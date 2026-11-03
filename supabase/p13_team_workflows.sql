-- p13: team-scoped (shared) workflows. RLS enabled with no policies:
-- service-role access only, authorization enforced in server routes.
-- Team deletion cascades shared workflows away. Audit reuses the existing
-- 'workflow_created' action with metadata {resource: "team_workflow"} —
-- no audit-constraint change needed.

create table if not exists public.team_workflows (
  team_id uuid not null references public.teams(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 200),
  name text not null check (char_length(name) between 1 and 100),
  description text not null default '' check (char_length(description) <= 500),
  steps jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) <= 30),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (team_id, id)
);

create index if not exists team_workflows_team_idx on public.team_workflows (team_id);

alter table public.team_workflows enable row level security;
