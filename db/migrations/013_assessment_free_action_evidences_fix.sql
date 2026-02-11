-- Garantir que assessment_free_action_evidences tenha free_action_id
-- (alguns ambientes podem ter a tabela com schema diferente)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'assessment_free_action_evidences'
      AND column_name = 'free_action_id'
  ) THEN
    -- Se a coluna assessment_free_action_id existir, renomear para free_action_id
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'assessment_free_action_evidences'
        AND column_name = 'assessment_free_action_id'
    ) THEN
      ALTER TABLE public.assessment_free_action_evidences
        RENAME COLUMN assessment_free_action_id TO free_action_id;
    ELSE
      -- Senão, adicionar nova coluna
      ALTER TABLE public.assessment_free_action_evidences
        ADD COLUMN free_action_id uuid REFERENCES public.assessment_free_actions(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Garantir constraint unique e índice
CREATE UNIQUE INDEX IF NOT EXISTS ix_afae_free_action_id
  ON public.assessment_free_action_evidences (free_action_id);
