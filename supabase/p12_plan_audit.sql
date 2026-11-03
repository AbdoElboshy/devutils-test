-- p12: allow the 'plan_changed' audit action for admin plan management.
-- Idempotent: finds the existing action check constraint (by its known
-- member 'account_deleted'), drops it, re-adds it with 'plan_changed'.
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.audit_logs'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%account_deleted%';
  if c is not null then
    execute format('alter table public.audit_logs drop constraint %I', c);
  end if;
end $$;

alter table public.audit_logs
  add constraint audit_logs_action_check
  check (action in ('logged_in','profile_updated','password_changed','api_key_created',
                    'api_key_revoked','workflow_created','integration_connected',
                    'integration_disconnected','account_deleted','plan_changed'));
