# Architecture

Overview of components and data flow.

Components
- Frontend: React + Vite + TypeScript. Handles editor UI, presence overlay, and API calls.
- Backend: Node.js + Express + TypeScript. Provides REST APIs, Socket.IO realtime server, and mailer utilities.
- Auth: Clerk — handles authentication and user management. Backend verifies Clerk tokens for protected APIs.
- Database: Supabase (Postgres). Stores documents, comments, versions, and metadata.
- Realtime: Socket.IO + Redis (optional). Socket room per document, presence tracked by session-id.
- Cache/PubSub: Redis used for scaling Socket.IO across nodes and simple caching.

Data flow
- Document edits: frontend -> Socket.IO `send-changes` -> backend broadcasts `receive-changes` to room -> frontend applies remote changes.
- Persistence: backend persists periodic snapshots and versions into Supabase via API calls.
- Presence: clients emit `cursor-move` events with session-scoped identity; server aggregates active sessions and broadcasts `active-users` updates.

Auth and identity
- Clerk provides user authentication and session management. The app uses `session-id` for per-tab presence so multiple sessions from same user appear separately.
- Note: original production doc suggested JWT + Mongo; this project uses Clerk + Supabase intentionally. See `docs/DEPLOYMENT.md` for migration notes.

Scaling notes
- Use Redis adapter for Socket.IO when running multiple backend instances.
- Configure sticky sessions at the load balancer (TCP or cookie-based) if not using Redis adapter.
