-- p14: team-native workflow execution audit action ('team_workflow_run').
-- Idempotent: rebuilds the audit_logs action check constraint preserving
-- every existing member and every action actually present in rows, then
-- adds the new action (same pattern as p12_teams.sql).

do $$
declare
  c text;
  def text;
  members text[] := array[]::text[];
  rec record;
  lit text;
begin
  select conname, pg_get_constraintdef(oid) into c, def
    from pg_constraint
   where conrelid = 'public.audit_logs'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) ~* 'account_deleted'
   limit 1;

if c is not null then
    for rec in select (regexp_matches(def, $q$([^']+)$q$, 'g'))[1] as action loop
      members := array_append(members, rec.action);
    end loop;
    execute format('alter table public.audit_logs drop constraint %I', c);
  end if;

for rec in select distinct action from public.audit_logs loop
    members := array_append(members, rec.action);
  end loop;

members := members || array['team_workflow_run'];

select string_agg(quote_literal(x), ',' order by x) into lit
    from (select distinct unnest(members) as x) t;

execute format('alter table public.audit_logs add constraint audit_logs_action_check check (action = ANY (ARRAY[%s]::text[]))', lit);
end $$;
