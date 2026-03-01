#!/usr/bin/env node
/**
 * Bootstrap idempotente dos usuários de teste (DEV/TEST).
 * Garante: fca@fca.com (USER), consultor@fca.com (CONSULTOR), admin@fca.com (ADMIN)
 * com senha senha123 e role em app_metadata.role.
 *
 * Requer: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY no .env
 *
 * Uso: npm run auth:bootstrap
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'senha123';

const USERS = [
  { email: 'fca@fca.com', role: 'USER' },
  { email: 'consultor@fca.com', role: 'CONSULTOR' },
  { email: 'admin@fca.com', role: 'ADMIN' },
];

async function ensureUserProfile(supabase, userId, email, role) {
  const { error } = await supabase.from('user_profiles').upsert(
    { user_id: userId, email: (email || '').toLowerCase(), role, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
  if (error) {
    console.warn(`${email}: user_profiles upsert falhou - ${error.message} (migration 034?)`);
  }
}

async function ensureUser(supabase, { email, role }) {
  const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) {
    console.warn(`[listUsers falhou: ${listErr.message}] Tentando createUser...`);
  }
  const existing = users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());

  if (existing) {
    const { error: updateErr } = await supabase.auth.admin.updateUserById(existing.id, {
      password: TEST_PASSWORD,
      app_metadata: { ...(existing.app_metadata || {}), role },
    });
    if (updateErr) {
      console.log(`${email}: ERRO ao atualizar - ${updateErr.message}`);
      return 'ERROR';
    }
    await ensureUserProfile(supabase, existing.id, existing.email || email, role);
    const hadRole = existing.app_metadata?.role === role;
    console.log(`${email}: ${hadRole ? 'OK' : 'UPDATED'} (role=${role}, senha=senha123)`);
    return hadRole ? 'OK' : 'UPDATED';
  }

  const { data: createData, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    app_metadata: { role },
  });
  if (createErr) {
    console.log(`${email}: ERRO ao criar - ${createErr.message}`);
    return 'ERROR';
  }
  if (createData?.user) {
    await ensureUserProfile(supabase, createData.user.id, createData.user.email || email, role);
  }
  console.log(`${email}: CREATED (role=${role}, senha=senha123)`);
  return 'CREATED';
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios no .env');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  console.log('\n=== Auth Bootstrap (DEV) ===\n');
  for (const user of USERS) {
    await ensureUser(supabase, user);
  }
  console.log('\nConcluído. Senha padrão: senha123\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
