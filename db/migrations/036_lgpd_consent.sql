-- Migration: 036_lgpd_consent
-- Fase 0: consentimento LGPD no onboarding.
-- Armazena o momento em que o usuário aceitou a Política de Privacidade.
-- NULL = não aceito; preenchido = aceito e data/hora registradas.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS lgpd_accepted_at TIMESTAMPTZ;
