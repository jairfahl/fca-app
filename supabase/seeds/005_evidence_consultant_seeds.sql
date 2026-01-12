-- ============================================================
-- PROMPT 05-A v2 — SEED DATA (RLS-COMPLIANT)
-- ============================================================

-- Test IDs (deterministic for testing)
DO $$
DECLARE
  test_company_id UUID := 'd290f1ee-6c54-4b01-90e6-d701748f0851';
  test_user_id UUID := '11111111-1111-1111-1111-111111111111';
  test_consultant_id UUID := '22222222-2222-2222-2222-222222222222';
  test_cycle_id UUID := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  test_action_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
BEGIN
  -- Ensure company exists
  INSERT INTO company (company_id, display_name, segment_id, created_by, created_at)
  VALUES (test_company_id, 'Test Company', 'C', test_user_id, NOW())
  ON CONFLICT (company_id) DO NOTHING;

  -- Link user to company (via company_users)
  INSERT INTO company_users (company_id, user_id, joined_at)
  VALUES (test_company_id, test_user_id, NOW())
  ON CONFLICT (company_id, user_id) DO NOTHING;

  -- NOTE: company_consultants INSERT blocked by RLS (no_insert policy)
  -- Consultant assignment must be done via service_role or admin interface
  -- For testing, manually insert via Supabase dashboard or migration script:
  -- 
  -- INSERT INTO company_consultants (company_id, consultant_id, assigned_at)
  -- VALUES (
  --   'd290f1ee-6c54-4b01-90e6-d701748f0851',
  --   '22222222-2222-2222-2222-222222222222',
  --   NOW()
  -- );

  -- Create closed cycle
  INSERT INTO assessment_cycle (
    assessment_cycle_id,
    company_id,
    status,
    created_by,
    started_at,
    finished_at
  )
  VALUES (
    test_cycle_id,
    test_company_id,
    'CLOSED',
    test_user_id,
    NOW() - INTERVAL '30 days',
    NOW() - INTERVAL '1 day'
  )
  ON CONFLICT (assessment_cycle_id) DO NOTHING;

  -- Create selected action
  INSERT INTO selected_actions (
    selected_action_id,
    cycle_id,
    user_id,
    action_catalog_id,
    sequence,
    status,
    created_at
  )
  VALUES (
    test_action_id,
    test_cycle_id,
    test_user_id,
    (SELECT action_catalog_id FROM action_catalog LIMIT 1),
    1,
    'IN_PROGRESS',
    NOW()
  )
  ON CONFLICT (selected_action_id) DO NOTHING;

END $$;

-- Sample evidence (would be inserted via authenticated user)
-- INSERT INTO action_evidence (company_id, cycle_id, selected_action_id, content, created_by)
-- VALUES (
--   'd290f1ee-6c54-4b01-90e6-d701748f0851',
--   'cccccccc-cccc-cccc-cccc-cccccccccccc',
--   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
--   'Implemented new sales tracking system',
--   '11111111-1111-1111-1111-111111111111'
-- );

-- Sample consultant comment (would be inserted via authenticated consultant)
-- INSERT INTO consultant_comments (company_id, cycle_id, selected_action_id, consultant_id, content)
-- VALUES (
--   'd290f1ee-6c54-4b01-90e6-d701748f0851',
--   'cccccccc-cccc-cccc-cccc-cccccccccccc',
--   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
--   '22222222-2222-2222-2222-222222222222',
--   'Great progress on implementing the sales tracking system. Consider adding weekly review meetings.'
-- );
