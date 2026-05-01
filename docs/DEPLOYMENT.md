# Deployment

Environment variables
List of required envs (see `.env.example`):

- `PORT` — backend port (default 5000)
- `CLIENT_URL` — frontend base URL
- `NODE_ENV` — `development` or `production`
- `CLERK_SECRET_KEY` — Clerk backend secret (rotate if exposed)
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_KEY` — Supabase service-role key (admin privileges)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — mailer config
- `REDIS_URL` — Redis connection string (optional, recommended for scaling)

Docker
- The project includes multi-stage `Dockerfile`s for `backend` and `frontend` and a `docker-compose.yml` for local full-stack runs.
- Example: `docker compose up --build` runs a local stack with Redis.

Cloud deploy
- Use a secrets manager (GitHub Actions Secrets, AWS Secret Manager, GCP Secret Manager) to store credentials.
- If deploying multiple backend instances, enable Redis adapter for Socket.IO and configure a load balancer with sticky sessions or use Redis for session/pubsub.

Migration notes (if moving from Clerk+Supabase to JWT+Mongo)
- Replace Clerk token verification middleware with JWT validation and user store in MongoDB.
- Migrate user references and session handling; update presence identity mapping if session model changes.
