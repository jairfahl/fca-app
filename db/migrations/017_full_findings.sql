-- Migration 017: FULL findings persistidos (3 vazamentos + 3 alavancas)

CREATE TABLE IF NOT EXISTS public.full_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES public.full_assessments(id) ON DELETE CASCADE,
  finding_type TEXT NOT NULL CHECK (finding_type IN ('VAZAMENTO', 'ALAVANCA')),
  position INT NOT NULL CHECK (position BETWEEN 1 AND 3),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  trace JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_fallback BOOLEAN NOT NULL DEFAULT FALSE,
  gap_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (assessment_id, finding_type, position)
);

CREATE INDEX IF NOT EXISTS ix_full_findings_assessment ON public.full_findings(assessment_id);

ALTER TABLE public.full_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS full_findings_all ON public.full_findings;
CREATE POLICY full_findings_all ON public.full_findings
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
