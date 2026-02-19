#!/usr/bin/env node
/**
 * QA: Verifica conserto GET /consultor/companies
 * - CONSULTOR: 200 + lista (mesmo vazia)
 * - USER: 403
 */
const path = require('path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const API = process.env.API_URL || 'http://localhost:3001';
const CONSULTOR_EMAIL = process.env.CONSULTOR_EMAIL || 'consultor@fca.com';
const CONSULTOR_PASSWORD = process.env.CONSULTOR_PASSWORD || 'senha123';
const USER_EMAIL = process.env.USER_EMAIL || process.env.TEST_EMAIL || 'fca@fca.com';
const USER_PASSWORD = process.env.USER_PASSWORD || process.env.TEST_PASSWORD || 'senha123';

async function getToken(email, password) {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error('SUPABASE_URL e SUPABASE_ANON_KEY obrigatórios');
  const supabase = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session.access_token;
}

async function fetchCompanies(token) {
  const res = await fetch(`${API}/consultor/companies`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  console.log('=== QA: Verificação conserto GET /consultor/companies ===\n');

  const consultorToken = await getToken(CONSULTOR_EMAIL, CONSULTOR_PASSWORD);
  const userToken = await getToken(USER_EMAIL, USER_PASSWORD);

  const consultorRes = await fetchCompanies(consultorToken);
  const userRes = await fetchCompanies(userToken);

  let ok = true;
  if (consultorRes.status !== 200) {
    console.error('FAIL: CONSULTOR deveria retornar 200, retornou', consultorRes.status);
    console.error('Body:', JSON.stringify(consultorRes.body, null, 2));
    ok = false;
  } else {
    console.log('OK: CONSULTOR retorna 200');
    const companies = consultorRes.body?.companies;
    if (!Array.isArray(companies)) {
      console.error('FAIL: payload.companies deveria ser array');
      ok = false;
    } else {
      console.log(`     companies.length = ${companies.length}`);
    }
  }

  if (userRes.status !== 403) {
    console.error('FAIL: USER deveria retornar 403, retornou', userRes.status);
    ok = false;
  } else {
    console.log('OK: USER retorna 403');
  }

  console.log(ok ? '\n=== Todos os critérios passaram ===' : '\n=== FALHOU ===');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
