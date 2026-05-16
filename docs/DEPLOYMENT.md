# Deployment

Environment variables
List of required envs (see `.env.example`):

- `PORT` — backend port (default 5000)
- `CLIENT_URL` — frontend base URL
- `CLIENT_URLS` — optional comma-separated additional frontend origins
- `NODE_ENV` — `development` or `production`
- `AUTH_TOKEN_SECRET` — backend token signing secret (rotate if exposed)
- `AUTH_TOKEN_TTL_SECONDS` — session token lifetime
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_KEY` — Supabase service-role key (admin privileges)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — mailer config
- `REDIS_URL` — Redis connection string (optional, recommended for scaling)

Docker
- The project includes multi-stage `Dockerfile`s for `backend` and `frontend` and a `docker-compose.yml` for local full-stack runs.
- Example: `docker compose up --build` runs a local stack with Redis.

Frontend on Vercel
- Project root: `frontend`
- Install command: `npm ci`
- Build command: `npm run build`
- Output directory: `dist`
- Environment variables: `VITE_API_URL=https://<azure-app-name>.azurewebsites.net/api`, `VITE_SOCKET_URL=https://<azure-app-name>.azurewebsites.net`

Backend on Azure App Service
- Runtime: Node.js 22 LTS on Linux.
- App root: `backend`
- Build command: `npm ci && npm run build`
- Startup command: `npm run start`
- Health check path: `/healthz`
- Enable WebSockets.
- App settings: `NODE_ENV=production`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `AUTH_TOKEN_SECRET`, `AUTH_TOKEN_TTL_SECONDS=1209600`, `CLIENT_URL=https://<vercel-domain>`, optional `CLIENT_URLS`, optional `REDIS_URL`, optional `SMTP_*`.
- If deploying multiple backend instances, configure sticky sessions and Redis-backed pub/sub before scaling out realtime editing.

Migration notes
- If moving to another auth provider, replace token issue/verify logic in `backend/src/utils/authToken.ts` and middleware in `backend/src/middleware/authMiddleware.ts`.
