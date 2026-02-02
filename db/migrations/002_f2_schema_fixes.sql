-- F2: Ajustes de schema para alinhar com uso real do código
-- Adiciona colunas que são usadas pelo código mas não estavam no migration inicial

-- 1) Adicionar owner_user_id e segment em companies (se não existirem)
DO $$
BEGIN
  -- owner_user_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'companies' 
      AND column_name = 'owner_user_id'
  ) THEN
    ALTER TABLE public.companies 
    ADD COLUMN owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    
    CREATE INDEX IF NOT EXISTS idx_companies_owner_user_id 
    ON public.companies(owner_user_id);
  END IF;

  -- segment
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'companies' 
      AND column_name = 'segment'
  ) THEN
    ALTER TABLE public.companies 
    ADD COLUMN segment TEXT CHECK (segment IN ('SERVICOS', 'COMERCIO', 'INDUSTRIA'));
  END IF;
END $$;

-- 2) Adicionar type em assessments (se não existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'assessments' 
      AND column_name = 'type'
  ) THEN
    ALTER TABLE public.assessments 
    ADD COLUMN type TEXT CHECK (type IN ('LIGHT', 'FULL')) DEFAULT 'LIGHT';
  END IF;
END $$;

-- 3) Ajustar status em assessments para aceitar uppercase (DRAFT, COMPLETED)
-- O migration inicial tem lowercase, mas o código usa uppercase
-- Vamos manter ambos compatíveis removendo o CHECK e usando TEXT simples
DO $$
BEGIN
  -- Remover constraint antiga se existir
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_schema = 'public' 
      AND table_name = 'assessments' 
      AND constraint_name = 'assessments_status_check'
  ) THEN
    ALTER TABLE public.assessments DROP CONSTRAINT assessments_status_check;
  END IF;
  
  -- Adicionar nova constraint que aceita ambos
  ALTER TABLE public.assessments 
  ADD CONSTRAINT assessments_status_check 
  CHECK (status IN ('draft', 'DRAFT', 'in_progress', 'IN_PROGRESS', 'completed', 'COMPLETED', 'archived', 'ARCHIVED'));
END $$;

-- 4) Alterar schema de scores para ter colunas por processo (se ainda não tiver)
-- O migration inicial tem category/score, mas o código usa commercial/operations/admin_fin/management/overall
DO $$
BEGIN
  -- Verificar se já tem coluna commercial (indicador de schema novo)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'scores' 
      AND column_name = 'commercial'
  ) THEN
    -- Adicionar novas colunas
    ALTER TABLE public.scores 
    ADD COLUMN commercial NUMERIC(4,2),
    ADD COLUMN operations NUMERIC(4,2),
    ADD COLUMN admin_fin NUMERIC(4,2),
    ADD COLUMN management NUMERIC(4,2),
    ADD COLUMN overall NUMERIC(4,2);
    
    -- Remover constraint antiga de unique category se existir
    IF EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE table_schema = 'public' 
        AND table_name = 'scores' 
        AND constraint_name = 'scores_unique_category'
    ) THEN
      ALTER TABLE public.scores DROP CONSTRAINT scores_unique_category;
    END IF;
    
    -- Adicionar constraint de unique assessment_id (uma linha por assessment)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE table_schema = 'public' 
        AND table_name = 'scores' 
        AND constraint_name = 'scores_unique_assessment_id'
    ) THEN
      ALTER TABLE public.scores 
      ADD CONSTRAINT scores_unique_assessment_id UNIQUE (assessment_id);
    END IF;
  END IF;
END $$;

-- 5) Ajustar assessment_items para ter process/activity/score_int (se ainda não tiver)
-- O migration inicial tem category/question/score, mas o código usa process/activity/score_int
DO $$
BEGIN
  -- Verificar se já tem coluna process (indicador de schema novo)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'assessment_items' 
      AND column_name = 'process'
  ) THEN
    -- Adicionar novas colunas
    ALTER TABLE public.assessment_items 
    ADD COLUMN process TEXT,
    ADD COLUMN activity TEXT,
    ADD COLUMN score_int INTEGER CHECK (score_int >= 0 AND score_int <= 10);
    
    -- Remover constraint antiga de unique order_index se existir
    IF EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE table_schema = 'public' 
        AND table_name = 'assessment_items' 
        AND constraint_name = 'assessment_items_unique_order'
    ) THEN
      ALTER TABLE public.assessment_items DROP CONSTRAINT assessment_items_unique_order;
    END IF;
    
    -- Adicionar constraint de unique (assessment_id, process, activity)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE table_schema = 'public' 
        AND table_name = 'assessment_items' 
        AND constraint_name = 'assessment_items_unique_process_activity'
    ) THEN
      ALTER TABLE public.assessment_items 
      ADD CONSTRAINT assessment_items_unique_process_activity 
      UNIQUE (assessment_id, process, activity);
    END IF;
  END IF;
END $$;
