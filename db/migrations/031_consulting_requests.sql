-- Migration 031: consulting_requests — pedidos de apoio (USER -> CONSULTOR)
-- Fluxo: USER solicita ajuda em ação/recomendação; CONSULTOR vê fila e atualiza status.

CREATE TABLE IF NOT EXISTS public.consulting_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  assessment_id UUID REFERENCES public.full_assessments(id) ON DELETE SET NULL,
  action_id TEXT,
  created_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'CLOSED')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_consulting_requests_company ON public.consulting_requests(company_id);
CREATE INDEX IF NOT EXISTS ix_consulting_requests_status ON public.consulting_requests(status);
CREATE INDEX IF NOT EXISTS ix_consulting_requests_created ON public.consulting_requests(created_at DESC);

DROP TRIGGER IF EXISTS trigger_consulting_requests_updated_at ON public.consulting_requests;
CREATE TRIGGER trigger_consulting_requests_updated_at
  BEFORE UPDATE ON public.consulting_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.consulting_requests ENABLE ROW LEVEL SECURITY;

-- USER: pode criar e ver seus próprios pedidos
DROP POLICY IF EXISTS consulting_requests_user_select ON public.consulting_requests;
CREATE POLICY consulting_requests_user_select ON public.consulting_requests
  FOR SELECT USING (created_by_user_id = auth.uid());

DROP POLICY IF EXISTS consulting_requests_user_insert ON public.consulting_requests;
CREATE POLICY consulting_requests_user_insert ON public.consulting_requests
  FOR INSERT WITH CHECK (created_by_user_id = auth.uid());

-- CONSULTOR/ADMIN: acesso via service_role (API bypassa RLS)
COMMENT ON TABLE public.consulting_requests IS 'Pedidos de apoio do USER ao consultor. CONSULTOR pode alterar status (única escrita permitida).';
