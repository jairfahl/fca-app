-- Migration 026: FULL value events — métricas "valor inevitável"
-- Eventos: CAUSE_CLASSIFIED, PLAN_CREATED, GAIN_DECLARED
-- Padrão: mesma estrutura de paywall_events (event table)

CREATE TABLE IF NOT EXISTS public.full_value_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event TEXT NOT NULL CHECK (event IN ('CAUSE_CLASSIFIED', 'PLAN_CREATED', 'GAIN_DECLARED')),
  assessment_id UUID REFERENCES public.full_assessments(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_full_value_events_event ON public.full_value_events(event);
CREATE INDEX IF NOT EXISTS idx_full_value_events_created ON public.full_value_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_full_value_events_assessment ON public.full_value_events(assessment_id);
CREATE INDEX IF NOT EXISTS idx_full_value_events_company ON public.full_value_events(company_id);

COMMENT ON TABLE public.full_value_events IS 'Eventos de valor FULL: causa classificada, plano criado, ganho declarado';
