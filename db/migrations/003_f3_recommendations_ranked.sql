-- F3: tabela coerente para recomendações rankeadas (determinismo + refresh-safe)
-- NÃO reutiliza a tabela existente assessment_recommendations (que tem colunas de tarefa/execução)

create table if not exists public.assessment_recommendations_ranked (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  recommendation_id uuid not null references public.recommendations_catalog(id),
  process text not null check (process in ('COMERCIAL','OPERACOES','ADM_FIN','GESTAO')),
  rank int not null check (rank >= 1 and rank <= 10),
  created_at timestamptz default now(),

  unique (assessment_id, rank),
  unique (assessment_id, recommendation_id)
);

create index if not exists ix_arr_assessment on public.assessment_recommendations_ranked (assessment_id);
