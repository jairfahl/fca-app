-- ============================================================
-- PROMPT 05-A v2 — RLS VALIDATION QUERIES
-- ============================================================

-- Test IDs
\set test_company_id 'd290f1ee-6c54-4b01-90e6-d701748f0851'
\set test_user_id '11111111-1111-1111-1111-111111111111'
\set test_consultant_id '22222222-2222-2222-2222-222222222222'
\set test_cycle_id 'cccccccc-cccc-cccc-cccc-cccccccccccc'
\set test_action_id 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
\set other_company_id '99999999-9999-9999-9999-999999999999'
\set other_user_id '88888888-8888-8888-8888-888888888888'

-- ============================================================
-- PROVA 2 — INSERT QUE FUNCIONA
-- ============================================================

-- Simulate authenticated user session
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claim.sub TO :'test_user_id';

-- Test 1: Company user inserts evidence (SHOULD SUCCEED)
INSERT INTO action_evidence (company_id, cycle_id, selected_action_id, content, created_by)
VALUES (
  :'test_company_id',
  :'test_cycle_id',
  :'test_action_id',
  'Implemented new sales tracking system with automated reports',
  :'test_user_id'
);

-- Verify evidence was inserted
SELECT 
  'Evidence Insert Test' as test,
  CASE 
    WHEN COUNT(*) = 1 THEN 'PASS'
    ELSE 'FAIL'
  END as result
FROM action_evidence
WHERE selected_action_id = :'test_action_id';

-- Simulate authenticated consultant session
SET LOCAL request.jwt.claim.sub TO :'test_consultant_id';

-- Test 2: Consultant inserts comment (SHOULD SUCCEED)
INSERT INTO consultant_comments (company_id, cycle_id, selected_action_id, consultant_id, content)
VALUES (
  :'test_company_id',
  :'test_cycle_id',
  :'test_action_id',
  :'test_consultant_id',
  'Great progress on implementing the sales tracking system. Consider adding weekly review meetings.'
);

-- Verify comment was inserted
SELECT 
  'Consultant Comment Insert Test' as test,
  CASE 
    WHEN COUNT(*) = 1 THEN 'PASS'
    ELSE 'FAIL'
  END as result
FROM consultant_comments
WHERE selected_action_id = :'test_action_id';

-- ============================================================
-- PROVA 3 — CROSS-TENANT QUE FALHA
-- ============================================================

-- Setup: Create another company
INSERT INTO company (company_id, display_name, segment_id, created_by, created_at)
VALUES (:'other_company_id', 'Other Company', 'C', :'other_user_id', NOW())
ON CONFLICT DO NOTHING;

INSERT INTO company_users (company_id, user_id, joined_at)
VALUES (:'other_company_id', :'other_user_id', NOW())
ON CONFLICT DO NOTHING;

-- Simulate other user trying to access test company data
SET LOCAL request.jwt.claim.sub TO :'other_user_id';

-- Test 3: Cross-tenant SELECT on evidence (SHOULD RETURN 0 ROWS)
SELECT 
  'Cross-tenant Evidence SELECT Test' as test,
  CASE 
    WHEN COUNT(*) = 0 THEN 'PASS'
    ELSE 'FAIL'
  END as result
FROM action_evidence
WHERE company_id = :'test_company_id';

-- Test 4: Cross-tenant INSERT on evidence (SHOULD FAIL)
DO $$
BEGIN
  INSERT INTO action_evidence (company_id, cycle_id, selected_action_id, content, created_by)
  VALUES (
    'd290f1ee-6c54-4b01-90e6-d701748f0851',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Malicious evidence attempt',
    '88888888-8888-8888-8888-888888888888'
  );
  
  RAISE EXCEPTION 'Cross-tenant INSERT should have been blocked by RLS';
EXCEPTION
  WHEN insufficient_privilege OR check_violation THEN
    RAISE NOTICE 'Cross-tenant Evidence INSERT Test: PASS (blocked by RLS)';
END $$;

-- Test 5: Non-consultant trying to comment (SHOULD FAIL)
SET LOCAL request.jwt.claim.sub TO :'test_user_id';

DO $$
BEGIN
  INSERT INTO consultant_comments (company_id, cycle_id, selected_action_id, consultant_id, content)
  VALUES (
    'd290f1ee-6c54-4b01-90e6-d701748f0851',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '11111111-1111-1111-1111-111111111111',
    'User trying to comment as consultant'
  );
  
  RAISE EXCEPTION 'Non-consultant INSERT should have been blocked by RLS';
EXCEPTION
  WHEN insufficient_privilege OR check_violation THEN
    RAISE NOTICE 'Non-consultant Comment INSERT Test: PASS (blocked by RLS)';
END $$;

-- Test 6: UPDATE attempt on evidence (SHOULD FAIL - APPEND ONLY)
SET LOCAL request.jwt.claim.sub TO :'test_user_id';

DO $$
BEGIN
  UPDATE action_evidence
  SET content = 'Modified evidence'
  WHERE selected_action_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  
  RAISE EXCEPTION 'UPDATE on evidence should have been blocked by RLS';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Evidence UPDATE Test: PASS (blocked by RLS)';
END $$;

-- Test 7: DELETE attempt on evidence (SHOULD FAIL - APPEND ONLY)
DO $$
BEGIN
  DELETE FROM action_evidence
  WHERE selected_action_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  
  RAISE EXCEPTION 'DELETE on evidence should have been blocked by RLS';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Evidence DELETE Test: PASS (blocked by RLS)';
END $$;

-- Reset role
RESET role;
RESET request.jwt.claim.sub;

-- ============================================================
-- SUMMARY
-- ============================================================
SELECT '=== RLS VALIDATION COMPLETE ===' as status;
