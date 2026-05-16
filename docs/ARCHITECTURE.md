# Architecture

Overview of components and data flow.

Components
- Frontend: React + Vite + TypeScript. Handles editor UI, presence overlay, and API calls.
- Backend: Node.js + Express + TypeScript. Provides REST APIs, Socket.IO realtime server, and mailer utilities.
- Auth: Internal signed session tokens. Backend verifies bearer tokens and derives stable user identity from email.
- Database: Supabase (Postgres). Stores documents, comments, versions, and metadata.
- Realtime: Socket.IO + Redis (optional). Socket room per document, presence tracked by session-id.
- Cache/PubSub: Redis used for scaling Socket.IO across nodes and simple caching.

Data flow
- Document edits: frontend -> Socket.IO `send-changes` -> backend broadcasts `receive-changes` to room -> frontend applies remote changes.
- Persistence: backend persists periodic snapshots and versions into Supabase via API calls.
- Presence: clients emit `cursor-move` events with session-scoped identity; server aggregates active sessions and broadcasts `active-users` updates.

Auth and identity
- Clients create a session via `POST /api/auth/session` using email.
- Backend signs and verifies auth tokens and stores no passwords.
- The app uses `session-id` for per-tab presence so multiple sessions from same user appear separately.

Scaling notes
- Use Redis adapter for Socket.IO when running multiple backend instances.
- Configure sticky sessions at the load balancer (TCP or cookie-based) if not using Redis adapter.
