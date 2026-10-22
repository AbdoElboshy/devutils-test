-- Phase 5: pinned tools (with user-defined ordering) and personal collections.
-- Follows conventions from 202609200001_platform.sql:
--   * per-user ownership with auth.users(id) on delete cascade
--   * row level security + per-user policies via (select auth.uid())
--   * least-privilege grants to authenticated only
--   * check constraints on all text lengths and enums

create table if not exists public.pinned_tools (
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_id text not null check (char_length(tool_id) between 1 and 200),
  sort_order integer not null default 0 check (sort_order between 0 and 999),
  created_at timestamptz not null default now(),
  primary key(user_id, tool_id)
);

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  description text not null default '' check (char_length(description) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, name)
);

create table if not exists public.collection_items (
  collection_id uuid not null references public.collections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('tool','toolkit','workflow','integration')),
  target_id text not null check (char_length(target_id) between 1 and 200),
  sort_order integer not null default 0 check (sort_order between 0 and 999),
  added_at timestamptz not null default now(),
  primary key(collection_id, target_id)
);

create index if not exists pinned_user_order_idx on public.pinned_tools(user_id, sort_order);
create index if not exists collections_user_time_idx on public.collections(user_id, updated_at desc);
create index if not exists collection_items_user_idx on public.collection_items(user_id);
create index if not exists collection_items_collection_idx on public.collection_items(collection_id, sort_order);

alter table public.pinned_tools enable row level security;
alter table public.collections enable row level security;
alter table public.collection_items enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant select, insert, update, delete on public.pinned_tools to authenticated;
grant select, insert, update, delete on public.collections to authenticated;
grant select, insert, update, delete on public.collection_items to authenticated;

create policy "pinned_select_own" on public.pinned_tools for select to authenticated using ((select auth.uid()) = user_id);
create policy "pinned_insert_own" on public.pinned_tools for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "pinned_update_own" on public.pinned_tools for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "pinned_delete_own" on public.pinned_tools for delete to authenticated using ((select auth.uid()) = user_id);

create policy "collections_select_own" on public.collections for select to authenticated using ((select auth.uid()) = user_id);
create policy "collections_insert_own" on public.collections for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "collections_update_own" on public.collections for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "collections_delete_own" on public.collections for delete to authenticated using ((select auth.uid()) = user_id);

create policy "collection_items_select_own" on public.collection_items for select to authenticated using ((select auth.uid()) = user_id);
create policy "collection_items_insert_own" on public.collection_items for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "collection_items_update_own" on public.collection_items for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "collection_items_delete_own" on public.collection_items for delete to authenticated using ((select auth.uid()) = user_id);
