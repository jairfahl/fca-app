-- Fix: "Database error querying schema" ao fazer login
-- Causa: colunas de token em auth.users com NULL; GoTrue espera strings (mesmo vazias).
-- Ver: https://github.com/supabase/auth/issues/1940
--
-- Execute no SQL Editor do Supabase Dashboard (project > SQL Editor).
-- Não altera o schema, apenas corrige dados existentes.

-- Corrige token columns que podem estar NULL
UPDATE auth.users SET confirmation_token = '' WHERE confirmation_token IS NULL;
UPDATE auth.users SET recovery_token = '' WHERE recovery_token IS NULL;
UPDATE auth.users SET email_change = '' WHERE email_change IS NULL;
UPDATE auth.users SET email_change_token_new = '' WHERE email_change_token_new IS NULL;

-- Colunas opcionais (podem existir em versões mais recentes)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'email_change_token_current') THEN
    EXECUTE 'UPDATE auth.users SET email_change_token_current = '''' WHERE email_change_token_current IS NULL';
  END IF;
END $$;
