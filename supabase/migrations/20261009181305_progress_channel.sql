-- Live progress for a run. When an analysis's stage, message or status moves,
-- a trigger on our own table publishes it to that analysis's private channel,
-- analysis:<id>. Nothing is attached to the realtime machinery itself.

-- stage_changed_at now means "last progress": a status change counts as well,
-- so a failure or completion is newer than the stage before it, and an
-- unfinished row whose progress hasn't moved in minutes reads as abandoned.
create or replace function private.touch_stage_changed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.stage is distinct from old.stage
    or new.stage_message is distinct from old.stage_message
    or new.status is distinct from old.status then
    new.stage_changed_at := now();
  end if;
  return new;
end;
$$;

-- Publishes what the page shows and nothing else: the status, the stage, one
-- message (the error once failed), and when it moved. The page renders it as
-- is; it has nothing to filter and nothing to interpret.
-- Security definer because the run writes as the service role and readers
-- write nothing; publishing is the function's privilege, not the caller's.
create function private.publish_analysis_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.stage is distinct from old.stage
    or new.stage_message is distinct from old.stage_message
    or new.status is distinct from old.status
    or new.error is distinct from old.error then
    perform realtime.send(
      jsonb_build_object(
        'status', new.status,
        'stage', new.stage,
        'message', case when new.status = 'failed' then new.error else new.stage_message end,
        'at', new.stage_changed_at
      ),
      'progress',
      'analysis:' || new.id::text,
      true
    );
  end if;
  return null;
end;
$$;

revoke execute on function private.publish_analysis_progress() from public;

create trigger publish_analysis_progress
  after update on public.analyses
  for each row execute function private.publish_analysis_progress();

-- The channel pattern, declared. Private channels are only joinable where a
-- policy allows it, so without this every publish above goes nowhere.
-- Subscribing to analysis:<id> is allowed exactly when that analysis is a row
-- the subscriber could select: the analyses policy decides, the same way it
-- decides for the data. Another organization's channel is refused at join.
-- A topic that isn't analysis:<uuid> casts to null and matches nothing,
-- rather than raising.
create policy "members receive their organization's analysis progress"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and exists (
      select 1 from public.analyses a
      where a.id = (
        select case
          when realtime.topic() ~ '^analysis:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then substring(realtime.topic() from 10)::uuid
        end
      )
    )
  );
