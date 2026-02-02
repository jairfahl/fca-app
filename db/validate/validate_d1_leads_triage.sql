-- Script de validação para Gate D1 - Leads Triage
-- Execute após rodar a migração 009_d1_leads_triage.sql

-- 1) Verificar se a tabela existe
SELECT 
  table_name,
  table_schema
FROM information_schema.tables
WHERE table_schema = 'public' 
  AND table_name = 'leads_triage';

-- 2) Verificar estrutura das colunas
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'leads_triage'
ORDER BY ordinal_position;

-- 3) Verificar CHECK constraints
SELECT 
  constraint_name,
  check_clause
FROM information_schema.check_constraints
WHERE constraint_schema = 'public'
  AND constraint_name LIKE 'leads_triage%';

-- 4) Verificar UNIQUE constraint
SELECT 
  constraint_name,
  constraint_type
FROM information_schema.table_constraints
WHERE table_schema = 'public' 
  AND table_name = 'leads_triage'
  AND constraint_type = 'UNIQUE';

-- 5) Verificar índices
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public' 
  AND tablename = 'leads_triage';

-- 6) Verificar RLS habilitado
SELECT 
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public' 
  AND tablename = 'leads_triage';

-- 7) Verificar policies RLS
SELECT 
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename = 'leads_triage';

-- 8) Validar dados (se houver)
SELECT * FROM public.leads_triage;
