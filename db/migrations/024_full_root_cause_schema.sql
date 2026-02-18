-- Migration 024: Root Cause Engine — modelo de dados DB-first
-- Taxonomia, mecanismos, question sets, regras, gap instances.
-- Preserva full_cause_answers e full_gap_causes (023); novas tabelas normalizam catálogo.

-- ============================================================================
-- 1. TAXONOMIA DE CAUSAS (fechada)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.full_cause_taxonomy (
  id TEXT PRIMARY KEY,
  label_cliente TEXT NOT NULL,
  descricao_cliente TEXT,
  mecanismo_primario TEXT,
  version TEXT NOT NULL DEFAULT '1.0.0',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_full_cause_taxonomy_version ON public.full_cause_taxonomy(version);

-- ============================================================================
-- 2. MECANISMOS (por causa)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.full_cause_mechanisms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cause_id TEXT NOT NULL REFERENCES public.full_cause_taxonomy(id) ON DELETE CASCADE,
  mechanism_key TEXT NOT NULL,
  label_cliente TEXT NOT NULL,
  descricao_cliente TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  version TEXT NOT NULL DEFAULT '1.0.0',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (cause_id, mechanism_key)
);

CREATE INDEX IF NOT EXISTS ix_full_cause_mechanisms_cause ON public.full_cause_mechanisms(cause_id);
CREATE INDEX IF NOT EXISTS ix_full_cause_mechanisms_version ON public.full_cause_mechanisms(version);

-- ============================================================================
-- 3. OPÇÕES DE RESPOSTA (objetivas; sem campo aberto no MVP)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.full_cause_answer_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_type TEXT NOT NULL,
  option_value TEXT NOT NULL,
  label_cliente TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  version TEXT NOT NULL DEFAULT '1.0.0',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (question_type, option_value)
);

CREATE INDEX IF NOT EXISTS ix_full_cause_answer_options_type ON public.full_cause_answer_options(question_type);

-- ============================================================================
-- 4. QUESTION SETS (por gap/processo; versionado)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.full_cause_question_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gap_id TEXT NOT NULL,
  process_key TEXT NOT NULL REFERENCES public.full_process_catalog(process_key) ON DELETE CASCADE,
  titulo_cliente TEXT,
  descricao_cliente TEXT,
  version TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (gap_id, version)
);

CREATE INDEX IF NOT EXISTS ix_full_cause_question_sets_gap ON public.full_cause_question_sets(gap_id);
CREATE INDEX IF NOT EXISTS ix_full_cause_question_sets_version ON public.full_cause_question_sets(version);

-- ============================================================================
-- 5. PERGUNTAS DE CAUSA
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.full_cause_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_set_id UUID NOT NULL REFERENCES public.full_cause_question_sets(id) ON DELETE CASCADE,
  q_id TEXT NOT NULL,
  texto_cliente TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'LIKERT_5',
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (question_set_id, q_id)
);

CREATE INDEX IF NOT EXISTS ix_full_cause_questions_set ON public.full_cause_questions(question_set_id);

-- ============================================================================
-- 6. REGRAS (weights/if-then; versionadas)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.full_cause_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_set_id UUID NOT NULL REFERENCES public.full_cause_question_sets(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL,
  version TEXT NOT NULL,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (question_set_id, version)
);

CREATE INDEX IF NOT EXISTS ix_full_cause_rules_set ON public.full_cause_rules(question_set_id);

-- ============================================================================
-- 7. GAP INSTANCES (instâncias detectadas no submit)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.full_gap_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES public.full_assessments(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  gap_id TEXT NOT NULL,
  process_key TEXT NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'submit',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (assessment_id, gap_id)
);

CREATE INDEX IF NOT EXISTS ix_full_gap_instances_assessment ON public.full_gap_instances(assessment_id);
CREATE INDEX IF NOT EXISTS ix_full_gap_instances_company ON public.full_gap_instances(company_id);

-- ============================================================================
-- 8. AÇÕES POR MECANISMO (gap → causa → action_key)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.full_cause_mechanism_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gap_id TEXT NOT NULL,
  cause_id TEXT NOT NULL REFERENCES public.full_cause_taxonomy(id) ON DELETE CASCADE,
  action_key TEXT NOT NULL,
  titulo_cliente TEXT,
  porque TEXT,
  primeiro_passo_30d TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  version TEXT NOT NULL DEFAULT '1.0.0',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (gap_id, cause_id, action_key)
);

CREATE INDEX IF NOT EXISTS ix_full_cause_mechanism_actions_gap ON public.full_cause_mechanism_actions(gap_id);
CREATE INDEX IF NOT EXISTS ix_full_cause_mechanism_actions_cause ON public.full_cause_mechanism_actions(cause_id);

-- ============================================================================
-- 9. ADAPTAR full_action_catalog (coluna opcional mechanism_id)
-- ============================================================================

ALTER TABLE public.full_action_catalog
  ADD COLUMN IF NOT EXISTS cause_mechanism_id UUID REFERENCES public.full_cause_mechanisms(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_full_action_catalog_mechanism ON public.full_action_catalog(cause_mechanism_id)
  WHERE cause_mechanism_id IS NOT NULL;

-- ============================================================================
-- 10. ADAPTAR full_recommendation_catalog (coluna opcional cause_id)
-- ============================================================================

ALTER TABLE public.full_recommendation_catalog
  ADD COLUMN IF NOT EXISTS cause_id TEXT REFERENCES public.full_cause_taxonomy(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_full_recommendation_catalog_cause ON public.full_recommendation_catalog(cause_id)
  WHERE cause_id IS NOT NULL;

-- ============================================================================
-- 11. RLS (catálogos: SELECT para autenticados; gap_instances: via company)
-- ============================================================================

ALTER TABLE public.full_cause_taxonomy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.full_cause_mechanisms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.full_cause_answer_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.full_cause_question_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.full_cause_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.full_cause_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.full_gap_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.full_cause_mechanism_actions ENABLE ROW LEVEL SECURITY;

-- Catálogos: leitura para autenticados (sem dados sensíveis)
DROP POLICY IF EXISTS full_cause_taxonomy_select ON public.full_cause_taxonomy;
CREATE POLICY full_cause_taxonomy_select ON public.full_cause_taxonomy
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS full_cause_mechanisms_select ON public.full_cause_mechanisms;
CREATE POLICY full_cause_mechanisms_select ON public.full_cause_mechanisms
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS full_cause_answer_options_select ON public.full_cause_answer_options;
CREATE POLICY full_cause_answer_options_select ON public.full_cause_answer_options
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS full_cause_question_sets_select ON public.full_cause_question_sets;
CREATE POLICY full_cause_question_sets_select ON public.full_cause_question_sets
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS full_cause_questions_select ON public.full_cause_questions;
CREATE POLICY full_cause_questions_select ON public.full_cause_questions
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS full_cause_rules_select ON public.full_cause_rules;
CREATE POLICY full_cause_rules_select ON public.full_cause_rules
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS full_cause_mechanism_actions_select ON public.full_cause_mechanism_actions;
CREATE POLICY full_cause_mechanism_actions_select ON public.full_cause_mechanism_actions
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- full_gap_instances: via company (padrão full_*)
DROP POLICY IF EXISTS full_gap_instances_all ON public.full_gap_instances;
CREATE POLICY full_gap_instances_all ON public.full_gap_instances
  FOR ALL
  USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      WHERE c.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT c.id FROM public.companies c
      WHERE c.owner_user_id = auth.uid()
    )
  );
