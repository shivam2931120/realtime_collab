-- Run this in your Supabase SQL editor

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text default '',
  owner_id text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists document_collaborators (
  document_id uuid references documents(id) on delete cascade not null,
  user_id text not null,
  role text default 'editor' check (role in ('editor', 'viewer')),
  primary key (document_id, user_id)
);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade not null,
  user_id text not null,
  content text not null,
  resolved boolean default false,
  position jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id text not null,
  sender_id text not null,
  document_id uuid references documents(id) on delete cascade,
  type text not null,
  message text not null,
  read boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id text not null,
  parent_id uuid references folders(id) on delete cascade,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table documents add column if not exists folder_id uuid references folders(id) on delete set null;

create table if not exists document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade not null,
  content text not null,
  created_by text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists document_tags (
  document_id uuid references documents(id) on delete cascade not null,
  tag text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (document_id, tag)
);

create table if not exists document_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  title text not null,
  content text not null,
  tags jsonb default '[]'::jsonb,
  is_system boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists document_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade not null,
  actor_id text not null,
  event_type text not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_documents_owner_updated on documents(owner_id, updated_at desc);
create index if not exists idx_document_collaborators_user on document_collaborators(user_id);
create index if not exists idx_document_tags_tag on document_tags(tag);
create index if not exists idx_document_events_document_created on document_events(document_id, created_at desc);
create index if not exists idx_document_events_actor_created on document_events(actor_id, created_at desc);
