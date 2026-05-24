# Requirements Traceability

Source: `project.pdf` LogicVeda Real-Time Collaboration Platform requirements.

## Functional Checklist

| ID | Requirement | Implementation |
| --- | --- | --- |
| F01 | Email/password auth, refresh, logout, reset | `POST /api/auth/register`, `/login`, `/refresh`, `/logout`, `/password-reset/request`, `/password-reset/confirm`. Existing `/auth/session` remains for demo access. Requires the latest `supabase_schema.sql` auth tables. |
| F02 | Document CRUD, owner delete, soft delete | Document create/list/read/update/delete is implemented. Owner-only delete writes `deleted_at` and hides the document from active workspaces while preserving comments, permissions, and version history. |
| F03 | Real-time editing | Socket.io rooms broadcast editor HTML updates, save to Supabase, and keep remote tabs visible. Automatic 30-second snapshots reduce recovery risk during active editing. |
| F04 | Presence/cursors | `join-doc`, `active-users`, `cursor-move`, and `presence-ping` show collaborators, idle state, and remote cursor labels. |
| F05 | Comments/mentions | Comments support resolved/open state, anchored editor ranges, and `@email` mention notifications plus email delivery. |
| F06 | Version history | Manual snapshots, automatic snapshots, version list, and persisted restore endpoint are implemented. |
| F07 | RBAC/share | Owner, editor, commenter, and viewer roles are enforced across REST and socket updates. Share by email creates collaborators and notifications. |
| F08 | Notifications/email | In-app notifications and EmailJS-backed share, mention, and password reset emails are implemented. Live EmailJS send and history checks passed on May 23, 2026 with the configured service. |
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
- Backend unit tests: `npm test`
- Frontend build: `npm run build`
- Smoke: `./scripts/smoke_check.sh http://localhost:5000`
- EmailJS config: `npm run email:check`
- EmailJS live send: checked with configured `EMAILJS_REPLY_TO`; provider returned HTTP 200.
- Realtime smoke: two Socket.io clients joined one document, presence reached 2 users, collaborator edits propagated and persisted.
