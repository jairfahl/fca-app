-- Seed 012: Empresa de teste para consultor (fca@fca.com)
-- Garante que fca@fca.com tenha ao menos uma empresa com owner_user_id.
-- Execute após: migrations, auth:bootstrap (ou create-test-users.js)
-- Idempotente: ON CONFLICT DO NOTHING

-- Inserir empresa FCA para fca@fca.com se não existir
INSERT INTO public.companies (id, cnpj, name, trade_name, owner_user_id, created_at, updated_at)
SELECT
  gen_random_uuid(),
  '00000000000191',  -- CNPJ válido (14 dígitos) para teste
  'FCA Teste',
  'FCA',
  up.user_id,
  NOW(),
  NOW()
FROM (SELECT user_id FROM public.user_profiles WHERE email = 'fca@fca.com' LIMIT 1) up
WHERE NOT EXISTS (
  SELECT 1 FROM public.companies c WHERE c.owner_user_id = up.user_id
);
