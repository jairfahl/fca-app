-- F4-B: Catálogo de Iniciativas FULL e Ranking Persistido por Assessment
-- Blueprint oficial: full_initiatives_catalog + full_assessment_initiatives

-- A) Tabela: public.full_initiatives_catalog (catálogo FULL)
create table if not exists public.full_initiatives_catalog (
  id uuid primary key default gen_random_uuid(),
  process text not null check (process in ('COMERCIAL','OPERACOES','ADM_FIN','GESTAO')),
  segment text not null, -- valores esperados: 'SERVICOS','COMERCIO','INDUSTRIA','ALL'
  title text not null,
  rationale text not null,
  impact text not null check (impact in ('HIGH','MED','LOW')),
  horizon text not null check (horizon in ('CURTO','MEDIO')),
  prerequisites_json jsonb not null default '[]'::jsonb,
  dependencies_json jsonb not null default '[]'::jsonb,
  trigger_json jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz default now()
);

-- Índices para full_initiatives_catalog
create index if not exists ix_full_initiatives_catalog_active
  on public.full_initiatives_catalog (active);

create index if not exists ix_full_initiatives_catalog_process
  on public.full_initiatives_catalog (process);

create index if not exists ix_full_initiatives_catalog_segment
  on public.full_initiatives_catalog (segment);

-- B) Tabela: public.full_assessment_initiatives (ranking persistido por assessment)
create table if not exists public.full_assessment_initiatives (
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  initiative_id uuid not null references public.full_initiatives_catalog(id) on delete cascade,
  rank int not null check (rank between 1 and 12),
  process text not null check (process in ('COMERCIAL','OPERACOES','ADM_FIN','GESTAO')),
  created_at timestamptz default now(),

  primary key (assessment_id, initiative_id),
  unique (assessment_id, rank)
);

-- Índices para full_assessment_initiatives
create index if not exists ix_full_assessment_initiatives_assessment
  on public.full_assessment_initiatives (assessment_id);

create index if not exists ix_full_assessment_initiatives_initiative
  on public.full_assessment_initiatives (initiative_id);

-- C) RLS (Row Level Security)

-- Habilitar RLS em full_initiatives_catalog
alter table public.full_initiatives_catalog enable row level security;

-- Policy: SELECT para usuários autenticados (catálogo é público para autenticados)
create policy "full_initiatives_catalog_select_authenticated"
  on public.full_initiatives_catalog
  for select
  using (auth.role() = 'authenticated');

-- Habilitar RLS em full_assessment_initiatives
alter table public.full_assessment_initiatives enable row level security;

-- Policy: SELECT somente se assessment pertence a company do usuário
-- Join: assessments.company_id -> companies.id -> companies.owner_user_id = auth.uid()
create policy "full_assessment_initiatives_select_owner"
  on public.full_assessment_initiatives
  for select
  using (
    exists (
      select 1
      from public.assessments a
      join public.companies c on c.id = a.company_id
      where a.id = full_assessment_initiatives.assessment_id
        and c.owner_user_id = auth.uid()
    )
  );

-- Nota: A tabela public.full_initiatives (criada em 007) permanece como legacy/unused
-- e não será utilizada pela Fase B conforme Blueprint oficial.
