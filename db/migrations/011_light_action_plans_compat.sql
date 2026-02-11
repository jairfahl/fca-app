-- LITE: ajustes compatíveis para planos 30d e progresso declarado

-- 1) light_action_plans: owner_user_id + locked + unique (owner_user_id, assessment_id, process)
alter table public.light_action_plans
  add column if not exists owner_user_id uuid references auth.users(id),
  add column if not exists assessment_free_action_id uuid references public.assessment_free_actions(id),
  add column if not exists locked boolean not null default false;

-- garantir coluna owner_user_id preenchida quando ausente (não falha se não houver dados)
update public.light_action_plans
  set owner_user_id = created_by_user_id
  where owner_user_id is null;

alter table public.light_action_plans
  alter column owner_user_id set not null;

create unique index if not exists ux_light_action_plans_owner_assessment_process
  on public.light_action_plans (owner_user_id, assessment_id, process);

-- RLS
alter table public.light_action_plans enable row level security;

drop policy if exists light_action_plans_select on public.light_action_plans;
create policy light_action_plans_select on public.light_action_plans
  for select
  using (owner_user_id = auth.uid());

drop policy if exists light_action_plans_insert on public.light_action_plans;
create policy light_action_plans_insert on public.light_action_plans
  for insert
  with check (owner_user_id = auth.uid());

drop policy if exists light_action_plans_update on public.light_action_plans;
create policy light_action_plans_update on public.light_action_plans
  for update
  using (owner_user_id = auth.uid() and locked = false)
  with check (owner_user_id = auth.uid());

-- 2) evidências: campos opcionais para progresso declarado
alter table public.assessment_free_action_evidences
  add column if not exists declared_gain_type text,
  add column if not exists declared_gain_note text,
  add column if not exists done_criteria_json jsonb;

-- RLS para evidências (owner_user_id)
alter table public.assessment_free_action_evidences enable row level security;

drop policy if exists afae_select on public.assessment_free_action_evidences;
create policy afae_select on public.assessment_free_action_evidences
  for select
  using (created_by_user_id = auth.uid());

drop policy if exists afae_insert on public.assessment_free_action_evidences;
create policy afae_insert on public.assessment_free_action_evidences
  for insert
  with check (created_by_user_id = auth.uid());
