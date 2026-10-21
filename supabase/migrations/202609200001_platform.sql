create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 100),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 1000),
  timezone text not null default 'UTC' check (char_length(timezone) <= 100),
  locale text not null default 'en' check (char_length(locale) <= 20),
  theme text not null default 'system' check (theme in ('light','dark','system')),
  preferences jsonb not null default '{}'::jsonb check (jsonb_typeof(preferences) = 'object' and pg_column_size(preferences) <= 8192),
  plan_id text not null default 'free' check (plan_id in ('free','pro','team','enterprise')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('tool','toolkit','workflow','integration')),
  target_id text not null check (char_length(target_id) between 1 and 200),
  created_at timestamptz not null default now(),
  unique(user_id, kind, target_id)
);

create table if not exists public.recent_tools (
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_id text not null check (char_length(tool_id) between 1 and 200),
  opened_at timestamptz not null default now(),
  primary key(user_id, tool_id)
);

create table if not exists public.saved_workflows (
  id text not null check (char_length(id) between 1 and 200),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  description text not null default '' check (char_length(description) <= 500),
  steps jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) <= 30),
  source text not null default 'custom' check (source in ('template','custom')),
  version integer not null default 1 check (version = 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id, id)
);

create table if not exists public.saved_presets (
  id text not null check (char_length(id) between 1 and 200),
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_id text not null check (char_length(tool_id) between 1 and 200),
  name text not null check (char_length(name) between 1 and 100),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object' and pg_column_size(config) <= 32768),
  version integer not null default 1 check (version = 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id, id)
);

create table if not exists public.usage_records (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  metric text not null check (metric in ('tool_runs','workflow_runs','api_requests','integration_calls','requests_per_day','api_requests_per_month','batch_operations')),
  resource_id text check (resource_id is null or char_length(resource_id) <= 200),
  quantity integer not null default 1 check (quantity between 1 and 1000),
  recorded_at timestamptz not null default now()
);

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  prefix text not null check (char_length(prefix) between 8 and 24),
  key_hash text not null unique check (char_length(key_hash) = 64),
  scopes text[] not null default array['tools:execute']::text[] check (cardinality(scopes) between 1 and 10),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create table if not exists public.subscriptions (
  id text primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  provider text not null check (provider in ('stripe','paddle','lemonsqueezy')),
  provider_customer_id text,
  provider_subscription_id text,
  plan_id text not null check (plan_id in ('free','pro','team','enterprise')),
  status text not null check (status in ('trialing','active','past_due','canceled')),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  integration_id text not null check (char_length(integration_id) between 1 and 100),
  display_name text not null check (char_length(display_name) between 1 and 100),
  endpoint text check (endpoint is null or char_length(endpoint) <= 1000),
  status text not null default 'disconnected' check (status in ('disconnected','connected','error')),
  capabilities text[] not null default '{}',
  secret_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_tested_at timestamptz,
  unique(user_id, integration_id, display_name)
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('logged_in','profile_updated','password_changed','api_key_created','api_key_revoked','workflow_created','integration_connected','integration_disconnected','account_deleted')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 8192),
  created_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  plan_id text not null default 'team' check (plan_id in ('team','enterprise')),
  created_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  primary key(organization_id, user_id)
);

create index if not exists favorites_user_idx on public.favorites(user_id);
create index if not exists recent_tools_user_time_idx on public.recent_tools(user_id, opened_at desc);
create index if not exists workflows_user_time_idx on public.saved_workflows(user_id, updated_at desc);
create index if not exists presets_user_tool_idx on public.saved_presets(user_id, tool_id);
create index if not exists usage_user_metric_time_idx on public.usage_records(user_id, metric, recorded_at desc);
create index if not exists api_keys_user_idx on public.api_keys(user_id, revoked_at);
create index if not exists integrations_user_idx on public.integration_connections(user_id);
create index if not exists audit_user_time_idx on public.audit_logs(user_id, created_at desc);
create index if not exists org_members_user_idx on public.organization_members(user_id);

alter table public.profiles enable row level security;
alter table public.favorites enable row level security;
alter table public.recent_tools enable row level security;
alter table public.saved_workflows enable row level security;
alter table public.saved_presets enable row level security;
alter table public.usage_records enable row level security;
alter table public.api_keys enable row level security;
alter table public.subscriptions enable row level security;
alter table public.integration_connections enable row level security;
alter table public.audit_logs enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles to authenticated;
grant insert(user_id, display_name, avatar_url, timezone, locale, theme, preferences) on public.profiles to authenticated;
grant update(display_name, avatar_url, timezone, locale, theme, preferences, updated_at) on public.profiles to authenticated;
grant select, insert, delete on public.favorites to authenticated;
grant select, insert, update, delete on public.recent_tools, public.saved_workflows, public.saved_presets to authenticated;
grant select on public.usage_records, public.api_keys, public.subscriptions, public.integration_connections, public.audit_logs, public.organizations, public.organization_members to authenticated;

create policy "profile_select_own" on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "profile_insert_own" on public.profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "profile_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "favorites_select_own" on public.favorites for select to authenticated using ((select auth.uid()) = user_id);
create policy "favorites_insert_own" on public.favorites for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "favorites_delete_own" on public.favorites for delete to authenticated using ((select auth.uid()) = user_id);

create policy "recent_select_own" on public.recent_tools for select to authenticated using ((select auth.uid()) = user_id);
create policy "recent_insert_own" on public.recent_tools for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "recent_update_own" on public.recent_tools for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "recent_delete_own" on public.recent_tools for delete to authenticated using ((select auth.uid()) = user_id);

create policy "workflows_select_own" on public.saved_workflows for select to authenticated using ((select auth.uid()) = user_id);
create policy "workflows_insert_own" on public.saved_workflows for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "workflows_update_own" on public.saved_workflows for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "workflows_delete_own" on public.saved_workflows for delete to authenticated using ((select auth.uid()) = user_id);

create policy "presets_select_own" on public.saved_presets for select to authenticated using ((select auth.uid()) = user_id);
create policy "presets_insert_own" on public.saved_presets for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "presets_update_own" on public.saved_presets for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "presets_delete_own" on public.saved_presets for delete to authenticated using ((select auth.uid()) = user_id);

create policy "usage_select_own" on public.usage_records for select to authenticated using ((select auth.uid()) = user_id);
create policy "keys_select_own" on public.api_keys for select to authenticated using ((select auth.uid()) = user_id);
create policy "subscriptions_select_own" on public.subscriptions for select to authenticated using ((select auth.uid()) = user_id);
create policy "integrations_select_own" on public.integration_connections for select to authenticated using ((select auth.uid()) = user_id);
create policy "audit_select_own" on public.audit_logs for select to authenticated using ((select auth.uid()) = user_id);
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
create or replace function private.is_org_member(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.organization_members where organization_id = p_organization_id and user_id = (select auth.uid()));
$$;
revoke all on function private.is_org_member(uuid) from public, anon;
grant execute on function private.is_org_member(uuid) to authenticated;
create policy "org_select_member" on public.organizations for select to authenticated using (private.is_org_member(id));
create policy "org_members_select_member" on public.organization_members for select to authenticated using (private.is_org_member(organization_id));

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(user_id, display_name) values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 100)) on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function private.audit_profile_change() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_logs(user_id, action, metadata) values (new.user_id, 'profile_updated', '{}'::jsonb);
  return new;
end;
$$;
create or replace function private.audit_workflow_create() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_logs(user_id, action, metadata) values (new.user_id, 'workflow_created', jsonb_build_object('workflow_id', new.id));
  return new;
end;
$$;
drop trigger if exists audit_profile_updated on public.profiles;
create trigger audit_profile_updated after update on public.profiles for each row execute procedure private.audit_profile_change();
drop trigger if exists audit_workflow_created on public.saved_workflows;
create trigger audit_workflow_created after insert on public.saved_workflows for each row execute procedure private.audit_workflow_create();

create or replace function public.record_usage(p_metric text, p_quantity integer default 1, p_resource_id text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if p_metric not in ('tool_runs','workflow_runs','api_requests','integration_calls','requests_per_day','api_requests_per_month','batch_operations') then raise exception 'Invalid metric'; end if;
  if p_quantity < 1 or p_quantity > 1000 then raise exception 'Invalid quantity'; end if;
  insert into public.usage_records(user_id, metric, resource_id, quantity) values ((select auth.uid()), p_metric, left(p_resource_id, 200), p_quantity);
end;
$$;
revoke all on function public.record_usage(text, integer, text) from public, anon;
grant execute on function public.record_usage(text, integer, text) to authenticated;

create or replace function public.get_usage_summary()
returns table(tool_runs bigint, workflow_runs bigint, api_requests bigint, integration_calls bigint, period_start timestamptz)
language sql security invoker set search_path = '' as $$
  select
    coalesce(sum(quantity) filter (where metric = 'tool_runs'), 0),
    coalesce(sum(quantity) filter (where metric = 'workflow_runs'), 0),
    coalesce(sum(quantity) filter (where metric = 'api_requests'), 0),
    coalesce(sum(quantity) filter (where metric = 'integration_calls'), 0),
    date_trunc('month', now())
  from public.usage_records
  where user_id = (select auth.uid()) and recorded_at >= date_trunc('month', now());
$$;
revoke all on function public.get_usage_summary() from public, anon;
grant execute on function public.get_usage_summary() to authenticated;

create or replace function public.consume_api_request(p_user_id uuid, p_key_id uuid, p_monthly_limit integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare current_usage bigint;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text || date_trunc('month', now())::text));
  select coalesce(sum(quantity), 0) into current_usage from public.usage_records
    where user_id = p_user_id and metric = 'api_requests' and recorded_at >= date_trunc('month', now());
  if p_monthly_limit is not null and current_usage >= p_monthly_limit then return false; end if;
  insert into public.usage_records(user_id, metric, resource_id, quantity) values (p_user_id, 'api_requests', p_key_id::text, 1);
  update public.api_keys set last_used_at = now() where id = p_key_id and user_id = p_user_id;
  return true;
end;
$$;
revoke all on function public.consume_api_request(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_api_request(uuid, uuid, integer) to service_role;