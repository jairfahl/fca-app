-- Migration 023: Motor de Causa — respostas e causas por gap
-- full_cause_answers: respostas LIKERT_5 por pergunta de causa
-- full_gap_causes: causa primária/secundária calculada por gap

CREATE TABLE IF NOT EXISTS public.full_cause_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  assessment_id UUID NOT NULL REFERENCES public.full_assessments(id) ON DELETE CASCADE,
  gap_id TEXT NOT NULL,
  q_id TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (assessment_id, gap_id, q_id)
);

CREATE INDEX IF NOT EXISTS ix_full_cause_answers_assessment ON public.full_cause_answers(assessment_id);
CREATE INDEX IF NOT EXISTS ix_full_cause_answers_gap ON public.full_cause_answers(assessment_id, gap_id);

-- full_gap_causes: resultado do engine (causa primária, evidências, scores)
CREATE TABLE IF NOT EXISTS public.full_gap_causes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  assessment_id UUID NOT NULL REFERENCES public.full_assessments(id) ON DELETE CASCADE,
  gap_id TEXT NOT NULL,
  cause_primary TEXT NOT NULL,
  cause_secondary TEXT,
  evidence_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  score_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  version TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (assessment_id, gap_id)
);

CREATE INDEX IF NOT EXISTS ix_full_gap_causes_assessment ON public.full_gap_causes(assessment_id);
