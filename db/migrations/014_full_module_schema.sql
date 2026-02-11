-- Migration 014: FULL Module - Schema completo
-- Diagnóstico FULL independente do LIGHT. Área→Processo→Perguntas, scores por banda, catálogo fechado.

-- ============================================================================
-- 1. ENUMS
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.full_status AS ENUM ('DRAFT', 'SUBMITTED', 'CLOSED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.band AS ENUM ('LOW', 'MEDIUM', 'HIGH');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.protects_dimension AS ENUM ('DINHEIRO', 'CLIENTE', 'RISCO', 'GARGALO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.question_dimension AS ENUM ('EXISTENCIA', 'ROTINA', 'DONO', 'CONTROLE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 2. CICLO FULL
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.full_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  segment TEXT NOT NULL CHECK (segment IN ('C', 'I', 'S')),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'CLOSED')),
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1 DRAFT/SUBMITTED por company por vez (ajustável depois)
CREATE UNIQUE INDEX IF NOT EXISTS ux_full_assessments_company_active
  ON public.full_assessments (company_id)
  WHERE status IN ('DRAFT', 'SUBMITTED');

CREATE INDEX IF NOT EXISTS ix_full_assessments_company_id ON public.full_assessments(company_id);
CREATE INDEX IF NOT EXISTS ix_full_assessments_created_by ON public.full_assessments(created_by_user_id);
CREATE INDEX IF NOT EXISTS ix_full_assessments_status ON public.full_assessments(status);

DROP TRIGGER IF EXISTS trigger_full_assessments_updated_at ON public.full_assessments;
CREATE TRIGGER trigger_full_assessments_updated_at
  BEFORE UPDATE ON public.full_assessments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 3. CATÁLOGOS FULL (fechados)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.full_process_catalog (
  area_key TEXT NOT NULL,
  process_key TEXT PRIMARY KEY,
  segment_applicability TEXT[] DEFAULT '{}',
  protects_dimension TEXT NOT NULL CHECK (protects_dimension IN ('DINHEIRO', 'CLIENTE', 'RISCO', 'GARGALO')),
  protects_text TEXT,
  owner_alert_text TEXT,
  typical_impact_band TEXT CHECK (typical_impact_band IN ('LOW', 'MEDIUM', 'HIGH')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.full_question_catalog (
  process_key TEXT NOT NULL REFERENCES public.full_process_catalog(process_key) ON DELETE CASCADE,
  question_key TEXT NOT NULL,
  question_text TEXT NOT NULL,
  dimension TEXT NOT NULL CHECK (dimension IN ('EXISTENCIA', 'ROTINA', 'DONO', 'CONTROLE')),
  weight INT DEFAULT 1 CHECK (weight >= 1),
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (process_key, question_key)
);

CREATE INDEX IF NOT EXISTS ix_full_question_catalog_process ON public.full_question_catalog(process_key);

CREATE TABLE IF NOT EXISTS public.full_recommendation_catalog (
  process_key TEXT NOT NULL REFERENCES public.full_process_catalog(process_key) ON DELETE CASCADE,
  band TEXT NOT NULL CHECK (band IN ('LOW', 'MEDIUM', 'HIGH')),
  recommendation_key TEXT NOT NULL,
  title TEXT NOT NULL,
  owner_language_explanation TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (process_key, band, recommendation_key)
);

CREATE INDEX IF NOT EXISTS ix_full_recommendation_catalog_process ON public.full_recommendation_catalog(process_key);

CREATE TABLE IF NOT EXISTS public.full_action_catalog (
  process_key TEXT NOT NULL REFERENCES public.full_process_catalog(process_key) ON DELETE CASCADE,
  band TEXT NOT NULL CHECK (band IN ('LOW', 'MEDIUM', 'HIGH')),
  action_key TEXT NOT NULL,
  title TEXT NOT NULL,
  benefit_text TEXT,
  metric_hint TEXT,
  dod_checklist JSONB DEFAULT '[]'::jsonb,
  segment_applicability TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (process_key, band, action_key)
);

CREATE INDEX IF NOT EXISTS ix_full_action_catalog_process ON public.full_action_catalog(process_key);

-- ============================================================================
-- 4. RESPOSTAS + SCORING (rastreável)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.full_answers (
  assessment_id UUID NOT NULL REFERENCES public.full_assessments(id) ON DELETE CASCADE,
  process_key TEXT NOT NULL,
  question_key TEXT NOT NULL,
  answer_value INT NOT NULL CHECK (answer_value BETWEEN 0 AND 10),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (assessment_id, process_key, question_key)
);

CREATE INDEX IF NOT EXISTS ix_full_answers_assessment ON public.full_answers(assessment_id);
CREATE INDEX IF NOT EXISTS ix_full_answers_process ON public.full_answers(process_key);

CREATE TABLE IF NOT EXISTS public.full_process_scores (
  assessment_id UUID NOT NULL REFERENCES public.full_assessments(id) ON DELETE CASCADE,
  process_key TEXT NOT NULL,
  score_numeric NUMERIC(5,2) NOT NULL,
  band TEXT NOT NULL CHECK (band IN ('LOW', 'MEDIUM', 'HIGH')),
  explanation_owner_language TEXT,
  support JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (assessment_id, process_key)
);

CREATE INDEX IF NOT EXISTS ix_full_process_scores_assessment ON public.full_process_scores(assessment_id);

-- ============================================================================
-- 5. GERADOS DETERMINÍSTICOS + PLANO MÍNIMO (3 ações)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.full_generated_recommendations (
  assessment_id UUID NOT NULL REFERENCES public.full_assessments(id) ON DELETE CASCADE,
  process_key TEXT NOT NULL,
  band TEXT NOT NULL CHECK (band IN ('LOW', 'MEDIUM', 'HIGH')),
  recommendation_key TEXT NOT NULL,
  action_keys JSONB DEFAULT '[]'::jsonb,
  is_fallback BOOLEAN DEFAULT FALSE,
  gap_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (assessment_id, process_key, recommendation_key)
);

CREATE INDEX IF NOT EXISTS ix_full_generated_recs_assessment ON public.full_generated_recommendations(assessment_id);

CREATE TABLE IF NOT EXISTS public.full_selected_actions (
  assessment_id UUID NOT NULL REFERENCES public.full_assessments(id) ON DELETE CASCADE,
  action_key TEXT NOT NULL,
  process_key TEXT NOT NULL,
  band TEXT NOT NULL CHECK (band IN ('LOW', 'MEDIUM', 'HIGH')),
  position INT NOT NULL CHECK (position BETWEEN 1 AND 3),
  owner_name TEXT NOT NULL,
  metric_text TEXT NOT NULL,
  checkpoint_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'DONE', 'DROPPED')),
  dropped_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (assessment_id, action_key),
  UNIQUE (assessment_id, position)
);

CREATE INDEX IF NOT EXISTS ix_full_selected_actions_assessment ON public.full_selected_actions(assessment_id);

-- ============================================================================
-- 6. EVIDÊNCIA FULL WRITE-ONCE (Antes/Depois)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.full_action_evidence (
  assessment_id UUID NOT NULL REFERENCES public.full_assessments(id) ON DELETE CASCADE,
  action_key TEXT NOT NULL,
  evidence_text TEXT NOT NULL,
  before_baseline TEXT NOT NULL,
  after_result TEXT NOT NULL,
  declared_gain TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (assessment_id, action_key),
  FOREIGN KEY (assessment_id, action_key) REFERENCES public.full_selected_actions(assessment_id, action_key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_full_action_evidence_assessment ON public.full_action_evidence(assessment_id);

-- ============================================================================
-- 7. CONSULTOR (accountability)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.full_consultant_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL,
  action_key TEXT NOT NULL,
  consultant_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note_type TEXT NOT NULL CHECK (note_type IN ('ORIENTACAO', 'IMPEDIMENTO', 'PROXIMO_PASSO')),
  note_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (assessment_id, action_key) REFERENCES public.full_selected_actions(assessment_id, action_key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_full_consultant_notes_assessment ON public.full_consultant_notes(assessment_id);

-- ============================================================================
-- 8. RLS (mínimo viável)
-- ============================================================================

ALTER TABLE public.full_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.full_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.full_process_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.full_generated_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.full_selected_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.full_action_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.full_consultant_notes ENABLE ROW LEVEL SECURITY;

-- Catálogos: leitura pública (não contêm dados sensíveis)
ALTER TABLE public.full_process_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.full_question_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.full_recommendation_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.full_action_catalog ENABLE ROW LEVEL SECURITY;

-- Políticas: usuário acessa apenas assessments da própria company
DROP POLICY IF EXISTS full_assessments_select ON public.full_assessments;
CREATE POLICY full_assessments_select ON public.full_assessments
  FOR SELECT USING (
    company_id IN (SELECT id FROM public.companies WHERE owner_user_id = auth.uid())
  );
DROP POLICY IF EXISTS full_assessments_insert ON public.full_assessments;
CREATE POLICY full_assessments_insert ON public.full_assessments
  FOR INSERT WITH CHECK (
    company_id IN (SELECT id FROM public.companies WHERE owner_user_id = auth.uid())
  );
DROP POLICY IF EXISTS full_assessments_update ON public.full_assessments;
CREATE POLICY full_assessments_update ON public.full_assessments
  FOR UPDATE USING (
    company_id IN (SELECT id FROM public.companies WHERE owner_user_id = auth.uid())
  );

-- Helper: subquery para assessments do usuário
-- full_answers: via assessment -> company
DROP POLICY IF EXISTS full_answers_all ON public.full_answers;
CREATE POLICY full_answers_all ON public.full_answers
  FOR ALL
  USING (
    assessment_id IN (
      SELECT fa.id FROM public.full_assessments fa
      JOIN public.companies c ON c.id = fa.company_id
      WHERE c.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    assessment_id IN (
      SELECT fa.id FROM public.full_assessments fa
      JOIN public.companies c ON c.id = fa.company_id
      WHERE c.owner_user_id = auth.uid()
    )
  );

-- full_process_scores
DROP POLICY IF EXISTS full_process_scores_all ON public.full_process_scores;
CREATE POLICY full_process_scores_all ON public.full_process_scores
  FOR ALL
  USING (
    assessment_id IN (
      SELECT fa.id FROM public.full_assessments fa
      JOIN public.companies c ON c.id = fa.company_id
      WHERE c.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    assessment_id IN (
      SELECT fa.id FROM public.full_assessments fa
      JOIN public.companies c ON c.id = fa.company_id
      WHERE c.owner_user_id = auth.uid()
    )
  );

-- full_generated_recommendations
DROP POLICY IF EXISTS full_generated_recs_all ON public.full_generated_recommendations;
CREATE POLICY full_generated_recs_all ON public.full_generated_recommendations
  FOR ALL
  USING (
    assessment_id IN (
      SELECT fa.id FROM public.full_assessments fa
      JOIN public.companies c ON c.id = fa.company_id
      WHERE c.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    assessment_id IN (
      SELECT fa.id FROM public.full_assessments fa
      JOIN public.companies c ON c.id = fa.company_id
      WHERE c.owner_user_id = auth.uid()
    )
  );

-- full_selected_actions
DROP POLICY IF EXISTS full_selected_actions_all ON public.full_selected_actions;
CREATE POLICY full_selected_actions_all ON public.full_selected_actions
  FOR ALL
  USING (
    assessment_id IN (
      SELECT fa.id FROM public.full_assessments fa
      JOIN public.companies c ON c.id = fa.company_id
      WHERE c.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    assessment_id IN (
      SELECT fa.id FROM public.full_assessments fa
      JOIN public.companies c ON c.id = fa.company_id
      WHERE c.owner_user_id = auth.uid()
    )
  );

-- full_action_evidence
DROP POLICY IF EXISTS full_action_evidence_all ON public.full_action_evidence;
CREATE POLICY full_action_evidence_all ON public.full_action_evidence
  FOR ALL
  USING (
    assessment_id IN (
      SELECT fa.id FROM public.full_assessments fa
      JOIN public.companies c ON c.id = fa.company_id
      WHERE c.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    assessment_id IN (
      SELECT fa.id FROM public.full_assessments fa
      JOIN public.companies c ON c.id = fa.company_id
      WHERE c.owner_user_id = auth.uid()
    )
  );

-- full_consultant_notes
DROP POLICY IF EXISTS full_consultant_notes_all ON public.full_consultant_notes;
CREATE POLICY full_consultant_notes_all ON public.full_consultant_notes
  FOR ALL
  USING (
    assessment_id IN (
      SELECT fa.id FROM public.full_assessments fa
      JOIN public.companies c ON c.id = fa.company_id
      WHERE c.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    assessment_id IN (
      SELECT fa.id FROM public.full_assessments fa
      JOIN public.companies c ON c.id = fa.company_id
      WHERE c.owner_user_id = auth.uid()
    )
  );

-- Catálogos: SELECT para todos autenticados
DROP POLICY IF EXISTS full_process_catalog_select ON public.full_process_catalog;
CREATE POLICY full_process_catalog_select ON public.full_process_catalog
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS full_question_catalog_select ON public.full_question_catalog;
CREATE POLICY full_question_catalog_select ON public.full_question_catalog
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS full_recommendation_catalog_select ON public.full_recommendation_catalog;
CREATE POLICY full_recommendation_catalog_select ON public.full_recommendation_catalog
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS full_action_catalog_select ON public.full_action_catalog;
CREATE POLICY full_action_catalog_select ON public.full_action_catalog
  FOR SELECT USING (auth.uid() IS NOT NULL);
