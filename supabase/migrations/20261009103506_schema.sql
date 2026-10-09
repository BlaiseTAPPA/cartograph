-- The first schema. Every row belongs to an organization, and the only thing
-- deciding who reads a row is the policy on its table.

-- Row-level security is on by default rather than per table. A table someone
-- forgot to enable returns everything, silently; this trigger makes that
-- impossible for anything created in public, including the tables below.
create schema if not exists private;

create function private.enable_rls_on_new_tables()
returns event_trigger
language plpgsql
as $$
declare
  obj record;
begin
  for obj in
    select * from pg_event_trigger_ddl_commands()
    where object_type = 'table' and schema_name = 'public'
  loop
    execute format('alter table %s enable row level security', obj.object_identity);
  end loop;
end;
$$;

create event trigger enable_rls_on_new_tables
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function private.enable_rls_on_new_tables();

-- The organization on the Clerk session token (v2 tokens carry it as o.id).
-- Wrapped in (select ...) inside each policy so it is evaluated once per
-- query, not once per row.
create function private.requesting_org_id()
returns text
language sql
stable
as $$
  select auth.jwt() -> 'o' ->> 'id'
$$;

grant usage on schema private to authenticated;
grant execute on function private.requesting_org_id() to authenticated;

-- Organizations live in Clerk; this row exists so everything else can hang
-- off it with a cascading foreign key. The id is Clerk's org id.
create table public.organizations (
  id text primary key,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  repo_url text not null,
  created_at timestamptz not null default now(),
  unique (org_id, repo_url),
  unique (id, org_id)
);

create type public.analysis_status as enum ('queued', 'parsing', 'complete', 'failed');

-- Children reference their parent through (id, org_id), so a row can't claim
-- one organization while hanging off another organization's parent.
create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  project_id uuid not null,
  status public.analysis_status not null default 'queued',
  commit_sha text,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  foreign key (project_id, org_id) references public.projects (id, org_id) on delete cascade,
  unique (id, org_id)
);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  path text not null,
  -- Null when parsed. A skipped file is recorded with why, never dropped.
  skip_reason text,
  foreign key (analysis_id, org_id) references public.analyses (id, org_id) on delete cascade,
  unique (analysis_id, path),
  unique (id, org_id)
);

create type public.edge_kind as enum ('import', 're-export', 'dynamic-import', 'require');

-- Both ends are required: an edge exists only when an import resolved to a
-- real file.
create table public.edges (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  from_file_id uuid not null,
  to_file_id uuid not null,
  kind public.edge_kind not null,
  foreign key (analysis_id, org_id) references public.analyses (id, org_id) on delete cascade,
  foreign key (from_file_id, org_id) references public.files (id, org_id) on delete cascade,
  foreign key (to_file_id, org_id) references public.files (id, org_id) on delete cascade
);

-- Method and path are both required: a route that can't be fully recovered
-- isn't stored at all.
create table public.routes (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  file_id uuid not null,
  method text not null,
  path text not null,
  foreign key (file_id, org_id) references public.files (id, org_id) on delete cascade
);

create table public.explanations (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  file_id uuid not null,
  body text not null,
  created_at timestamptz not null default now(),
  foreign key (file_id, org_id) references public.files (id, org_id) on delete cascade
);

create table public.file_roles (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  file_id uuid not null,
  role text not null,
  foreign key (file_id, org_id) references public.files (id, org_id) on delete cascade
);

create table public.insights (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  body text not null,
  created_at timestamptz not null default now(),
  foreign key (analysis_id, org_id) references public.analyses (id, org_id) on delete cascade
);

-- Foreign keys aren't indexed automatically; cascades and joins need these.
create index on public.projects (org_id);
create index on public.analyses (org_id, created_at desc);
create index on public.analyses (project_id, org_id);
create index on public.files (org_id);
create index on public.edges (analysis_id, org_id);
create index on public.edges (from_file_id, org_id);
create index on public.edges (to_file_id, org_id);
create index on public.edges (org_id);
create index on public.routes (file_id, org_id);
create index on public.routes (org_id);
create index on public.explanations (file_id, org_id);
create index on public.explanations (org_id);
create index on public.file_roles (file_id, org_id);
create index on public.file_roles (org_id);
create index on public.insights (analysis_id, org_id);
create index on public.insights (org_id);

-- Read access only. Nothing in the app writes yet; write policies arrive with
-- the phase that writes.
create policy "members read their organization"
  on public.organizations for select to authenticated
  using (id = (select private.requesting_org_id()));

create policy "members read their organization's rows"
  on public.projects for select to authenticated
  using (org_id = (select private.requesting_org_id()));

create policy "members read their organization's rows"
  on public.analyses for select to authenticated
  using (org_id = (select private.requesting_org_id()));

create policy "members read their organization's rows"
  on public.files for select to authenticated
  using (org_id = (select private.requesting_org_id()));

create policy "members read their organization's rows"
  on public.edges for select to authenticated
  using (org_id = (select private.requesting_org_id()));

create policy "members read their organization's rows"
  on public.routes for select to authenticated
  using (org_id = (select private.requesting_org_id()));

create policy "members read their organization's rows"
  on public.explanations for select to authenticated
  using (org_id = (select private.requesting_org_id()));

create policy "members read their organization's rows"
  on public.file_roles for select to authenticated
  using (org_id = (select private.requesting_org_id()));

create policy "members read their organization's rows"
  on public.insights for select to authenticated
  using (org_id = (select private.requesting_org_id()));
