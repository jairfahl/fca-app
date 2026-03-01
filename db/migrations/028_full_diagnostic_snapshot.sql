-- Migration 028: FULL diagnostic snapshot — snapshot por versão (SUBMIT/CLOSE)
-- Gravado no SUBMIT e atualizado no CLOSE. Nunca recalcula retroativamente.
-- Estrutura mínima para relatório PDF e comparação entre versões.

CREATE TABLE IF NOT EXISTS public.full_diagnostic_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  full_assessment_id UUID NOT NULL REFERENCES public.full_assessments(id) ON DELETE CASCADE,
  full_version INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  segment TEXT NOT NULL,
  -- Scores/bandas por processo (ex.: [{process_key, band, score_numeric, ...}])
  processes JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Raio-X: vazamentos + alavancas (ex.: {vazamentos: [...], alavancas: [...]})
  raios_x JSONB NOT NULL DEFAULT '{"vazamentos":[],"alavancas":[]}'::jsonb,
  -- Recomendações derivadas (estrutura final)
  recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Plano: 3 ações (dono, métrica, checkpoint, status)
  plan JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Resumo de evidências: antes/depois + ganho declarado por ação
  evidence_summary JSONB NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE (full_assessment_id)
);

CREATE INDEX IF NOT EXISTS ix_full_diagnostic_snapshot_company ON public.full_diagnostic_snapshot(company_id);
CREATE INDEX IF NOT EXISTS ix_full_diagnostic_snapshot_assessment ON public.full_diagnostic_snapshot(full_assessment_id);
CREATE INDEX IF NOT EXISTS ix_full_diagnostic_snapshot_version ON public.full_diagnostic_snapshot(company_id, full_version);

DROP TRIGGER IF EXISTS trigger_full_diagnostic_snapshot_updated_at ON public.full_diagnostic_snapshot;
CREATE TRIGGER trigger_full_diagnostic_snapshot_updated_at
  BEFORE UPDATE ON public.full_diagnostic_snapshot
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.full_diagnostic_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS full_diagnostic_snapshot_all ON public.full_diagnostic_snapshot;
CREATE POLICY full_diagnostic_snapshot_all ON public.full_diagnostic_snapshot
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

COMMENT ON TABLE public.full_diagnostic_snapshot IS 'Snapshot do diagnóstico FULL por versão. Gravado no SUBMIT, atualizado no CLOSE. Fonte para relatório PDF e comparação.';
