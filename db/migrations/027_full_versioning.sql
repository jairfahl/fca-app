-- Migration 027: FULL versionamento — full_version, parent, closed_at
-- Permite refazer diagnóstico (2º, 3º...) e comparar evolução entre versões.
-- DB soberano: cada versão mantém seu snapshot, nada recalcula retroativamente.

-- ============================================================================
-- 1. Adicionar colunas em full_assessments
-- ============================================================================

ALTER TABLE public.full_assessments
  ADD COLUMN IF NOT EXISTS full_version INT,
  ADD COLUMN IF NOT EXISTS parent_full_assessment_id UUID REFERENCES public.full_assessments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- Backfill full_version: sequência 1..N por company (ordenado por created_at)
DO $$
DECLARE
  r RECORD;
  v INT;
BEGIN
  FOR r IN (
    SELECT company_id, id, created_at,
           ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at ASC) AS rn
    FROM public.full_assessments
    WHERE full_version IS NULL
  )
  LOOP
    UPDATE public.full_assessments SET full_version = r.rn WHERE id = r.id;
  END LOOP;
END $$;

-- Backfill closed_at para assessments CLOSED (usa updated_at como aproximação)
UPDATE public.full_assessments
SET closed_at = COALESCE(closed_at, updated_at)
WHERE status = 'CLOSED' AND closed_at IS NULL;

-- Tornar full_version NOT NULL (app deve fornecer ao inserir; backfill já preencheu)
ALTER TABLE public.full_assessments
  ALTER COLUMN full_version SET NOT NULL;

-- Unicidade: (company_id, full_version) único
CREATE UNIQUE INDEX IF NOT EXISTS ux_full_assessments_company_version
  ON public.full_assessments (company_id, full_version);

-- Índices para queries de versionamento
CREATE INDEX IF NOT EXISTS ix_full_assessments_parent ON public.full_assessments(parent_full_assessment_id);
CREATE INDEX IF NOT EXISTS ix_full_assessments_closed_at ON public.full_assessments(closed_at) WHERE closed_at IS NOT NULL;

-- Comentários
COMMENT ON COLUMN public.full_assessments.full_version IS 'Sequência 1..N do diagnóstico FULL por company (refazer = nova versão)';
COMMENT ON COLUMN public.full_assessments.parent_full_assessment_id IS 'Versão anterior (para comparação de evolução)';
COMMENT ON COLUMN public.full_assessments.closed_at IS 'Momento em que o ciclo foi fechado (status CLOSED)';
