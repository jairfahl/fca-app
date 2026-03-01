-- Migration 032: SoD RBAC — Base de autorização e auditoria
-- Tabelas: company_members, consultant_company_access, audit_events
-- Funções helpers para RLS e políticas coerentes com o app

-- =============================================================================
-- 1) TABELAS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.company_members (
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  member_role TEXT NOT NULL DEFAULT 'MEMBER' CHECK (member_role IN ('OWNER', 'MEMBER')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, user_id)
);

CREATE INDEX IF NOT EXISTS ix_company_members_user ON public.company_members(user_id);
CREATE INDEX IF NOT EXISTS ix_company_members_status ON public.company_members(status);

COMMENT ON TABLE public.company_members IS 'Membership de usuário em empresa. Usado por can_read_company() e RLS.';

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.consultant_company_access (
  consultant_user_id UUID NOT NULL,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  access_level TEXT NOT NULL DEFAULT 'READ' CHECK (access_level IN ('READ', 'SUPPORT')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (consultant_user_id, company_id)
);

CREATE INDEX IF NOT EXISTS ix_consultant_company_access_consultant ON public.consultant_company_access(consultant_user_id);

COMMENT ON TABLE public.consultant_company_access IS 'Escopo consultor por empresa. Por ora consultor é transversal (can_read_company ignora).';

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.audit_events (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id UUID NULL,
  actor_role TEXT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NULL,
  company_id UUID NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_audit_events_actor ON public.audit_events(actor_user_id);
CREATE INDEX IF NOT EXISTS ix_audit_events_company ON public.audit_events(company_id);
CREATE INDEX IF NOT EXISTS ix_audit_events_created ON public.audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS ix_audit_events_action ON public.audit_events(action);

COMMENT ON TABLE public.audit_events IS 'Auditoria write-only. Backend insere via service_role. RLS bloqueia acesso direto do client.';

-- =============================================================================
-- 2) FUNÇÕES HELPERS (SECURITY DEFINER)
-- =============================================================================

-- current_role: lê app_metadata.role do JWT, fallback 'USER'
CREATE OR REPLACE FUNCTION public.current_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt()->'app_metadata'->>'role'),
    (auth.jwt()->'user_metadata'->>'role'),
    'USER'
  );
$$;

-- jwt_uid: alias para auth.uid()
CREATE OR REPLACE FUNCTION public.jwt_uid()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid();
$$;

-- is_admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_role() = 'ADMIN';
$$;

-- is_consultor
CREATE OR REPLACE FUNCTION public.is_consultor()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_role() = 'CONSULTOR';
$$;

-- is_user (role USER)
CREATE OR REPLACE FUNCTION public.is_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_role() = 'USER';
$$;

-- can_read_company: true se admin, consultor (transversal), membro ativo ou owner legado
CREATE OR REPLACE FUNCTION public.can_read_company(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Admin vê tudo
  IF public.is_admin() THEN
    RETURN TRUE;
  END IF;

  -- Consultor transversal (por ora sempre true; evoluir com consultant_company_access)
  IF public.is_consultor() THEN
    RETURN TRUE;
  END IF;

  -- Membro ativo em company_members
  IF EXISTS (
    SELECT 1 FROM public.company_members
    WHERE company_id = p_company_id
      AND user_id = uid
      AND status = 'ACTIVE'
  ) THEN
    RETURN TRUE;
  END IF;

  -- Backward: owner legado em companies
  IF EXISTS (
    SELECT 1 FROM public.companies
    WHERE id = p_company_id AND owner_user_id = uid
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- =============================================================================
-- 3) RLS
-- =============================================================================

ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultant_company_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- company_members
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS company_members_select_admin ON public.company_members;
CREATE POLICY company_members_select_admin ON public.company_members
  FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS company_members_select_consultor ON public.company_members;
CREATE POLICY company_members_select_consultor ON public.company_members
  FOR SELECT
  USING (public.is_consultor());

DROP POLICY IF EXISTS company_members_select_user ON public.company_members;
CREATE POLICY company_members_select_user ON public.company_members
  FOR SELECT
  USING (public.is_user() AND user_id = auth.uid());

DROP POLICY IF EXISTS company_members_insert_admin ON public.company_members;
CREATE POLICY company_members_insert_admin ON public.company_members
  FOR INSERT
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS company_members_update_admin ON public.company_members;
CREATE POLICY company_members_update_admin ON public.company_members
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS company_members_delete_admin ON public.company_members;
CREATE POLICY company_members_delete_admin ON public.company_members
  FOR DELETE
  USING (public.is_admin());

-- -----------------------------------------------------------------------------
-- consultant_company_access
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS consultant_company_access_select_admin ON public.consultant_company_access;
CREATE POLICY consultant_company_access_select_admin ON public.consultant_company_access
  FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS consultant_company_access_select_consultor ON public.consultant_company_access;
CREATE POLICY consultant_company_access_select_consultor ON public.consultant_company_access
  FOR SELECT
  USING (public.is_consultor());

DROP POLICY IF EXISTS consultant_company_access_insert_admin ON public.consultant_company_access;
CREATE POLICY consultant_company_access_insert_admin ON public.consultant_company_access
  FOR INSERT
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS consultant_company_access_update_admin ON public.consultant_company_access;
CREATE POLICY consultant_company_access_update_admin ON public.consultant_company_access
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS consultant_company_access_delete_admin ON public.consultant_company_access;
CREATE POLICY consultant_company_access_delete_admin ON public.consultant_company_access
  FOR DELETE
  USING (public.is_admin());

-- -----------------------------------------------------------------------------
-- audit_events
-- INSERT: sem policy = nega acesso direto do client. Backend usa service_role.
-- SELECT: apenas admin
-- UPDATE/DELETE: sem policy = nega todos
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS audit_events_select_admin ON public.audit_events;
CREATE POLICY audit_events_select_admin ON public.audit_events
  FOR SELECT
  USING (public.is_admin());
