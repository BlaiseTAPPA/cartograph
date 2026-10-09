-- Both functions reference everything fully qualified, so an empty search
-- path costs nothing and stops a caller's path from changing what they resolve.
alter function private.enable_rls_on_new_tables() set search_path = '';
alter function private.requesting_org_id() set search_path = '';
