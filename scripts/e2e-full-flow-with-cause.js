#!/usr/bin/env node
/**
 * E2E: Fluxo completo FULL com causa
 * - preencher diagnóstico FULL
 * - submit
 * - responder causa (3 gaps MVP)
 * - ver resultado com gap+causa
 * - selecionar 3 ações (com 1 de mecanismo)
 * - registrar evidência Antes/Depois
 * - ver ganho declarado no dashboard
 * - fechar ciclo e manter leitura
 *
 * Requer: API rodando, .env com TEST_EMAIL, TEST_PASSWORD, DATABASE_URL
 * Uso: node scripts/e2e-full-flow-with-cause.js
 */
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const API = process.env.API_URL || 'http://localhost:3001';

function fail(msg) {
  console.error('E2E FAIL:', msg);
  process.exit(1);
}

function assert(cond, msg) {
  if (!cond) fail(msg);
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
  return { status: res.status, body, ok: res.ok };
}

async function fetchAuth(path, token, opts = {}) {
  return fetchApi(path, {
    ...opts,
    headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` },
  });
}

async function main() {
  let token = process.env.JWT;
  if (!token) {
    try {
      token = execSync('node tmp_get_token.js', { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' }).trim();
    } catch (e) {
      fail('JWT ausente. Use: export JWT=$(node tmp_get_token.js) ou configure TEST_EMAIL/TEST_PASSWORD');
    }
  }
  assert(token, 'Token vazio');

  // 0) DB fingerprint (validação DB soberano)
  const fp = await fetchApi('/diagnostic/db-fingerprint');
  if (fp.status === 200 && fp.body?.database) {
    console.log('[OK] DB fingerprint:', fp.body.database, fp.body.supabase_project_ref || '');
  } else {
    console.warn('[WARN] DB fingerprint não disponível (API pode não ter pool inicializado)');
  }

  // 1) Company + entitlement
  let companyId = process.env.COMPANY_ID;
  if (!companyId) {
    const companies = await fetchAuth('/companies', token);
    assert(companies.ok, 'Companies: ' + (companies.body?.error || companies.status));
    companyId = companies.body?.[0]?.id;
    assert(companyId, 'Nenhuma company. Crie uma em POST /companies.');
  }

  const unlock = await fetchAuth('/entitlements/manual-unlock', token, {
    method: 'POST',
    body: JSON.stringify({ company_id: companyId }),
  });
  if (!unlock.ok) console.warn('[WARN] manual-unlock:', unlock.body?.error || unlock.status);

  // 2) Start assessment (force_new)
  const start = await fetchAuth('/full/assessments/start', token, {
    method: 'POST',
    body: JSON.stringify({ company_id: companyId, segment: 'C', force_new: true }),
  });
  assert(start.ok, 'Start: ' + (start.body?.error || start.status));
  const assessmentId = start.body?.assessment_id;
  assert(assessmentId, 'assessment_id ausente');

  console.log('[OK] assessment_id=', assessmentId);

  // 3) Answers (respostas que produzem LOW para ADM_FIN, COMERCIAL, GESTAO → 3 vazamentos)
  const lowAnswers = [
    { question_key: 'Q01', answer_value: 2 }, { question_key: 'Q02', answer_value: 3 }, { question_key: 'Q03', answer_value: 2 },
    { question_key: 'Q04', answer_value: 3 }, { question_key: 'Q05', answer_value: 2 }, { question_key: 'Q06', answer_value: 3 },
    { question_key: 'Q07', answer_value: 2 }, { question_key: 'Q08', answer_value: 3 }, { question_key: 'Q09', answer_value: 2 },
    { question_key: 'Q10', answer_value: 3 }, { question_key: 'Q11', answer_value: 2 }, { question_key: 'Q12', answer_value: 3 },
  ];
  for (const proc of ['COMERCIAL', 'OPERACOES', 'ADM_FIN', 'GESTAO']) {
    const put = await fetchAuth(
      `/full/assessments/${assessmentId}/answers?company_id=${companyId}`,
      token,
      { method: 'PUT', body: JSON.stringify({ process_key: proc, answers: lowAnswers }) }
    );
    assert(put.ok, `Answers ${proc}: ` + (put.body?.error || put.status));
  }

  // 4) Submit
  const submit = await fetchAuth(
    `/full/assessments/${assessmentId}/submit?company_id=${companyId}`,
    token,
    { method: 'POST' }
  );
  assert(submit.ok, 'Submit: ' + (submit.body?.error || submit.status));

  // 5) Causes pending
  const pending = await fetchAuth(
    `/full/causes/pending?assessment_id=${assessmentId}&company_id=${companyId}`,
    token
  );
  assert(pending.ok, 'Causes pending: ' + (pending.body?.error || pending.status));
  const pendingList = pending.body?.pending || [];
  assert(pendingList.length >= 1, 'Esperado pelo menos 1 gap pendente');

  // 6) Answer cause para cada gap pendente (CAUSE_RITUAL para GAP_CAIXA_PREVISAO)
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
  for (const p of pendingList) {
    const answers = causeAnswers[p.gap_id];
    if (!answers) continue;
    const ans = await fetchAuth('/full/causes/answer', token, {
      method: 'POST',
      body: JSON.stringify({
        assessment_id: assessmentId,
        company_id: companyId,
        gap_id: p.gap_id,
        answers,
      }),
    });
    const ok = ans.ok || ans.body?.cause_primary;
    assert(ok, `Cause answer ${p.gap_id}: ` + (ans.body?.error || ans.status));
  }

  // 7) Results (com gap+causa)
  const results = await fetchAuth(
    `/full/assessments/${assessmentId}/results?company_id=${companyId}`,
    token
  );
  assert(results.ok, 'Results: ' + (results.body?.error || results.status));
  const items = results.body?.items || [];
  assert(items.length >= 6, 'Esperado 6 itens (3 vazamentos + 3 alavancas)');
  const hasCause = items.some((i) => i.cause_primary || i.cause_label);
  assert(hasCause, 'Esperado algum item com cause_primary/cause_label');

  // 8) Actions (sugestões)
  const actions = await fetchAuth(
    `/full/actions?assessment_id=${assessmentId}&company_id=${companyId}`,
    token
  );
  assert(actions.ok, 'Actions: ' + (actions.body?.error || actions.status));
  const suggestions = actions.body?.suggestions || [];
  assert(suggestions.length >= 3, 'Esperado pelo menos 3 sugestões');

  // 9) Plan com 1 ação de mecanismo (ADM_FIN-ROTINA_CAIXA_SEMANAL para CAUSE_RITUAL)
  const mechAction = 'ADM_FIN-ROTINA_CAIXA_SEMANAL';
  const fallbackActions = ['COMERCIAL-FUNIL_MINIMO', 'GESTAO-REUNIAO_SEMANAL'];
  const otherFromSuggestions = suggestions
    .filter((s) => s.action_key !== mechAction && !fallbackActions.includes(s.action_key))
    .slice(0, 2)
    .map((s) => s.action_key);
  const otherActions = otherFromSuggestions.length >= 2
    ? otherFromSuggestions
    : [...otherFromSuggestions, ...fallbackActions].slice(0, 2);
  const planActions = [mechAction, ...otherActions].slice(0, 3);
  const planBody = {
    assessment_id: assessmentId,
    company_id: companyId,
    actions: planActions.map((ak, i) => ({
      action_key: ak,
      position: i + 1,
      owner_name: 'Dono ' + (i + 1),
      metric_text: 'Métrica ' + (i + 1),
      checkpoint_date: '2025-04-15',
    })),
  };
  const plan = await fetchAuth(`/full/plan?company_id=${companyId}`, token, {
    method: 'POST',
    body: JSON.stringify(planBody),
  });
  assert(plan.ok, 'Plan: ' + (plan.body?.error || plan.body?.code || plan.status));

  // 10) DoD confirm
  const dod = await fetchAuth(`/full/actions/${encodeURIComponent(mechAction)}/dod`, token);
  const dodItems = dod.body?.dod_checklist || ['Item 1', 'Item 2', 'Item 3'];
  const dodConfirm = await fetchAuth(
    `/full/assessments/${assessmentId}/plan/${encodeURIComponent(mechAction)}/dod/confirm?company_id=${companyId}`,
    token,
    { method: 'POST', body: JSON.stringify({ confirmed_items: dodItems }) }
  );
  assert(dodConfirm.ok, 'DoD confirm: ' + (dodConfirm.body?.error || dodConfirm.status));

  // 11) Evidence (Antes/Depois)
  const evidence = await fetchAuth(
    `/full/assessments/${assessmentId}/plan/${encodeURIComponent(mechAction)}/evidence?company_id=${companyId}`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        evidence_text: 'Rotina instalada semanalmente',
        before_baseline: '0 projeções/semana',
        after_result: 'Projeção D+30 atualizada',
      }),
    }
  );
  assert(evidence.ok, 'Evidence: ' + (evidence.body?.error || evidence.status));
  const declaredGain = evidence.body?.evidence?.declared_gain || evidence.body?.already_exists;
  assert(declaredGain || evidence.body?.already_exists, 'Esperado declared_gain ou already_exists');

  // 12) Mark DONE
  const statusRes = await fetchAuth(
    `/full/actions/${encodeURIComponent(mechAction)}/status?company_id=${companyId}&assessment_id=${assessmentId}`,
    token,
    { method: 'POST', body: JSON.stringify({ status: 'DONE', company_id: companyId, assessment_id: assessmentId }) }
  );
  assert(statusRes.ok, 'Status DONE: ' + (statusRes.body?.error || statusRes.body?.code || statusRes.status));

  // 13) Dashboard (ganho declarado)
  const dashboard = await fetchAuth(
    `/full/assessments/${assessmentId}/dashboard?company_id=${companyId}`,
    token
  );
  assert(dashboard.ok, 'Dashboard: ' + (dashboard.body?.error || dashboard.status));
  const actionsWithGain = (dashboard.body?.actions || []).filter((a) => a.declared_gain);
  assert(actionsWithGain.length >= 1, 'Esperado pelo menos 1 ação com declared_gain no dashboard');

  // 14) DoD para as outras 2 ações + evidence + DONE (para fechar ciclo)
  for (let i = 1; i < planActions.length; i++) {
    const ak = planActions[i];
    const d = await fetchAuth(`/full/actions/${encodeURIComponent(ak)}/dod`, token);
    const items = d.body?.dod_checklist || ['Item 1', 'Item 2'];
    await fetchAuth(
      `/full/assessments/${assessmentId}/plan/${encodeURIComponent(ak)}/dod/confirm?company_id=${companyId}`,
      token,
      { method: 'POST', body: JSON.stringify({ confirmed_items: items }) }
    );
    await fetchAuth(
      `/full/assessments/${assessmentId}/plan/${encodeURIComponent(ak)}/evidence?company_id=${companyId}`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({
          evidence_text: 'Evidência',
          before_baseline: 'Antes',
          after_result: 'Depois',
        }),
      }
    );
    await fetchAuth(
      `/full/actions/${encodeURIComponent(ak)}/status?company_id=${companyId}&assessment_id=${assessmentId}`,
      token,
      { method: 'POST', body: JSON.stringify({ status: 'DONE', company_id: companyId, assessment_id: assessmentId }) }
    );
  }

  // 15) Close cycle
  const close = await fetchAuth(
    `/full/assessments/${assessmentId}/close?company_id=${companyId}`,
    token,
    { method: 'POST' }
  );
  assert(close.ok || close.body?.already_closed, 'Close: ' + (close.body?.error || close.status));

  // 16) Dashboard fechado (leitura)
  const dashboardClosed = await fetchAuth(
    `/full/assessments/${assessmentId}/dashboard?company_id=${companyId}`,
    token
  );
  assert(dashboardClosed.ok, 'Dashboard closed: ' + (dashboardClosed.body?.error || dashboardClosed.status));
  const gains = (dashboardClosed.body?.actions || []).filter((a) => a.declared_gain);
  assert(gains.length >= 1, 'Esperado ganhos declarados após fechar');

  console.log('[OK] E2E FULL com causa concluído. Ganhos declarados:', gains.length);
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
