-- Migration 022: help_requests — pedidos de ajuda auditáveis (USER -> CONSULTOR)
CREATE TABLE IF NOT EXISTS public.help_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_help_requests_company ON public.help_requests(company_id);
CREATE INDEX IF NOT EXISTS ix_help_requests_user ON public.help_requests(user_id);
CREATE INDEX IF NOT EXISTS ix_help_requests_status ON public.help_requests(status);
CREATE INDEX IF NOT EXISTS ix_help_requests_created ON public.help_requests(created_at DESC);

ALTER TABLE public.help_requests ENABLE ROW LEVEL SECURITY;

-- USER: pode criar e ver seus próprios pedidos
DROP POLICY IF EXISTS help_requests_user_select ON public.help_requests;
CREATE POLICY help_requests_user_select ON public.help_requests
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS help_requests_user_insert ON public.help_requests;
CREATE POLICY help_requests_user_insert ON public.help_requests
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- CONSULTOR/ADMIN: acesso via service_role (API bypassa RLS)
