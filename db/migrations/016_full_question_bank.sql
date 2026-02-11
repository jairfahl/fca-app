-- Migration 016: FULL Question Bank — answer_type + answered_at
-- Catálogo fechado: tipos de resposta por pergunta, timestamp de resposta.

-- 1) answer_type em full_question_catalog (SCALE_0_10 | YES_NO | MULTI)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'full_question_catalog' AND column_name = 'answer_type'
  ) THEN
    ALTER TABLE public.full_question_catalog
    ADD COLUMN answer_type TEXT NOT NULL DEFAULT 'SCALE_0_10'
    CHECK (answer_type IN ('SCALE_0_10', 'YES_NO', 'MULTI'));
  END IF;
END $$;

-- 2) answered_at em full_answers (registra quando a resposta foi dada/atualizada)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'full_answers' AND column_name = 'answered_at'
  ) THEN
    ALTER TABLE public.full_answers
    ADD COLUMN answered_at TIMESTAMPTZ DEFAULT NOW();
    -- Preencher existentes com updated_at
    UPDATE public.full_answers SET answered_at = COALESCE(updated_at, created_at) WHERE answered_at IS NULL;
  END IF;
END $$;
