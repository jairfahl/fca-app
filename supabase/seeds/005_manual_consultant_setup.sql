-- ============================================================
-- MANUAL SETUP REQUIRED FOR TESTING
-- ============================================================
-- This script must be run with elevated privileges (service_role or postgres role)
-- to insert into company_consultants table (blocked by RLS for authenticated users)

INSERT INTO company_consultants (company_id, consultant_id, assigned_at)
VALUES (
  'd290f1ee-6c54-4b01-90e6-d701748f0851'::uuid,
  '22222222-2222-2222-2222-222222222222'::uuid,
  NOW()
)
ON CONFLICT (company_id, consultant_id) DO NOTHING;
