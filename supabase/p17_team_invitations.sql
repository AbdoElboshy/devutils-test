-- p17: team invitations (token links, revocation, single-use accept) and
-- ownership transfer audit action. Mirrors p12/p13 conventions: RLS enabled
-- with NO policies (service-role only; authorization enforced in routes),
-- no grants to anon/authenticated, check constraints on lengths/enums.
-- Rebuilds the audit_logs action constraint idempotently (p14 pattern).

create table if not exists public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  email text not null check (char_length(email) between 3 and 254),
  role text not null default 'member' check (role in ('admin','member')),
  token_hash text not null unique check (char_length(token_hash) = 64),
  invited_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  revoked_at timestamptz,
  accepted_at timestamptz
);

create index if not exists team_invitations_team_idx on public.team_invitations(team_id, created_at desc);
create index if not exists team_invitations_email_idx on public.team_invitations(email);

alter table public.team_invitations enable row level security;
revoke all on public.team_invitations from anon, authenticated;

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

members := members || array['team_invitation_created','team_invitation_revoked',
                               'team_invitation_accepted','team_ownership_transferred'];

select string_agg(quote_literal(x), ',' order by x) into lit
    from (select distinct unnest(members) as x) t;

execute format('alter table public.audit_logs add constraint audit_logs_action_check check (action = ANY (ARRAY[%s]::text[]))', lit);
end $$;
