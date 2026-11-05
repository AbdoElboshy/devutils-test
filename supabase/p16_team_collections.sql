-- p16: team-scoped shared collections.
-- Mirrors p13_team_workflows conventions: text ids (client-minted UUIDs),
-- team_id FK on delete cascade, RLS enabled with NO policies (service-role
-- only; authorization enforced explicitly in each route), no grants to
-- anon/authenticated, check constraints on text lengths and kinds.
-- Also rebuilds the audit_logs action constraint idempotently (p14 pattern)
-- to add 'team_collection_saved' and 'team_collection_deleted'.

create table if not exists public.team_collections (
  id text not null check (char_length(id) between 1 and 200),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  description text not null default '' check (char_length(description) <= 200),
  updated_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (team_id, id),
  unique (team_id, name)
);

create table if not exists public.team_collection_items (
  collection_id text not null,
  team_id uuid not null references public.teams(id) on delete cascade,
  kind text not null check (kind in ('tool','toolkit','workflow','integration')),
  target_id text not null check (char_length(target_id) between 1 and 200),
  sort_order integer not null default 0 check (sort_order between 0 and 999),
  added_at timestamptz not null default now(),
  primary key (collection_id, target_id),
  foreign key (collection_id, team_id) references public.team_collections(id, team_id) on delete cascade
);

create index if not exists team_collections_team_time_idx on public.team_collections(team_id, updated_at desc);
create index if not exists team_collection_items_collection_idx on public.team_collection_items(collection_id, sort_order);

alter table public.team_collections enable row level security;
alter table public.team_collection_items enable row level security;
revoke all on public.team_collections from anon, authenticated;
revoke all on public.team_collection_items from anon, authenticated;

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

members := members || array['team_collection_saved','team_collection_deleted'];

select string_agg(quote_literal(x), ',' order by x) into lit
    from (select distinct unnest(members) as x) t;

execute format('alter table public.audit_logs add constraint audit_logs_action_check check (action = ANY (ARRAY[%s]::text[]))', lit);
end $$;
