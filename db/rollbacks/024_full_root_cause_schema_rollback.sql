-- Rollback 024: Root Cause Engine schema
-- Executar manualmente se necessário reverter a migration 024.
-- Este arquivo NÃO é executado automaticamente pelo run-migrations.

-- Remover colunas adicionadas
ALTER TABLE public.full_action_catalog DROP COLUMN IF EXISTS cause_mechanism_id;
ALTER TABLE public.full_recommendation_catalog DROP COLUMN IF EXISTS cause_id;

-- Remover tabelas (ordem por dependência)
DROP TABLE IF EXISTS public.full_cause_mechanism_actions;
DROP TABLE IF EXISTS public.full_gap_instances;
DROP TABLE IF EXISTS public.full_cause_rules;
DROP TABLE IF EXISTS public.full_cause_questions;
DROP TABLE IF EXISTS public.full_cause_question_sets;
DROP TABLE IF EXISTS public.full_cause_answer_options;
DROP TABLE IF EXISTS public.full_cause_mechanisms;
DROP TABLE IF EXISTS public.full_cause_taxonomy;
