-- Placeholder rows until something creates real analyses. Only organizations,
-- projects and analyses: seeding files or edges would be inventing structure
-- the parser never found.
--
-- The org ids are real Clerk organizations, so signing into each one shows
-- its own rows. Runs as the table owner, which bypasses RLS.

insert into public.organizations (id) values
  ('org_3KQf2jg9Da20nZ87I1XNSBpnBPw'),
  ('org_3KSEaORTDq3EIeeoSt0jXDbdLFy')
on conflict do nothing;

insert into public.projects (id, org_id, repo_url) values
  ('00000000-0000-4000-a000-000000000101', 'org_3KQf2jg9Da20nZ87I1XNSBpnBPw', 'https://github.com/vercel/next.js'),
  ('00000000-0000-4000-a000-000000000102', 'org_3KQf2jg9Da20nZ87I1XNSBpnBPw', 'https://github.com/colinhacks/zod'),
  ('00000000-0000-4000-a000-000000000201', 'org_3KSEaORTDq3EIeeoSt0jXDbdLFy', 'https://github.com/expressjs/express')
on conflict do nothing;

insert into public.analyses (id, org_id, project_id, status, commit_sha, error, created_at, finished_at) values
  ('00000000-0000-4000-b000-000000000101', 'org_3KQf2jg9Da20nZ87I1XNSBpnBPw', '00000000-0000-4000-a000-000000000101',
   'complete', null, null, now() - interval '2 days', now() - interval '2 days' + interval '41 seconds'),
  ('00000000-0000-4000-b000-000000000102', 'org_3KQf2jg9Da20nZ87I1XNSBpnBPw', '00000000-0000-4000-a000-000000000102',
   'parsing', null, null, now() - interval '3 minutes', null),
  ('00000000-0000-4000-b000-000000000103', 'org_3KQf2jg9Da20nZ87I1XNSBpnBPw', '00000000-0000-4000-a000-000000000102',
   'failed', null, 'Repository could not be cloned', now() - interval '1 day', now() - interval '1 day' + interval '4 seconds'),
  ('00000000-0000-4000-b000-000000000201', 'org_3KSEaORTDq3EIeeoSt0jXDbdLFy', '00000000-0000-4000-a000-000000000201',
   'queued', null, null, now() - interval '20 seconds', null)
on conflict do nothing;
