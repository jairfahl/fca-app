-- Migration: 039_audit_log
-- Blueprint v2.0 — Observabilidade: audit_log de eventos de negócio críticos.
-- Eventos instrumentados: cause_classified, plan_created, evidence_recorded, gain_declared
-- Acesso: restrito a ADMIN via service_role (sem policy de SELECT para usuários finais).
-- Dados sensíveis NUNCA devem ir para meta — policy de desenvolvimento, não schema.

CREATE TABLE IF NOT EXISTS public.audit_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event         TEXT        NOT NULL,
  user_id       UUID        REFERENCES auth.users(id),
  company_id    UUID        REFERENCES public.companies(id),
  assessment_id UUID,
  meta          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice principal: varredura por tipo de evento + ordem cronológica
CREATE INDEX IF NOT EXISTS idx_audit_log_event_created
  ON public.audit_log (event, created_at DESC);

-- Índice secundário: histórico por empresa
CREATE INDEX IF NOT EXISTS idx_audit_log_company_created
  ON public.audit_log (company_id, created_at DESC);

-- RLS: nenhum usuário final lê audit_log diretamente.
-- Leituras são feitas pela API com service_role (relatórios de SLA/métricas).
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Sem policy de SELECT/INSERT para auth.uid() — operações via service_role apenas.
