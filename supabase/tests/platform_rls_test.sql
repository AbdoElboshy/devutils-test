begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'profiles RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.favorites'::regclass), 'favorites RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.saved_workflows'::regclass), 'workflows RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.api_keys'::regclass), 'API keys RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.integration_connections'::regclass), 'integrations RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.audit_logs'::regclass), 'audit logs RLS enabled');

select isnt(has_table_privilege('anon', 'public.profiles', 'select'), true, 'anon cannot select profiles');
select isnt(has_table_privilege('anon', 'public.api_keys', 'select'), true, 'anon cannot select API-key metadata');
select isnt(has_table_privilege('authenticated', 'public.api_keys', 'insert'), true, 'browser cannot insert API keys directly');
select isnt(has_table_privilege('authenticated', 'public.usage_records', 'insert'), true, 'browser cannot insert usage directly');
select isnt(has_table_privilege('authenticated', 'public.audit_logs', 'insert'), true, 'browser cannot insert audit events directly');
select isnt(has_table_privilege('authenticated', 'public.integration_connections', 'insert'), true, 'browser cannot create integration secrets directly');

select * from finish();
rollback;