#!/usr/bin/env node
/**
 * E2E: ativar FULL (teste) → carregar FULL
 *
 * Pré-requisitos:
 * - API rodando (ex: http://localhost:3001)
 * - Supabase com usuário fca@fca.com / senha123
 * - .env com SUPABASE_URL, SUPABASE_ANON_KEY, TEST_EMAIL, TEST_PASSWORD
 *
 * Uso:
 *   node scripts/e2e-activate-full.js
 *   # ou com env:
 *   TEST_EMAIL=fca@fca.com TEST_PASSWORD=senha123 node scripts/e2e-activate-full.js
 */
const path = require('path');
const dotenv = require('dotenv');

const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const API_URL = (process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/+$/, '');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const TEST_EMAIL = process.env.TEST_EMAIL || 'fca@fca.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'senha123';

function fail(step, message, detail) {
  console.error(`\n[E2E FAIL] ${step}: ${message}`);
  if (detail) console.error('Detalhe:', typeof detail === 'object' ? JSON.stringify(detail, null, 2) : detail);
  process.exit(1);
}

async function apiFetch(pathname, options = {}, token) {
  const url = `${API_URL}${pathname}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    fail('CONFIG', 'SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórios no .env');
  }

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

  // 1) Autenticar como fca@fca.com
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (authErr) fail('AUTH', 'Falha ao autenticar', authErr.message);
  const token = authData.session.access_token;
  console.log('[E2E] Autenticado como', TEST_EMAIL);

  // 2) Obter company_id (criar se não existir)
  let companyId;
  const { status: companiesStatus, body: companiesBody } = await apiFetch('/companies', {}, token);
  if (companiesStatus !== 200) fail('GET /companies', `Status ${companiesStatus}`, companiesBody);
  const companies = Array.isArray(companiesBody) ? companiesBody : [];
  if (companies.length > 0) {
    companyId = companies[0].id;
    console.log('[E2E] Company existente:', companyId);
  } else {
    const { status: createStatus, body: createBody } = await apiFetch(
      '/companies',
      { method: 'POST', body: JSON.stringify({ name: 'E2E Test Company', segment: 'COMERCIO' }) },
      token
    );
    if (createStatus !== 201 || !createBody?.id) {
      fail('POST /companies', `Status ${createStatus}`, createBody);
    }
    companyId = createBody.id;
    console.log('[E2E] Company criada:', companyId);
  }

  // 3) POST /entitlements/full/activate_test
  const { status: activateStatus, body: activateBody } = await apiFetch(
    `/entitlements/full/activate_test?company_id=${companyId}`,
    { method: 'POST' },
    token
  );
  if (activateStatus !== 200) {
    fail('POST /entitlements/full/activate_test', `Esperado 200, recebido ${activateStatus}`, activateBody);
  }
  if (activateBody.plan !== 'FULL' || activateBody.status !== 'ACTIVE') {
    fail(
      'POST /entitlements/full/activate_test',
      `Payload inválido: esperado plan=FULL status=ACTIVE, recebido plan=${activateBody.plan} status=${activateBody.status}`,
      activateBody
    );
  }
  console.log('[E2E] activate_test 200 OK', { plan: activateBody.plan, status: activateBody.status });

  // 4) GET /entitlements?company_id=...
  const { status: entStatus, body: entBody } = await apiFetch(`/entitlements?company_id=${companyId}`, {}, token);
  if (entStatus !== 200) {
    fail('GET /entitlements', `Status ${entStatus}`, entBody);
  }
  if (entBody.plan !== 'FULL' || entBody.status !== 'ACTIVE') {
    fail(
      'GET /entitlements',
      `Entitlement não reflete FULL/ACTIVE: plan=${entBody.plan} status=${entBody.status}`,
      entBody
    );
  }
  console.log('[E2E] Entitlements FULL/ACTIVE confirmado');

  // 5) GET /full/assessments/current?company_id=...
  const { status: currentStatus, body: currentBody } = await apiFetch(
    `/full/assessments/current?company_id=${companyId}`,
    {},
    token
  );
  if (currentStatus !== 200) {
    fail('GET /full/assessments/current', `Esperado 200, recebido ${currentStatus}`, currentBody);
  }
  if (!currentBody.id) {
    fail('GET /full/assessments/current', 'Payload sem id (assessment)', currentBody);
  }
  console.log('[E2E] /full/assessments/current 200 OK', { assessment_id: currentBody.id });

  console.log('\n[E2E PASS] ativar FULL → carregar FULL: todas as validações passaram.');
}

main().catch((err) => {
  console.error('[E2E FAIL] Erro inesperado:', err.message);
  process.exit(1);
});
