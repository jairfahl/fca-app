-- Migration 020: FULL cycle history — novo ciclo sem criar assessment
-- Histórico de planos fechados para excluir ações já executadas das sugestões.

CREATE TABLE IF NOT EXISTS public.full_cycle_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES public.full_assessments(id) ON DELETE CASCADE,
  cycle_no INT NOT NULL,
  action_key TEXT NOT NULL,
  process_key TEXT NOT NULL,
  position INT NOT NULL,
  status TEXT NOT NULL,
  owner_name TEXT,
  metric_text TEXT,
  checkpoint_date DATE,
  dropped_reason TEXT,
  declared_gain TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_full_cycle_history_assessment ON public.full_cycle_history(assessment_id);
CREATE INDEX IF NOT EXISTS ix_full_cycle_history_assessment_cycle ON public.full_cycle_history(assessment_id, cycle_no);

ALTER TABLE public.full_cycle_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS full_cycle_history_all ON public.full_cycle_history;
CREATE POLICY full_cycle_history_all ON public.full_cycle_history
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
