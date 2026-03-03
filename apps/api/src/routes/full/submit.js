/**
 * Rotas de assessments e resultados FULL:
 *   POST /full/assessments/start
 *   GET  /full/assessments/current
 *   GET  /full/assessments/:id
 *   GET  /full/assessments/:id/status
 *   POST /full/assessments/:id/submit
 *   GET  /full/assessments/:id/results
 *   GET  /full/results (legacy)
 */
const express = require('express');
const router = express.Router();
const { supabase } = require('../../lib/supabase');
const { requireAuth } = require('../../middleware/requireAuth');
const { requireFullEntitlement } = require('../../middleware/requireFullEntitlement');
const { blockConsultorOnMutation } = require('../../middleware/requireRole');
const { ensureCompanyAccess, ensureConsultantOrOwnerAccess } = require('../../lib/companyAccess');
const { getOrCreateCurrentFullAssessment, FullCurrentError, logFullCurrentError } = require('../../lib/fullAssessment');
const { apiError, toExternalScore, avg, BAND_WORST_FIRST, BAND_BEST_FIRST, firstNByOrder } = require('../../lib/fullHelpers');
const { getAssessment, getAssessmentById, getLatestClosedAssessment, getLatestSubmittedOrClosedAssessment } = require('../../lib/repositories/fullAssessmentRepo');
const { buildAndPersistFindings, PROCESS_BAND_TO_GAP, PROCESS_OWNER_LABEL } = require('../../lib/fullFindings');
const {
  getOQueEstaAcontecendo,
  getCustoDeNaoAgirFaixa,
  getOQueMudaEm30Dias,
  humanizeAnswerValue,
  FALLBACK_ACTION_TITLE,
} = require('../../lib/fullResultCopy');

const CAUSE_ENGINE_GAP_IDS = ['GAP_CAIXA_PREVISAO', 'GAP_VENDAS_FUNIL', 'GAP_ROTINA_GERENCIAL'];

function makeDebugId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `sub_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function deriveBandFromCanonical(dimensionScores, overallScore) {
  const { EXISTENCIA, ROTINA, DONO, CONTROLE } = dimensionScores;
  const allDefined = [EXISTENCIA, ROTINA, DONO, CONTROLE].every((v) => v != null && !isNaN(v));
  if (!allDefined || overallScore == null) {
    const { scoreToBand } = require('../../lib/fullHelpers');
    return { band: scoreToBand(overallScore ?? 0), rule: 'fallback_missing_dims' };
  }
  if (EXISTENCIA < 4) return { band: 'LOW', rule: 'existencia_lt4' };
  if (ROTINA < 4) return { band: 'LOW', rule: 'rotina_lt4' };
  if (DONO < 4 && CONTROLE < 4) return { band: 'LOW', rule: 'dono_and_controle_lt4' };
  if (overallScore < 4) return { band: 'LOW', rule: 'overall_lt4' };
  if (EXISTENCIA >= 7 && ROTINA >= 7 && DONO >= 7 && CONTROLE >= 7) return { band: 'HIGH', rule: 'all_dims_gte7' };
  if (overallScore >= 7) return { band: 'HIGH', rule: 'overall_gte7' };
  return { band: 'MEDIUM', rule: 'default_medium' };
}

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
    const title = f.gap_label ? f.gap_label : `${processLabel} (${f.maturity_band})`;
    const questionRefs = f.trace?.question_refs || [];
    const isGap = !!f.is_fallback;
    return {
      title,
      o_que_acontece: f.gap_label || f.o_que_esta_acontecendo,
      causa_porque: f.cause_label || f.mechanism_label || null,
      custo_nao_agir: f.custo_de_nao_agir,
      muda_em_30_dias: f.o_que_muda_em_30_dias,
      primeiro_passo_action_id: f.primeiro_passo?.action_key || null,
      primeiro_passo: f.primeiro_passo?.action_title || null,
      is_fallback: isGap,
      is_gap_content: isGap,
      evidence_keys: (questionRefs || []).map((q) => `${q.process_key}_${q.question_key}`),
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
      scores_by_process: (scores || []).map((s) => ({ ...s, score_numeric: toExternalScore(s.score_numeric) })),
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

function deriveSixPackFromScores(scores, processCatalog) {
  const catalogMap = {};
  (processCatalog || []).forEach((p) => { catalogMap[p.process_key] = p; });
  function getProcessMeta(processKey) {
    return catalogMap[processKey] || { protects_dimension: 'RISCO', typical_impact_band: 'MEDIUM' };
  }

  const scoreList = (scores || []).map((s) => ({
    ...s,
    typical_impact_band: (catalogMap[s.process_key]?.typical_impact_band) || 'MEDIUM',
    quick_win: !!(catalogMap[s.process_key]?.quick_win),
  }));

  let vazamentosBase = scoreList.filter((s) => s.band === 'LOW');
  vazamentosBase = firstNByOrder(
    vazamentosBase,
    3,
    (a, b) => (BAND_BEST_FIRST[a.typical_impact_band] ?? 9) - (BAND_BEST_FIRST[b.typical_impact_band] ?? 9) || b.score_numeric - a.score_numeric
  );
  if (vazamentosBase.length < 3) {
    const used = new Set(vazamentosBase.map((s) => s.process_key));
    const byScore = scoreList.filter((s) => !used.has(s.process_key)).sort((a, b) => a.score_numeric - b.score_numeric);
    vazamentosBase = [...vazamentosBase, ...byScore.slice(0, 3 - vazamentosBase.length)];
  }

  let alavancaCandidates = scoreList.filter((s) => s.band === 'MEDIUM');
  const usedV = new Set(vazamentosBase.map((s) => s.process_key));
  if (alavancaCandidates.length < 3) {
    const lowMed = scoreList.filter((s) => (s.band === 'LOW' || s.band === 'MEDIUM') && !usedV.has(s.process_key));
    alavancaCandidates = [...alavancaCandidates, ...lowMed];
  }
  alavancaCandidates = alavancaCandidates.sort((a, b) => {
    if (a.quick_win !== b.quick_win) return a.quick_win ? -1 : 1;
    return (BAND_BEST_FIRST[a.typical_impact_band] ?? 9) - (BAND_BEST_FIRST[b.typical_impact_band] ?? 9) || b.score_numeric - a.score_numeric;
  });
  const alavancasBase = alavancaCandidates.slice(0, 3);

  function toItem(type, s) {
    const processLabel = PROCESS_OWNER_LABEL[s.process_key] || s.process_key;
    const meta = getProcessMeta(s.process_key);
    const protects = meta.protects_dimension || 'RISCO';
    const answers = (s.support?.answers || []).slice(0, 4).map((a) => ({
      process_key: s.process_key,
      question_key: a.question_key,
      question_text: '',
      answer_value: a.answer_value,
      answer_text: humanizeAnswerValue(a.answer_value),
    }));
    return {
      title: `${processLabel} (${s.band})`,
      o_que_acontece: getOQueEstaAcontecendo(type, s.process_key, protects, s.band, meta),
      custo_nao_agir: getCustoDeNaoAgirFaixa(s.band, meta),
      muda_em_30_dias: getOQueMudaEm30Dias(type, s.process_key, protects, s.band),
      primeiro_passo_action_id: null,
      primeiro_passo: FALLBACK_ACTION_TITLE,
      is_fallback: true,
      is_gap_content: true,
      evidence_keys: answers.map((a) => `${a.process_key}_${a.question_key}`),
      supporting: { processes: [s.process_key], como_puxou_nivel: null, questions: answers },
    };
  }

  return {
    vazamentos: vazamentosBase.map((s) => toItem('VAZAMENTO', s)),
    alavancas: alavancasBase.map((s) => toItem('ALAVANCA', s)),
  };
}

// POST /full/assessments/start
router.post('/full/assessments/start', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
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

// GET /full/assessments/current?company_id=
router.get('/full/assessments/current', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
  const userId = req.user.id;
  const userEmail = req.user.email || null;
  const companyId = req.query.company_id;

  try {
    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');

    const company = await ensureConsultantOrOwnerAccess(userId, companyId, req.user?.email, req.user?.role);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');

    const forWizard = req.query.for_wizard === '1' || req.query.for_wizard === 'true';
    const result = await getOrCreateCurrentFullAssessment(companyId, userId, { forWizard });

    const { assessment } = result;
    const { data: answers } = await supabase
      .schema('public')
      .from('full_answers')
      .select('process_key, question_key, answer_value, answered_at, updated_at')
      .eq('assessment_id', assessment.id)
      .order('process_key', { ascending: true })
      .order('question_key', { ascending: true });

    const payload = { ...assessment, type: 'FULL', answers: answers || [] };

    console.log('[AUDIT] full_answers_load assessment_id=' + assessment.id + ' count=' + (answers || []).length + ' (via /current)');

    return res.json(payload);
  } catch (err) {
    if (err instanceof FullCurrentError) {
      logFullCurrentError(err.phase, companyId, userId, userEmail, err.originalError);
      const isDev = process.env.NODE_ENV !== 'production';
      return res.status(500).json({
        code: 'FULL_CURRENT_FAILED',
        error: err.message,
        message_user: 'Não foi possível carregar o diagnóstico. Tente novamente.',
        ...(isDev && { phase: err.phase }),
      });
    }
    console.error('Erro GET /full/assessments/current:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// GET /full/assessments/:id
router.get('/full/assessments/:id', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
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

// GET /full/assessments/:id/status
router.get('/full/assessments/:id/status', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
  try {
    const assessmentId = req.params.id;
    const companyId = req.query.company_id;
    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada.');

    const company = await ensureCompanyAccess(req.user.id, companyId);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada.');

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

    const { data: answers } = await supabase
      .schema('public')
      .from('full_answers')
      .select('process_key, question_key, answer_value, updated_at')
      .eq('assessment_id', assessmentId);

    const processesAnswered = [...new Set((answers || []).map((a) => a.process_key))];
    const lastSaved = (answers || []).reduce((acc, a) => {
      const t = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      return t > acc ? t : acc;
    }, 0);

    return res.json({
      assessment_id: assessmentId,
      company_id: companyId,
      status: assessment.status,
      answered_count: (answers || []).length,
      processes_answered: processesAnswered,
      last_saved_at: lastSaved ? new Date(lastSaved).toISOString() : null,
    });
  } catch (err) {
    console.error('Erro GET /full/assessments/:id/status:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// POST /full/assessments/:id/submit
router.post('/full/assessments/:id/submit', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
  const debugId = makeDebugId();
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const companyId = req.query.company_id || req.body.company_id;

    if (!companyId) {
      return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
    }

    const company = await ensureConsultantOrOwnerAccess(userId, companyId, req.user?.email, req.user?.role);
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
    console.log('[AUDIT] full_submit_start', {
      debug_id: debugId,
      company_id: companyId,
      assessment_id: assessmentId,
      user_id: userId,
      status: assessment.status,
      segment,
    });

    // 1) Carregar catálogo (processos + perguntas obrigatórias)
    const { data: processesForSegment, error: procErr } = await supabase
      .schema('public')
      .from('full_process_catalog')
      .select('process_key')
      .eq('is_active', true)
      .contains('segment_applicability', [segment]);

    let processKeys = (!procErr && processesForSegment?.length)
      ? processesForSegment.map((p) => p.process_key)
      : [];
    if (processKeys.length === 0) {
      console.warn('[AUDIT] full_submit processKeys vazio segment=' + segment + ' usando fallback COMERCIAL,OPERACOES,ADM_FIN,GESTAO');
      processKeys = ['COMERCIAL', 'OPERACOES', 'ADM_FIN', 'GESTAO'];
    }

    const { data: requiredQuestions } = await supabase
      .schema('public')
      .from('full_question_catalog')
      .select('process_key, question_key')
      .in('process_key', processKeys)
      .eq('is_active', true);

    const requiredSet = new Set((requiredQuestions || []).map((q) => `${q.process_key}:${q.question_key}`));
    const totalExpected = requiredSet.size;

    // 2) Validar catálogo: cada processo deve ter ao menos 1 pergunta
    const questionsByProcess = {};
    (requiredQuestions || []).forEach((q) => {
      if (!questionsByProcess[q.process_key]) questionsByProcess[q.process_key] = [];
      questionsByProcess[q.process_key].push(q.question_key);
    });
    const processesWithoutQuestions = processKeys.filter((pk) => !questionsByProcess[pk]?.length);
    if (totalExpected === 0 || processesWithoutQuestions.length > 0) {
      console.error('[AUDIT] full_submit CATALOG_INVALID', {
        assessment_id: assessmentId,
        segment,
        process_keys: processKeys,
        total_expected: totalExpected,
        processes_without_questions: processesWithoutQuestions,
      });
      return apiError(res, 500, 'CATALOG_INVALID', 'Catálogo inconsistente. Contate o suporte.');
    }

    // 3) Carregar respostas e validar completude
    const { data: answers, error: ansErr } = await supabase
      .schema('public')
      .from('full_answers')
      .select('process_key, question_key, answer_value')
      .eq('assessment_id', assessmentId);

    if (ansErr) {
      console.error('Erro ao buscar respostas:', ansErr.message);
      return res.status(500).json({ error: 'erro ao calcular scores' });
    }

    const answered_count = (answers || []).length;
    const processes_answered = [...new Set((answers || []).map((a) => a.process_key))];
    const answeredSet = new Set((answers || []).map((a) => `${a.process_key}:${a.question_key}`));
    const missing = [...requiredSet].filter((k) => !answeredSet.has(k));

    const allProcessesAnswered = processKeys.every((pk) => processes_answered.includes(pk));
    const answeredCountOk = answered_count >= totalExpected;

    if (missing.length > 0 || !answers || answers.length === 0 || !allProcessesAnswered || !answeredCountOk) {
      const missingByProcess = {};
      const keysToUse = missing.length > 0 ? missing : [...requiredSet];
      for (const k of keysToUse) {
        const [pk, qk] = String(k).split(':');
        if (pk && qk) {
          if (!missingByProcess[pk]) missingByProcess[pk] = [];
          missingByProcess[pk].push(qk);
        }
      }
      const missing_process_keys = [...new Set(
        Object.keys(missingByProcess).length > 0 ? Object.keys(missingByProcess) : processKeys.filter((pk) => !processes_answered.includes(pk))
      )].sort();
      const missingPayload = Object.entries(missingByProcess).map(([process_key, missing_question_keys]) => ({
        process_key,
        missing_question_keys: [...new Set(missing_question_keys)].sort(),
      }));
      if (missingPayload.length === 0 && missing_process_keys.length > 0) {
        missing_process_keys.forEach((pk) => {
          missingPayload.push({ process_key: pk, missing_question_keys: (questionsByProcess[pk] || []).sort() });
        });
      }
      const firstMissingLabel = PROCESS_OWNER_LABEL[missing_process_keys[0]] || missing_process_keys[0];
      const message_user = missing_process_keys.length === 1
        ? `Faltam respostas. Complete o processo ${firstMissingLabel}.`
        : `Faltam respostas. Complete os processos: ${missing_process_keys.map((pk) => PROCESS_OWNER_LABEL[pk] || pk).join(', ')}.`;

      console.log('[AUDIT] full_submit_incomplete', {
        assessment_id: assessmentId,
        missing_process_keys,
        answered_count,
        total_expected: totalExpected,
      });

      return apiError(res, 400, 'DIAG_INCOMPLETE', message_user, {
        missing: missingPayload,
        missing_process_keys,
        answered_count,
        total_expected: totalExpected,
      });
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
      console.error('[AUDIT] full_submit_scoring_fail', { debug_id: debugId, assessment_id: assessmentId, error: insertErr.message });
      return res.status(500).json({ error: 'erro ao calcular scores' });
    }
    console.log('[AUDIT] full_submit_scoring_ok', {
      debug_id: debugId,
      assessment_id: assessmentId,
      scores_count: scoresToInsert.length,
      process_keys: scoresToInsert.map((s) => s.process_key),
    });

    // Calcular próxima assessment_version
    const { data: maxVerRow } = await supabase
      .schema('public')
      .from('full_assessments')
      .select('assessment_version')
      .eq('company_id', companyId)
      .in('status', ['SUBMITTED', 'CLOSED'])
      .order('assessment_version', { ascending: false })
      .limit(1)
      .maybeSingle();
    const newAssessmentVersion = (maxVerRow?.assessment_version ?? 0) + 1;

    const { error: updErr } = await supabase
      .schema('public')
      .from('full_assessments')
      .update({
        status: 'SUBMITTED',
        assessment_version: newAssessmentVersion,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', assessmentId);

    if (updErr) {
      console.error('Erro ao atualizar status:', updErr.message);
      return apiError(res, 500, 'SUBMIT_ERROR', 'Erro ao enviar diagnóstico. Tente novamente.');
    }

    // Criar gap_instances para processos LOW
    try {
      const toInsert = [];
      for (const s of scoresToInsert) {
        if (s.band !== 'LOW') continue;
        const gapId = PROCESS_BAND_TO_GAP[s.process_key];
        if (!gapId) continue;
        toInsert.push({
          assessment_id: assessmentId,
          company_id: companyId,
          gap_id: gapId,
          process_key: s.process_key,
          source: 'submit',
          status: 'CAUSE_PENDING',
        });
      }
      if (toInsert.length > 0) {
        const { error: giErr } = await supabase
          .schema('public')
          .from('full_gap_instances')
          .upsert(toInsert, { onConflict: 'assessment_id,gap_id', ignoreDuplicates: false });
        if (giErr) console.warn('[AUDIT] full_submit gap_instances skip:', giErr.message);
        else console.log('[AUDIT] full_submit_gaps_ok', { debug_id: debugId, assessment_id: assessmentId, gap_count: toInsert.length });
      } else {
        console.log('[AUDIT] full_submit_gaps_ok', { debug_id: debugId, assessment_id: assessmentId, gap_count: 0 });
      }
    } catch (giEx) {
      console.warn('[AUDIT] full_submit gap_instances skip:', giEx.message);
    }

    // Motor de Causa: avaliar gaps MVP
    try {
      const { loadCauseCatalog, scoreCause, persistGapCause, getCauseAnswersByGap } = require('../../lib/causeEngine');
      const { emitValueEvent } = require('../../lib/fullValueEvents');
      const catalog = loadCauseCatalog();
      for (const gapId of CAUSE_ENGINE_GAP_IDS) {
        const gapDef = (catalog.gaps || []).find((g) => g.gap_id === gapId);
        if (!gapDef) continue;
        const answersByQid = await getCauseAnswersByGap(assessmentId, gapId);
        const requiredQids = (gapDef.cause_questions || []).map((q) => q.q_id);
        const missing = requiredQids.filter((qid) => !answersByQid[qid] || answersByQid[qid] === '');
        if (missing.length === 0) {
          const result = scoreCause(gapDef, answersByQid);
          await persistGapCause({ companyId, assessmentId, gapId, result, version: catalog.version || '1.0.0' });
          if (result.primary && result.primary !== 'UNKNOWN') {
            emitValueEvent('CAUSE_CLASSIFIED', { assessment_id: assessmentId, company_id: companyId, meta: { gap_id: gapId, cause_primary: result.primary } });
          }
        }
      }
    } catch (causeErr) {
      console.warn('[AUDIT] full_submit cause_eval skip:', causeErr.message);
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

    let findingsResult;
    try {
      findingsResult = await buildAndPersistFindings({
        assessmentId,
        companyId,
        segment,
        scores: scoresToInsert,
        answers,
        processCatalog: processCatalog || [],
        questionCatalogTex: questionCatalogTex || []
      });
    } catch (findingsErr) {
      const step = 'generate_findings';
      console.error('[AUDIT] full_submit_findings_fail', {
        debug_id: debugId,
        company_id: companyId,
        assessment_id: assessmentId,
        user_id: userId,
        step,
        error_message: findingsErr?.message || String(findingsErr),
        stack: findingsErr?.stack,
      });
      return res.status(500).json({
        code: 'FINDINGS_FAILED',
        error: 'Falha ao concluir diagnóstico. Tente novamente.',
        message_user: 'Falha ao concluir diagnóstico. Tente novamente.',
        debug_id: debugId,
      });
    }

    if (findingsResult.error) {
      const step = findingsResult.step || 'unknown';
      const errMsg = findingsResult.error?.message || String(findingsResult.error);
      console.error('[AUDIT] full_submit_findings_fail', {
        debug_id: debugId,
        company_id: companyId,
        assessment_id: assessmentId,
        user_id: userId,
        step,
        answered_count: answers?.length,
        process_keys: scoresToInsert?.map((s) => s.process_key),
        segment,
        scores_count: scoresToInsert?.length,
        error_message: errMsg,
        stack: findingsResult.error?.stack,
      });
      return res.status(500).json({
        code: 'FINDINGS_FAILED',
        error: 'Falha ao concluir diagnóstico. Tente novamente.',
        message_user: 'Falha ao concluir diagnóstico. Tente novamente.',
        debug_id: debugId,
      });
    }

    if (findingsResult.hadGap) {
      console.warn('[AUDIT] full_submit findings_gap assessment_id=' + assessmentId);
    }

    const { persistSnapshotOnSubmit } = require('../../lib/fullSnapshot');
    await persistSnapshotOnSubmit(assessmentId, companyId, segment, scoresToInsert, findingsResult.findings, getAssessmentById);

    console.log('[AUDIT] full_submit assessment_id=' + assessmentId + ' status=SUBMITTED');

    return res.status(200).json({
      ok: true,
      status: 'SUBMITTED',
      scores: scoresToInsert.map((s) => ({ ...s, score_numeric: toExternalScore(s.score_numeric) })),
      findings_count: findingsResult.findings.length
    });
  } catch (err) {
    console.error('Erro POST /full/assessments/:id/submit:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// GET /full/assessments/:id/results
router.get('/full/assessments/:id/results', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
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
router.get('/full/results', requireAuth, blockConsultorOnMutation, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.query.assessment_id;
    const companyId = req.query.company_id;
    if (!assessmentId) return res.status(400).json({ error: 'assessment_id é obrigatório' });

    const assessment = companyId
      ? await getAssessment(assessmentId, companyId)
      : await getAssessmentById(assessmentId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

    let sourceAssessment = assessment;
    if (assessment.status === 'DRAFT' && companyId) {
      const closed = await getLatestClosedAssessment(companyId);
      if (!closed) return apiError(res, 400, 'DIAG_NOT_READY', 'Conclua o diagnóstico para ver o resultado.');
      sourceAssessment = closed;
    } else if (assessment.status !== 'SUBMITTED' && assessment.status !== 'CLOSED') {
      return apiError(res, 400, 'DIAG_NOT_READY', 'Conclua o diagnóstico para ver o resultado.');
    }

    const access = await ensureConsultantOrOwnerAccess(userId, assessment.company_id, req.user?.email, req.user?.role);
    if (!access) return apiError(res, 403, 'ACCESS_DENIED', 'Sem acesso a este recurso.');

    let loaded = await loadFullResultsPayload(sourceAssessment.id);
    if (loaded.error) return apiError(res, 500, 'RESULTS_LOAD_ERROR', 'Erro ao carregar resultados. Tente novamente.');

    const hasFindings = (loaded.payload?.findings?.length ?? 0) > 0;
    const hasScores = (loaded.payload?.scores_by_process?.length ?? 0) > 0;
    if (!hasFindings && hasScores) {
      const segment = sourceAssessment.segment || assessment.segment || 'C';
      const scores = loaded.payload.scores_by_process;
      const processKeys = [...new Set(scores.map((s) => s.process_key))];

      const { data: answersRows } = await supabase
        .schema('public')
        .from('full_answers')
        .select('process_key, question_key, answer_value')
        .eq('assessment_id', sourceAssessment.id);
      const answers = (answersRows || []).map((a) => ({
        process_key: a.process_key,
        question_key: a.question_key,
        answer_value: a.answer_value,
      }));

      const { data: processCatalog } = await supabase
        .schema('public')
        .from('full_process_catalog')
        .select('process_key, protects_dimension, protects_text, owner_alert_text, typical_impact_band, typical_impact_text, quick_win')
        .in('process_key', processKeys);

      const { data: questionCatalogTex } = await supabase
        .schema('public')
        .from('full_question_catalog')
        .select('process_key, question_key, question_text, dimension')
        .in('process_key', processKeys)
        .eq('is_active', true);

      const findingsResult = await buildAndPersistFindings({
        assessmentId: sourceAssessment.id,
        companyId: companyId || assessment.company_id,
        segment,
        scores,
        answers,
        processCatalog: processCatalog || [],
        questionCatalogTex: questionCatalogTex || [],
      });
      if (!findingsResult.error) {
        console.log('[AUDIT] full_results findings_backfill assessment_id=' + sourceAssessment.id);
        loaded = await loadFullResultsPayload(sourceAssessment.id);
      } else {
        console.warn('[AUDIT] full_results findings_backfill_failed', {
          assessment_id: sourceAssessment.id,
          step: findingsResult.step,
          error: findingsResult.error?.message,
        });
      }
    }

    const stillEmpty = (loaded.payload?.six_pack?.vazamentos?.length ?? 0) === 0 && (loaded.payload?.six_pack?.alavancas?.length ?? 0) === 0;
    if (stillEmpty && (loaded.payload?.scores_by_process?.length ?? 0) > 0) {
      const scores = loaded.payload.scores_by_process;
      const processKeys = [...new Set(scores.map((s) => s.process_key))];
      const { data: processCatalog } = await supabase
        .schema('public')
        .from('full_process_catalog')
        .select('process_key, protects_dimension, owner_alert_text, typical_impact_band, typical_impact_text, quick_win')
        .in('process_key', processKeys);
      const derived = deriveSixPackFromScores(scores, processCatalog || []);
      if (derived.vazamentos.length > 0 || derived.alavancas.length > 0) {
        console.log('[AUDIT] full_results derived_six_pack_from_scores assessment_id=' + sourceAssessment.id);
        loaded.payload.six_pack = derived;
      }
    }

    return res.json(loaded.payload);
  } catch (err) {
    console.error('Erro GET /full/results:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

module.exports = router;
module.exports.loadFullResultsPayload = loadFullResultsPayload;
