-- What a framework adapter found: each file's role, the routes the syntax
-- declares exactly, and the ones it declares but couldn't be read exactly.

-- The adapter's name for what the file is. Null when no convention identifies
-- it, and always null for a skipped file, which the adapter never read.
alter table public.files
  add column role text,
  add constraint files_role_only_when_parsed check (role is null or skip_reason is null),
  -- Lets a route name its file and its analysis together, below.
  add constraint files_id_analysis unique (id, analysis_id);

-- Routes belong to an analysis directly, so its table is one read. The file
-- must be one of that same analysis's files: a route can't point across runs.
alter table public.routes
  add column analysis_id uuid not null,
  add column line integer not null check (line >= 1),
  add constraint routes_analysis_fkey foreign key (analysis_id, org_id)
    references public.analyses (id, org_id) on delete cascade,
  add constraint routes_file_in_analysis foreign key (file_id, analysis_id)
    references public.files (id, analysis_id) on delete cascade;

create index on public.routes (analysis_id, org_id);
create index on public.routes (file_id, analysis_id);

alter table public.analyses
  -- The parser contract the stored rows were written under. An analysis
  -- stored before roles and routes existed is told apart by this, not guessed.
  add column result_version integer,
  -- Routes declared in the code that couldn't be recovered exactly, and why.
  add column route_gaps jsonb;
