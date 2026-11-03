-- p12: team workspaces. Two tables, RLS enabled with no policies
-- (service-role access only; authorization is enforced in server routes).
-- Also extends the audit_logs action constraint to the full p12 list,
-- subsuming supabase/p12_plan_audit.sql (plan_changed included).

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create index if not exists team_members_user_idx on public.team_members (user_id);

alter table public.teams enable row level security;
alter table public.team_members enable row level security;

do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.audit_logs'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%account_deleted%'
   limit 1;
  if c is not null then
    execute format('alter table public.audit_logs drop constraint %I', c);
  end if;
  alter table public.audit_logs add constraint audit_logs_action_check
    check (action in ('logged_in','profile_updated','password_changed','api_key_created','api_key_revoked',
                      'workflow_created','integration_connected','integration_disconnected','account_deleted',
                      'plan_changed','team_created','team_member_added','team_member_removed','team_deleted'));
end $$;
