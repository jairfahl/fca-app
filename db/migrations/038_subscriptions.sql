-- Migration: 038_subscriptions
-- Fase 6: modelo de assinatura completo por empresa.
--
-- DESIGN:
--   • entitlements (006) continua sendo o gate de acesso durante a transição;
--     subscriptions é a fonte de verdade financeira futura.
--   • Uma empresa tem exatamente uma assinatura (UNIQUE company_id).
--   • Planos: FREE / PRO / CONSULTORIA
--   • Estados: TRIAL → ACTIVE → PAST_DUE → CANCELLED | INACTIVE
--   • Preços NUNCA ficam hardcoded aqui — ficam em variáveis de ambiente.
--   • Todas as colunas de datas são TIMESTAMPTZ para suporte a fuso horário.

-- ============================================================================
-- 1. Tabela principal
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Plano contratado
  plan                    TEXT        NOT NULL
                            CHECK (plan IN ('FREE','PRO','CONSULTORIA'))
                            DEFAULT 'FREE',

  -- Estado atual da assinatura
  status                  TEXT        NOT NULL
                            CHECK (status IN ('ACTIVE','INACTIVE','PAST_DUE','TRIAL','CANCELLED'))
                            DEFAULT 'TRIAL',

  -- Trial
  trial_ends_at           TIMESTAMPTZ,

  -- Período de faturamento atual (preenchido pelo webhook do gateway)
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,

  -- Carência após falha de pagamento (gateway webhook define)
  grace_period_ends_at    TIMESTAMPTZ,

  -- IDs externos do gateway de pagamento (ex: Stripe, Iugu)
  -- Valores lidos de variáveis de ambiente pela API — nunca hardcoded aqui
  gateway_subscription_id VARCHAR(255),
  gateway_customer_id     VARCHAR(255),

  -- Cancelamento
  cancelled_at            TIMESTAMPTZ,

  -- Auditoria
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT subscriptions_unique_company UNIQUE (company_id)
);

-- ============================================================================
-- 2. Trigger de updated_at (reutiliza função de 001_init.sql)
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER trigger_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 3. Índices
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_subscriptions_company_id
  ON public.subscriptions (company_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status
  ON public.subscriptions (status);

CREATE INDEX IF NOT EXISTS idx_subscriptions_gateway_subscription_id
  ON public.subscriptions (gateway_subscription_id)
  WHERE gateway_subscription_id IS NOT NULL;

-- ============================================================================
-- 4. RLS — apenas o dono da empresa lê sua assinatura
-- ============================================================================

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscriptions_select ON public.subscriptions;
CREATE POLICY subscriptions_select
  ON public.subscriptions
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE owner_user_id = auth.uid()
    )
  );

-- Sem policy de INSERT/UPDATE para usuário final:
-- escritas são feitas pelo service-role da API (webhook do gateway).

-- ============================================================================
-- 5. Seed de exemplo — NÃO executar em produção; apenas documentação
-- ============================================================================

/*
-- Exemplo: empresa em trial de 14 dias (inserção via service-role)
INSERT INTO public.subscriptions (
  company_id,
  plan,
  status,
  trial_ends_at
) VALUES (
  '<uuid-da-empresa>',
  'FREE',
  'TRIAL',
  NOW() + INTERVAL '14 days'
);

-- Exemplo: upgrade para PRO após pagamento confirmado via webhook
UPDATE public.subscriptions
SET
  plan                  = 'PRO',
  status                = 'ACTIVE',
  gateway_subscription_id = 'sub_abc123',   -- valor vindo do gateway
  gateway_customer_id   = 'cus_xyz456',     -- valor vindo do gateway
  current_period_start  = NOW(),
  current_period_end    = NOW() + INTERVAL '30 days',
  updated_at            = NOW()
WHERE company_id = '<uuid-da-empresa>';

-- Exemplo: marcar carência após falha de cobrança
UPDATE public.subscriptions
SET
  status               = 'PAST_DUE',
  grace_period_ends_at = NOW() + INTERVAL '7 days',
  updated_at           = NOW()
WHERE company_id = '<uuid-da-empresa>';

-- Exemplo: cancelamento
UPDATE public.subscriptions
SET
  status       = 'CANCELLED',
  cancelled_at = NOW(),
  updated_at   = NOW()
WHERE company_id = '<uuid-da-empresa>';
*/
