# Realtime Collaboration Platform

Google Docs style collaborative editor built with:

- `React + Vite + TypeScript`
- `Tailwind CSS`
- `Zustand`
- `Tiptap`
- `Node.js + Express + TypeScript`
- `Supabase (Postgres)`
- `Clerk Authentication`
- `Socket.io`

## Quickstart

1. Copy env examples for backend and frontend and fill secret values locally (do NOT commit them):

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

2. Start backend and frontend in development:

```bash
# backend
cd backend && npm ci && npm run dev

# frontend (new terminal)
cd frontend && npm ci && npm run dev
```

3. Visit the frontend at `http://localhost:5173` and sign in via Clerk.


## Project structure

```bash
backend/
frontend/
postman/
docker-compose.yml
```

## Backend env

Create `backend/.env` with:

```env
PORT=5000
CLIENT_URL=http://localhost:5173
NODE_ENV=development
CLERK_SECRET_KEY=sk_test_your_clerk_secret_here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_supabase_service_role_key

# Optional: Google SMTP (Gmail) for password recovery + share emails
# Use a Gmail "App Password" (recommended) instead of your normal account password.
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM="Editorial <your@gmail.com>"
```

Create `frontend/.env` with:

```env
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_publishable_key_here
```

## Local run

### 1) Start backend

```bash
cd backend
npm install
npm run dev
```

Backend runs on `http://localhost:5000`

### 2) Start frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`

## API endpoints

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

## Testing flow

1. Sign in with two different Clerk users (two browsers/incognito windows).
2. Create/open a document with the first user.
3. Create a document, optionally share with the second user.
4. Open the document in one tab.
5. Open the same document in another tab or another browser session.
6. Start typing and confirm live updates.

## Socket events

- `join-doc`
- `send-changes`
- `receive-changes`

## Optional Docker

Run the full stack:

```bash
docker compose up --build
```

## Postman

Import `postman/Realtime-Collab.postman_collection.json`

## Clerk setup

1. Create a Clerk application.
2. Enable Google and GitHub social connections in Clerk.
3. Put the publishable key in `frontend/.env`.
4. Put the secret key in `backend/.env` for backend verification.
5. Social login buttons stay disabled until `VITE_CLERK_PUBLISHABLE_KEY` is set.

## Password recovery

- Password recovery is handled by Clerk's hosted auth flow.
- SMTP in this backend is currently used for document share emails.

## Supabase setup

Run `supabase_schema.sql` in your Supabase SQL editor before first run.

---

## Submission notes

Before you submit or open a release PR, confirm the following:

- Copy `.env.example` to the appropriate `.env` files and fill in your secrets locally; do not commit secrets.
- Run frontend tests and build:

```
cd frontend
npm ci
npm run test
npm run build
```

- Run backend build and any backend tests:

```
cd backend
npm ci
npm run build
# npm test (if tests are configured)
```

- Update `CHANGELOG.md` with release notes and the PR description with verification steps.

If you want, I can prepare the release branch and commit these files for you (I already created them in this commit).
