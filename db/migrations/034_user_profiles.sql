-- Migration 034: user_profiles — cache DB de email/role (espelho de app_metadata)
-- Usado pelo módulo ADMIN para listar usuários e manter consistência com Auth.

CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'CONSULTOR', 'ADMIN')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_user_profiles_email ON public.user_profiles(email);
CREATE INDEX IF NOT EXISTS ix_user_profiles_role ON public.user_profiles(role);

COMMENT ON TABLE public.user_profiles IS 'Cache de email/role espelhando app_metadata.role do Auth. ADMIN upserta via API.';

-- RLS: SELECT apenas ADMIN. INSERT/UPDATE via backend (service_role).
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_profiles_select_admin ON public.user_profiles;
CREATE POLICY user_profiles_select_admin ON public.user_profiles
  FOR SELECT
  USING (public.is_admin());
