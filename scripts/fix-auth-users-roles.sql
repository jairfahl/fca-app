-- Fix: Garantir role correto em auth.users (app_metadata.role)
-- Fonte de verdade: raw_app_meta_data no Supabase
--
-- Execute no SQL Editor do Supabase Dashboard (project > SQL Editor).
-- Idempotente: pode rodar várias vezes.

-- consultor@fca.com => CONSULTOR
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role":"CONSULTOR"}'::jsonb
WHERE email = 'consultor@fca.com';

-- admin@fca.com => ADMIN
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role":"ADMIN"}'::jsonb
WHERE email = 'admin@fca.com';

-- fca@fca.com => USER
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role":"USER"}'::jsonb
WHERE email = 'fca@fca.com';

-- Verificar (opcional)
-- SELECT id, email, raw_app_meta_data->>'role' AS role FROM auth.users WHERE email IN ('consultor@fca.com','admin@fca.com','fca@fca.com');
