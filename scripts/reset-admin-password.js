#!/usr/bin/env node
/**
 * Reseta a senha de admin@fca.com para "senha123"
 * Requer: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY devem estar no .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  const email = 'admin@fca.com';
  const newPassword = 'senha123';

  const { data: users, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) {
    console.error('Erro ao listar usuários:', listErr.message);
    process.exit(1);
  }

  const user = users.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    console.error(`Usuário ${email} não encontrado.`);
    process.exit(1);
  }

  const { error: updateErr } = await supabase.auth.admin.updateUserById(user.id, {
    password: newPassword,
  });

  if (updateErr) {
    console.error('Erro ao atualizar senha:', updateErr.message);
    process.exit(1);
  }

  console.log(`Senha de ${email} alterada com sucesso para "${newPassword}"`);
}

main();
