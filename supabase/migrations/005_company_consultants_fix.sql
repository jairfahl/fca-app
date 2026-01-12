-- ============================================================
-- PROMPT 05-A v3 — CORREÇÃO (company_consultants only)
-- ============================================================

-- ============================================================
-- PROVA 1: VERIFICAR EXISTÊNCIA DA TABELA
-- ============================================================
SELECT to_regclass('public.company_consultants');
-- Resultado esperado: null (se não existe) ou 'company_consultants' (se existe)

-- ============================================================
-- PROVA 2: CRIAR TABELA (IDEMPOTENTE)
-- ============================================================
CREATE TABLE IF NOT EXISTS company_consultants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  consultant_id UUID NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, consultant_id)
);
-- Resultado esperado: CREATE TABLE ou NOTICE: relation "company_consultants" already exists, skipping

-- ============================================================
-- PROVA 3: HABILITAR RLS
-- ============================================================
ALTER TABLE company_consultants ENABLE ROW LEVEL SECURITY;
-- Resultado esperado: ALTER TABLE

-- ============================================================
-- PROVA 4: CRIAR POLICY ÚNICA PERMITIDA
-- ============================================================
CREATE POLICY insert_company_consultants_by_company_user
ON company_consultants
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM company_users cu
    WHERE cu.company_id = company_consultants.company_id
      AND cu.user_id = auth.uid()
  )
);
-- Resultado esperado: CREATE POLICY

-- ============================================================
-- PROVA 5: TESTE DE INSERT (USUÁRIO VINCULADO)
-- ============================================================
-- Simular usuário autenticado vinculado à empresa
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claim.sub TO '11111111-1111-1111-1111-111111111111';

-- Este INSERT deve PASSAR (usuário está em company_users)
INSERT INTO company_consultants (company_id, consultant_id, assigned_at)
VALUES (
  'd290f1ee-6c54-4b01-90e6-d701748f0851',
  '22222222-2222-2222-2222-222222222222',
  NOW()
);
-- Resultado esperado: INSERT 0 1

-- ============================================================
-- PROVA 6: TESTE DE INSERT (USUÁRIO NÃO VINCULADO)
-- ============================================================
-- Simular usuário não vinculado
SET LOCAL request.jwt.claim.sub TO '88888888-8888-8888-8888-888888888888';

-- Este INSERT deve FALHAR (usuário NÃO está em company_users)
INSERT INTO company_consultants (company_id, consultant_id, assigned_at)
VALUES (
  'd290f1ee-6c54-4b01-90e6-d701748f0851',
  '99999999-9999-9999-9999-999999999999',
  NOW()
);
-- Resultado esperado: ERROR: new row violates row-level security policy for table "company_consultants"

-- Reset
RESET role;
RESET request.jwt.claim.sub;

-- ============================================================
-- VERIFICAÇÃO FINAL
-- ============================================================
SELECT 
  'company_consultants table exists' as check,
  CASE 
    WHEN to_regclass('public.company_consultants') IS NOT NULL THEN 'PASS'
    ELSE 'FAIL'
  END as result;

SELECT 
  'RLS enabled on company_consultants' as check,
  CASE 
    WHEN relrowsecurity THEN 'PASS'
    ELSE 'FAIL'
  END as result
FROM pg_class
WHERE relname = 'company_consultants';

SELECT 
  'insert policy exists' as check,
  CASE 
    WHEN COUNT(*) >= 1 THEN 'PASS'
    ELSE 'FAIL'
  END as result
FROM pg_policies
WHERE tablename = 'company_consultants' 
  AND policyname = 'insert_company_consultants_by_company_user';
