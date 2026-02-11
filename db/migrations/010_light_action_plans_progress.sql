-- LITE: plano 30d + progresso declarado (write-once)

create table if not exists public.light_action_plans (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  process text not null check (process in ('COMERCIAL','OPERACOES','ADM_FIN','GESTAO')),
  free_action_id uuid not null references public.assessment_free_actions(id) on delete cascade,
  step_1 text not null,
  step_2 text not null,
  step_3 text not null,
  owner_name text not null,
  metric text not null,
  checkpoint_date date not null,
  created_by_user_id uuid not null references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique (free_action_id)
);

create index if not exists ix_light_action_plans_assessment_id
  on public.light_action_plans (assessment_id);

create index if not exists ix_light_action_plans_company_id
  on public.light_action_plans (company_id);

create index if not exists ix_light_action_plans_free_action_id
  on public.light_action_plans (free_action_id);

create table if not exists public.light_action_progress (
  id uuid primary key default gen_random_uuid(),
  free_action_id uuid not null references public.assessment_free_actions(id) on delete cascade,
  done_criteria_json jsonb not null default '[]'::jsonb,
  declared_gain_type text not null,
  declared_gain_note text not null,
  created_by_user_id uuid not null references auth.users(id),
  created_at timestamptz default now(),

  unique (free_action_id)
);

create index if not exists ix_light_action_progress_free_action_id
  on public.light_action_progress (free_action_id);
