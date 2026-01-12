-- ============================================================
-- PROMPT 05-A v2 — EVIDENCE & CONSULTANT COMMENTS
-- ============================================================

-- ============================================================
-- TABLE: company_consultants
-- ============================================================
CREATE TABLE IF NOT EXISTS company_consultants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES company(company_id) ON DELETE CASCADE,
  consultant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, consultant_id)
);

CREATE INDEX IF NOT EXISTS idx_company_consultants_company ON company_consultants(company_id);
CREATE INDEX IF NOT EXISTS idx_company_consultants_consultant ON company_consultants(consultant_id);

-- ============================================================
-- TABLE: action_evidence
-- ============================================================
CREATE TABLE action_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES company(company_id) ON DELETE CASCADE,
  cycle_id UUID NOT NULL REFERENCES assessment_cycle(assessment_cycle_id) ON DELETE CASCADE,
  selected_action_id UUID NOT NULL REFERENCES selected_actions(selected_action_id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_content_not_empty CHECK (length(trim(content)) > 0)
);

CREATE INDEX idx_action_evidence_company ON action_evidence(company_id);
CREATE INDEX idx_action_evidence_cycle ON action_evidence(cycle_id);
CREATE INDEX idx_action_evidence_action ON action_evidence(selected_action_id);
CREATE INDEX idx_action_evidence_created_by ON action_evidence(created_by);

-- ============================================================
-- TABLE: consultant_comments
-- ============================================================
CREATE TABLE consultant_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES company(company_id) ON DELETE CASCADE,
  cycle_id UUID NOT NULL REFERENCES assessment_cycle(assessment_cycle_id) ON DELETE CASCADE,
  selected_action_id UUID NOT NULL REFERENCES selected_actions(selected_action_id) ON DELETE CASCADE,
  consultant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_comment_not_empty CHECK (length(trim(content)) > 0)
);

CREATE INDEX idx_consultant_comments_company ON consultant_comments(company_id);
CREATE INDEX idx_consultant_comments_cycle ON consultant_comments(cycle_id);
CREATE INDEX idx_consultant_comments_action ON consultant_comments(selected_action_id);
CREATE INDEX idx_consultant_comments_consultant ON consultant_comments(consultant_id);

-- ============================================================
-- ENABLE RLS
-- ============================================================
ALTER TABLE company_consultants ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultant_comments ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES: company_consultants
-- ============================================================

-- SELECT: company users and consultants can see their assignments
CREATE POLICY select_company_consultants
ON company_consultants
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM company_users cu
    WHERE cu.company_id = company_consultants.company_id
      AND cu.user_id = auth.uid()
  )
  OR consultant_id = auth.uid()
);

-- INSERT/UPDATE/DELETE: Not allowed via RLS (admin-only via service_role)
CREATE POLICY no_insert_company_consultants
ON company_consultants
FOR INSERT
WITH CHECK (false);

CREATE POLICY no_update_company_consultants
ON company_consultants
FOR UPDATE
USING (false);

CREATE POLICY no_delete_company_consultants
ON company_consultants
FOR DELETE
USING (false);

-- ============================================================
-- RLS POLICIES: action_evidence
-- ============================================================

-- INSERT: company user can submit evidence for their company's actions
CREATE POLICY insert_action_evidence
ON action_evidence
FOR INSERT
WITH CHECK (
  auth.uid() = created_by
  AND EXISTS (
    SELECT 1 FROM company_users cu
    WHERE cu.company_id = action_evidence.company_id
      AND cu.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM selected_actions sa
    JOIN assessment_cycle ac ON ac.assessment_cycle_id = sa.cycle_id
    WHERE sa.selected_action_id = action_evidence.selected_action_id
      AND ac.company_id = action_evidence.company_id
  )
);

-- SELECT: company users can see their company's evidence
CREATE POLICY select_action_evidence
ON action_evidence
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM company_users cu
    WHERE cu.company_id = action_evidence.company_id
      AND cu.user_id = auth.uid()
  )
);

-- UPDATE: explicitly denied (append-only)
CREATE POLICY no_update_action_evidence
ON action_evidence
FOR UPDATE
USING (false);

-- DELETE: explicitly denied (append-only)
CREATE POLICY no_delete_action_evidence
ON action_evidence
FOR DELETE
USING (false);

-- ============================================================
-- RLS POLICIES: consultant_comments
-- ============================================================

-- INSERT: consultant assigned to company can comment
CREATE POLICY insert_consultant_comment
ON consultant_comments
FOR INSERT
WITH CHECK (
  auth.uid() = consultant_id
  AND EXISTS (
    SELECT 1 FROM company_consultants cc
    WHERE cc.company_id = consultant_comments.company_id
      AND cc.consultant_id = auth.uid()
  )
);

-- SELECT: company users and consultants can see comments
CREATE POLICY select_consultant_comments
ON consultant_comments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM company_users cu
    WHERE cu.company_id = consultant_comments.company_id
      AND cu.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM company_consultants cc
    WHERE cc.company_id = consultant_comments.company_id
      AND cc.consultant_id = auth.uid()
  )
);

-- UPDATE: explicitly denied
CREATE POLICY no_update_consultant_comments
ON consultant_comments
FOR UPDATE
USING (false);

-- DELETE: explicitly denied
CREATE POLICY no_delete_consultant_comments
ON consultant_comments
FOR DELETE
USING (false);
