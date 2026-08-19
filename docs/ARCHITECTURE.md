# Architecture

Overview of components and data flow.

Components
- Frontend: React + Vite + TypeScript. Handles editor UI, presence overlay, and API calls.
- Backend: Node.js + Express + TypeScript. Provides REST APIs, Socket.IO realtime server, and mailer utilities.
- Auth: Internal signed session tokens. Backend verifies bearer tokens and derives stable user identity from email.
- Database: Supabase (Postgres). Stores documents, comments, versions, and metadata.
- Realtime: Yjs CRDT updates over authenticated Socket.IO rooms. Redis remains optional for multi-instance fan-out, and the legacy HTML event is retained as a rolling-deployment fallback.
- Cache/PubSub: Redis used for scaling Socket.IO across nodes and simple caching.

Data flow
- Document edits: Tiptap binds to a per-document Y.Doc; incremental `yjs-update` messages converge independently of arrival order and persist in `document_collaboration_states`.
- Compatibility persistence: merged HTML remains in `documents.content` for exports, public views, versions, and older clients.
- AI: authenticated backend routes call NVIDIA's OpenAI-compatible API. The API key never enters the frontend bundle.
- Semantic search embeds the query and accessible document passages, including comments, embedded attachment metadata, and version text. NVIDIA failures fall back to keyword results.
- Presence: clients emit `cursor-move` events with session-scoped identity; server aggregates active sessions and broadcasts `active-users` updates.

Auth and identity
- Clients create a session via `POST /api/auth/session` using email.
- Backend signs and verifies auth tokens and stores no passwords.
- The app uses `session-id` for per-tab presence so multiple sessions from same user appear separately.

Scaling notes
- Use Redis adapter for Socket.IO when running multiple backend instances.
- Configure sticky sessions at the load balancer (TCP or cookie-based) if not using Redis adapter.
