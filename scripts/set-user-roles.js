/**
 * Define app_metadata.role para usuários de teste (CONSULTOR, ADMIN).
 * Requer: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY no .env
 *
 * Uso: node scripts/set-user-roles.js
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

async function setRole(email, role) {
  const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) {
    console.error('Erro ao listar usuários:', listErr.message);
    return false;
  }
  const user = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    console.warn(`Usuário não encontrado: ${email}`);
    return false;
  }
  const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, role },
  });
  if (error) {
    console.error(`Erro ao definir role ${role} para ${email}:`, error.message);
    return false;
  }
  console.log(`OK: ${email} -> role=${role}`);
  return true;
}

async function main() {
  await setRole('consultor@fca.com', 'CONSULTOR');
  await setRole('admin@fca.com', 'ADMIN');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
