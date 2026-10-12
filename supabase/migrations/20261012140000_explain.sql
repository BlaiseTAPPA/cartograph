-- What the model is allowed to add: explanations and labels, cached on the
-- content they were written from, and a role on a file no convention named.

-- Not the phase 2 explanations and file_roles placeholders: they hang an
-- answer off a file row, which a re-run deletes. An answer is a function of
-- what the model was handed, not of a row, so the cache is keyed on that.

create type public.ai_task as enum ('explain-file', 'explain-folder', 'classify');

-- The key is a sha256 over the pinned model name and everything the model is
-- handed, so the same question asked again is the same row, and re-pinning a
-- model or changing a prompt misses only its own entries.
create table public.ai_cache (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  task public.ai_task not null,
  model text not null,
  key text not null check (key ~ '^[0-9a-f]{64}$'),
  body text not null,
  created_at timestamptz not null default now(),
  unique (org_id, key)
);

create index on public.ai_cache (org_id);

-- Written by the server with the secret key, for the organization on a
-- verified session. Read through the policy.
create policy "members read their organization's rows"
  on public.ai_cache for select to authenticated
  using (org_id = (select private.requesting_org_id()));

-- A role the model gave rather than a convention. Only roles that decide
-- nothing structural: page, route and controller roles drive the route table
-- and entry points, and convention owns them. Checked here so a model label
-- in one of those is impossible, not merely unlikely.
alter table public.files
  add column role_from_model boolean not null default false,
  add constraint files_model_role_not_structural check (
    not role_from_model
    or role in ('service', 'repository', 'model', 'util', 'config', 'component', 'hook')
  );
