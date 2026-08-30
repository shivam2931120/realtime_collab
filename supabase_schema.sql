-- Realtime Collab Supabase schema
-- Run this in Supabase SQL Editor for the public schema.
-- It is non-destructive: it creates missing tables/columns/views without dropping app data.

create extension if not exists pgcrypto;

-- Users created by the app's email/password auth flow.
-- Demo/session-only users are still represented by their deterministic usr_* IDs in documents.
create table if not exists public.auth_users (
  id text primary key,
  email text not null unique,
  password_hash text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.auth_refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id text references public.auth_users(id) on delete cascade not null,
  token_hash text not null unique,
  expires_at timestamp with time zone not null,
  revoked_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.auth_password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id text references public.auth_users(id) on delete cascade not null,
  token_hash text not null unique,
  expires_at timestamp with time zone not null,
  used_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id text not null,
  parent_id uuid references public.folders(id) on delete cascade,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Files/documents owned by users.
-- owner_id intentionally stays text without a foreign key because the app also supports demo/session users.
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text default '',
  owner_id text not null,
  folder_id uuid references public.folders(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  deleted_at timestamp with time zone
);

alter table public.documents add column if not exists content text default '';
alter table public.documents add column if not exists folder_id uuid;
alter table public.documents add column if not exists deleted_at timestamp with time zone;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'documents_folder_id_fkey'
  ) then
    alter table public.documents
      add constraint documents_folder_id_fkey
      foreign key (folder_id) references public.folders(id) on delete set null not valid;
  end if;
end $$;

-- Permissions granted to collaborators.
create table if not exists public.document_collaborators (
  document_id uuid references public.documents(id) on delete cascade not null,
  user_id text not null,
  role text default 'editor' check (role in ('editor', 'commenter', 'viewer')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (document_id, user_id)
);

alter table public.document_collaborators add column if not exists role text default 'editor';
alter table public.document_collaborators add column if not exists created_at timestamp with time zone default timezone('utc'::text, now()) not null;
alter table public.document_collaborators add column if not exists updated_at timestamp with time zone default timezone('utc'::text, now()) not null;
alter table public.document_collaborators add column if not exists invitation_status text default 'pending';
alter table public.document_collaborators add column if not exists last_invite_sent_at timestamp with time zone;
alter table public.document_collaborators add column if not exists invite_email_status text default 'queued';

alter table public.document_collaborators drop constraint if exists document_collaborators_role_check;
alter table public.document_collaborators
  add constraint document_collaborators_role_check
  check (role in ('editor', 'commenter', 'viewer'));

alter table public.document_collaborators drop constraint if exists document_collaborators_invitation_status_check;
alter table public.document_collaborators
  add constraint document_collaborators_invitation_status_check
  check (invitation_status in ('pending', 'accepted', 'cancelled'));

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.documents(id) on delete cascade not null,
  parent_id uuid references public.comments(id) on delete cascade,
  user_id text not null,
  content text not null,
  resolved boolean default false,
  position jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.comments add column if not exists resolved boolean default false;
alter table public.comments add column if not exists position jsonb;
alter table public.comments add column if not exists parent_id uuid references public.comments(id) on delete cascade;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id text not null,
  sender_id text not null,
  document_id uuid references public.documents(id) on delete cascade,
  type text not null,
  message text not null,
  read boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.documents(id) on delete cascade not null,
  content text not null,
  created_by text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Compact Yjs CRDT state. HTML remains in documents.content for exports and legacy clients.
create table if not exists public.document_collaboration_states (
  document_id uuid primary key references public.documents(id) on delete cascade,
  state_base64 text not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.document_tags (
  document_id uuid references public.documents(id) on delete cascade not null,
  tag text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (document_id, tag)
);

create table if not exists public.document_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  title text not null,
  content text not null,
  tags jsonb default '[]'::jsonb,
  is_system boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.document_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.documents(id) on delete cascade not null,
  actor_id text not null,
  event_type text not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Revocable, expiring read-only public links. Store only token hashes.
create table if not exists public.document_public_links (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.documents(id) on delete cascade not null,
  token_hash text unique not null,
  created_by text not null,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  revoked_at timestamp with time zone
);

-- File/media metadata. Binary content is kept in the private Supabase Storage bucket.
create table if not exists public.document_attachments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.documents(id) on delete cascade not null,
  uploaded_by text not null,
  storage_path text unique not null,
  file_name text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_document_attachments_document on public.document_attachments(document_id, created_at desc);

insert into storage.buckets (id, name, public)
values ('document-attachments', 'document-attachments', false)
on conflict (id) do nothing;

-- Helpful indexes for the backend and Table Editor browsing.
create index if not exists idx_auth_refresh_tokens_user on public.auth_refresh_tokens(user_id);
create index if not exists idx_auth_password_reset_tokens_user on public.auth_password_reset_tokens(user_id);
create index if not exists idx_documents_owner_updated on public.documents(owner_id, updated_at desc);
create index if not exists idx_documents_folder on public.documents(folder_id);
create index if not exists idx_documents_deleted_at on public.documents(deleted_at);
create index if not exists idx_document_collaborators_user on public.document_collaborators(user_id);
create index if not exists idx_document_collaborators_invitation_status on public.document_collaborators(invitation_status, last_invite_sent_at desc);
create index if not exists idx_comments_document_created on public.comments(document_id, created_at desc);
create index if not exists idx_comments_parent on public.comments(parent_id, created_at asc);
create index if not exists idx_notifications_recipient_read on public.notifications(recipient_id, read, created_at desc);
create index if not exists idx_document_versions_document_created on public.document_versions(document_id, created_at desc);
create index if not exists idx_document_collaboration_updated on public.document_collaboration_states(updated_at desc);
create index if not exists idx_document_tags_tag on public.document_tags(tag);
create index if not exists idx_document_events_document_created on public.document_events(document_id, created_at desc);
create index if not exists idx_document_events_actor_created on public.document_events(actor_id, created_at desc);
create index if not exists idx_document_public_links_document on public.document_public_links(document_id, created_at desc);
create index if not exists idx_document_public_links_active on public.document_public_links(expires_at) where revoked_at is null;

-- Decode the app's deterministic usr_<base64url(email)> IDs for admin views.
create or replace function public.app_email_from_user_id(value text)
returns text
language plpgsql
immutable
as $$
declare
  encoded text;
  padded text;
  decoded text;
begin
  if value is null or btrim(value) = '' then
    return '';
  end if;

  if left(value, 4) <> 'usr_' then
    return regexp_replace(lower(value), '[^a-z0-9]+', '-', 'g') || '@legacy.local';
  end if;

  encoded := replace(replace(substr(value, 5), '-', '+'), '_', '/');
  padded := encoded || repeat('=', (4 - length(encoded) % 4) % 4);

  begin
    decoded := lower(convert_from(decode(padded, 'base64'), 'utf8'));
    if decoded ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      return decoded;
    end if;
  exception when others then
    decoded := null;
  end;

  return regexp_replace(lower(value), '[^a-z0-9]+', '-', 'g') || '@legacy.local';
end;
$$;

-- Easy admin views for Supabase Table Editor.
create or replace view public.workspace_users as
with user_ids as (
  select id as user_id from public.auth_users
  union
  select owner_id from public.documents
  union
  select user_id from public.document_collaborators
  union
  select user_id from public.comments
  union
  select created_by from public.document_versions
  union
  select actor_id from public.document_events
  union
  select recipient_id from public.notifications
  union
  select sender_id from public.notifications
)
select
  ids.user_id,
  coalesce(users.email, public.app_email_from_user_id(ids.user_id)) as email,
  users.created_at as registered_at,
  (
    select count(*) from public.documents d
    where d.owner_id = ids.user_id and d.deleted_at is null
  ) as owned_files_count,
  (
    select count(*) from public.document_collaborators dc
    where dc.user_id = ids.user_id
  ) as shared_files_count,
  (
    select count(*) from public.comments c
    where c.user_id = ids.user_id
  ) as comments_count
from user_ids ids
left join public.auth_users users on users.id = ids.user_id
where ids.user_id is not null and ids.user_id <> '';

create or replace view public.workspace_files as
select
  d.id as file_id,
  d.title,
  d.owner_id,
  public.app_email_from_user_id(d.owner_id) as owner_email,
  d.folder_id,
  f.name as folder_name,
  left(regexp_replace(coalesce(d.content, ''), '<[^>]*>', '', 'g'), 180) as content_preview,
  (
    select count(*) from public.document_collaborators dc
    where dc.document_id = d.id
  ) as collaborators_count,
  (
    select count(*) from public.comments c
    where c.document_id = d.id
  ) as comments_count,
  (
    select coalesce(array_agg(dt.tag order by dt.tag), array[]::text[])
    from public.document_tags dt
    where dt.document_id = d.id
  ) as tags,
  d.created_at,
  d.updated_at,
  d.deleted_at,
  (
    select count(*) from public.document_attachments da
    where da.document_id = d.id
  ) as attachments_count
from public.documents d
left join public.folders f on f.id = d.folder_id;

create or replace view public.workspace_permissions as
select
  d.id as file_id,
  d.title,
  d.owner_id as user_id,
  public.app_email_from_user_id(d.owner_id) as user_email,
  'owner'::text as role,
  true as can_edit,
  true as can_share,
  d.created_at as granted_at,
  'accepted'::text as invitation_status,
  null::timestamp with time zone as last_invite_sent_at,
  null::text as invite_email_status
from public.documents d
union all
select
  d.id as file_id,
  d.title,
  dc.user_id,
  public.app_email_from_user_id(dc.user_id) as user_email,
  dc.role,
  dc.role = 'editor' as can_edit,
  false as can_share,
  dc.created_at as granted_at,
  dc.invitation_status,
  dc.last_invite_sent_at,
  dc.invite_email_status
from public.document_collaborators dc
join public.documents d on d.id = dc.document_id;

create or replace view public.workspace_comments as
select
  c.id as comment_id,
  c.document_id as file_id,
  d.title,
  c.user_id,
  public.app_email_from_user_id(c.user_id) as author_email,
  c.content,
  c.resolved,
  c.position,
  c.created_at
from public.comments c
join public.documents d on d.id = c.document_id;
