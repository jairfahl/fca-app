/**
 * Cria usuários de teste (USER, CONSULTOR, ADMIN) via Supabase Auth API.
 * Usa auth.admin.createUser() para garantir tokens corretos (evita "Database error querying schema").
 *
 * Requer: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY no .env
 *
 * Uso: node scripts/create-test-users.js
 */
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const TEST_PASSWORD = process.env.TEST_PASSWORD || 'senha123';

const USERS = [
  { email: 'fca@fca.com', role: 'USER' },
  { email: 'consultor@fca.com', role: 'CONSULTOR' },
  { email: 'admin@fca.com', role: 'ADMIN' },
];

async function ensureUserProfile(userId, email, role) {
  const { error } = await supabase.from('user_profiles').upsert(
    { user_id: userId, email: email.toLowerCase(), role, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
  if (error) {
    console.warn(`Aviso: user_profiles upsert falhou para ${email}:`, error.message);
  }
}

async function ensureUser(email, role) {
  const { data: { users } } = await supabase.auth.admin.listUsers();
  const existing = users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());

  if (existing) {
    const { error: updateErr } = await supabase.auth.admin.updateUserById(existing.id, {
      app_metadata: { ...existing.app_metadata, role },
    });
    if (updateErr) {
      console.warn(`Aviso: não foi possível atualizar role de ${email}:`, updateErr.message);
    }
    await ensureUserProfile(existing.id, existing.email || email, role);
    console.log(`OK: ${email} já existe (role=${role})`);
    return;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    app_metadata: { role },
  });

  if (error) {
    console.error(`Erro ao criar ${email}:`, error.message);
    return false;
  }
  if (data?.user) {
    await ensureUserProfile(data.user.id, data.user.email || email, role);
  }
  console.log(`OK: ${email} criado (role=${role})`);
  return true;
}

async function main() {
  for (const { email, role } of USERS) {
    await ensureUser(email, role);
  }
  console.log('\nConcluído. Usuários criados com senha:', TEST_PASSWORD);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
