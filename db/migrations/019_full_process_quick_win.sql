-- Migration 019: quick_win em full_process_catalog (alavancas preferem processos com quick-win)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'full_process_catalog'
      AND column_name = 'quick_win'
  ) THEN
    ALTER TABLE public.full_process_catalog
      ADD COLUMN quick_win BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;
