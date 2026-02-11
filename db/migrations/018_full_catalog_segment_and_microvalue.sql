-- Migration 018: FULL catalog deterministic enhancements
-- - Segment flags por pergunta
-- - Campo textual de impacto típico no processo (linguagem de dono)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'full_process_catalog'
      AND column_name = 'typical_impact_text'
  ) THEN
    ALTER TABLE public.full_process_catalog
      ADD COLUMN typical_impact_text TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'full_question_catalog'
      AND column_name = 'segment_applicability'
  ) THEN
    ALTER TABLE public.full_question_catalog
      ADD COLUMN segment_applicability TEXT[] DEFAULT ARRAY['C','I','S'];
  END IF;
END $$;

UPDATE public.full_question_catalog
SET segment_applicability = ARRAY['C','I','S']
WHERE segment_applicability IS NULL OR cardinality(segment_applicability) = 0;
