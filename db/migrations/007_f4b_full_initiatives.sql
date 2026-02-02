-- F4-B: Iniciativas FULL (persistidas e determinísticas)

create table if not exists public.full_initiatives (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  process text not null check (process in ('COMERCIAL','OPERACOES','ADM_FIN','GESTAO')),
  initiative_code text not null,
  title text not null,
  rationale text not null,
  expected_impact text not null,
  priority int not null check (priority between 1 and 10),
  created_at timestamptz default now(),

  unique (assessment_id, initiative_code)
);

create index if not exists ix_full_initiatives_assessment
  on public.full_initiatives (assessment_id);
