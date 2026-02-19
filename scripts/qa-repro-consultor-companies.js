#!/usr/bin/env node
/**
 * QA: Reproduz 500 em GET /consultor/companies
 * Login como consultor@fca.com, chama o endpoint, imprime resposta.
 * O backend deve logar stack trace em [CONSULTOR_ERROR].
 *
 * Uso: node scripts/qa-repro-consultor-companies.js
 * Requer: API rodando, .env com SUPABASE_URL, SUPABASE_ANON_KEY
 */
const path = require('path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const API = process.env.API_URL || 'http://localhost:3001';
const email = process.env.CONSULTOR_EMAIL || 'consultor@fca.com';
const password = process.env.CONSULTOR_PASSWORD || 'senha123';

async function main() {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) {
    console.error('SUPABASE_URL e SUPABASE_ANON_KEY obrigatórios');
    process.exit(1);
  }

  const supabase = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.error('Login falhou:', error.message);
    process.exit(1);
  }
  const token = data.session.access_token;

  console.log('=== QA: GET /consultor/companies ===');
  console.log('Token obtido para', email);

  const res = await fetch(`${API}/consultor/companies`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.text();
  let json;
  try {
    json = body ? JSON.parse(body) : null;
  } catch {
    json = null;
  }

  console.log('Status:', res.status);
  console.log('Body:', json || body);
  console.log('\nVerifique o terminal do backend para [CONSULTOR_ERROR] e stack trace.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
