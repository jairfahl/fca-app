-- Validação SoD RBAC (Migration 032)
-- Execute após rodar db/migrations/032_sod_rbac.sql
-- Uso: psql $DATABASE_URL -f db/validate/validate_sod_rbac.sql

-- 1) Tabelas existem
SELECT
  table_schema,
  table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('company_members', 'consultant_company_access', 'audit_events')
ORDER BY table_name;

-- 2) RLS habilitado
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('company_members', 'consultant_company_access', 'audit_events')
ORDER BY tablename;

-- 3) Funções helpers existem
SELECT
  routine_schema,
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('current_role', 'jwt_uid', 'is_admin', 'is_consultor', 'is_user', 'can_read_company')
ORDER BY routine_name;

-- 4) Políticas RLS criadas
SELECT
  schemaname,
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('company_members', 'consultant_company_access', 'audit_events')
ORDER BY tablename, policyname;

-- 5) Estrutura company_members
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'company_members'
ORDER BY ordinal_position;
