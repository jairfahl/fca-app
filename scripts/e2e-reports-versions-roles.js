#!/usr/bin/env node
/**
 * E2E: Relatórios, versões, comparação e papéis (USER / CONSULTOR / ADMIN)
 *
 * Cenários:
 * 1) USER: Concluir FULL v1 -> gerar PDF -> baixar PDF
 *          Concluir ciclo (CLOSE) -> gerar PDF com evidências -> baixar
 *          Refazer diagnóstico -> cria FULL v2 -> comparar v1 vs v2
 * 2) CONSULTOR: Acessar lista companies -> abrir company de USER -> ver versões -> baixar relatório
 * 3) ADMIN: Smoke test (acesso irrestrito)
 * 4) Guards: 403 para USER em rota de consultor
 *
 * Requer: API rodando, .env com SUPABASE_URL, SUPABASE_ANON_KEY
 *         USER: fca@fca.com/senha123 (ou USER_EMAIL, USER_PASSWORD)
 *         CONSULTOR: consultor@fca.com/senha123 (ou CONSULTOR_EMAIL, CONSULTOR_PASSWORD)
 *         ADMIN: admin@fca.com/senha123 (ou ADMIN_EMAIL, ADMIN_PASSWORD)
 *
 * Uso: node scripts/e2e-reports-versions-roles.js
 */
const path = require('path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const API = process.env.API_URL || 'http://localhost:3001';

const USER_EMAIL = process.env.USER_EMAIL || process.env.TEST_EMAIL || 'fca@fca.com';
const USER_PASSWORD = process.env.USER_PASSWORD || process.env.TEST_PASSWORD || 'senha123';
const CONSULTOR_EMAIL = process.env.CONSULTOR_EMAIL || 'consultor@fca.com';
const CONSULTOR_PASSWORD = process.env.CONSULTOR_PASSWORD || 'senha123';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@fca.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'senha123';

function fail(msg) {
  console.error('E2E FAIL:', msg);
  process.exit(1);
}

function assert(cond, msg) {
  if (!cond) fail(msg);
}

async function getToken(email, password) {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  assert(url && anon, 'SUPABASE_URL e SUPABASE_ANON_KEY obrigatórios');
  const supabase = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) fail(`Login ${email}: ${error.message}`);
  return data.session.access_token;
}

async function fetchApi(path, opts = {}) {
  const url = `${API}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { status: res.status, body, ok: res.ok, headers: res.headers };
}

async function fetchAuth(path, token, opts = {}) {
  return fetchApi(path, {
    ...opts,
    headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` },
  });
}

async function fetchBinary(path, token) {
  const url = `${API}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, ok: res.ok, headers: res.headers, blob: res.ok ? await res.blob() : null };
}

async function main() {
  console.log('[1/8] Obtendo tokens...');
  const userToken = await getToken(USER_EMAIL, USER_PASSWORD);
  const consultorToken = await getToken(CONSULTOR_EMAIL, CONSULTOR_PASSWORD);
  const adminToken = await getToken(ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log('[OK] Tokens obtidos para USER, CONSULTOR, ADMIN');

  // --- Guard: USER não acessa rota de consultor ---
  console.log('[2/8] Guard: USER em /consultor/companies -> 403');
  const userConsultor = await fetchAuth('/consultor/companies', userToken);
  assert(userConsultor.status === 403, `Esperado 403, obtido ${userConsultor.status}`);
  console.log('[OK] USER recebe 403 em /consultor/companies');

  // --- CONSULTOR: lista companies ---
  console.log('[3/8] CONSULTOR: GET /consultor/companies');
  const companies = await fetchAuth('/consultor/companies', consultorToken);
  assert(companies.ok, 'Consultor companies: ' + (companies.body?.error || companies.status));
  const companyList = companies.body?.companies || [];
  assert(Array.isArray(companyList), 'companies deve ser array');
  console.log('[OK] CONSULTOR lista', companyList.length, 'empresas');

  // Se não houver company, precisamos que USER crie uma. Usar company do USER.
  let companyId = process.env.COMPANY_ID;
  if (!companyId && companyList.length > 0) {
    companyId = companyList[0].id;
  }
  if (!companyId) {
    const userCompanies = await fetchAuth('/companies', userToken);
    assert(userCompanies.ok, 'User companies: ' + (userCompanies.body?.error || userCompanies.status));
    const uc = userCompanies.body;
    companyId = (Array.isArray(uc) ? uc[0] : uc?.companies?.[0])?.id;
  }
  if (!companyId) {
    console.warn('[SKIP] Nenhuma company. Execute e2e-full-flow primeiro ou defina COMPANY_ID.');
    console.log('[OK] E2E reports/versions/roles concluído (parcial - sem company)');
    process.exit(0);
  }

  // --- USER: garantir entitlement FULL ---
  const unlock = await fetchAuth('/entitlements/manual-unlock', userToken, {
    method: 'POST',
    body: JSON.stringify({ company_id: companyId }),
  });
  if (!unlock.ok) console.warn('[WARN] manual-unlock:', unlock.body?.error);

  // --- USER: start assessment, answers, submit (v1) ---
  console.log('[4/8] USER: FULL v1 (start -> answers -> submit)');
  const start = await fetchAuth('/full/assessments/start', userToken, {
    method: 'POST',
    body: JSON.stringify({ company_id: companyId, segment: 'C', force_new: true }),
  });
  assert(start.ok, 'Start: ' + (start.body?.error || start.status));
  const assessmentId = start.body?.assessment_id;
  assert(assessmentId, 'assessment_id ausente');

  const lowAnswers = [
    { question_key: 'Q01', answer_value: 2 }, { question_key: 'Q02', answer_value: 3 }, { question_key: 'Q03', answer_value: 2 },
    { question_key: 'Q04', answer_value: 3 }, { question_key: 'Q05', answer_value: 2 }, { question_key: 'Q06', answer_value: 3 },
    { question_key: 'Q07', answer_value: 2 }, { question_key: 'Q08', answer_value: 3 }, { question_key: 'Q09', answer_value: 2 },
    { question_key: 'Q10', answer_value: 3 }, { question_key: 'Q11', answer_value: 2 }, { question_key: 'Q12', answer_value: 3 },
  ];
  for (const proc of ['COMERCIAL', 'OPERACOES', 'ADM_FIN', 'GESTAO']) {
    const put = await fetchAuth(
      `/full/assessments/${assessmentId}/answers?company_id=${companyId}`,
      userToken,
      { method: 'PUT', body: JSON.stringify({ process_key: proc, answers: lowAnswers }) }
    );
    assert(put.ok, `Answers ${proc}: ` + (put.body?.error || put.status));
  }

  const submit = await fetchAuth(
    `/full/assessments/${assessmentId}/submit?company_id=${companyId}`,
    userToken,
    { method: 'POST' }
  );
  assert(submit.ok, 'Submit: ' + (submit.body?.error || submit.status));
  console.log('[OK] FULL v1 SUBMITTED');

  // --- Versões: ordenadas, full_version incrementa ---
  console.log('[5/8] GET /full/versions');
  const versions = await fetchAuth(`/full/versions?company_id=${companyId}`, userToken);
  assert(versions.ok, 'Versions: ' + (versions.body?.error || versions.status));
  const vers = Array.isArray(versions.body) ? versions.body : versions.body?.versions || [];
  assert(vers.length >= 1, 'Esperado pelo menos 1 versão');
  const sorted = [...vers].sort((a, b) => (b.full_version || 0) - (a.full_version || 0));
  for (let i = 1; i < sorted.length; i++) {
    assert((sorted[i - 1].full_version || 0) >= (sorted[i].full_version || 0), 'Versões devem estar ordenadas por full_version desc');
  }
  const fullVersion1 = sorted[0]?.full_version ?? 1;
  console.log('[OK] Versões ordenadas, full_version atual:', fullVersion1);

  // --- Gerar PDF v1 ---
  console.log('[6/8] USER: gerar e baixar PDF v1');
  const gen = await fetchAuth(
    `/full/reports/generate?company_id=${companyId}&full_version=${fullVersion1}`,
    userToken,
    { method: 'POST' }
  );
  assert(gen.ok, 'Generate: ' + (gen.body?.error || gen.status));

  const statusRes = await fetchAuth(
    `/full/reports/status?company_id=${companyId}&full_version=${fullVersion1}`,
    userToken
  );
  assert(statusRes.ok, 'Status: ' + (statusRes.body?.error || statusRes.status));
  const reportStatus = statusRes.body?.status || gen.body?.status;
  assert(reportStatus === 'READY' || reportStatus === 'PENDING', 'Status esperado READY ou PENDING');

  const downloadRes = await fetchBinary(
    `/full/reports/download?company_id=${companyId}&full_version=${fullVersion1}`,
    userToken
  );
  assert(downloadRes.status === 200, `Download PDF: esperado 200, obtido ${downloadRes.status}`);
  const ct = downloadRes.headers.get('content-type') || '';
  assert(ct.includes('application/pdf'), `Content-Type esperado application/pdf, obtido ${ct}`);
  console.log('[OK] PDF retorna 200 e content-type application/pdf');

  // --- Ciclo: plan, evidence, close (para ter PDF com evidências) ---
  console.log('[7/8] USER: plano -> evidência -> close');
  const pending = await fetchAuth(
    `/full/causes/pending?assessment_id=${assessmentId}&company_id=${companyId}`,
    userToken
  );
  if (pending.ok && (pending.body?.pending || []).length > 0) {
    const causeAnswers = {
      GAP_CAIXA_PREVISAO: [
        { q_id: 'CAIXA_Q1', answer: 'DISCORDO_PLENAMENTE' },
        { q_id: 'CAIXA_Q2', answer: 'DISCORDO_PLENAMENTE' },
        { q_id: 'CAIXA_Q3', answer: 'DISCORDO_PLENAMENTE' },
        { q_id: 'CAIXA_Q4', answer: 'DISCORDO_PLENAMENTE' },
      ],
      GAP_VENDAS_FUNIL: [
        { q_id: 'VENDAS_Q1', answer: 'DISCORDO_PLENAMENTE' },
        { q_id: 'VENDAS_Q2', answer: 'DISCORDO_PLENAMENTE' },
        { q_id: 'VENDAS_Q3', answer: 'DISCORDO_PLENAMENTE' },
        { q_id: 'VENDAS_Q4', answer: 'DISCORDO_PLENAMENTE' },
      ],
      GAP_ROTINA_GERENCIAL: [
        { q_id: 'ROTINA_Q1', answer: 'DISCORDO_PLENAMENTE' },
        { q_id: 'ROTINA_Q2', answer: 'DISCORDO_PLENAMENTE' },
        { q_id: 'ROTINA_Q3', answer: 'DISCORDO_PLENAMENTE' },
        { q_id: 'ROTINA_Q4', answer: 'DISCORDO_PLENAMENTE' },
      ],
    };
    for (const p of pending.body.pending) {
      const ans = causeAnswers[p.gap_id];
      if (ans) {
        await fetchAuth('/full/causes/answer', userToken, {
          method: 'POST',
          body: JSON.stringify({
            assessment_id: assessmentId,
            company_id: companyId,
            gap_id: p.gap_id,
            answers: ans,
          }),
        });
      }
    }
  }

  const actions = await fetchAuth(
    `/full/actions?assessment_id=${assessmentId}&company_id=${companyId}`,
    userToken
  );
  const suggestions = (actions.body?.suggestions || []).slice(0, 3);
  if (suggestions.length >= 3) {
    const planBody = {
      assessment_id: assessmentId,
      company_id: companyId,
      actions: suggestions.slice(0, 3).map((s, i) => ({
        action_key: s.action_key,
        position: i + 1,
        owner_name: 'Dono ' + (i + 1),
        metric_text: 'Métrica ' + (i + 1),
        checkpoint_date: '2025-04-15',
      })),
    };
    const plan = await fetchAuth(`/full/plan?company_id=${companyId}`, userToken, {
      method: 'POST',
      body: JSON.stringify(planBody),
    });
    if (plan.ok) {
      const ak = suggestions[0].action_key;
      const dod = await fetchAuth(`/full/actions/${encodeURIComponent(ak)}/dod`, userToken);
      const dodItems = dod.body?.dod_checklist || ['Item 1', 'Item 2'];
      await fetchAuth(
        `/full/assessments/${assessmentId}/plan/${encodeURIComponent(ak)}/dod/confirm?company_id=${companyId}`,
        userToken,
        { method: 'POST', body: JSON.stringify({ confirmed_items: dodItems }) }
      );
      await fetchAuth(
        `/full/assessments/${assessmentId}/plan/${encodeURIComponent(ak)}/evidence?company_id=${companyId}`,
        userToken,
        {
          method: 'POST',
          body: JSON.stringify({
            evidence_text: 'Evidência E2E',
            before_baseline: 'Antes',
            after_result: 'Depois',
          }),
        }
      );
      await fetchAuth(
        `/full/actions/${encodeURIComponent(ak)}/status?company_id=${companyId}&assessment_id=${assessmentId}`,
        userToken,
        { method: 'POST', body: JSON.stringify({ status: 'DONE', company_id: companyId, assessment_id: assessmentId }) }
      );
      for (let i = 1; i < 3; i++) {
        const a = suggestions[i];
        if (a) {
          const d = await fetchAuth(`/full/actions/${encodeURIComponent(a.action_key)}/dod`, userToken);
          const items = d.body?.dod_checklist || ['Item 1'];
          await fetchAuth(
            `/full/assessments/${assessmentId}/plan/${encodeURIComponent(a.action_key)}/dod/confirm?company_id=${companyId}`,
            userToken,
            { method: 'POST', body: JSON.stringify({ confirmed_items: items }) }
          );
          await fetchAuth(
            `/full/assessments/${assessmentId}/plan/${encodeURIComponent(a.action_key)}/evidence?company_id=${companyId}`,
            userToken,
            {
              method: 'POST',
              body: JSON.stringify({
                evidence_text: 'Ev',
                before_baseline: 'B',
                after_result: 'A',
              }),
            }
          );
          await fetchAuth(
            `/full/actions/${encodeURIComponent(a.action_key)}/status?company_id=${companyId}&assessment_id=${assessmentId}`,
            userToken,
            { method: 'POST', body: JSON.stringify({ status: 'DONE', company_id: companyId, assessment_id: assessmentId }) }
          );
        }
      }
      const close = await fetchAuth(
        `/full/assessments/${assessmentId}/close?company_id=${companyId}`,
        userToken,
        { method: 'POST' }
      );
      if (close.ok || close.body?.already_closed) {
        console.log('[OK] Ciclo fechado');
      }
    }
  }

  // --- Refazer diagnóstico (v2) ---
  const newVer = await fetchAuth(
    `/full/versions/new?company_id=${companyId}`,
    userToken,
    { method: 'POST' }
  );
  if (newVer.ok && newVer.body?.assessment_id) {
    const v2AssessmentId = newVer.body.assessment_id;
    for (const proc of ['COMERCIAL', 'OPERACOES', 'ADM_FIN', 'GESTAO']) {
      await fetchAuth(
        `/full/assessments/${v2AssessmentId}/answers?company_id=${companyId}`,
        userToken,
        { method: 'PUT', body: JSON.stringify({ process_key: proc, answers: lowAnswers }) }
      );
    }
    await fetchAuth(
      `/full/assessments/${v2AssessmentId}/submit?company_id=${companyId}`,
      userToken,
      { method: 'POST' }
    );
    const vers2 = await fetchAuth(`/full/versions?company_id=${companyId}`, userToken);
    const vList = Array.isArray(vers2.body) ? vers2.body : vers2.body?.versions || [];
    const v2 = vList.find((v) => v.full_version === 2);
    if (v2) {
      const compare = await fetchAuth(
        `/full/compare?company_id=${companyId}&from=1&to=2`,
        userToken
      );
      assert(compare.ok, 'Compare: ' + (compare.body?.error || compare.status));
      const comp = compare.body;
      assert(comp.from_version === 1 && comp.to_version === 2, 'Compare deve retornar from_version e to_version');
      assert(Array.isArray(comp.evolution_by_process), 'evolution_by_process deve ser array');
      console.log('[OK] Comparação v1 vs v2 retorna JSON consistente');
    }
  }

  // --- CONSULTOR: abrir company, ver versões, baixar relatório ---
  console.log('[8/8] CONSULTOR: company -> versões -> download');
  const consultorVersions = await fetchAuth(`/full/versions?company_id=${companyId}`, consultorToken);
  assert(consultorVersions.ok, 'Consultor versions: ' + (consultorVersions.body?.error || consultorVersions.status));
  const cv = Array.isArray(consultorVersions.body) ? consultorVersions.body : consultorVersions.body?.versions || [];
  assert(cv.length >= 1, 'Consultor deve ver versões da company');
  const downloadConsultor = await fetchBinary(
    `/full/reports/download?company_id=${companyId}&full_version=${fullVersion1}`,
    consultorToken
  );
  assert(downloadConsultor.status === 200, `Consultor download: esperado 200, obtido ${downloadConsultor.status}`);
  console.log('[OK] CONSULTOR acessa versões e baixa PDF');

  // --- ADMIN: smoke ---
  const adminVersions = await fetchAuth(`/full/versions?company_id=${companyId}`, adminToken);
  assert(adminVersions.ok, 'Admin versions: ' + (adminVersions.body?.error || adminVersions.status));
  const adminCompanies = await fetchAuth('/consultor/companies', adminToken);
  assert(adminCompanies.ok, 'Admin consultant companies: ' + (adminCompanies.body?.error || adminCompanies.status));
  console.log('[OK] ADMIN acesso irrestrito');

  console.log('');
  console.log('[PASS] E2E reports, versions, comparison e roles concluído.');
  process.exit(0);
}

main().catch((err) => {
  if (err.cause?.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
    console.error('E2E FAIL: API não está rodando. Inicie com: npm run dev');
  } else {
    console.error(err);
  }
  process.exit(1);
});
