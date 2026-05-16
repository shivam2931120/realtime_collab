# Realtime Collaboration Platform

Google Docs style collaborative editor built with:

- React + Vite + TypeScript
- Tailwind CSS
- Zustand
- Tiptap
- Node.js + Express + TypeScript
- Supabase (Postgres)
- Socket.io
- Internal token-based email auth

## Project structure

```bash
backend/
frontend/
postman/
docker-compose.yml
supabase_schema.sql
```

## Environment setup

1. Copy env examples:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

2. Configure backend env (`backend/.env`):

```env
PORT=5000
CLIENT_URL=http://localhost:5173
NODE_ENV=development
AUTH_TOKEN_SECRET=replace_with_a_long_random_secret
AUTH_TOKEN_TTL_SECONDS=1209600
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_supabase_service_role_key

# Optional SMTP for share notifications
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM="Editorial <your@gmail.com>"
```

3. Configure frontend env (`frontend/.env`):

```env
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```

## Local run

### 1) Backend

```bash
cd backend
npm ci
npm run dev
```

Backend runs on `http://localhost:5000`.

### 2) Frontend

```bash
cd frontend
npm ci
npm run dev
```

Frontend runs on `http://localhost:5173`.

## Auth flow

- Use `/login` or `/register`.
- Enter an email to create a signed session token.
- Token is stored client-side and sent as `Authorization: Bearer <token>`.
- Backend verifies token signature and derives a stable user ID from email.

## API endpoints

- `POST /api/auth/session`
- `GET /api/auth/me`
- `POST /api/docs`
- `GET /api/docs`
- `GET /api/docs/:id`
- `PUT /api/docs/:id`
- `DELETE /api/docs/:id`
- `GET /api/docs/:id/comments`
- `POST /api/docs/:id/comments`
- `POST /api/docs/:id/versions`
- `GET /api/docs/:id/versions`
- `GET /api/docs/search`
- `GET /api/docs/tags`
- `GET /api/docs/:id/tags`
- `PUT /api/docs/:id/tags`
- `GET /api/docs/templates`
- `POST /api/docs/templates`
- `POST /api/docs/templates/:templateId/apply`
- `POST /api/docs/import`
- `GET /api/docs/:id/export?format=markdown|html|txt|pdf|docx`
- `GET /api/docs/analytics?days=30`
- `GET /api/notifications`
- `PUT /api/notifications/read-all`
- `PUT /api/notifications/:id/read`

## Realtime socket events

- `join-doc`
- `send-changes`
- `receive-changes`
- `cursor-move`
- `active-users`

## Supabase setup

Run `supabase_schema.sql` in your Supabase SQL editor before first run.

## Deployment checklist

Backend:

```bash
cd backend
npm ci
npm run build
```

Frontend:

```bash
cd frontend
npm ci
npm run build
```

Set production environment values:

- Backend: `NODE_ENV=production`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `AUTH_TOKEN_SECRET`, `CLIENT_URL`
- Frontend: `VITE_API_URL`, `VITE_SOCKET_URL`

## Hosting targets

Frontend (Vercel):
- Root directory: `frontend`
- Build command: `npm run build`
- Output directory: `dist`
- `frontend/vercel.json` already includes SPA rewrites.

Backend (Azure App Service):
- Runtime stack: Node.js 22 LTS on Linux.
- Deploy the `backend/` directory as the app root.
- Build command: `npm ci && npm run build`.
- Startup command: `npm run start`.
- Health check path: `/healthz`.
- Enable WebSockets for Socket.IO.
- Set required app settings in Azure (`NODE_ENV`, `SUPABASE_*`, `AUTH_TOKEN_SECRET`, `CLIENT_URL`, optional `CLIENT_URLS`, optional `REDIS_URL`, optional `SMTP_*`).
