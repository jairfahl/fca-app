-- Migration 033: support_threads + support_thread_messages — canal de suporte humano (thread-based)
-- Thread: company_id + user_id; status OPEN|CLOSED
-- Messages: thread_id, author_user_id, author_role, message

CREATE TABLE IF NOT EXISTS public.support_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS ix_support_threads_company_user_open
  ON public.support_threads(company_id, user_id)
  WHERE status = 'OPEN';

CREATE INDEX IF NOT EXISTS ix_support_threads_company ON public.support_threads(company_id);
CREATE INDEX IF NOT EXISTS ix_support_threads_user ON public.support_threads(user_id);
CREATE INDEX IF NOT EXISTS ix_support_threads_status ON public.support_threads(status);
CREATE INDEX IF NOT EXISTS ix_support_threads_created ON public.support_threads(created_at DESC);

CREATE TABLE IF NOT EXISTS public.support_thread_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.support_threads(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_role TEXT NOT NULL CHECK (author_role IN ('USER', 'CONSULTOR', 'ADMIN')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_support_thread_messages_thread ON public.support_thread_messages(thread_id);
CREATE INDEX IF NOT EXISTS ix_support_thread_messages_created ON public.support_thread_messages(created_at);

ALTER TABLE public.support_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_thread_messages ENABLE ROW LEVEL SECURITY;

-- USER: read/write apenas do próprio thread (company_id + user_id)
DROP POLICY IF EXISTS support_threads_user_select ON public.support_threads;
CREATE POLICY support_threads_user_select ON public.support_threads
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS support_threads_user_insert ON public.support_threads;
CREATE POLICY support_threads_user_insert ON public.support_threads
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS support_thread_messages_user_select ON public.support_thread_messages;
CREATE POLICY support_thread_messages_user_select ON public.support_thread_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.support_threads t
      JOIN public.companies c ON c.id = t.company_id
      WHERE t.id = thread_id AND (t.user_id = auth.uid() OR c.owner_user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS support_thread_messages_user_insert ON public.support_thread_messages;
CREATE POLICY support_thread_messages_user_insert ON public.support_thread_messages
  FOR INSERT WITH CHECK (
    author_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.support_threads t
      JOIN public.companies c ON c.id = t.company_id
      WHERE t.id = thread_id AND (t.user_id = auth.uid() OR c.owner_user_id = auth.uid())
    )
  );

-- CONSULTOR/ADMIN: acesso via service_role (API bypassa RLS)
COMMENT ON TABLE public.support_threads IS 'Threads de suporte (USER ↔ CONSULTOR). Um por (company_id, user_id) OPEN.';
COMMENT ON TABLE public.support_thread_messages IS 'Mensagens em thread de suporte. author_role snapshot.';
