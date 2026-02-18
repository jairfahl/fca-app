#!/usr/bin/env node
/**
 * Diagnóstico do Supabase Auth (DEV/TEST).
 * Verifica: health REST, listagem de usuários, existência dos 3 usuários de teste,
 * teste de login (password grant) e identifica se 500 "Database error querying schema"
 * é problema do Auth/schema (não credencial).
 *
 * Requer: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY no .env
 *
 * Uso: npm run auth:diagnose
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TEST_USERS = [
  { email: 'fca@fca.com', role: 'USER' },
  { email: 'consultor@fca.com', role: 'CONSULTOR' },
  { email: 'admin@fca.com', role: 'ADMIN' },
];
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'senha123';

function log(section, msg, data = null) {
  const prefix = `[${section}]`;
  console.log(prefix, msg);
  if (data != null) console.log(prefix, JSON.stringify(data, null, 2));
}

async function checkRestHealth() {
  log('1. HEALTH', 'Consegue bater no endpoint de health do Supabase (rest/v1)?');
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      method: 'HEAD',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    const ok = res.ok || res.status === 404; // 404 = endpoint existe mas não responde HEAD
    log('1. HEALTH', ok ? 'SIM' : `NÃO (status=${res.status})`);
    return ok;
  } catch (err) {
    log('1. HEALTH', 'NÃO', { error: err.message });
    return false;
  }
}

async function checkAdminListUsers() {
  log('2. ADMIN API', 'Consegue listar usuários via Admin API (service role)?');
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    log('2. ADMIN API', 'NÃO - SUPABASE_SERVICE_ROLE_KEY ausente');
    return { ok: false, users: [] };
  }
  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (error) {
      log('2. ADMIN API', 'NÃO', { error: error.message, code: error.code });
      return { ok: false, users: [] };
    }
    const users = data?.users ?? [];
    log('2. ADMIN API', `SIM (${users.length} usuário(s) listado(s))`);
    return { ok: true, users };
  } catch (err) {
    log('2. ADMIN API', 'NÃO', { error: err.message });
    return { ok: false, users: [] };
  }
}

function checkUsersExist(users) {
  log('3. USUÁRIOS', 'Usuários existem? (fca/admin/consultor)');
  const emails = (users || []).map((u) => u?.email?.toLowerCase()).filter(Boolean);
  for (const { email } of TEST_USERS) {
    const exists = emails.includes(email.toLowerCase());
    log('3. USUÁRIOS', `${email}: ${exists ? 'SIM' : 'NÃO'}`);
  }
}

async function testLoginRaw(email, password) {
  const url = `${SUPABASE_URL}/auth/v1/token?grant_type=password`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = { raw: body };
  }
  return { status: res.status, body: parsed };
}

async function testLogin(email, password) {
  try {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      return { ok: false, error: { message: error.message, status: error.status, code: error.code } };
    }
    return { ok: true, hasSession: !!data?.session };
  } catch (err) {
    return { ok: false, error: { message: err.message } };
  }
}

async function runLoginTests() {
  log('4. LOGIN', 'Teste de login (password grant) para cada um');
  if (!SUPABASE_ANON_KEY) {
    log('4. LOGIN', 'NÃO - SUPABASE_ANON_KEY ausente');
    return;
  }
  for (const { email } of TEST_USERS) {
    const result = await testLogin(email, TEST_PASSWORD);
    if (result.ok) {
      log('4. LOGIN', `${email}: 200 OK`);
    } else {
      const err = result.error || {};
      log('4. LOGIN', `${email}: FALHOU`, err);
      const msg = (err.message || '').toLowerCase();
      const code = (err.code || '').toLowerCase();
      if (
        msg.includes('database error querying schema') ||
        msg.includes('unexpected_failure') ||
        code === 'unexpected_failure'
      ) {
        const raw = await testLoginRaw(email, TEST_PASSWORD);
        log('5. EVIDÊNCIA 500', `Status=${raw.status}`, raw.body);
        log(
          '5. RECOMENDAÇÃO',
          'Problema do Auth/schema no projeto Supabase, não credencial. Rode: npm run auth:bootstrap. Se persistir, verifique migrações do Auth no Supabase Dashboard.'
        );
      }
    }
  }
}

async function main() {
  console.log('\n=== Auth Diagnóstico (DEV) ===\n');
  if (!SUPABASE_URL) {
    console.error('SUPABASE_URL ausente no .env');
    process.exit(1);
  }
  if (!SUPABASE_ANON_KEY) {
    console.warn('SUPABASE_ANON_KEY ausente - teste de login será limitado');
  }

  await checkRestHealth();
  const { users } = await checkAdminListUsers();
  checkUsersExist(users);
  await runLoginTests();
  console.log('\n=== Fim do diagnóstico ===\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
