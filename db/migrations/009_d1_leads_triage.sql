-- Gate D1: Tabela de Leads Triage
-- Armazena informações de triagem de leads por assessment

-- 1) Criar tabela public.leads_triage
CREATE TABLE IF NOT EXISTS public.leads_triage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL,
  company_id UUID NOT NULL,
  assessment_id UUID NOT NULL,
  pain TEXT NOT NULL CHECK (pain IN ('CAIXA','VENDA','OPERACAO','PESSOAS')),
  horizon TEXT NOT NULL CHECK (horizon IN ('30','60','90')),
  budget_monthly TEXT NOT NULL CHECK (budget_monthly IN ('ZERO','ATE_300','DE_301_800','DE_801_2000','ACIMA_2000')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2) Criar UNIQUE constraint para evitar duplicação
-- Um usuário só pode ter um triage por assessment
ALTER TABLE public.leads_triage
ADD CONSTRAINT leads_triage_unique_owner_assessment 
UNIQUE (owner_user_id, assessment_id);

-- 3) Criar índices por company_id e assessment_id
CREATE INDEX IF NOT EXISTS ix_leads_triage_company_id 
ON public.leads_triage(company_id);

CREATE INDEX IF NOT EXISTS ix_leads_triage_assessment_id 
ON public.leads_triage(assessment_id);

CREATE INDEX IF NOT EXISTS ix_leads_triage_owner_user_id 
ON public.leads_triage(owner_user_id);

-- 4) Habilitar RLS
ALTER TABLE public.leads_triage ENABLE ROW LEVEL SECURITY;

-- 5) Policies RLS
-- SELECT: usuário só vê seus próprios leads_triage
CREATE POLICY "leads_triage_select_owner"
ON public.leads_triage
FOR SELECT
USING (owner_user_id = auth.uid());

-- INSERT: usuário só pode inserir com seu próprio owner_user_id
CREATE POLICY "leads_triage_insert_owner"
ON public.leads_triage
FOR INSERT
WITH CHECK (owner_user_id = auth.uid());

-- Nota: Não criar triggers, não criar FK rígida (somente integridade lógica)
