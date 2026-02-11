-- Migration 015: DoD confirmations + evidência write-once (governança FULL)
-- DoD obrigatório antes de DONE; evidência Antes/Depois write-once.

-- ============================================================================
-- 1. TABELA full_action_dod_confirmations
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.full_action_dod_confirmations (
  assessment_id UUID NOT NULL REFERENCES public.full_assessments(id) ON DELETE CASCADE,
  action_key TEXT NOT NULL,
  confirmed_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (assessment_id, action_key),
  FOREIGN KEY (assessment_id, action_key) REFERENCES public.full_selected_actions(assessment_id, action_key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_full_action_dod_confirmations_assessment ON public.full_action_dod_confirmations(assessment_id);

-- ============================================================================
-- 2. RLS
-- ============================================================================

ALTER TABLE public.full_action_dod_confirmations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS full_action_dod_confirmations_all ON public.full_action_dod_confirmations;
CREATE POLICY full_action_dod_confirmations_all ON public.full_action_dod_confirmations
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
