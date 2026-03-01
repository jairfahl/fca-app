-- Seed 011: Membership de teste para SoD RBAC
-- Garante que empresas cujo owner é fca@fca.com tenham linha em company_members.
-- Execute após: migrations, create-test-users.js
-- Idempotente: ON CONFLICT DO NOTHING

INSERT INTO public.company_members (company_id, user_id, member_role, status)
SELECT
  c.id,
  c.owner_user_id,
  'OWNER',
  'ACTIVE'
FROM public.companies c
JOIN auth.users u ON u.id = c.owner_user_id
WHERE u.email = 'fca@fca.com'
  AND c.owner_user_id IS NOT NULL
ON CONFLICT (company_id, user_id) DO NOTHING;
