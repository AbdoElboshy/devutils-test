-- p11: persistent sliding-window rate limiting for the /api/v1 gateway.
-- One row per accepted execute request. The gateway counts rows inside the
-- last 60 seconds per key and prunes older rows opportunistically.
-- Read/written only by the service role; RLS enabled with no policies so
-- anon/authenticated roles are denied by default.
create table if not exists public.rate_limit_hits (
  id bigint generated always as identity primary key,
  key_id text not null,
  hit_at timestamptz not null default now()
);

create index if not exists rate_limit_hits_key_time_idx
  on public.rate_limit_hits (key_id, hit_at desc);

alter table public.rate_limit_hits enable row level security;
