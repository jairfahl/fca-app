/**
 * Rotas FULL: Ciclo completo DRAFT → SUBMITTED → Results → Plan (3 ações)
 * Contratos determinísticos, DB-backed.
 */
const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');
const { requireAuth } = require('../middleware/requireAuth');
const { requireFullEntitlement } = require('../middleware/requireFullEntitlement');
const { ensureCompanyAccess, ensureConsultantOrOwnerAccess } = require('../lib/companyAccess');
const { getOrCreateCurrentFullAssessment, companySegmentToFull } = require('../lib/fullAssessment');
const {
  getOQueEstaAcontecendo,
  getCustoDeNaoAgir,
  getOQueMudaEm30Dias,
  humanizeAnswerValue,
  getComoPuxouNivel,
  FALLBACK_ACTION_TITLE,
} = require('../lib/fullResultCopy');

const BANDS_ORDER = ['LOW', 'MEDIUM', 'HIGH'];
const BAND_WORST_FIRST = { LOW: 0, MEDIUM: 1, HIGH: 2 };
const BAND_BEST_FIRST = { HIGH: 0, MEDIUM: 1, LOW: 2 };

function scoreToBand(score) {
  if (score < 4) return 'LOW';
  if (score < 7) return 'MEDIUM';
  return 'HIGH';
}

async function getAssessment(assessmentId, companyId) {
  const { data, error } = await supabase
    .schema('public')
    .from('full_assessments')
    .select('*')
    .eq('id', assessmentId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

async function getAssessmentById(assessmentId) {
  const { data, error } = await supabase
    .schema('public')
    .from('full_assessments')
    .select('*')
    .eq('id', assessmentId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

/**
 * Resposta de erro padronizada para UI: code (técnico) + message_user (texto para usuário).
 * O campo error é mantido como fallback para clientes legados.
 */
function apiError(res, status, code, messageUser) {
  return res.status(status).json({
    code,
    message_user: messageUser,
    error: messageUser,
  });
}

function cycleClosed(res) {
  return apiError(res, 409, 'CYCLE_CLOSED', 'Ciclo fechado. Somente leitura.');
}

const PROCESS_OWNER_LABEL = {
  COMERCIAL: 'Comercial',
  OPERACOES: 'Operações',
  ADM_FIN: 'Adm/Fin',
  GESTAO: 'Gestão',
};

function avg(values) {
  if (!values || values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function deriveBandFromCanonical(dimensionScores, overallScore) {
  const rotina = dimensionScores.ROTINA;
  const dono = dimensionScores.DONO;
  const controle = dimensionScores.CONTROLE;
  const existencia = dimensionScores.EXISTENCIA;

  const missingMinimum = rotina == null || dono == null || controle == null;
  const weakMinimum = (rotina ?? 0) < 5 || (dono ?? 0) < 5 || (controle ?? 0) < 5;
  if (missingMinimum || weakMinimum) {
    return { band: 'LOW', rule: 'missing_or_weak_minimum' };
  }

  const allStrong = (rotina ?? 0) >= 8 && (dono ?? 0) >= 8 && (controle ?? 0) >= 8 && (existencia ?? 0) >= 7 && overallScore >= 7;
  if (allStrong) {
    return { band: 'HIGH', rule: 'all_minimum_strong' };
  }

  return { band: 'MEDIUM', rule: 'intermediate' };
}

function firstNByOrder(arr, n, sorter) {
  return [...arr].sort(sorter).slice(0, n);
}

async function buildAndPersistFindings({ assessmentId, segment, scores, answers, processCatalog, questionCatalogTex } = {}) {
  const processKeys = scores.map((s) => s.process_key);
  const { data: actionCatalog } = await supabase
    .schema('public')
    .from('full_action_catalog')
    .select('process_key, band, action_key, title')
    .in('process_key', processKeys)
    .eq('is_active', true)
    .contains('segment_applicability', [segment]);

  const actionMap = {};
  (actionCatalog || []).forEach((a) => {
    const k = `${a.process_key}:${a.band}`;
    if (!actionMap[k]) actionMap[k] = [];
    actionMap[k].push(a);
  });

  const catalogMap = {};
  (processCatalog || []).forEach((p) => { catalogMap[p.process_key] = p; });

  const questionTextMap = {};
  (questionCatalogTex || []).forEach((q) => {
    questionTextMap[`${q.process_key}:${q.question_key}`] = q.question_text || '';
  });

  const answersByProcess = {};
  (answers || []).forEach((a) => {
    if (!answersByProcess[a.process_key]) answersByProcess[a.process_key] = [];
    answersByProcess[a.process_key].push(a);
  });

  const scoreList = (scores || []).map((s) => ({
    ...s,
    typical_impact_band: catalogMap[s.process_key]?.typical_impact_band || 'MEDIUM',
    quick_win: !!catalogMap[s.process_key]?.quick_win,
  }));

  // Vazamentos: processos LOW com maior impacto_tipico (ranking fixo por catálogo)
  let vazamentosBase = scoreList.filter((s) => s.band === 'LOW');
  vazamentosBase = firstNByOrder(
    vazamentosBase,
    3,
    (a, b) => (BAND_BEST_FIRST[a.typical_impact_band] ?? 9) - (BAND_BEST_FIRST[b.typical_impact_band] ?? 9) || b.score_numeric - a.score_numeric
  );

  // Alavancas: processos MED com maior impacto e quick-win (flag no catálogo)
  let alavancaCandidates = scoreList.filter((s) => s.band === 'MEDIUM');
  if (alavancaCandidates.length < 3) {
    const used = new Set(alavancaCandidates.map((s) => s.process_key));
    const lowMed = scoreList.filter((s) => s.band === 'LOW' && !used.has(s.process_key));
    alavancaCandidates = [...alavancaCandidates, ...lowMed];
  }
  alavancaCandidates = alavancaCandidates.sort((a, b) => {
    if (a.quick_win !== b.quick_win) return a.quick_win ? -1 : 1;
    return (BAND_BEST_FIRST[a.typical_impact_band] ?? 9) - (BAND_BEST_FIRST[b.typical_impact_band] ?? 9) || b.score_numeric - a.score_numeric;
  });
  const alavancasBase = alavancaCandidates.slice(0, 3);

  let hadGap = false;
  if (vazamentosBase.length < 3 || alavancasBase.length < 3) hadGap = true;

  function toFinding(type, position, s, forcedGapReason = null) {
    const processLabel = PROCESS_OWNER_LABEL[s.process_key] || s.process_key;
    const processMeta = catalogMap[s.process_key] || {};
    const protects = processMeta.protects_dimension || 'RISCO';
    const processAnswers = (answersByProcess[s.process_key] || []).slice().sort((a, b) => a.answer_value - b.answer_value);
    const traceAnswers = (type === 'VAZAMENTO' ? processAnswers : [...processAnswers].reverse()).slice(0, Math.max(4, processAnswers.length));

    const allActions = actionMap[`${s.process_key}:${s.band}`] || [];
    const actions = allActions.filter((a) => !a.action_key.startsWith('fallback-'));
    const firstAction = actions[0] || {
      action_key: `fallback-${s.process_key}-${s.band}`,
      title: FALLBACK_ACTION_TITLE,
    };
    const isFallback = !actions.length || !!forcedGapReason;
    if (isFallback && !actions.length) {
      console.log(`[AUDIT] full_finding action_gap process_key=${s.process_key} band=${s.band} action_key=${firstAction.action_key}`);
    } else {
      console.log(`[AUDIT] full_finding action_selected process_key=${s.process_key} band=${s.band} action_key=${firstAction.action_key}`);
    }

    const whatText = getOQueEstaAcontecendo(type, s.process_key, protects, s.band, processMeta);
    const custoText = getCustoDeNaoAgir(processMeta, s.band, protects);
    const mudaText = getOQueMudaEm30Dias(type, s.process_key, protects, s.band);

    const comoPuxou = getComoPuxouNivel(processAnswers, questionCatalogTex);

    const payload = {
      processo: s.process_key,
      maturity_band: s.band,
      o_que_esta_acontecendo: whatText,
      custo_de_nao_agir: custoText,
      o_que_muda_em_30_dias: mudaText,
      primeiro_passo: {
        action_key: firstAction.action_key,
        action_title: isFallback && !actions.length ? FALLBACK_ACTION_TITLE : firstAction.title,
      },
    };

    const trace = {
      process_keys: [s.process_key],
      como_puxou_nivel: comoPuxou || null,
      question_refs: traceAnswers.map((a) => ({
        process_key: a.process_key,
        question_key: a.question_key,
        question_text: questionTextMap[`${a.process_key}:${a.question_key}`] || '',
        answer_value: a.answer_value,
        answer_text: humanizeAnswerValue(a.answer_value),
      })),
    };

    return {
      assessment_id: assessmentId,
      finding_type: type,
      position,
      payload,
      trace,
      is_fallback: isFallback,
      gap_reason: !actions.length
        ? 'fallback_action_missing_catalog'
        : (forcedGapReason || null),
    };
  }

  const vazamentos = [...vazamentosBase];
  while (vazamentos.length < 3 && scoreList.length > 0) {
    hadGap = true;
    const used = new Set(vazamentos.map((s) => s.process_key));
    const next = scoreList.find((s) => !used.has(s.process_key)) || scoreList[vazamentos.length % scoreList.length];
    vazamentos.push(next);
  }
  const alavancas = [...alavancasBase];
  while (alavancas.length < 3 && scoreList.length > 0) {
    hadGap = true;
    const used = new Set(alavancas.map((s) => s.process_key));
    const next = scoreList.find((s) => !used.has(s.process_key)) || scoreList[alavancas.length % scoreList.length];
    alavancas.push(next);
  }

  const findings = [
    ...vazamentos.map((s, i) => toFinding('VAZAMENTO', i + 1, s, i >= vazamentosBase.length ? 'insufficient_processes' : null)),
    ...alavancas.map((s, i) => toFinding('ALAVANCA', i + 1, s, i >= alavancasBase.length ? 'insufficient_candidates' : (hadGap ? 'insufficient_low_medium_candidates' : null))),
  ];

  const { error: delFindErr } = await supabase
    .schema('public')
    .from('full_findings')
    .delete()
    .eq('assessment_id', assessmentId);
  if (delFindErr) {
    console.error('Erro ao limpar findings:', delFindErr.message);
    return { findings: [], hadGap: true, error: delFindErr };
  }

  const { error: insFindErr } = await supabase
    .schema('public')
    .from('full_findings')
    .insert(findings);
  if (insFindErr) {
    console.error('Erro ao persistir findings:', insFindErr.message);
    return { findings: [], hadGap: true, error: insFindErr };
  }

  return { findings, hadGap, error: null };
}

// ---------------------------------------------------------------------------
// 1) POST /full/assessments/start — criar/obter assessment (idempotente)
// ---------------------------------------------------------------------------
router.post('/full/assessments/start', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const { company_id, segment } = req.body;

    if (!company_id || !segment) {
      return res.status(400).json({ error: 'company_id e segment são obrigatórios' });
    }
    if (!['C', 'I', 'S'].includes(segment)) {
      return res.status(400).json({ error: 'segment deve ser C, I ou S' });
    }

    const company = await ensureCompanyAccess(userId, company_id);
    if (!company) {
      return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');
    }

    const forceNew =
      req.query.force_new === '1' ||
      req.query.force_new === 'true' ||
      req.body.force_new === true ||
      req.body.force_new === '1' ||
      req.body.force_new === 'true';

    // Idempotente: retornar DRAFT existente se houver (a menos que force_new)
    const { data: existing, error: findErr } = await supabase
      .schema('public')
      .from('full_assessments')
      .select('*')
      .eq('company_id', company_id)
      .in('status', ['DRAFT', 'SUBMITTED'])
      .maybeSingle();

    if (findErr) {
      console.error('Erro ao buscar assessment:', findErr.message);
      return res.status(500).json({ error: 'erro ao buscar assessment' });
    }

    if (existing && !forceNew) {
      return res.status(200).json({ assessment_id: existing.id, assessment: existing });
    }

    if (existing && forceNew) {
      const { error: updateErr } = await supabase
        .schema('public')
        .from('full_assessments')
        .update({ status: 'CLOSED', updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (updateErr) {
        console.error('Erro ao fechar assessment (force_new):', updateErr.message);
        return res.status(500).json({ error: 'erro ao fechar assessment anterior' });
      }
    }

    const { data: created, error: insertErr } = await supabase
      .schema('public')
      .from('full_assessments')
      .insert({
        company_id,
        created_by_user_id: userId,
        segment,
        status: 'DRAFT'
      })
      .select()
      .single();

    if (insertErr) {
      console.error('Erro ao criar assessment:', insertErr.message);
      return res.status(500).json({ error: 'erro ao criar assessment' });
    }

    return res.status(201).json({ assessment_id: created.id, assessment: created });
  } catch (err) {
    console.error('Erro POST /full/assessments/start:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// GET /full/assessments/current?company_id= — retorna assessment FULL ativo (cria DRAFT se não existir)
router.get('/full/assessments/current', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.query.company_id;
    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');

    const company = await ensureConsultantOrOwnerAccess(userId, companyId, req.user?.email);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');

    const result = await getOrCreateCurrentFullAssessment(companyId, userId);
    if (!result) return res.status(500).json({ error: 'erro ao obter ou criar assessment' });

    const { assessment } = result;
    const { data: answers } = await supabase
      .schema('public')
      .from('full_answers')
      .select('process_key, question_key, answer_value, answered_at, updated_at')
      .eq('assessment_id', assessment.id)
      .order('process_key', { ascending: true })
      .order('question_key', { ascending: true });

    const payload = { ...assessment, type: 'FULL', answers: answers || [] };

    console.log(`[FULL_CURRENT] company_id=${companyId} assessment_id=${assessment.id} status=${assessment.status} type=FULL`);

    return res.json(payload);
  } catch (err) {
    console.error('Erro GET /full/assessments/current:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// ---------------------------------------------------------------------------
// 2) GET /full/assessments/:id
// ---------------------------------------------------------------------------
router.get('/full/assessments/:id', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const companyId = req.query.company_id;

    if (!companyId) {
      return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
    }

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) {
      return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');
    }

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) {
      return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    }

    return res.json(assessment);
  } catch (err) {
    console.error('Erro GET /full/assessments/:id:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

async function resolveCatalogSegmentForRequest(req) {
  const companyId = req.query.company_id;
  if (companyId) {
    const { data: company } = await supabase
      .schema('public')
      .from('companies')
      .select('segment')
      .eq('id', companyId)
      .maybeSingle();
    if (company?.segment) {
      return companySegmentToFull(company.segment);
    }
  }
  const seg = req.query.segment || 'C';
  return ['C', 'I', 'S'].includes(seg) ? seg : null;
}

async function loadCatalogBySegment(segment) {
  const normalizeCostAxis = (axis) => {
    const normalized = String(axis || '').toUpperCase().trim();
    return ['DINHEIRO', 'CLIENTE', 'RISCO', 'GARGALO', 'TRAVAMENTO'].includes(normalized)
      ? normalized
      : 'TRAVAMENTO';
  };

  // Processos aplicáveis ao segmento; se vazio/nulo -> considera global
  const { data: procs, error: procErr } = await supabase
    .schema('public')
    .from('full_process_catalog')
    .select('*')
    .eq('is_active', true)
    .contains('segment_applicability', [segment])
    .order('area_key')
    .order('process_key');
  if (procErr) throw procErr;

  if (!procs || procs.length === 0) return { areas: [], processes: [], questionsCount: 0 };

  const processKeys = procs.map((p) => p.process_key);
  const { data: questions, error: qErr } = await supabase
    .schema('public')
    .from('full_question_catalog')
    .select('*')
    .in('process_key', processKeys)
    .eq('is_active', true)
    .contains('segment_applicability', [segment])
    .order('process_key')
    .order('sort_order');
  if (qErr) throw qErr;

  const questionsByProcess = {};
  (questions || []).forEach((q) => {
    if (!questionsByProcess[q.process_key]) questionsByProcess[q.process_key] = [];
    questionsByProcess[q.process_key].push(q);
  });

  const areasMap = {};
  const processes = procs.map((p) => {
    const processCostAxis = normalizeCostAxis(p.protects_dimension);
    const processQuestions = (questionsByProcess[p.process_key] || []).map((q) => ({
      ...q,
      cost_axis: normalizeCostAxis(q.cost_axis || q.dimension || processCostAxis)
    }));
    const processOut = {
      ...p,
      // aliases de microvalor exigidos no prompt
      o_que_protege: p.protects_dimension || 'EM DEFINIÇÃO',
      sinal_alerta: p.owner_alert_text || 'EM DEFINIÇÃO',
      impacto_tipico: p.typical_impact_text || p.typical_impact_band || 'EM DEFINIÇÃO',
      questions: processQuestions,
    };
    if (!areasMap[p.area_key]) {
      areasMap[p.area_key] = { area: p.area_key, processes: [] };
    }
    areasMap[p.area_key].processes.push(processOut);
    return processOut;
  });

  const areas = Object.values(areasMap);
  return { areas, processes, questionsCount: (questions || []).length };
}

// ---------------------------------------------------------------------------
// 3) GET /full/catalog?company_id=... (ou ?segment=C|I|S)
// ---------------------------------------------------------------------------
router.get('/full/catalog', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.query.company_id;

    if (companyId) {
      const access = await ensureConsultantOrOwnerAccess(userId, companyId, req.user?.email);
      if (!access) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');
    }

    const segment = await resolveCatalogSegmentForRequest(req);
    if (!segment) {
      return res.status(400).json({ error: 'segment inválido. Use C, I ou S, ou informe company_id válido' });
    }

    const out = await loadCatalogBySegment(segment);
    const hasGap = out.processes.some((p) => !p.o_que_protege || !p.sinal_alerta || !p.impacto_tipico || p.questions.length === 0);
    if (hasGap) {
      console.warn(`[AUDIT] full_catalog_gap segment=${segment} gaps_detected=true`);
    }
    console.log(`[AUDIT] full_catalog_loaded segment=${segment} processes=${out.processes.length} questions=${out.questionsCount}`);
    return res.json({ segment, areas: out.areas, processes: out.processes });
  } catch (err) {
    console.error('Erro GET /full/catalog:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// GET /full/catalog/process/:process_key?company_id=... (opcional)
router.get('/full/catalog/process/:process_key', requireAuth, async (req, res) => {
  try {
    const segment = await resolveCatalogSegmentForRequest(req);
    if (!segment) return res.status(400).json({ error: 'segment inválido' });
    const processKey = req.params.process_key;
    const out = await loadCatalogBySegment(segment);
    const process = out.processes.find((p) => p.process_key === processKey);
    if (!process) return res.status(404).json({ error: 'processo não encontrado para o segmento informado' });
    return res.json({ segment, process });
  } catch (err) {
    console.error('Erro GET /full/catalog/process/:process_key:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// ---------------------------------------------------------------------------
// 4) PUT/POST /full/assessments/:id/answers — salvar respostas (DRAFT, upsert idempotente)
// Body: { process_key, answers: [{ question_key, answer_value }] }
// ou { answers: [{ question_id: "PROCESS:Q01", answer_value }] }
// ---------------------------------------------------------------------------
async function handleAnswersUpsert(req, res) {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const companyId = req.query.company_id || req.body.company_id;
    const { process_key, question_key, answer_value, answered_at, answers } = req.body;

    if (!companyId) {
      return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
    }

    let rows = [];
    if (process_key && question_key && typeof answer_value === 'number') {
      rows = [{
        assessment_id: assessmentId,
        process_key,
        question_key,
        answer_value: Math.max(0, Math.min(10, answer_value)),
        answered_at: answered_at || new Date().toISOString()
      }];
    } else if (process_key && Array.isArray(answers)) {
      rows = answers
        .filter((a) => a.question_key && typeof a.answer_value === 'number')
        .map((a) => ({
          assessment_id: assessmentId,
          process_key,
          question_key: a.question_key,
          answer_value: Math.max(0, Math.min(10, a.answer_value)),
          answered_at: a.answered_at || new Date().toISOString()
        }));
    } else if (Array.isArray(req.body.answers)) {
      // Formato: { answers: [{ question_id: "COMERCIAL:Q01", answer_value }] }
      rows = req.body.answers
        .filter((a) => a.question_id && typeof a.answer_value === 'number')
        .map((a) => {
          const [pk, qk] = String(a.question_id).split(':');
          return pk && qk ? { process_key: pk, question_key: qk, answer_value: a.answer_value } : null;
        })
        .filter(Boolean)
        .map((a) => ({
          assessment_id: assessmentId,
          process_key: a.process_key,
          question_key: a.question_key,
          answer_value: Math.max(0, Math.min(10, a.answer_value)),
          answered_at: a.answered_at || new Date().toISOString()
        }));
    }

    if (rows.length === 0) {
      return res.status(400).json({ error: 'process_key e answers (array) ou answers com question_id são obrigatórios; answer_value 0-10' });
    }

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) {
      return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');
    }

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) {
      return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    }
    if (assessment.status !== 'DRAFT') {
      return apiError(res, 400, 'DIAG_NOT_DRAFT', 'Apenas diagnósticos em andamento podem receber respostas.');
    }

    const { error: upsertErr } = await supabase
      .schema('public')
      .from('full_answers')
      .upsert(rows, {
        onConflict: 'assessment_id,process_key,question_key',
        ignoreDuplicates: false
      });

    if (upsertErr) {
      console.error('Erro ao salvar respostas:', upsertErr.message);
      return res.status(500).json({ error: 'erro ao salvar respostas' });
    }

    console.log('[AUDIT] full_answer_saved assessment_id=' + assessmentId + ' count=' + rows.length);

    return res.status(200).json({ ok: true, count: rows.length });
  } catch (err) {
    console.error('Erro answers upsert:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
}

router.put('/full/assessments/:id/answers', requireAuth, requireFullEntitlement, handleAnswersUpsert);
router.post('/full/assessments/:id/answers', requireAuth, requireFullEntitlement, handleAnswersUpsert);

// ---------------------------------------------------------------------------
// 5) GET /full/assessments/:id/answers?process_key=
// ---------------------------------------------------------------------------
router.get('/full/assessments/:id/answers', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const companyId = req.query.company_id;
    const processKey = req.query.process_key;

    if (!companyId) {
      return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
    }

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) {
      return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');
    }

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) {
      return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    }

    let q = supabase
      .schema('public')
      .from('full_answers')
      .select('process_key, question_key, answer_value, answered_at, updated_at')
      .eq('assessment_id', assessmentId);

    if (processKey) {
      q = q.eq('process_key', processKey);
    }

    const { data, error } = await q;

    if (error) {
      console.error('Erro ao buscar respostas:', error.message);
      return res.status(500).json({ error: 'erro ao buscar respostas' });
    }

    return res.json({ answers: data || [] });
  } catch (err) {
    console.error('Erro GET /full/assessments/:id/answers:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// ---------------------------------------------------------------------------
// 6) POST /full/assessments/:id/submit — calcular scoring e SUBMITTED
// ---------------------------------------------------------------------------
router.post('/full/assessments/:id/submit', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const companyId = req.query.company_id || req.body.company_id;

    if (!companyId) {
      return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
    }

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) {
      return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');
    }

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) {
      return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    }
    if (assessment.status !== 'DRAFT') {
      return apiError(res, 400, 'DIAG_ALREADY_SUBMITTED', 'Diagnóstico já foi concluído.');
    }

    const segment = assessment.segment || 'C';

    // Validar completude: todas as perguntas obrigatórias do catálogo devem ter resposta
    let processKeys = [];
    const { data: processesForSegment, error: procErr } = await supabase
      .schema('public')
      .from('full_process_catalog')
      .select('process_key')
      .eq('is_active', true)
      .or(`segment_applicability.eq.{}` + ',' + `segment_applicability.cs.{"${segment}"}`);

    if (!procErr && processesForSegment?.length) {
      processKeys = processesForSegment.map((p) => p.process_key);
    }
    if (processKeys.length === 0) {
      const { data: fallback } = await supabase
        .schema('public')
        .from('full_process_catalog')
        .select('process_key')
        .eq('is_active', true)
        .contains('segment_applicability', [segment]);
      processKeys = (fallback || []).map((p) => p.process_key);
    }

    const { data: requiredQuestions } = await supabase
      .schema('public')
      .from('full_question_catalog')
      .select('process_key, question_key')
      .in('process_key', processKeys)
      .eq('is_active', true);

    const requiredSet = new Set((requiredQuestions || []).map((q) => `${q.process_key}:${q.question_key}`));

    const { data: answers, error: ansErr } = await supabase
      .schema('public')
      .from('full_answers')
      .select('process_key, question_key, answer_value')
      .eq('assessment_id', assessmentId);

    if (ansErr) {
      console.error('Erro ao buscar respostas:', ansErr.message);
      return res.status(500).json({ error: 'erro ao calcular scores' });
    }

    if (!answers || answers.length === 0) {
      return res.status(400).json({ error: 'nenhuma resposta encontrada para calcular scores' });
    }

    const answeredSet = new Set((answers || []).map((a) => `${a.process_key}:${a.question_key}`));
    const missing = [...requiredSet].filter((k) => !answeredSet.has(k));
    if (missing.length > 0) {
      console.log('[AUDIT] full_submit FAIL incompleto assessment_id=' + assessmentId + ' missing=' + missing.join(','));
      return apiError(res, 400, 'DIAG_INCOMPLETE', 'Diagnóstico incompleto: faltam respostas obrigatórias.');
    }

    const answersByProcessCount = {};
    (answers || []).forEach((a) => {
      answersByProcessCount[a.process_key] = (answersByProcessCount[a.process_key] || 0) + 1;
    });
    const processWithTooFew = processKeys.filter((pk) => (answersByProcessCount[pk] || 0) < 4);
    if (processWithTooFew.length > 0) {
      return apiError(res, 400, 'DIAG_MIN_QUESTIONS', 'Cada processo deve ter no mínimo 4 perguntas respondidas.');
    }

    const { data: questionCatalog, error: qCatErr } = await supabase
      .schema('public')
      .from('full_question_catalog')
      .select('process_key, question_key, dimension')
      .in('process_key', processKeys)
      .eq('is_active', true);
    if (qCatErr) {
      console.error('Erro ao buscar question_catalog:', qCatErr.message);
      return res.status(500).json({ error: 'erro ao calcular scores' });
    }

    const qDimMap = {};
    (questionCatalog || []).forEach((q) => {
      qDimMap[`${q.process_key}:${q.question_key}`] = q.dimension;
    });

    const byProcess = {};
    answers.forEach((a) => {
      if (!byProcess[a.process_key]) byProcess[a.process_key] = [];
      byProcess[a.process_key].push(a);
    });

    const scoresToInsert = [];
    for (const [processKey, items] of Object.entries(byProcess)) {
      const sum = items.reduce((s, i) => s + i.answer_value, 0);
      const overallScore = sum / items.length;
      const dimBuckets = { EXISTENCIA: [], ROTINA: [], DONO: [], CONTROLE: [] };
      items.forEach((it) => {
        const dim = qDimMap[`${processKey}:${it.question_key}`];
        if (dim && dimBuckets[dim]) dimBuckets[dim].push(it.answer_value);
      });
      const dimensionScores = {
        EXISTENCIA: avg(dimBuckets.EXISTENCIA),
        ROTINA: avg(dimBuckets.ROTINA),
        DONO: avg(dimBuckets.DONO),
        CONTROLE: avg(dimBuckets.CONTROLE),
      };
      const derived = deriveBandFromCanonical(dimensionScores, overallScore);

      const support = {
        answers: items.map((i) => ({ question_key: i.question_key, answer_value: i.answer_value })),
        score_numeric: overallScore,
        dimension_scores: dimensionScores,
        band_rule: derived.rule,
      };
      scoresToInsert.push({
        assessment_id: assessmentId,
        process_key: processKey,
        score_numeric: Math.round(overallScore * 100) / 100,
        band: derived.band,
        support
      });
    }

    const { error: delErr } = await supabase
      .schema('public')
      .from('full_process_scores')
      .delete()
      .eq('assessment_id', assessmentId);

    if (delErr) {
      console.error('Erro ao limpar scores:', delErr.message);
      return res.status(500).json({ error: 'erro ao calcular scores' });
    }

    const { error: insertErr } = await supabase
      .schema('public')
      .from('full_process_scores')
      .insert(scoresToInsert);

    if (insertErr) {
      console.error('Erro ao inserir scores:', insertErr.message);
      return res.status(500).json({ error: 'erro ao calcular scores' });
    }

    const { error: updErr } = await supabase
      .schema('public')
      .from('full_assessments')
      .update({
        status: 'SUBMITTED',
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', assessmentId);

    if (updErr) {
      console.error('Erro ao atualizar status:', updErr.message);
      return apiError(res, 500, 'SUBMIT_ERROR', 'Erro ao enviar diagnóstico. Tente novamente.');
    }

    const { data: processCatalog } = await supabase
      .schema('public')
      .from('full_process_catalog')
      .select('process_key, protects_dimension, protects_text, owner_alert_text, typical_impact_band, typical_impact_text, quick_win')
      .in('process_key', scoresToInsert.map((s) => s.process_key));

    const { data: questionCatalogTex } = await supabase
      .schema('public')
      .from('full_question_catalog')
      .select('process_key, question_key, question_text, dimension')
      .in('process_key', processKeys)
      .eq('is_active', true);

    const findingsResult = await buildAndPersistFindings({
      assessmentId,
      segment,
      scores: scoresToInsert,
      answers,
      processCatalog: processCatalog || [],
      questionCatalogTex: questionCatalogTex || []
    });
    if (findingsResult.error) {
      return res.status(500).json({ error: 'erro ao gerar findings' });
    }

    if (findingsResult.hadGap) {
      console.warn('[AUDIT] full_submit findings_gap assessment_id=' + assessmentId);
    }

    console.log('[AUDIT] full_submit assessment_id=' + assessmentId + ' status=SUBMITTED');

    return res.status(200).json({
      ok: true,
      status: 'SUBMITTED',
      scores: scoresToInsert,
      findings_count: findingsResult.findings.length
    });
  } catch (err) {
    console.error('Erro POST /full/assessments/:id/submit:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

async function loadFullResultsPayload(assessmentId) {
  const { data: scores, error: scoresErr } = await supabase
    .schema('public')
    .from('full_process_scores')
    .select('*')
    .eq('assessment_id', assessmentId)
    .order('process_key');
  if (scoresErr || !scores) {
    return { error: scoresErr || new Error('scores_not_found') };
  }

  const { data: findingsRows, error: findErr } = await supabase
    .schema('public')
    .from('full_findings')
    .select('*')
    .eq('assessment_id', assessmentId)
    .order('finding_type')
    .order('position');
  if (findErr) {
    return { error: findErr };
  }

  const findings = (findingsRows || []).map((f) => ({
    id: f.id,
    type: f.finding_type,
    position: f.position,
    ...f.payload,
    trace: f.trace || {},
    is_fallback: !!f.is_fallback,
    gap_reason: f.gap_reason || null,
  }));

  const trace = findings.map((f) => ({
    id: f.id,
    type: f.type,
    position: f.position,
    trace: f.trace,
  }));

  const vazamentosFindings = findings.filter((f) => f.type === 'VAZAMENTO').slice(0, 3);
  const alavancasFindings = findings.filter((f) => f.type === 'ALAVANCA').slice(0, 3);

  function toSixPackItem(f) {
    const processLabel = PROCESS_OWNER_LABEL[f.processo] || f.processo;
    const title = `${processLabel} (${f.maturity_band})`;
    const questionRefs = f.trace?.question_refs || [];
    return {
      title,
      o_que_acontece: f.o_que_esta_acontecendo,
      custo_nao_agir: f.custo_de_nao_agir,
      muda_em_30_dias: f.o_que_muda_em_30_dias,
      primeiro_passo_action_id: f.primeiro_passo?.action_key || null,
      primeiro_passo: f.primeiro_passo?.action_title || null,
      is_fallback: !!f.is_fallback,
      supporting: {
        processes: f.trace?.process_keys || [f.processo],
        como_puxou_nivel: f.trace?.como_puxou_nivel || null,
        questions: questionRefs.map((q) => ({
          process_key: q.process_key,
          question_key: q.question_key,
          question_text: q.question_text || '',
          answer_value: q.answer_value,
          answer_text: q.answer_text || (q.answer_value != null ? humanizeAnswerValue(q.answer_value) : null),
        })),
      },
    };
  }

  const six_pack = {
    vazamentos: vazamentosFindings.map(toSixPackItem),
    alavancas: alavancasFindings.map(toSixPackItem),
  };

  return {
    error: null,
    payload: {
      six_pack,
      findings,
      scores_by_process: scores,
      trace,
      items: findings.map((f) => ({
        type: f.type,
        title: `${f.type}: ${f.processo || ''}`.trim(),
        what_is_happening: f.o_que_esta_acontecendo,
        cost_of_inaction_band: f.custo_de_nao_agir,
        change_in_30_days: f.o_que_muda_em_30_dias,
        first_step_action_key: f.primeiro_passo?.action_key || null,
        trace: f.trace,
      })),
    }
  };
}

// ---------------------------------------------------------------------------
// 7) GET /full/assessments/:id/results — compat (usa findings persistidos)
// ---------------------------------------------------------------------------
router.get('/full/assessments/:id/results', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const companyId = req.query.company_id;

    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    if (assessment.status !== 'SUBMITTED' && assessment.status !== 'CLOSED') {
      return apiError(res, 400, 'DIAG_NOT_READY', 'Conclua o diagnóstico para ver o resultado.');
    }

    const loaded = await loadFullResultsPayload(assessmentId);
    if (loaded.error) return apiError(res, 500, 'RESULTS_LOAD_ERROR', 'Erro ao carregar resultados. Tente novamente.');
    return res.json(loaded.payload);
  } catch (err) {
    console.error('Erro GET /full/assessments/:id/results:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// GET /full/results?assessment_id=...&company_id=...
router.get('/full/results', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.query.assessment_id;
    const companyId = req.query.company_id;
    if (!assessmentId) return res.status(400).json({ error: 'assessment_id é obrigatório' });

    const assessment = companyId
      ? await getAssessment(assessmentId, companyId)
      : await getAssessmentById(assessmentId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    if (assessment.status !== 'SUBMITTED' && assessment.status !== 'CLOSED') {
      return apiError(res, 400, 'DIAG_NOT_READY', 'Conclua o diagnóstico para ver o resultado.');
    }

    const access = await ensureConsultantOrOwnerAccess(userId, assessment.company_id, req.user?.email);
    if (!access) return apiError(res, 403, 'ACCESS_DENIED', 'Sem acesso a este recurso.');

    const loaded = await loadFullResultsPayload(assessment.id);
    if (loaded.error) return apiError(res, 500, 'RESULTS_LOAD_ERROR', 'Erro ao carregar resultados. Tente novamente.');
    return res.json(loaded.payload);
  } catch (err) {
    console.error('Erro GET /full/results:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// GET /full/plan/status?assessment_id=...&company_id=...
router.get('/full/plan/status', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.query.assessment_id;
    const companyId = req.query.company_id;
    if (!assessmentId) return res.status(400).json({ error: 'assessment_id é obrigatório' });
    if (!companyId) return res.status(400).json({ error: 'company_id é obrigatório' });

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

    const access = await ensureConsultantOrOwnerAccess(userId, assessment.company_id, req.user?.email);
    if (!access) return apiError(res, 403, 'ACCESS_DENIED', 'Sem acesso a este recurso.');

    const { data: plan, error } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .select('action_key, status')
      .eq('assessment_id', assessmentId)
      .order('position');

    if (error) {
      console.error('Erro ao buscar plan status:', error.message);
      return apiError(res, 500, 'PLAN_STATUS_ERROR', 'Erro ao verificar plano.');
    }

    const rows = plan || [];
    const exists = rows.length > 0;
    const doneCount = rows.filter((p) => p.status === 'DONE' || p.status === 'DROPPED').length;
    const progress = exists ? `${doneCount}/3` : '0/3';

    let next_action_title = null;
    if (exists) {
      const next = rows.find((p) => p.status === 'NOT_STARTED' || p.status === 'IN_PROGRESS');
      if (next) {
        const { data: cat } = await supabase
          .schema('public')
          .from('full_action_catalog')
          .select('title')
          .eq('action_key', next.action_key)
          .maybeSingle();
        next_action_title = cat?.title || next.action_key;
      }
    }

    return res.json({ exists, progress, next_action_title });
  } catch (err) {
    console.error('Erro GET /full/plan/status:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// ---------------------------------------------------------------------------
// 8) GET /full/assessments/:id/recommendations — recs + ações do catálogo
// ---------------------------------------------------------------------------
router.get('/full/assessments/:id/recommendations', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const companyId = req.query.company_id;

    if (!companyId) {
      return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
    }

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) {
      return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');
    }

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) {
      return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    }
    if (assessment.status !== 'SUBMITTED' && assessment.status !== 'CLOSED') {
      return apiError(res, 400, 'DIAG_NOT_READY', 'Conclua o diagnóstico para ver recomendações.');
    }

    const { data: scores } = await supabase
      .schema('public')
      .from('full_process_scores')
      .select('*')
      .eq('assessment_id', assessmentId);

    if (!scores || scores.length === 0) {
      return res.status(404).json({ error: 'scores não encontrados' });
    }

    const segment = assessment.segment;
    const byProcessBand = {};
    scores.forEach((s) => {
      byProcessBand[`${s.process_key}:${s.band}`] = s;
    });

    const processKeys = [...new Set(scores.map((s) => s.process_key))];

    const { data: recCatalog } = await supabase
      .schema('public')
      .from('full_recommendation_catalog')
      .select('*')
      .in('process_key', processKeys)
      .eq('is_active', true);

    const { data: actCatalog } = await supabase
      .schema('public')
      .from('full_action_catalog')
      .select('*')
      .in('process_key', processKeys)
      .eq('is_active', true)
      .contains('segment_applicability', [segment]);

    const recByProcessBand = {};
    (recCatalog || []).forEach((r) => {
      const k = `${r.process_key}:${r.band}`;
      if (!recByProcessBand[k]) recByProcessBand[k] = [];
      recByProcessBand[k].push(r);
    });

    const actByProcessBand = {};
    (actCatalog || []).forEach((a) => {
      const k = `${a.process_key}:${a.band}`;
      if (!actByProcessBand[k]) actByProcessBand[k] = [];
      actByProcessBand[k].push(a);
    });

    const recommendations = [];
    for (const s of scores) {
      const k = `${s.process_key}:${s.band}`;
      let recs = recByProcessBand[k] || [];
      let acts = actByProcessBand[k] || [];
      let isFallback = false;
      let gapReason = null;

      if (recs.length === 0) {
        recs = [{
          recommendation_key: `fallback-${s.process_key}-${s.band}`,
          title: `Recomendação padrão ${s.process_key} (${s.band})`,
          owner_language_explanation: 'Fallback determinístico.'
        }];
        isFallback = true;
        gapReason = 'catálogo vazio para processo/banda';
      }

      if (acts.length === 0) {
        acts = [{
          action_key: `fallback-${s.process_key}-${s.band}`,
          title: `Ação padrão ${s.process_key} (${s.band})`,
          benefit_text: 'Em definição.',
          dod_checklist: ['Definir escopo', 'Documentar resultado']
        }];
        isFallback = true;
        gapReason = gapReason || 'ações não encontradas no catálogo';
      }

      const rec = recs[0];
      const actionKeys = acts.map((a) => a.action_key);

      const { error: genErr } = await supabase
        .schema('public')
        .from('full_generated_recommendations')
        .upsert({
          assessment_id: assessmentId,
          process_key: s.process_key,
          band: s.band,
          recommendation_key: rec.recommendation_key,
          action_keys: actionKeys,
          is_fallback: isFallback,
          gap_reason: gapReason
        }, { onConflict: 'assessment_id,process_key,recommendation_key' });

      if (genErr) {
        console.warn('Aviso ao persistir generated_rec:', genErr.message);
      }

      recommendations.push({
        process_key: s.process_key,
        band: s.band,
        recommendation: rec,
        actions: acts,
        is_fallback: isFallback
      });
    }

    return res.json({ recommendations });
  } catch (err) {
    console.error('Erro GET /full/assessments/:id/recommendations:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// ---------------------------------------------------------------------------
// 9) POST /full/assessments/:id/plan/select — exatamente 3 ações
// ---------------------------------------------------------------------------
router.post('/full/assessments/:id/plan/select', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const companyId = req.query.company_id || req.body.company_id;
    const items = req.body.items || req.body;

    if (!companyId) {
      return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
    }

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) {
      return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');
    }

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) {
      return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    }

    const arr = Array.isArray(items) ? items : [items];
    if (arr.length !== 3) {
      return res.status(400).json({ error: 'exatamente 3 ações são obrigatórias' });
    }

    const validated = [];
    const seenKeys = new Set();
    const seenPos = new Set();

    for (const it of arr) {
      const pos = it.position ?? it.pos;
      const actionKey = it.action_key;
      const ownerName = it.owner_name ?? it.owner;
      const metricText = it.metric_text ?? it.metric;
      const checkpointDate = it.checkpoint_date ?? it.checkpoint;

      if (!pos || !actionKey || !ownerName || !metricText || !checkpointDate) {
        return res.status(400).json({
          error: 'cada item deve ter position (1-3), action_key, owner_name, metric_text, checkpoint_date'
        });
      }
      if (pos < 1 || pos > 3) {
        return res.status(400).json({ error: 'position deve ser 1, 2 ou 3' });
      }
      if (seenKeys.has(actionKey)) {
        return res.status(400).json({ error: 'action_key não pode ser duplicado' });
      }
      if (seenPos.has(pos)) {
        return res.status(400).json({ error: 'position não pode ser duplicado' });
      }

      seenKeys.add(actionKey);
      seenPos.add(pos);
      validated.push({ position: pos, action_key: actionKey, owner_name: ownerName, metric_text: metricText, checkpoint_date: checkpointDate });
    }

    const { data: scores } = await supabase
      .schema('public')
      .from('full_process_scores')
      .select('process_key, band')
      .eq('assessment_id', assessmentId);

    const { data: actCatalog } = await supabase
      .schema('public')
      .from('full_action_catalog')
      .select('process_key, band, action_key')
      .in('action_key', validated.map((v) => v.action_key));

    const catalogMap = {};
    (actCatalog || []).forEach((a) => {
      catalogMap[a.action_key] = a;
    });

    let toInsert = [];
    for (const v of validated) {
      const cat = catalogMap[v.action_key];
      const processKey = cat?.process_key || 'GESTAO';
      const band = cat?.band || 'MEDIUM';
      toInsert.push({
        assessment_id: assessmentId,
        action_key: v.action_key,
        process_key: processKey,
        band,
        position: v.position,
        owner_name: v.owner_name,
        metric_text: v.metric_text,
        checkpoint_date: v.checkpoint_date,
        status: 'NOT_STARTED'
      });
    }

    const { error: delErr } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .delete()
      .eq('assessment_id', assessmentId);

    if (delErr) {
      console.error('Erro ao limpar plano:', delErr.message);
      return res.status(500).json({ error: 'erro ao salvar plano' });
    }

    const { error: insertErr } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .insert(toInsert);

    if (insertErr) {
      console.error('Erro ao inserir plano:', insertErr.message);
      return res.status(500).json({ error: 'erro ao salvar plano' });
    }

    return res.status(200).json({ ok: true, plan: toInsert });
  } catch (err) {
    console.error('Erro POST /full/assessments/:id/plan/select:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// ---------------------------------------------------------------------------
// DoD + Evidência (feito de verdade)
// ---------------------------------------------------------------------------

// GET /full/actions/:action_key/dod — DoD do catálogo
router.get('/full/actions/:action_key/dod', requireAuth, async (req, res) => {
  try {
    const actionKey = decodeURIComponent(req.params.action_key || '');
    if (!actionKey) {
      return res.status(400).json({ error: 'action_key é obrigatório' });
    }

    const { data: catalog, error } = await supabase
      .schema('public')
      .from('full_action_catalog')
      .select('action_key, dod_checklist')
      .eq('action_key', actionKey)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Erro ao buscar DoD:', error.message);
      return apiError(res, 500, 'CHECKLIST_FETCH_ERROR', 'Erro ao buscar checklist. Tente novamente.');
    }

    let dodChecklist = [];
    if (catalog && catalog.dod_checklist) {
      dodChecklist = Array.isArray(catalog.dod_checklist) ? catalog.dod_checklist : [];
    }
    if (dodChecklist.length === 0 && actionKey.startsWith('fallback-')) {
      dodChecklist = ['Definir escopo', 'Executar conforme contexto', 'Documentar resultado'];
    }

    return res.json({ action_key: actionKey, dod_checklist: dodChecklist });
  } catch (err) {
    console.error('Erro GET /full/actions/:action_key/dod:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// POST /full/assessments/:id/plan/:action_key/dod/confirm
router.post('/full/assessments/:id/plan/:action_key/dod/confirm', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const actionKey = decodeURIComponent(req.params.action_key || '');
    const companyId = req.query.company_id || req.body.company_id;
    const { confirmed_items } = req.body;

    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
    if (!actionKey) return res.status(400).json({ error: 'action_key é obrigatório' });
    if (!Array.isArray(confirmed_items)) {
      return apiError(res, 400, 'CHECKLIST_INVALID', 'Falta confirmar o que conta como feito.');
    }

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    if (assessment.status === 'CLOSED') return cycleClosed(res);

    const { data: planRow } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .select('action_key')
      .eq('assessment_id', assessmentId)
      .eq('action_key', actionKey)
      .maybeSingle();
    if (!planRow) return apiError(res, 404, 'ACTION_NOT_FOUND', 'Ação não encontrada no plano.');

    const { data: catalog } = await supabase
      .schema('public')
      .from('full_action_catalog')
      .select('dod_checklist')
      .eq('action_key', actionKey)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    let expectedItems = [];
    if (catalog && catalog.dod_checklist && Array.isArray(catalog.dod_checklist)) {
      expectedItems = catalog.dod_checklist;
    } else if (actionKey.startsWith('fallback-')) {
      expectedItems = ['Definir escopo', 'Executar conforme contexto', 'Documentar resultado'];
    }

    const confirmedSet = new Set(confirmed_items.map((s) => String(s).trim()).filter(Boolean));
    const missing = expectedItems.filter((e) => !confirmedSet.has(e));
    if (missing.length > 0) {
      return apiError(res, 400, 'CHECKLIST_INCOMPLETE', 'Falta confirmar o que conta como feito.');
    }

    const { data: existing } = await supabase
      .schema('public')
      .from('full_action_dod_confirmations')
      .select('*')
      .eq('assessment_id', assessmentId)
      .eq('action_key', actionKey)
      .maybeSingle();

    if (existing) {
      const { error: updErr } = await supabase
        .schema('public')
        .from('full_action_dod_confirmations')
        .update({ confirmed_items, confirmed_at: new Date().toISOString() })
        .eq('assessment_id', assessmentId)
        .eq('action_key', actionKey);
      if (updErr) {
        console.error('Erro ao atualizar DoD:', updErr.message);
        return apiError(res, 500, 'CHECKLIST_CONFIRM_ERROR', 'Erro ao confirmar o que conta como feito. Tente novamente.');
      }
    } else {
      const { error: insErr } = await supabase
        .schema('public')
        .from('full_action_dod_confirmations')
        .insert({ assessment_id: assessmentId, action_key: actionKey, confirmed_items });
      if (insErr) {
        console.error('Erro ao inserir DoD:', insErr.message);
        return apiError(res, 500, 'CHECKLIST_CONFIRM_ERROR', 'Erro ao confirmar o que conta como feito. Tente novamente.');
      }
    }

    const { data: updated } = await supabase
      .schema('public')
      .from('full_action_dod_confirmations')
      .select('*')
      .eq('assessment_id', assessmentId)
      .eq('action_key', actionKey)
      .single();

    return res.status(200).json({ ok: true, confirmation: updated });
  } catch (err) {
    console.error('Erro POST dod/confirm:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// POST /full/assessments/:id/plan/:action_key/evidence — write-once
router.post('/full/assessments/:id/plan/:action_key/evidence', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const actionKey = decodeURIComponent(req.params.action_key || '');
    const companyId = req.query.company_id || req.body.company_id;
    const { evidence_text, before_baseline, after_result } = req.body;

    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
    if (!actionKey) return res.status(400).json({ error: 'action_key é obrigatório' });
    if (!evidence_text || typeof evidence_text !== 'string' || evidence_text.trim().length === 0) {
      return res.status(400).json({ error: 'evidence_text é obrigatório' });
    }
    if (!before_baseline || (typeof before_baseline !== 'string' && typeof before_baseline !== 'number')) {
      return res.status(400).json({ error: 'before_baseline é obrigatório (texto ou número)' });
    }
    if (!after_result || (typeof after_result !== 'string' && typeof after_result !== 'number')) {
      return res.status(400).json({ error: 'after_result é obrigatório (texto ou número)' });
    }

    const beforeStr = String(before_baseline).trim();
    const afterStr = String(after_result).trim();
    if (!beforeStr || !afterStr) {
      return res.status(400).json({ error: 'before_baseline e after_result não podem ser vazios' });
    }

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    if (assessment.status === 'CLOSED') return cycleClosed(res);

    const { data: planRow } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .select('action_key')
      .eq('assessment_id', assessmentId)
      .eq('action_key', actionKey)
      .maybeSingle();
    if (!planRow) return apiError(res, 404, 'ACTION_NOT_FOUND', 'Ação não encontrada no plano.');

    const { data: existing } = await supabase
      .schema('public')
      .from('full_action_evidence')
      .select('*')
      .eq('assessment_id', assessmentId)
      .eq('action_key', actionKey)
      .maybeSingle();

    if (existing) {
      return res.status(200).json({
        already_exists: true,
        evidence: existing
      });
    }

    const declared_gain = `Ganho: ${afterStr} (antes: ${beforeStr})`;

    const { data: created, error: insErr } = await supabase
      .schema('public')
      .from('full_action_evidence')
      .insert({
        assessment_id: assessmentId,
        action_key: actionKey,
        evidence_text: evidence_text.trim(),
        before_baseline: beforeStr,
        after_result: afterStr,
        declared_gain
      })
      .select()
      .single();

    if (insErr) {
      if (insErr.code === '23505') {
        const { data: again } = await supabase
          .schema('public')
          .from('full_action_evidence')
          .select('*')
          .eq('assessment_id', assessmentId)
          .eq('action_key', actionKey)
          .single();
        return res.status(200).json({ already_exists: true, evidence: again });
      }
      console.error('Erro ao salvar evidência:', insErr.message);
      return apiError(res, 500, 'EVIDENCE_SAVE_ERROR', 'Erro ao registrar evidência. Tente novamente.');
    }

    return res.status(201).json({ evidence: created });
  } catch (err) {
    console.error('Erro POST evidence:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// ---------------------------------------------------------------------------
// Dashboard FULL (progresso + próxima ação determinística)
// ---------------------------------------------------------------------------
router.get('/full/assessments/:id/dashboard', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const companyId = req.query.company_id;

    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

    const { data: plan, error: planErr } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .select('*')
      .eq('assessment_id', assessmentId)
      .order('position');

    if (planErr || !plan || plan.length === 0) {
      return res.json({
        progress: '0/3',
        next_action_key: null,
        actions: [],
        assessment_status: assessment.status
      });
    }

    const actionKeys = plan.map((p) => p.action_key);
    const { data: catalog } = await supabase
      .schema('public')
      .from('full_action_catalog')
      .select('action_key, title, dod_checklist')
      .in('action_key', actionKeys);

    const { data: dodRows } = await supabase
      .schema('public')
      .from('full_action_dod_confirmations')
      .select('action_key')
      .eq('assessment_id', assessmentId)
      .in('action_key', actionKeys);

    const { data: evRows } = await supabase
      .schema('public')
      .from('full_action_evidence')
      .select('*')
      .eq('assessment_id', assessmentId)
      .in('action_key', actionKeys);

    const catalogMap = {};
    (catalog || []).forEach((c) => { catalogMap[c.action_key] = c; });
    const dodSet = new Set((dodRows || []).map((r) => r.action_key));
    const evMap = {};
    (evRows || []).forEach((e) => { evMap[e.action_key] = e; });

    const { data: notesRows } = await supabase
      .schema('public')
      .from('full_consultant_notes')
      .select('action_key, note_type, note_text, created_at')
      .eq('assessment_id', assessmentId)
      .in('action_key', actionKeys)
      .order('created_at', { ascending: false });

    const notesByAction = {};
    (notesRows || []).forEach((n) => {
      if (!notesByAction[n.action_key]) notesByAction[n.action_key] = [];
      if (notesByAction[n.action_key].length < 3) {
        notesByAction[n.action_key].push({ note_type: n.note_type, note_text: n.note_text, created_at: n.created_at });
      }
    });

    const doneOrDropped = plan.filter((p) => p.status === 'DONE' || p.status === 'DROPPED');
    const progress = `${doneOrDropped.length}/3`;

    let nextActionKey = null;
    for (const p of plan) {
      if (p.status !== 'DONE' && p.status !== 'DROPPED') {
        nextActionKey = p.action_key;
        break;
      }
    }

    const actions = plan.map((p) => {
      const cat = catalogMap[p.action_key] || {};
      const ev = evMap[p.action_key];
      const dodChecklist = (cat.dod_checklist && Array.isArray(cat.dod_checklist))
        ? cat.dod_checklist
        : (p.action_key.startsWith('fallback-') ? ['Definir escopo', 'Executar conforme contexto', 'Documentar resultado'] : []);

      return {
        position: p.position,
        process_key: p.process_key,
        action_key: p.action_key,
        title: cat.title || p.action_key,
        owner_name: p.owner_name,
        metric_text: p.metric_text,
        checkpoint_date: p.checkpoint_date,
        status: p.status,
        dod_checklist: dodChecklist,
        dod_confirmed: dodSet.has(p.action_key),
        evidence_exists: !!ev,
        before_baseline: ev?.before_baseline ?? null,
        after_result: ev?.after_result ?? null,
        declared_gain: ev?.declared_gain ?? null,
        dropped_reason: p.dropped_reason ?? null,
        consultant_notes: notesByAction[p.action_key] || []
      };
    });

    return res.json({
      progress,
      next_action_key: nextActionKey,
      actions,
      assessment_status: assessment.status
    });
  } catch (err) {
    console.error('Erro GET /full/assessments/:id/dashboard:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// GET /full/assessments/:id/close-summary — somente quando ciclo pronto
router.get('/full/assessments/:id/close-summary', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const companyId = req.query.company_id;

    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

    const { data: plan, error: planErr } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .select('*')
      .eq('assessment_id', assessmentId)
      .order('position');

    if (planErr || !plan || plan.length === 0) {
      return res.status(400).json({ error: 'plano não existe' });
    }

    const notClosed = plan.filter((p) => p.status !== 'DONE' && p.status !== 'DROPPED');
    if (notClosed.length > 0) {
      return res.status(400).json({
        error: 'ciclo não finalizado',
        pending: notClosed.map((p) => ({ action_key: p.action_key, status: p.status }))
      });
    }

    const droppedWithoutReason = plan.filter((p) => p.status === 'DROPPED' && (!p.dropped_reason || p.dropped_reason.trim().length === 0));
    if (droppedWithoutReason.length > 0) {
      return res.status(400).json({
        error: 'ações DROPPED exigem dropped_reason'
      });
    }

    const { data: evRows } = await supabase
      .schema('public')
      .from('full_action_evidence')
      .select('action_key, declared_gain')
      .eq('assessment_id', assessmentId);

    const { data: catalog } = await supabase
      .schema('public')
      .from('full_action_catalog')
      .select('action_key, title')
      .in('action_key', plan.map((p) => p.action_key));

    const catalogMap = {};
    (catalog || []).forEach((c) => { catalogMap[c.action_key] = c; });
    const evMap = {};
    (evRows || []).forEach((e) => { evMap[e.action_key] = e; });

    const gains = plan.map((p) => {
      const ev = evMap[p.action_key];
      const cat = catalogMap[p.action_key] || {};
      return {
        position: p.position,
        action_key: p.action_key,
        title: cat.title || p.action_key,
        status: p.status,
        dropped_reason: p.dropped_reason ?? null,
        declared_gain: ev?.declared_gain ?? null
      };
    });

    return res.json({
      assessment_id: assessmentId,
      company_id: companyId,
      gains
    });
  } catch (err) {
    console.error('Erro GET /full/assessments/:id/close-summary:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// POST /full/assessments/:id/close — fechar ciclo (status => CLOSED)
router.post('/full/assessments/:id/close', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const companyId = req.query.company_id || req.body.company_id;

    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

    if (assessment.status === 'CLOSED') {
      const { data: plan } = await supabase
        .schema('public')
        .from('full_selected_actions')
        .select('*')
        .eq('assessment_id', assessmentId)
        .order('position');
      const { data: evRows } = await supabase
        .schema('public')
        .from('full_action_evidence')
        .select('action_key, declared_gain')
        .eq('assessment_id', assessmentId);
      const { data: catalog } = await supabase
        .schema('public')
        .from('full_action_catalog')
        .select('action_key, title')
        .in('action_key', (plan || []).map((p) => p.action_key));
      const catalogMap = {};
      (catalog || []).forEach((c) => { catalogMap[c.action_key] = c; });
      const evMap = {};
      (evRows || []).forEach((e) => { evMap[e.action_key] = e; });
      const gains = (plan || []).map((p) => ({
        position: p.position,
        action_key: p.action_key,
        title: catalogMap[p.action_key]?.title || p.action_key,
        status: p.status,
        dropped_reason: p.dropped_reason ?? null,
        declared_gain: evMap[p.action_key]?.declared_gain ?? null
      }));
      return res.json({ already_closed: true, assessment_id: assessmentId, company_id: companyId, gains });
    }

    const { data: plan, error: planErr } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .select('*')
      .eq('assessment_id', assessmentId)
      .order('position');

    if (planErr || !plan || plan.length === 0) {
      return res.status(400).json({ error: 'plano não existe' });
    }

    const notClosed = plan.filter((p) => p.status !== 'DONE' && p.status !== 'DROPPED');
    if (notClosed.length > 0) {
      return res.status(400).json({
        error: 'ciclo não finalizado',
        pending: notClosed.map((p) => ({ action_key: p.action_key, status: p.status }))
      });
    }

    const droppedWithoutReason = plan.filter((p) => p.status === 'DROPPED' && (!p.dropped_reason || p.dropped_reason.trim().length === 0));
    if (droppedWithoutReason.length > 0) {
      return apiError(res, 400, 'DROP_REASON_REQUIRED', 'Ações descartadas exigem motivo.');
    }

    const { error: updErr } = await supabase
      .schema('public')
      .from('full_assessments')
      .update({ status: 'CLOSED', updated_at: new Date().toISOString() })
      .eq('id', assessmentId);

    if (updErr) {
      console.error('Erro ao fechar ciclo:', updErr.message);
      return apiError(res, 500, 'CYCLE_CLOSE_ERROR', 'Erro ao fechar ciclo. Tente novamente.');
    }

    const { data: evRows } = await supabase
      .schema('public')
      .from('full_action_evidence')
      .select('action_key, declared_gain')
      .eq('assessment_id', assessmentId);
    const { data: catalog } = await supabase
      .schema('public')
      .from('full_action_catalog')
      .select('action_key, title')
      .in('action_key', plan.map((p) => p.action_key));
    const catalogMap = {};
    (catalog || []).forEach((c) => { catalogMap[c.action_key] = c; });
    const evMap = {};
    (evRows || []).forEach((e) => { evMap[e.action_key] = e; });
    const gains = plan.map((p) => ({
      position: p.position,
      action_key: p.action_key,
      title: catalogMap[p.action_key]?.title || p.action_key,
      status: p.status,
      dropped_reason: p.dropped_reason ?? null,
      declared_gain: evMap[p.action_key]?.declared_gain ?? null
    }));

    return res.status(200).json({ assessment_id: assessmentId, company_id: companyId, gains });
  } catch (err) {
    console.error('Erro POST /full/assessments/:id/close:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// POST /full/assessments/:id/new-cycle — criar novo DRAFT (reavaliação)
router.post('/full/assessments/:id/new-cycle', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const companyId = req.query.company_id || req.body.company_id;

    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

    if (assessment.status !== 'CLOSED') {
      return res.status(400).json({
        error: 'só é possível iniciar novo ciclo a partir de um assessment CLOSED',
        hint: 'Feche o ciclo atual primeiro (POST /full/assessments/:id/close)'
      });
    }

    const { data: created, error: insertErr } = await supabase
      .schema('public')
      .from('full_assessments')
      .insert({
        company_id: companyId,
        created_by_user_id: userId,
        segment: assessment.segment,
        status: 'DRAFT'
      })
      .select('id')
      .single();

    if (insertErr) {
      console.error('Erro ao criar novo ciclo:', insertErr.message);
      return apiError(res, 500, 'CYCLE_NEW_ERROR', 'Erro ao iniciar novo ciclo. Tente novamente.');
    }

    return res.status(201).json({ new_assessment_id: created.id });
  } catch (err) {
    console.error('Erro POST /full/assessments/:id/new-cycle:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// ---------------------------------------------------------------------------
// 10) GET /full/assessments/:id/plan
// ---------------------------------------------------------------------------
router.get('/full/assessments/:id/plan', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const companyId = req.query.company_id;

    if (!companyId) {
      return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
    }

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) {
      return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');
    }

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) {
      return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    }

    const { data: plan, error } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .select('*')
      .eq('assessment_id', assessmentId)
      .order('position');

    if (error) {
      console.error('Erro ao buscar plano:', error.message);
      return res.status(500).json({ error: 'erro ao buscar plano' });
    }

    return res.json({ plan: plan || [] });
  } catch (err) {
    console.error('Erro GET /full/assessments/:id/plan:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// ---------------------------------------------------------------------------
// 11) PATCH /full/assessments/:id/plan/:action_key/status
// ---------------------------------------------------------------------------
router.patch('/full/assessments/:id/plan/:action_key/status', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const actionKey = decodeURIComponent(req.params.action_key || '');
    const companyId = req.query.company_id || req.body.company_id;
    const { status, dropped_reason } = req.body;

    if (!companyId) {
      return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
    }
    if (!status || !['DONE', 'DROPPED', 'IN_PROGRESS', 'NOT_STARTED'].includes(status)) {
      return apiError(res, 400, 'INVALID_STATUS', 'Status inválido.');
    }

    if (status === 'DONE') {
      const company = await ensureCompanyAccess(userId, companyId);
      if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');
      const assessment = await getAssessment(assessmentId, companyId);
      if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

      const { data: dodRow } = await supabase
        .schema('public')
        .from('full_action_dod_confirmations')
        .select('assessment_id')
        .eq('assessment_id', assessmentId)
        .eq('action_key', actionKey)
        .maybeSingle();
      if (!dodRow) {
        return apiError(res, 400, 'CHECKLIST_INCOMPLETE', 'Falta confirmar o que conta como feito.');
      }

      const { data: evRow } = await supabase
        .schema('public')
        .from('full_action_evidence')
        .select('assessment_id')
        .eq('assessment_id', assessmentId)
        .eq('action_key', actionKey)
        .maybeSingle();
      if (!evRow) {
        return apiError(res, 400, 'EVIDENCE_REQUIRED', 'Para concluir, registre a evidência (antes e depois).');
      }
    }
    if (status === 'DROPPED' && (!dropped_reason || typeof dropped_reason !== 'string' || dropped_reason.trim().length === 0)) {
      return apiError(res, 400, 'DROP_REASON_REQUIRED', 'Ao descartar uma ação, informe o motivo.');
    }

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) {
      return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');
    }

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) {
      return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    }
    if (assessment.status === 'CLOSED') return cycleClosed(res);

    const update = { status, updated_at: new Date().toISOString() };
    if (status === 'DROPPED') update.dropped_reason = dropped_reason;

    const { data, error } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .update(update)
      .eq('assessment_id', assessmentId)
      .eq('action_key', actionKey)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Erro ao atualizar status:', error.message);
      return apiError(res, 500, 'STATUS_UPDATE_ERROR', 'Erro ao atualizar status. Tente novamente.');
    }
    if (!data) {
      return apiError(res, 404, 'ACTION_NOT_FOUND', 'Ação não encontrada no plano.');
    }

    return res.json(data);
  } catch (err) {
    console.error('Erro PATCH plan status:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// ---------------------------------------------------------------------------
// Prompt 4 aliases (ciclo FULL) - mantém fonte de verdade nas tabelas atuais
// ---------------------------------------------------------------------------

// GET /full/actions?assessment_id=...&company_id=...
router.get('/full/actions', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.query.assessment_id;
    const companyId = req.query.company_id;
    if (!assessmentId) return res.status(400).json({ error: 'assessment_id é obrigatório' });
    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    if (assessment.status !== 'SUBMITTED' && assessment.status !== 'CLOSED') {
      return apiError(res, 400, 'DIAG_NOT_READY', 'Conclua o diagnóstico para sugerir ações.');
    }

    const { data: scores } = await supabase
      .schema('public')
      .from('full_process_scores')
      .select('process_key, band, score_numeric')
      .eq('assessment_id', assessmentId);
    const processKeys = [...new Set((scores || []).map((s) => s.process_key))];

    const { data: actions } = await supabase
      .schema('public')
      .from('full_action_catalog')
      .select('process_key, band, action_key, title, benefit_text, metric_hint, dod_checklist, segment_applicability')
      .in('process_key', processKeys)
      .eq('is_active', true)
      .contains('segment_applicability', [assessment.segment]);

    const scoresByProcess = {};
    (scores || []).forEach((s) => { scoresByProcess[s.process_key] = s; });

    const suggestions = (actions || [])
      .filter((a) => scoresByProcess[a.process_key] && scoresByProcess[a.process_key].band === a.band)
      .sort((a, b) => {
        if (a.process_key !== b.process_key) return a.process_key.localeCompare(b.process_key);
        return a.action_key.localeCompare(b.action_key);
      })
      .map((a) => ({
        process_key: a.process_key,
        band: a.band,
        action_key: a.action_key,
        title: a.title,
        benefit_text: a.benefit_text,
        metric_hint: a.metric_hint,
        dod_checklist: Array.isArray(a.dod_checklist) ? a.dod_checklist : [],
      }));

    return res.json({ suggestions, scores_by_process: scores || [] });
  } catch (err) {
    console.error('Erro GET /full/actions:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// POST /full/cycle/select-actions
router.post('/full/cycle/select-actions', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.query.company_id || req.body.company_id;
    const assessmentId = req.body.assessment_id;
    const items = req.body.actions || req.body.items || [];

    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
    if (!assessmentId) return res.status(400).json({ error: 'assessment_id é obrigatório' });

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    if (assessment.status === 'CLOSED') return cycleClosed(res);

    const arr = Array.isArray(items) ? items : [];
    if (arr.length !== 3) return res.status(400).json({ error: 'exatamente 3 ações são obrigatórias' });

    const seenAction = new Set();
    const seenPos = new Set();
    const validated = [];
    for (const it of arr) {
      const actionKey = it.action_key;
      const ownerName = it.owner_name;
      const metricText = it.metric_text;
      const checkpointDate = it.checkpoint_date;
      const pos = Number(it.position);
      if (!actionKey || !ownerName || !metricText || !checkpointDate || !pos) {
        return res.status(400).json({ error: 'cada ação exige action_key, owner_name, metric_text, checkpoint_date e position(1..3)' });
      }
      if (pos < 1 || pos > 3) return res.status(400).json({ error: 'position deve ser 1..3' });
      if (seenAction.has(actionKey)) return res.status(400).json({ error: 'action_key duplicado' });
      if (seenPos.has(pos)) return res.status(400).json({ error: 'position duplicado' });
      seenAction.add(actionKey);
      seenPos.add(pos);
      validated.push({ action_key: actionKey, owner_name: ownerName, metric_text: metricText, checkpoint_date: checkpointDate, position: pos });
    }

    const { data: actionCatalog } = await supabase
      .schema('public')
      .from('full_action_catalog')
      .select('action_key, process_key, band')
      .in('action_key', validated.map((v) => v.action_key));

    const actMap = {};
    (actionCatalog || []).forEach((a) => { actMap[a.action_key] = a; });

    const toInsert = validated.map((v) => ({
      assessment_id: assessmentId,
      action_key: v.action_key,
      process_key: actMap[v.action_key]?.process_key || 'GESTAO',
      band: actMap[v.action_key]?.band || 'MEDIUM',
      position: v.position,
      owner_name: v.owner_name,
      metric_text: v.metric_text,
      checkpoint_date: v.checkpoint_date,
      status: 'NOT_STARTED',
    }));

    const { error: delErr } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .delete()
      .eq('assessment_id', assessmentId);
    if (delErr) return res.status(500).json({ error: 'erro ao preparar ciclo' });

    const { error: insErr } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .insert(toInsert);
    if (insErr) return res.status(500).json({ error: 'erro ao salvar ciclo' });

    return res.status(200).json({ ok: true, actions: toInsert });
  } catch (err) {
    console.error('Erro POST /full/cycle/select-actions:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// POST /full/cycle/actions/:id/evidence (write-once)
router.post('/full/cycle/actions/:id/evidence', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const actionKey = decodeURIComponent(req.params.id || '');
    const companyId = req.query.company_id || req.body.company_id;
    const assessmentId = req.body.assessment_id;
    const evidenceText = req.body.evidence_text;
    const beforeText = req.body.before_text;
    const afterText = req.body.after_text;
    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
    if (!assessmentId) return res.status(400).json({ error: 'assessment_id é obrigatório' });
    if (!actionKey) return res.status(400).json({ error: 'action id é obrigatório' });
    if (!evidenceText || !beforeText || !afterText) {
      return res.status(400).json({ error: 'evidence_text, before_text e after_text são obrigatórios' });
    }

    const existingAssessment = await getAssessment(assessmentId, companyId);
    if (!existingAssessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

    const { data: existing } = await supabase
      .schema('public')
      .from('full_action_evidence')
      .select('*')
      .eq('assessment_id', assessmentId)
      .eq('action_key', actionKey)
      .maybeSingle();
    if (existing) return res.status(409).json({ error: 'evidência já registrada (write-once)' });

    const declaredGain = `Antes: ${String(beforeText)}. Depois: ${String(afterText)}.`;
    const { data: created, error: insErr } = await supabase
      .schema('public')
      .from('full_action_evidence')
      .insert({
        assessment_id: assessmentId,
        action_key: actionKey,
        evidence_text: String(evidenceText),
        before_baseline: String(beforeText),
        after_result: String(afterText),
        declared_gain: declaredGain,
      })
      .select()
      .single();
    if (insErr) return res.status(500).json({ error: 'erro ao registrar evidência' });
    return res.status(201).json({ evidence: created });
  } catch (err) {
    console.error('Erro POST /full/cycle/actions/:id/evidence:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// POST /full/cycle/actions/:id/mark-done
router.post('/full/cycle/actions/:id/mark-done', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const actionKey = decodeURIComponent(req.params.id || '');
    const companyId = req.query.company_id || req.body.company_id;
    const assessmentId = req.body.assessment_id;
    const confirmedItems = req.body.confirmed_items || [];
    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
    if (!assessmentId) return res.status(400).json({ error: 'assessment_id é obrigatório' });
    if (!actionKey) return res.status(400).json({ error: 'action id é obrigatório' });

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    if (assessment.status === 'CLOSED') return cycleClosed(res);

    const { data: cat } = await supabase
      .schema('public')
      .from('full_action_catalog')
      .select('dod_checklist')
      .eq('action_key', actionKey)
      .eq('is_active', true)
      .maybeSingle();
    const expected = Array.isArray(cat?.dod_checklist) ? cat.dod_checklist : [];
    const confSet = new Set((confirmedItems || []).map((x) => String(x)));
    const missingDod = expected.filter((x) => !confSet.has(String(x)));
    if (missingDod.length > 0) {
      return apiError(res, 400, 'CHECKLIST_INCOMPLETE', 'Falta confirmar o que conta como feito.');
    }

    const { data: ev } = await supabase
      .schema('public')
      .from('full_action_evidence')
      .select('assessment_id')
      .eq('assessment_id', assessmentId)
      .eq('action_key', actionKey)
      .maybeSingle();
    if (!ev) return apiError(res, 400, 'EVIDENCE_REQUIRED', 'Para concluir, registre a evidência (antes e depois).');

    const { error: updErr } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .update({ status: 'DONE', updated_at: new Date().toISOString() })
      .eq('assessment_id', assessmentId)
      .eq('action_key', actionKey);
    if (updErr) return apiError(res, 500, 'MARK_DONE_ERROR', 'Erro ao marcar como concluído. Tente novamente.');

    return res.json({ ok: true, status: 'DONE' });
  } catch (err) {
    console.error('Erro POST /full/cycle/actions/:id/mark-done:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// GET /full/dashboard?assessment_id=...&company_id=...
router.get('/full/dashboard', requireAuth, requireFullEntitlement, async (req, res) => {
  const assessmentId = req.query.assessment_id;
  const companyId = req.query.company_id;
  if (!assessmentId) return res.status(400).json({ error: 'assessment_id é obrigatório' });
  if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
  return res.redirect(307, `/full/assessments/${assessmentId}/dashboard?company_id=${companyId}`);
});

// ---------------------------------------------------------------------------
// Prompt 4: POST /full/plan, GET /full/plan (aliases idempotentes)
// ---------------------------------------------------------------------------
router.post('/full/plan', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.query.company_id || req.body.company_id;
    const assessmentId = req.body.assessment_id;
    const items = req.body.actions || req.body.items || req.body;

    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
    if (!assessmentId) return res.status(400).json({ error: 'assessment_id é obrigatório' });

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    if (assessment.status === 'CLOSED') return cycleClosed(res);

    const arr = Array.isArray(items) ? items : [items];
    if (arr.length !== 3) {
      return res.status(400).json({ error: 'exatamente 3 ações são obrigatórias (dono, métrica, checkpoint por ação)' });
    }

    const validated = [];
    const seenKeys = new Set();
    const seenPos = new Set();

    for (const it of arr) {
      const pos = it.position ?? it.pos;
      const actionKey = it.action_key;
      const ownerName = (it.owner_name ?? it.owner ?? '').toString().trim();
      const metricText = (it.metric_text ?? it.metric ?? '').toString().trim();
      const checkpointDate = it.checkpoint_date ?? it.checkpoint;

      if (!pos || !actionKey || !ownerName || !metricText || !checkpointDate) {
        return res.status(400).json({
          error: 'cada ação exige position (1-3), action_key, owner_name, metric_text, checkpoint_date'
        });
      }
      if (pos < 1 || pos > 3) return res.status(400).json({ error: 'position deve ser 1, 2 ou 3' });
      if (seenKeys.has(actionKey)) return res.status(400).json({ error: 'action_key duplicado' });
      if (seenPos.has(pos)) return res.status(400).json({ error: 'position duplicado' });
      seenKeys.add(actionKey);
      seenPos.add(pos);
      validated.push({ position: pos, action_key: actionKey, owner_name: ownerName, metric_text: metricText, checkpoint_date: checkpointDate });
    }

    const { data: actCatalog } = await supabase
      .schema('public')
      .from('full_action_catalog')
      .select('process_key, band, action_key')
      .in('action_key', validated.map((v) => v.action_key));

    const catalogMap = {};
    (actCatalog || []).forEach((a) => { catalogMap[a.action_key] = a; });

    const toInsert = validated.map((v) => ({
      assessment_id: assessmentId,
      action_key: v.action_key,
      process_key: catalogMap[v.action_key]?.process_key || 'GESTAO',
      band: catalogMap[v.action_key]?.band || 'MEDIUM',
      position: v.position,
      owner_name: v.owner_name,
      metric_text: v.metric_text,
      checkpoint_date: v.checkpoint_date,
      status: 'NOT_STARTED',
    }));

    const { error: delErr } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .delete()
      .eq('assessment_id', assessmentId);
    if (delErr) return res.status(500).json({ error: 'erro ao preparar plano' });

    const { error: insErr } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .insert(toInsert);
    if (insErr) return res.status(500).json({ error: 'erro ao salvar plano' });

    return res.status(200).json({ ok: true, plan: toInsert });
  } catch (err) {
    console.error('Erro POST /full/plan:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

router.get('/full/plan', requireAuth, requireFullEntitlement, async (req, res) => {
  const assessmentId = req.query.assessment_id;
  const companyId = req.query.company_id;
  if (!assessmentId) return res.status(400).json({ error: 'assessment_id é obrigatório' });
  if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
  return res.redirect(307, `/full/assessments/${assessmentId}/dashboard?company_id=${companyId}`);
});

// POST /full/actions/:action_key/status — atualiza status (NOT_STARTED/IN_PROGRESS/DONE/DROPPED)
router.post('/full/actions/:action_key/status', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const actionKey = decodeURIComponent(req.params.action_key || '');
    const companyId = req.query.company_id || req.body.company_id;
    const assessmentId = req.query.assessment_id || req.body.assessment_id;
    const { status, dropped_reason } = req.body;

    if (!companyId || !assessmentId) return res.status(400).json({ error: 'company_id e assessment_id são obrigatórios' });
    if (!status || !['DONE', 'DROPPED', 'IN_PROGRESS', 'NOT_STARTED'].includes(status)) {
      return apiError(res, 400, 'INVALID_STATUS', 'Status inválido.');
    }

    if (status === 'DONE') {
      const company = await ensureCompanyAccess(userId, companyId);
      if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada.');
      const assessment = await getAssessment(assessmentId, companyId);
      if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

      const { data: dodRow } = await supabase
        .schema('public')
        .from('full_action_dod_confirmations')
        .select('assessment_id')
        .eq('assessment_id', assessmentId)
        .eq('action_key', actionKey)
        .maybeSingle();
      if (!dodRow) return apiError(res, 400, 'CHECKLIST_INCOMPLETE', 'Falta confirmar o que conta como feito.');

      const { data: evRow } = await supabase
        .schema('public')
        .from('full_action_evidence')
        .select('assessment_id')
        .eq('assessment_id', assessmentId)
        .eq('action_key', actionKey)
        .maybeSingle();
      if (!evRow) return apiError(res, 400, 'EVIDENCE_REQUIRED', 'Para concluir, registre a evidência (antes e depois).');
    }
    if (status === 'DROPPED' && (!dropped_reason || String(dropped_reason).trim().length === 0)) {
      return apiError(res, 400, 'DROP_REASON_REQUIRED', 'Ao descartar uma ação, informe o motivo.');
    }

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada.');
    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    if (assessment.status === 'CLOSED') return cycleClosed(res);

    const update = { status, updated_at: new Date().toISOString() };
    if (status === 'DROPPED') update.dropped_reason = dropped_reason;

    const { data, error } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .update(update)
      .eq('assessment_id', assessmentId)
      .eq('action_key', actionKey)
      .select()
      .maybeSingle();

    if (error) return apiError(res, 500, 'STATUS_UPDATE_ERROR', 'Erro ao atualizar status. Tente novamente.');
    if (!data) return apiError(res, 404, 'ACTION_NOT_FOUND', 'Ação não encontrada no plano.');

    return res.json(data);
  } catch (err) {
    console.error('Erro POST /full/actions/:action_key/status:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// POST /full/actions/:action_key/evidence (write-once) — aceita evidência, antes, depois
router.post('/full/actions/:action_key/evidence', requireAuth, requireFullEntitlement, async (req, res) => {
  const actionKey = decodeURIComponent(req.params.action_key || '');
  const companyId = req.query.company_id || req.body.company_id;
  const assessmentId = req.body.assessment_id || req.query.assessment_id;
  const evidencia = req.body.evidência ?? req.body.evidencia ?? req.body.evidence_text;
  const antes = req.body.antes ?? req.body.before_baseline ?? req.body.before_text;
  const depois = req.body.depois ?? req.body.after_result ?? req.body.after_text;

  if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
  if (!assessmentId) return res.status(400).json({ error: 'assessment_id é obrigatório' });
  if (!actionKey) return res.status(400).json({ error: 'action_key é obrigatório' });
  if (!evidencia || !antes || !depois) {
    return res.status(400).json({ error: 'evidência, antes e depois são obrigatórios' });
  }

  const company = await ensureCompanyAccess(req.user.id, companyId);
  if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada.');

  const assessment = await getAssessment(assessmentId, companyId);
  if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
  if (assessment.status === 'CLOSED') return cycleClosed(res);

  const { data: existing } = await supabase
    .schema('public')
    .from('full_action_evidence')
    .select('*')
    .eq('assessment_id', assessmentId)
    .eq('action_key', actionKey)
    .maybeSingle();

  if (existing) return res.status(409).json({ error: 'evidência já registrada (write-once)' });

  const ganhoDeclarado = `Ganho: ${String(depois).trim()} (antes: ${String(antes).trim()})`;

  const { data: created, error: insErr } = await supabase
    .schema('public')
    .from('full_action_evidence')
    .insert({
      assessment_id: assessmentId,
      action_key: actionKey,
      evidence_text: String(evidencia).trim(),
      before_baseline: String(antes).trim(),
      after_result: String(depois).trim(),
      declared_gain: ganhoDeclarado,
    })
    .select()
    .single();

  if (insErr) return res.status(500).json({ error: 'erro ao registrar evidência' });
  return res.status(201).json({ evidence: created, ganho_declarado: ganhoDeclarado });
});

// ---------------------------------------------------------------------------
// CONSULTOR (accountability) — visão read + notas write
// ---------------------------------------------------------------------------

// GET /full/consultor/assessments/:id?company_id= — pacote completo para consultor
router.get('/full/consultor/assessments/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const companyId = req.query.company_id;

    const assessment = companyId
      ? await getAssessment(assessmentId, companyId)
      : await getAssessmentById(assessmentId);

    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

    const cid = assessment.company_id;
    const access = await ensureConsultantOrOwnerAccess(userId, cid);
    if (!access) return res.status(403).json({ error: 'sem acesso como consultor' });

    const [answersRes, scoresRes, planRes, evRes] = await Promise.all([
      supabase.schema('public').from('full_answers').select('*').eq('assessment_id', assessmentId),
      supabase.schema('public').from('full_process_scores').select('*').eq('assessment_id', assessmentId),
      supabase.schema('public').from('full_selected_actions').select('*').eq('assessment_id', assessmentId).order('position'),
      supabase.schema('public').from('full_action_evidence').select('*').eq('assessment_id', assessmentId)
    ]);

    const answers = answersRes.data || [];
    const scores = scoresRes.data || [];
    const plan = planRes.data || [];
    const evidence = evRes.data || [];

    const actionKeys = plan.map((p) => p.action_key);
    const { data: catalog } = await supabase
      .schema('public')
      .from('full_action_catalog')
      .select('action_key, title, dod_checklist')
      .in('action_key', actionKeys);
    const catalogMap = {};
    (catalog || []).forEach((c) => { catalogMap[c.action_key] = c; });
    const evMap = {};
    evidence.forEach((e) => { evMap[e.action_key] = e; });

    const { data: dodRows } = await supabase
      .schema('public')
      .from('full_action_dod_confirmations')
      .select('action_key')
      .eq('assessment_id', assessmentId)
      .in('action_key', actionKeys);
    const dodSet = new Set((dodRows || []).map((r) => r.action_key));

    const dashboard_actions = plan.map((p) => {
      const cat = catalogMap[p.action_key] || {};
      const ev = evMap[p.action_key];
      const dodChecklist = (cat.dod_checklist && Array.isArray(cat.dod_checklist))
        ? cat.dod_checklist
        : (p.action_key.startsWith('fallback-') ? ['Definir escopo', 'Executar conforme contexto', 'Documentar resultado'] : []);
      return {
        position: p.position,
        process_key: p.process_key,
        action_key: p.action_key,
        title: cat.title || p.action_key,
        owner_name: p.owner_name,
        metric_text: p.metric_text,
        checkpoint_date: p.checkpoint_date,
        status: p.status,
        dod_checklist: dodChecklist,
        dod_confirmed: dodSet.has(p.action_key),
        evidence_exists: !!ev,
        before_baseline: ev?.before_baseline ?? null,
        after_result: ev?.after_result ?? null,
        declared_gain: ev?.declared_gain ?? null,
        dropped_reason: p.dropped_reason ?? null
      };
    });

    const loadedResults = assessment.status !== 'DRAFT'
      ? await loadFullResultsPayload(assessmentId)
      : { error: null, payload: { findings: [], scores_by_process: [], trace: [], items: [] } };
    const results = loadedResults.error
      ? { items: [] }
      : { items: loadedResults.payload.items, findings: loadedResults.payload.findings, trace: loadedResults.payload.trace };

    const { data: companyRow } = await supabase
      .schema('public')
      .from('companies')
      .select('name, trade_name')
      .eq('id', cid)
      .maybeSingle();
    const companyName = companyRow?.trade_name || companyRow?.name || null;

    return res.json({
      assessment: { id: assessment.id, company_id: cid, company_name: companyName, segment: assessment.segment, status: assessment.status },
      catalog_segment: assessment.segment,
      answers,
      scores,
      results,
      plan,
      evidence,
      dashboard: {
        progress: `${plan.filter((p) => p.status === 'DONE' || p.status === 'DROPPED').length}/3`,
        actions: dashboard_actions
      }
    });
  } catch (err) {
    console.error('Erro GET /full/consultor/assessments/:id:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// POST /full/consultor/assessments/:id/actions/:action_key/notes
router.post('/full/consultor/assessments/:id/actions/:action_key/notes', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const actionKey = decodeURIComponent(req.params.action_key || '');
    const companyId = req.query.company_id || req.body.company_id;
    const { note_type, note_text } = req.body;

    const assessment = companyId ? await getAssessment(assessmentId, companyId) : await getAssessmentById(assessmentId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

    const access = await ensureConsultantOrOwnerAccess(userId, assessment.company_id);
    if (!access) return res.status(403).json({ error: 'sem acesso como consultor' });

    if (!note_type || !['ORIENTACAO', 'IMPEDIMENTO', 'PROXIMO_PASSO'].includes(note_type)) {
      return res.status(400).json({ error: 'note_type deve ser ORIENTACAO, IMPEDIMENTO ou PROXIMO_PASSO' });
    }
    if (!note_text || typeof note_text !== 'string' || note_text.trim().length === 0) {
      return res.status(400).json({ error: 'note_text é obrigatório' });
    }

    const { data: planRow } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .select('action_key')
      .eq('assessment_id', assessmentId)
      .eq('action_key', actionKey)
      .maybeSingle();
    if (!planRow) return apiError(res, 404, 'ACTION_NOT_FOUND', 'Ação não encontrada no plano.');

    const { data: created, error: insErr } = await supabase
      .schema('public')
      .from('full_consultant_notes')
      .insert({
        assessment_id: assessmentId,
        action_key: actionKey,
        consultant_user_id: userId,
        note_type,
        note_text: note_text.trim()
      })
      .select()
      .single();

    if (insErr) {
      console.error('Erro ao inserir nota:', insErr.message);
      return res.status(500).json({ error: 'erro ao salvar nota' });
    }

    return res.status(201).json(created);
  } catch (err) {
    console.error('Erro POST consultor notes:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// GET /full/assessments/:id/actions/:action_key/notes — lista notas (cliente ou consultor)
router.get('/full/assessments/:id/actions/:action_key/notes', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const actionKey = decodeURIComponent(req.params.action_key || '');
    const companyId = req.query.company_id;

    const assessment = companyId ? await getAssessment(assessmentId, companyId) : await getAssessmentById(assessmentId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

    const cid = assessment.company_id;
    const access = await ensureConsultantOrOwnerAccess(userId, cid);
    if (!access) return apiError(res, 403, 'ACCESS_DENIED', 'Sem acesso a este recurso.');

    const { data: notes, error } = await supabase
      .schema('public')
      .from('full_consultant_notes')
      .select('id, note_type, note_text, created_at')
      .eq('assessment_id', assessmentId)
      .eq('action_key', actionKey)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar notas:', error.message);
      return res.status(500).json({ error: 'erro ao buscar notas' });
    }

    return res.json({ notes: notes || [] });
  } catch (err) {
    console.error('Erro GET notes:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

module.exports = router;
