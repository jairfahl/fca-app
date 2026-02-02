-- Migration 006: F4 Entitlements and Paywall Events
-- Cria tabelas para controle de acesso (LIGHT/FULL) e trilha de eventos do paywall

-- ============================================================================
-- 1. Tabela public.entitlements
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id UUID NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    plan TEXT NOT NULL CHECK (plan IN ('LIGHT', 'FULL')) DEFAULT 'LIGHT',
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE')) DEFAULT 'ACTIVE',
    source TEXT NOT NULL CHECK (source IN ('MANUAL', 'PAYMENT')) DEFAULT 'MANUAL',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT entitlements_unique_user_company UNIQUE (user_id, company_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_entitlements_user_id ON public.entitlements(user_id);
CREATE INDEX IF NOT EXISTS idx_entitlements_company_id ON public.entitlements(company_id);

-- Trigger para updated_at (usa função já existente de 001_init.sql)
DROP TRIGGER IF EXISTS trigger_entitlements_updated_at ON public.entitlements;
CREATE TRIGGER trigger_entitlements_updated_at
    BEFORE UPDATE ON public.entitlements
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS entitlements_select ON public.entitlements;
CREATE POLICY entitlements_select ON public.entitlements
    FOR SELECT
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS entitlements_insert ON public.entitlements;
CREATE POLICY entitlements_insert ON public.entitlements
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS entitlements_update ON public.entitlements;
CREATE POLICY entitlements_update ON public.entitlements
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- 2. Tabela public.paywall_events
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.paywall_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id UUID NULL REFERENCES public.companies(id) ON DELETE SET NULL,
    event TEXT NOT NULL CHECK (event IN ('VIEW_PAYWALL', 'CLICK_UPGRADE', 'UNLOCK_FULL')),
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_paywall_events_user_created ON public.paywall_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paywall_events_company_created ON public.paywall_events(company_id, created_at DESC);

-- RLS
ALTER TABLE public.paywall_events ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS paywall_events_select ON public.paywall_events;
CREATE POLICY paywall_events_select ON public.paywall_events
    FOR SELECT
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS paywall_events_insert ON public.paywall_events;
CREATE POLICY paywall_events_insert ON public.paywall_events
    FOR INSERT
    WITH CHECK (user_id = auth.uid());
