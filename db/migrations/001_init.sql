-- Extensão pgcrypto para funções de criptografia
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Tabela: users (espelho do auth.users do Supabase)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    email_confirmed_at TIMESTAMPTZ,
    phone TEXT,
    phone_confirmed_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    last_sign_in_at TIMESTAMPTZ,
    raw_app_meta_data JSONB,
    raw_user_meta_data JSONB,
    is_super_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT users_email_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Tabela: companies
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cnpj TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    trade_name TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    zip_code TEXT,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT companies_cnpj_check CHECK (LENGTH(cnpj) = 14),
    CONSTRAINT companies_email_check CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Tabela: assessments
CREATE TABLE IF NOT EXISTS public.assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'completed', 'archived')),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela: assessment_items
CREATE TABLE IF NOT EXISTS public.assessment_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT,
    score INTEGER CHECK (score >= 0 AND score <= 100),
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT assessment_items_unique_order UNIQUE (assessment_id, order_index)
);

-- Tabela: scores
CREATE TABLE IF NOT EXISTS public.scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
    max_score INTEGER NOT NULL DEFAULT 100 CHECK (max_score > 0),
    percentage DECIMAL(5,2) GENERATED ALWAYS AS (
        CASE 
            WHEN max_score > 0 THEN ROUND((score::DECIMAL / max_score::DECIMAL) * 100, 2)
            ELSE 0
        END
    ) STORED,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT scores_unique_category UNIQUE (assessment_id, category)
);

-- Tabela: recommendations_catalog
CREATE TABLE IF NOT EXISTS public.recommendations_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    min_score INTEGER DEFAULT 0 CHECK (min_score >= 0 AND min_score <= 100),
    max_score INTEGER DEFAULT 100 CHECK (max_score >= 0 AND max_score <= 100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT recommendations_score_range CHECK (min_score <= max_score)
);

-- Tabela: assessment_recommendations
CREATE TABLE IF NOT EXISTS public.assessment_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
    recommendation_id UUID NOT NULL REFERENCES public.recommendations_catalog(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'dismissed')),
    assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
    notes TEXT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT assessment_recommendations_unique UNIQUE (assessment_id, recommendation_id)
);

-- Tabela: free_actions
CREATE TABLE IF NOT EXISTS public.free_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    action_type TEXT NOT NULL CHECK (action_type IN ('task', 'meeting', 'document', 'other')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    due_date TIMESTAMPTZ,
    assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela: action_evidences
CREATE TABLE IF NOT EXISTS public.action_evidences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_id UUID REFERENCES public.free_actions(id) ON DELETE CASCADE,
    recommendation_id UUID REFERENCES public.assessment_recommendations(id) ON DELETE CASCADE,
    evidence_type TEXT NOT NULL CHECK (evidence_type IN ('file', 'link', 'note', 'image')),
    title TEXT NOT NULL,
    content TEXT,
    file_url TEXT,
    file_name TEXT,
    file_size INTEGER,
    uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT action_evidences_reference_check CHECK (
        (action_id IS NOT NULL AND recommendation_id IS NULL) OR
        (action_id IS NULL AND recommendation_id IS NOT NULL)
    )
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_companies_cnpj ON public.companies(cnpj);
CREATE INDEX IF NOT EXISTS idx_companies_created_by ON public.companies(created_by);
CREATE INDEX IF NOT EXISTS idx_assessments_company_id ON public.assessments(company_id);
CREATE INDEX IF NOT EXISTS idx_assessments_user_id ON public.assessments(user_id);
CREATE INDEX IF NOT EXISTS idx_assessments_status ON public.assessments(status);
CREATE INDEX IF NOT EXISTS idx_assessment_items_assessment_id ON public.assessment_items(assessment_id);
CREATE INDEX IF NOT EXISTS idx_scores_assessment_id ON public.scores(assessment_id);
CREATE INDEX IF NOT EXISTS idx_scores_category ON public.scores(category);
CREATE INDEX IF NOT EXISTS idx_recommendations_catalog_category ON public.recommendations_catalog(category);
CREATE INDEX IF NOT EXISTS idx_recommendations_catalog_active ON public.recommendations_catalog(is_active);
CREATE INDEX IF NOT EXISTS idx_assessment_recommendations_assessment_id ON public.assessment_recommendations(assessment_id);
CREATE INDEX IF NOT EXISTS idx_assessment_recommendations_status ON public.assessment_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_free_actions_company_id ON public.free_actions(company_id);
CREATE INDEX IF NOT EXISTS idx_free_actions_status ON public.free_actions(status);
CREATE INDEX IF NOT EXISTS idx_action_evidences_action_id ON public.action_evidences(action_id);
CREATE INDEX IF NOT EXISTS idx_action_evidences_recommendation_id ON public.action_evidences(recommendation_id);

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON public.companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_assessments_updated_at BEFORE UPDATE ON public.assessments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_assessment_items_updated_at BEFORE UPDATE ON public.assessment_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scores_updated_at BEFORE UPDATE ON public.scores
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_recommendations_catalog_updated_at BEFORE UPDATE ON public.recommendations_catalog
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_assessment_recommendations_updated_at BEFORE UPDATE ON public.assessment_recommendations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_free_actions_updated_at BEFORE UPDATE ON public.free_actions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
