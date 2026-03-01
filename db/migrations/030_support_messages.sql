-- Migration 030: support_messages — mensagens USER ↔ CONSULTOR
CREATE TABLE IF NOT EXISTS public.support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  subject TEXT,
  body TEXT NOT NULL,
  created_by_role TEXT NOT NULL CHECK (created_by_role IN ('USER', 'CONSULTOR', 'ADMIN')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_support_messages_company_created ON public.support_messages(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_support_messages_from_user ON public.support_messages(from_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_support_messages_to_user ON public.support_messages(to_user_id, created_at DESC);

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- USER: pode inserir onde from_user_id = auth.uid() e company é sua
DROP POLICY IF EXISTS support_messages_user_insert ON public.support_messages;
CREATE POLICY support_messages_user_insert ON public.support_messages
  FOR INSERT WITH CHECK (
    created_by_role = 'USER'
    AND from_user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.owner_user_id = auth.uid())
  );

-- USER: pode ler mensagens da sua company onde from_user_id ou to_user_id = auth.uid()
DROP POLICY IF EXISTS support_messages_user_select ON public.support_messages;
CREATE POLICY support_messages_user_select ON public.support_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.owner_user_id = auth.uid())
    AND (from_user_id = auth.uid() OR to_user_id = auth.uid())
  );

-- CONSULTOR/ADMIN: acesso via service_role (API bypassa RLS)
