-- Migration: 035_consultor_companies
-- Vínculo consultor ↔ empresa para segregação de dados (Blueprint v2.0)
-- CONSULTOR vê apenas empresas vinculadas a ele; ADMIN vê todas.

CREATE TABLE IF NOT EXISTS public.consultor_companies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  consultor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (consultor_user_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_consultor_companies_lookup
  ON public.consultor_companies (consultor_user_id, company_id);

-- RLS: CONSULTOR lê/insere apenas seus próprios vínculos; ADMIN lê todos.
ALTER TABLE public.consultor_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consultor_companies_read"
  ON public.consultor_companies
  FOR SELECT
  USING (
    auth.uid() = consultor_user_id
    OR EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_id = auth.uid() AND role = 'ADMIN'
    )
  );

CREATE POLICY "consultor_companies_insert"
  ON public.consultor_companies
  FOR INSERT
  WITH CHECK (auth.uid() = consultor_user_id);
