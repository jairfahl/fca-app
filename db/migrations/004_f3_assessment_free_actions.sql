-- F3: ações gratuitas vinculadas ao assessment (não confundir com public.free_actions genérica)

create table if not exists public.assessment_free_actions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  recommendation_id uuid not null references public.recommendations_catalog(id),
  process text not null check (process in ('COMERCIAL','OPERACOES','ADM_FIN','GESTAO')),
  status text not null default 'ACTIVE',
  created_at timestamptz default now(),

  unique (assessment_id, process),
  unique (assessment_id, recommendation_id)
);

create index if not exists ix_assessment_free_actions_assessment_id
  on public.assessment_free_actions (assessment_id);
