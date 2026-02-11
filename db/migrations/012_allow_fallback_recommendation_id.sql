-- Permitir recommendation_id como TEXT para fallback LIGHT (fallback-COMERCIAL, etc.)
-- mantendo compatibilidade com UUIDs existentes do catálogo

-- 1. Dropar FK (recommendation_id -> recommendations_catalog)
ALTER TABLE public.assessment_free_actions
  DROP CONSTRAINT IF EXISTS assessment_free_actions_recommendation_id_fkey;

-- 2. Dropar unique (assessment_id, recommendation_id) - será recriado após alter
ALTER TABLE public.assessment_free_actions
  DROP CONSTRAINT IF EXISTS assessment_free_actions_assessment_id_recommendation_id_key;

-- 3. Alterar coluna para TEXT (UUIDs viram string, fallback-* funciona)
ALTER TABLE public.assessment_free_actions
  ALTER COLUMN recommendation_id TYPE TEXT USING recommendation_id::text;

-- 4. Recriar unique (assessment_id, recommendation_id)
ALTER TABLE public.assessment_free_actions
  ADD CONSTRAINT assessment_free_actions_assessment_id_recommendation_id_key
  UNIQUE (assessment_id, recommendation_id);
