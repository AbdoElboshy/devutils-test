-- DevUtils: Phase 6 — administrator role hierarchy, feature flags, and
-- tool/category metadata version history.
-- Requires 202609200001_platform.sql, 202610190002_tools_admin_analytics.sql,
-- and 202610200001_audit_admin_actions.sql to be applied first.
--
-- Design notes:
--   * Role hierarchy: moderator < admin < super_admin. Membership lives in
--     admin_users and is checked server-side by the Node gateway with the
--     service role. Users cannot self-promote: no client grants and no
--     permissive RLS policy on admin tables.
--   * Feature flags are gateway-mediated: the browser reads them through a
--     gateway endpoint, never directly from this table.
--   * Metadata history keeps one row per saved change so any previous
--     configuration version can be inspected and restored.
--   * Migration safety rule (Phase 5 incident): NO schema-wide REVOKE.
--     The REVOKEs below target only tables created in this file, so no
--     pre-existing grant is affected. A post-apply verification query is
--     included at the bottom.

BEGIN;

-- 1. Role hierarchy ------------------------------------------------------------
alter table public.admin_users
  drop constraint if exists admin_users_role_check;

alter table public.admin_users
  add constraint admin_users_role_check
  check (role in ('moderator', 'admin', 'super_admin'));

comment on column public.admin_users.role is
  'moderator: read-only admin surfaces; admin: full tools/user management; super_admin: role management + destructive actions';

-- 2. Audit actions --------------------------------------------------------------
-- Forward migration: widen the action enum for Phase 6 admin actions while
-- preserving every pre-existing action.
alter table public.audit_logs
  drop constraint if exists audit_logs_action_check;

alter table public.audit_logs
  add constraint audit_logs_action_check
  check (action in (
    -- user/account actions (pre-existing)
    'logged_in', 'profile_updated', 'password_changed', 'api_key_created',
    'api_key_revoked', 'workflow_created', 'integration_connected',
    'integration_disconnected', 'account_deleted',
    -- admin tools actions (pre-existing)
    'tool_config_changed', 'tool_visibility_changed',
    -- phase 6: user management
    'user_suspended', 'user_reactivated', 'user_access_revoked',
    -- phase 6: role management
    'admin_role_assigned', 'admin_role_revoked',
    -- phase 6: configuration management
    'feature_flag_changed', 'registry_imported', 'tool_version_restored'
  ));

-- 3. Feature flags ---------------------------------------------------------------
create table if not exists public.feature_flags (
  key text primary key check (key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  description text check (description is null or char_length(description) <= 400),
  enabled boolean not null default false,
  rollout jsonb not null default '{}'::jsonb
    check (rollout = '{}'::jsonb or jsonb_typeof(rollout) = 'object'),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- 4. Tool/category metadata version history --------------------------------------
create table if not exists public.tool_override_versions (
  id bigint generated always as identity primary key,
  tool_id text not null check (char_length(tool_id) between 2 and 64),
  patch jsonb not null,
  change_kind text not null default 'update'
    check (change_kind in ('update', 'reset', 'restore', 'visibility')),
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists tool_override_versions_tool_idx
  on public.tool_override_versions(tool_id, created_at desc);

create table if not exists public.category_override_versions (
  id bigint generated always as identity primary key,
  category_id text not null check (char_length(category_id) between 2 and 40),
  patch jsonb not null,
  change_kind text not null default 'update'
    check (change_kind in ('update', 'reset', 'restore')),
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists category_override_versions_idx
  on public.category_override_versions(category_id, created_at desc);

-- 5. RLS and grants ----------------------------------------------------------------
alter table public.feature_flags enable row level security;
alter table public.tool_override_versions enable row level security;
alter table public.category_override_versions enable row level security;

-- Only tables created by this file. No schema-wide REVOKE (incident rule):
-- pre-existing tables keep every grant they had before this migration.
revoke all on public.feature_flags from anon, authenticated;
revoke all on public.tool_override_versions from anon, authenticated;
revoke all on public.category_override_versions from anon, authenticated;

-- 6. Role helpers (service_role only) ------------------------------------------------
-- admin_role(): resolve a user's effective admin role, or null.
create or replace function public.admin_role(p_user_id uuid)
returns text language sql security definer set search_path = '' as $$
  select role from public.admin_users
  where user_id = p_user_id and revoked_at is null;
$$;
revoke all on function public.admin_role(uuid) from public, anon, authenticated;
grant execute on function public.admin_role(uuid) to service_role;

-- set_admin_role(): assign or change a role (revive a revoked row, or revoke
-- by setting revoked_at via revoke_admin). p_role is validated by the table check.
create or replace function public.set_admin_role(
  p_user_id uuid,
  p_role text,
  p_set_by uuid default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user_id is null then raise exception 'p_user_id is required'; end if;
  if p_role not in ('moderator', 'admin', 'super_admin') then
    raise exception 'p_role must be moderator, admin, or super_admin';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'No auth.users row with that id';
  end if;
  insert into public.admin_users(user_id, role, created_by)
  values (p_user_id, p_role, p_set_by)
  on conflict (user_id) do update
    set role = excluded.role, revoked_at = null;
end;
$$;
revoke all on function public.set_admin_role(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.set_admin_role(uuid, text, uuid) to service_role;

COMMIT;

-- Post-apply verification (Phase 5 incident rule: run after applying).
--
-- 1) Role constraint widened:
--    select role from public.admin_users limit 1;  -- should not error
--
-- 2) New admin tables must NOT be readable by clients (expect 'f' for each):
--    select has_table_privilege('authenticated', 'public.feature_flags', 'select')        as flags,
--           has_table_privilege('authenticated', 'public.tool_override_versions', 'select')    as tool_hist,
--           has_table_privilege('authenticated', 'public.category_override_versions', 'select') as cat_hist;
--
-- 3) Pre-existing tables kept their grants (snapshot and compare with the
--    pre-migration list; the two account-era migrations define the baseline):
--    select table_name, string_agg(privilege_type, ', ' order by privilege_type) as grants
--    from information_schema.role_table_grants
--    where grantee = 'authenticated' and table_schema = 'public'
--    group by table_name order by table_name;
