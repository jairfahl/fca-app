-- F3: evidências write-once para ações gratuitas do assessment
-- Fonte de verdade F3 (coerente com assessment_free_actions e auth.users)

create table if not exists public.assessment_free_action_evidences (
  id uuid primary key default gen_random_uuid(),
  free_action_id uuid not null references public.assessment_free_actions(id) on delete cascade,
  evidence_text text not null,
  created_by_user_id uuid not null references auth.users(id),
  created_at timestamptz default now(),

  unique (free_action_id) -- write-once
);

create index if not exists ix_afae_free_action_id
  on public.assessment_free_action_evidences (free_action_id);
