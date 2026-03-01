-- Migration 029: FULL reports — artefatos PDF (PENDING/READY/FAILED)
-- PDF re-gerável a partir do DB; pode ser armazenado pronto para download.
-- Unicidade: um relatório por assessment (último estado).

CREATE TABLE IF NOT EXISTS public.full_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  full_assessment_id UUID NOT NULL REFERENCES public.full_assessments(id) ON DELETE CASCADE,
  full_version INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'READY', 'FAILED')),
  generated_at TIMESTAMPTZ,
  file_path TEXT,
  checksum TEXT,
  meta JSONB DEFAULT '{}'::jsonb,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, full_assessment_id)
);

CREATE INDEX IF NOT EXISTS ix_full_reports_company ON public.full_reports(company_id);
CREATE INDEX IF NOT EXISTS ix_full_reports_assessment ON public.full_reports(full_assessment_id);
CREATE INDEX IF NOT EXISTS ix_full_reports_status ON public.full_reports(status) WHERE status = 'READY';

DROP TRIGGER IF EXISTS trigger_full_reports_updated_at ON public.full_reports;
CREATE TRIGGER trigger_full_reports_updated_at
  BEFORE UPDATE ON public.full_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.full_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS full_reports_all ON public.full_reports;
CREATE POLICY full_reports_all ON public.full_reports
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

COMMENT ON TABLE public.full_reports IS 'Relatórios PDF do diagnóstico FULL. Status: PENDING (na fila), READY (disponível), FAILED (erro). Re-gerável a partir do snapshot.';
