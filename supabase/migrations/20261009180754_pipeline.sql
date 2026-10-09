-- What a run needs to store: the stage it is in, what the parser reported
-- about its own coverage, and the per-file facts the explorer draws from.
--
-- No write policies. The run writes with the server's secret key, because a
-- Clerk session token expires long before a large repository finishes
-- parsing. Reads still go through the select policies only.

create type public.analysis_stage as enum ('fetch', 'select', 'parse', 'store');

alter table public.analyses
  add column stage public.analysis_stage,
  add column stage_message text,
  -- When the stage last moved. An unfinished run whose stage hasn't moved in
  -- minutes has died without failing; this is how that is told apart from a
  -- slow one.
  add column stage_changed_at timestamptz,
  add column adapter text,
  -- The parser's coverage report, as it wrote it. Null until stored.
  add column coverage jsonb;

-- One analysis per repository. Re-running reuses the row.
alter table public.analyses
  add constraint analyses_one_per_project unique (project_id);

create function private.touch_stage_changed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.stage is distinct from old.stage or new.stage_message is distinct from old.stage_message then
    new.stage_changed_at := now();
  end if;
  return new;
end;
$$;

create trigger touch_stage_changed_at
  before update on public.analyses
  for each row execute function private.touch_stage_changed_at();

-- Both lines and hash exist exactly when the file was parsed.
alter table public.files
  add column module text not null,
  add column lines integer check (lines >= 0),
  add column hash text,
  add constraint files_parsed_facts check (
    (skip_reason is null) = (lines is not null and hash is not null)
  );

-- The parser deduplicates edges; this makes a duplicate impossible rather
-- than unlikely.
alter table public.edges
  add constraint edges_unique unique (analysis_id, from_file_id, to_file_id, kind);
