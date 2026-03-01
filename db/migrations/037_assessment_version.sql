-- Migration: 037_assessment_version
-- Fase 7: versionamento sequencial de diagnósticos FULL por empresa.
-- assessment_version é calculado e gravado no momento do SUBMIT, não na criação.
-- NULL = ainda não submetido (DRAFT); após submit = 1, 2, 3 …
-- DEFAULT 1 garante que registros históricos pré-migração não quebrem.

ALTER TABLE public.full_assessments
  ADD COLUMN IF NOT EXISTS assessment_version SMALLINT NOT NULL DEFAULT 1;
