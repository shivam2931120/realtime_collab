# Requirements Traceability

Source: `project.pdf` LogicVeda Real-Time Collaboration Platform requirements.

## Functional Checklist

| ID | Requirement | Implementation |
| --- | --- | --- |
| F01 | Email/password auth, refresh, logout, reset | `POST /api/auth/register`, `/login`, `/refresh`, `/logout`, `/password-reset/request`, `/password-reset/confirm`. Existing `/auth/session` remains for demo access. Requires the latest `supabase_schema.sql` auth tables. |
| F02 | Document CRUD, owner delete, soft delete | Document create/list/read/update/delete is implemented. Owner-only delete now writes `deleted_at` when the schema column exists and falls back to hard delete on older schemas. |
| F03 | Real-time editing | Socket.io rooms broadcast editor HTML updates, save to Supabase, and keep remote tabs visible. Automatic 30-second snapshots reduce recovery risk during active editing. |
| F04 | Presence/cursors | `join-doc`, `active-users`, `cursor-move`, and `presence-ping` show collaborators, idle state, and remote cursor labels. |
| F05 | Comments/mentions | Comments support resolved/open state, anchored editor ranges, and `@email` mention notifications plus email delivery. |
| F06 | Version history | Manual snapshots, automatic snapshots, version list, and persisted restore endpoint are implemented. |
| F07 | RBAC/share | Owner, editor, and viewer roles are enforced across REST and socket updates. Share by email creates collaborators and notifications. |
| F08 | Notifications/email | In-app notifications and EmailJS-backed share, mention, and password reset emails are implemented. |
| F09 | Search/filtering | Dashboard search plus `/api/docs/search`, tags, folders, templates, import/export, and analytics are present. Tags require the latest schema. |
| F10 | Offline awareness | The editor shows offline/realtime warnings and queues saves for retry when connectivity returns. |

## Submission Deliverables

| Deliverable | Status |
| --- | --- |
| Project PDF/report | `project.pdf` is present in the repo root. |
| Live public demo URL | Frontend is configured for Vercel; backend is configured for Render. |
| GitHub repository | Remotes are configured for the GitHub repo. |
| README | Root `README.md` documents setup, endpoints, realtime events, and deployment. |
| Demo video | Not present in the repository; record and attach externally for final LogicVeda submission. |

## Verification Notes

- Backend build: `npm run build`
- Frontend build: `npm run build`
- Smoke: `./scripts/smoke_check.sh http://localhost:5000`
- EmailJS config: `npm run email:check`
- Realtime smoke: two Socket.io clients joined one document, presence reached 2 users, collaborator edits propagated and persisted.
