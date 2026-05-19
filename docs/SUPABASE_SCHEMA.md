# Supabase Schema Setup

Use `supabase_schema.sql` to initialize or repair the public schema.

What it creates:
- App tables: `auth_users`, `auth_refresh_tokens`, `auth_password_reset_tokens`, `folders`, `documents`, `document_collaborators`, `comments`, `notifications`, `document_versions`, `document_tags`, `document_templates`, `document_events`.
- Admin views for Table Editor: `workspace_users`, `workspace_files`, `workspace_permissions`, `workspace_comments`.

Apply in Supabase:
1. Open Supabase Dashboard.
2. Select the project used by `SUPABASE_URL`.
3. Open SQL Editor.
4. Paste the full contents of `supabase_schema.sql`.
5. Click Run.
6. In Table Editor, select the `public` schema and look for the tables/views above.

Verify from the backend:

```bash
cd backend
npm run db:check
```

If the check reports schema-cache misses right after running SQL, wait a few seconds and run it again. Supabase/PostgREST can take a short moment to refresh newly created tables and views.
