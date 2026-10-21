-- DevUtils: Tools Management, administrator authorization, and analytics.
-- Requires 202609200001_platform.sql to be applied first.
--
-- Design notes:
--   * Code (src/lib/registry.ts -> registry.generated.json) remains the source of
--     truth for tool implementations. These tables store administrator-editable
--     metadata overlays only: no executable code, SQL, or shell is ever stored.
--   * Administrator membership lives in admin_users and is checked by the Node
--     gateway with the service role. Users cannot self-promote: the table has no
--     client grants and no permissive RLS policy.
BEGIN;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);

create table if not exists public.tool_overrides (
  id text primary key check (char_length(id) between 2 and 64),
  name text check (name is null or char_length(name) between 2 and 80),
  slug text check (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text check (description is null or char_length(description) between 8 and 240),
  long_description text check (long_description is null or char_length(long_description) <= 1200),
  category text check (category is null or char_length(category) between 2 and 40),
  keywords text[] check (keywords is null or cardinality(keywords) <= 24),
  aliases text[] check (aliases is null or cardinality(aliases) <= 24),
  tags text[] check (tags is null or cardinality(tags) <= 12),
  related text[] check (related is null or cardinality(related) <= 8),
  "order" integer check ("order" is null or ("order" between 0 and 9999)),
  featured boolean,
  enabled boolean,
  visibility text check (visibility is null or visibility in ('published','draft','archived')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (slug)
);

create table if not exists public.category_overrides (
  id text primary key check (char_length(id) between 2 and 40),
  name text check (name is null or char_length(name) between 2 and 60),
  slug text check (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text check (description is null or char_length(description) <= 400),
  tagline text check (tagline is null or char_length(tagline) <= 160),
  "order" integer check ("order" is null or ("order" between 0 and 999)),
  enabled boolean,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (slug)
);

create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  actor_kind text not null default 'anonymous' check (actor_kind in ('anonymous','user')),
  user_id uuid references auth.users(id) on delete set null,
  event_name text not null check (event_name in (
    'tool_opened','tool_completed','tool_copied','tool_downloaded','search_used',
    'category_visited','auth_success','auth_failure','tool_config_changed','tool_visibility_changed'
  )),
  tool_id text check (tool_id is null or char_length(tool_id) <= 64),
  category_id text check (category_id is null or char_length(category_id) <= 40),
  outcome text check (outcome is null or outcome in ('success','failure')),
  occurred_at timestamptz not null default now()
);

-- Privacy: analytics stores identifiers and counters only. There is deliberately
-- no column for tool input, output, payloads, tokens, or free-form metadata.

create index if not exists analytics_events_time_idx on public.analytics_events(occurred_at desc);
create index if not exists analytics_events_name_time_idx on public.analytics_events(event_name, occurred_at desc);
create index if not exists analytics_events_tool_idx on public.analytics_events(tool_id, occurred_at desc);
create index if not exists tool_overrides_order_idx on public.tool_overrides("order");
create index if not exists audit_logs_time_idx on public.audit_logs(created_at desc);

alter table public.admin_users enable row level security;
alter table public.tool_overrides enable row level security;
alter table public.category_overrides enable row level security;
alter table public.analytics_events enable row level security;

-- Published tool metadata is public read-only data.
-- Override rows may contain draft or hidden metadata.
-- Access these tables only through the Node.js gateway.
revoke all on public.tool_overrides from anon, authenticated;
revoke all on public.category_overrides from anon, authenticated;


-- Administrator tables and analytics are never writable by the browser client.
-- The Node gateway uses the service role, which bypasses RLS by design and is
-- kept server-side only.
revoke all on public.admin_users from anon, authenticated;
revoke all on public.analytics_events from anon, authenticated;

create policy "tool_overrides_public_read" on public.tool_overrides
  for select to anon, authenticated using (true);
create policy "category_overrides_public_read" on public.category_overrides
  for select to anon, authenticated using (true);

-- Retention helper: prune analytics older than the configured window.
create or replace function public.prune_analytics(p_days integer default 120)
returns integer language plpgsql security definer set search_path = '' as $$
declare removed integer;
begin
  if p_days < 1 or p_days > 3650 then
    raise exception 'Retention window must be between 1 and 3650 days';
  end if;
  delete from public.analytics_events where occurred_at < now() - make_interval(days => p_days);
  get diagnostics removed = row_count;
  return removed;
end;
$$;
revoke all on function public.prune_analytics(integer) from public, anon, authenticated;
grant execute on function public.prune_analytics(integer) to service_role;

-- Administrator bootstrap helper. Intentionally service_role only: there is no
-- client path to promote a user. Documented in docs/TOOLS_MANAGEMENT.md.
create or replace function public.grant_admin(p_user_id uuid, p_granted_by uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user_id is null then raise exception 'p_user_id is required'; end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'No auth.users row with that id';
  end if;
  insert into public.admin_users(user_id, role, created_by)
  values (p_user_id, 'admin', p_granted_by)
  on conflict (user_id) do update set role = 'admin', revoked_at = null;
end;
$$;
revoke all on function public.grant_admin(uuid, uuid) from public, anon, authenticated;
grant execute on function public.grant_admin(uuid, uuid) to service_role;

create or replace function public.revoke_admin(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.admin_users set revoked_at = now() where user_id = p_user_id;
end;
$$;
revoke all on function public.revoke_admin(uuid) from public, anon, authenticated;
grant execute on function public.revoke_admin(uuid) to service_role;
COMMIT;
