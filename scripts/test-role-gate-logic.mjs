#!/usr/bin/env node
/**
 * Teste mínimo: RoleGate não redireciona quando já está em /consultor
 * Rodar: node scripts/test-role-gate-logic.mjs
 */

const CONSULTOR_ALLOWED_PREFIXES = ['/consultor', '/full/consultor', '/logout'];

function computeRedirectTarget(pathname, role) {
  if (!pathname) return null;
  const isConsultorRoute = CONSULTOR_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p));

  if (role === 'CONSULTOR' || role === 'ADMIN') {
    if (!isConsultorRoute) return '/consultor';
    return null;
  }
  if (role === 'USER') {
    if (isConsultorRoute) return '/diagnostico';
    return null;
  }
  return null;
}

const tests = [
  { path: '/consultor', role: 'CONSULTOR', expected: null, desc: 'CONSULTOR em /consultor => não redireciona' },
  { path: '/consultor', role: 'ADMIN', expected: null, desc: 'ADMIN em /consultor => não redireciona' },
  { path: '/consultor?msg=x', role: 'CONSULTOR', expected: null, desc: 'CONSULTOR em /consultor?msg= => não redireciona' },
  { path: '/full/consultor', role: 'CONSULTOR', expected: null, desc: 'CONSULTOR em /full/consultor => não redireciona' },
  { path: '/consultor', role: 'USER', expected: '/diagnostico', desc: 'USER em /consultor => redirect /diagnostico' },
  { path: '/full', role: 'CONSULTOR', expected: '/consultor', desc: 'CONSULTOR em /full => redirect /consultor' },
  { path: '/diagnostico', role: 'CONSULTOR', expected: '/consultor', desc: 'CONSULTOR em /diagnostico => redirect /consultor' },
  { path: '/results', role: 'CONSULTOR', expected: '/consultor', desc: 'CONSULTOR em /results => redirect /consultor' },
  { path: '/diagnostico', role: 'USER', expected: null, desc: 'USER em /diagnostico => não redireciona' },
];

let passed = 0;
let failed = 0;

for (const t of tests) {
  const got = computeRedirectTarget(t.path, t.role);
  const ok = got === t.expected;
  if (ok) {
    passed++;
    console.log(`PASS: ${t.desc}`);
  } else {
    failed++;
    console.log(`FAIL: ${t.desc} (got ${got}, expected ${t.expected})`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
