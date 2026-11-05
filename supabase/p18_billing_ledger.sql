-- p18: provider-independent billing ledger. Records every plan change with
-- old/new plan, source, and who recorded it. RLS enabled with NO policies
-- (service-role only; authorization enforced in routes). No new audit_logs
-- actions are required, so the action constraint is NOT rebuilt here.

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'plan_change' check (kind in ('plan_change','plan_note')),
  old_plan_id text,
  new_plan_id text not null,
  source text not null default 'admin' check (source in ('admin','api','system')),
  note text check (char_length(coalesce(note,'')) <= 500),
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists billing_events_user_idx on public.billing_events(user_id, created_at desc);

alter table public.billing_events enable row level security;
revoke all on public.billing_events from anon, authenticated;
