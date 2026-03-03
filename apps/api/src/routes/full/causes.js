/**
 * Rotas do Motor de Causa FULL:
 *   GET  /full/status
 *   GET  /full/cause/catalog
 *   GET  /full/cause/answers
 *   GET  /full/cause/result
 *   POST /full/cause/answer
 *   POST /full/cause/evaluate
 *   GET  /full/causes/pending
 *   POST /full/causes/answer
 *   GET  /full/causes
 */
const express = require('express');
const router = express.Router();
const { supabase } = require('../../lib/supabase');
const { requireAuth } = require('../../middleware/requireAuth');
const { requireFullEntitlement } = require('../../middleware/requireFullEntitlement');
const { blockConsultorOnMutation } = require('../../middleware/requireRole');
const { ensureCompanyAccess, ensureConsultantOrOwnerAccess } = require('../../lib/companyAccess');
const { logEvent } = require('../../lib/auditLog');
const { apiError } = require('../../lib/fullHelpers');
const { getAssessment } = require('../../lib/repositories/fullAssessmentRepo');
const { loadCauseCatalog, scoreCause, persistGapCause, getCauseAnswersByGap, getGapCause } = require('../../lib/causeEngine');
const { emitValueEvent } = require('../../lib/fullValueEvents');

const CAUSE_ENGINE_GAP_IDS = ['GAP_CAIXA_PREVISAO', 'GAP_VENDAS_FUNIL', 'GAP_ROTINA_GERENCIAL'];
const LIKERT_5_VALUES = ['DISCORDO_PLENAMENTE', 'DISCORDO', 'NEUTRO', 'CONCORDO', 'CONCORDO_PLENAMENTE'];

// GET /full/status?company_id=&assessment_id=
router.get('/full/status', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
  try {
    const assessmentId = req.query.assessment_id;
    const companyId = req.query.company_id;
    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada.');
    if (!assessmentId) return apiError(res, 400, 'ASSESSMENT_REQUIRED', 'Diagnóstico não informado.');

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
      status: assessment.status,
      answered_count: (answers || []).length,
      processes_answered: processesAnswered,
      last_saved_at: lastSaved ? new Date(lastSaved).toISOString() : null,
    });
  } catch (err) {
    console.error('Erro GET /full/status:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// GET /full/cause/catalog — catálogo de gaps e perguntas
router.get('/full/cause/catalog', requireAuth, blockConsultorOnMutation, async (req, res) => {
  try {
    const catalog = loadCauseCatalog();
    return res.json({
      version: catalog.version,
      cause_classes: catalog.cause_classes,
      gaps: catalog.gaps,
    });
  } catch (err) {
    console.error('Erro GET /full/cause/catalog:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro ao carregar catálogo.');
  }
});

// GET /full/cause/answers?company_id=&assessment_id=&gap_id=
router.get('/full/cause/answers', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
  try {
    const companyId = req.query.company_id;
    const assessmentId = req.query.assessment_id;
    const gapId = req.query.gap_id;
    if (!companyId || !assessmentId || !gapId) {
      return apiError(res, 400, 'PARAMS_REQUIRED', 'company_id, assessment_id e gap_id são obrigatórios.');
    }
    const company = await ensureConsultantOrOwnerAccess(req.user.id, companyId, req.user?.email, req.user?.role);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada.');
    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    const answersByQid = await getCauseAnswersByGap(assessmentId, gapId);
    return res.json({ answers: answersByQid });
  } catch (err) {
    console.error('Erro GET /full/cause/answers:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado.');
  }
});

// GET /full/cause/result?company_id=&assessment_id=&gap_id=
router.get('/full/cause/result', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
  try {
    const companyId = req.query.company_id;
    const assessmentId = req.query.assessment_id;
    const gapId = req.query.gap_id;
    if (!companyId || !assessmentId || !gapId) {
      return apiError(res, 400, 'PARAMS_REQUIRED', 'company_id, assessment_id e gap_id são obrigatórios.');
    }
    const company = await ensureConsultantOrOwnerAccess(req.user.id, companyId, req.user?.email, req.user?.role);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada.');
    const cause = await getGapCause(assessmentId, gapId);
    return res.json(cause || null);
  } catch (err) {
    console.error('Erro GET /full/cause/result:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado.');
  }
});

// POST /full/cause/answer?company_id=&assessment_id=&gap_id=
router.post('/full/cause/answer', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.query.company_id || req.body.company_id;
    const assessmentId = req.query.assessment_id || req.body.assessment_id;
    const gapId = req.query.gap_id || req.body.gap_id;
    const { q_id, answer } = req.body;

    if (!companyId || !assessmentId || !gapId) {
      return apiError(res, 400, 'PARAMS_REQUIRED', 'company_id, assessment_id e gap_id são obrigatórios.');
    }
    if (!q_id || !answer) {
      return apiError(res, 400, 'BODY_REQUIRED', 'q_id e answer são obrigatórios no body.');
    }
    if (!LIKERT_5_VALUES.includes(answer)) {
      return apiError(res, 400, 'INVALID_ANSWER', `answer deve ser um de: ${LIKERT_5_VALUES.join(', ')}`);
    }

    const company = await ensureConsultantOrOwnerAccess(userId, companyId, req.user?.email, req.user?.role);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada.');
    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    if (assessment.status !== 'DRAFT' && assessment.status !== 'SUBMITTED') {
      return apiError(res, 400, 'DIAG_ALREADY_SUBMITTED', 'Só é possível responder perguntas de causa em diagnóstico em andamento ou concluído.');
    }

    const { error } = await supabase
      .schema('public')
      .from('full_cause_answers')
      .upsert({
        company_id: companyId,
        assessment_id: assessmentId,
        gap_id: gapId,
        q_id,
        answer,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'assessment_id,gap_id,q_id' });

    if (error) {
      console.error('Erro POST /full/cause/answer:', error.message);
      return apiError(res, 500, 'INTERNAL_ERROR', 'Erro ao salvar resposta.');
    }

    return res.status(200).json({ ok: true, q_id, answer });
  } catch (err) {
    console.error('Erro POST /full/cause/answer:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// POST /full/cause/evaluate?company_id=&assessment_id=&gap_id=
router.post('/full/cause/evaluate', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.query.company_id || req.body.company_id;
    const assessmentId = req.query.assessment_id || req.body.assessment_id;
    const gapId = req.query.gap_id || req.body.gap_id;

    if (!companyId || !assessmentId || !gapId) {
      return apiError(res, 400, 'PARAMS_REQUIRED', 'company_id, assessment_id e gap_id são obrigatórios.');
    }

    const company = await ensureConsultantOrOwnerAccess(userId, companyId, req.user?.email, req.user?.role);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada.');
    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

    const catalog = loadCauseCatalog();
    const gapDef = (catalog.gaps || []).find((g) => g.gap_id === gapId);
    if (!gapDef) {
      return apiError(res, 400, 'GAP_NOT_FOUND', `Gap "${gapId}" não encontrado no catálogo.`);
    }

    const answersByQid = await getCauseAnswersByGap(assessmentId, gapId);
    const requiredQids = (gapDef.cause_questions || []).map((q) => q.q_id);
    const missing = requiredQids.filter((qid) => !answersByQid[qid] || answersByQid[qid] === '');

    if (missing.length > 0) {
      return apiError(res, 400, 'DIAG_INCOMPLETE', 'Responda todas as perguntas de causa antes de avaliar.', { missing });
    }

    const result = scoreCause(gapDef, answersByQid);
    await persistGapCause({
      companyId,
      assessmentId,
      gapId,
      result,
      version: catalog.version || '1.0.0',
    });

    if (result.primary && result.primary !== 'UNKNOWN') {
      logEvent(supabase, { event: 'cause_classified', userId, companyId, assessmentId, meta: { gap_id: gapId, cause_primary: result.primary } });
    }

    return res.json({
      gap_id: gapId,
      cause_primary: result.primary,
      cause_secondary: result.secondary,
      scores: result.scores,
      evidence: result.evidence,
    });
  } catch (err) {
    console.error('Erro POST /full/cause/evaluate:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// GET /full/causes/pending?assessment_id=&company_id=
router.get('/full/causes/pending', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.query.assessment_id;
    const companyId = req.query.company_id;
    if (!companyId || !assessmentId) {
      return apiError(res, 400, 'PARAMS_REQUIRED', 'assessment_id e company_id são obrigatórios.');
    }

    const company = await ensureConsultantOrOwnerAccess(userId, companyId, req.user?.email, req.user?.role);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada.');
    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    if (assessment.status !== 'SUBMITTED' && assessment.status !== 'CLOSED') {
      return apiError(res, 400, 'DIAG_NOT_READY', 'Conclua o diagnóstico para responder sobre causas.');
    }

    const { data: instances } = await supabase
      .schema('public')
      .from('full_gap_instances')
      .select('id, gap_id, process_key, status, detected_at')
      .eq('assessment_id', assessmentId)
      .eq('company_id', companyId)
      .eq('status', 'CAUSE_PENDING');

    if (!instances || instances.length === 0) {
      return res.json({ pending: [], assessment_id: assessmentId });
    }

    const catalog = loadCauseCatalog();
    const pending = [];
    for (const inst of instances) {
      const gapDef = (catalog.gaps || []).find((g) => g.gap_id === inst.gap_id);
      if (!gapDef) continue;
      pending.push({
        gap_instance_id: inst.id,
        gap_id: inst.gap_id,
        process_key: inst.process_key,
        titulo_cliente: gapDef.titulo_cliente,
        descricao_cliente: gapDef.descricao_cliente,
        cause_questions: gapDef.cause_questions || [],
      });
    }

    console.log('[AUDIT] full_causes_pending assessment_id=' + assessmentId + ' count=' + pending.length);
    return res.json({ pending, assessment_id: assessmentId });
  } catch (err) {
    console.error('Erro GET /full/causes/pending:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado.');
  }
});

// POST /full/causes/answer
router.post('/full/causes/answer', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.query.company_id || req.body.company_id;
    const assessmentId = req.query.assessment_id || req.body.assessment_id;
    const { gap_id: gapId, answers } = req.body;

    if (!companyId || !assessmentId || !gapId) {
      return apiError(res, 400, 'PARAMS_REQUIRED', 'company_id, assessment_id e gap_id são obrigatórios.');
    }
    if (!Array.isArray(answers) || answers.length === 0) {
      return apiError(res, 400, 'BODY_REQUIRED', 'answers (array de {q_id, answer}) é obrigatório.');
    }

    const company = await ensureConsultantOrOwnerAccess(userId, companyId, req.user?.email, req.user?.role);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada.');
    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

    const { data: instance } = await supabase
      .schema('public')
      .from('full_gap_instances')
      .select('id, status')
      .eq('assessment_id', assessmentId)
      .eq('gap_id', gapId)
      .maybeSingle();

    if (!instance || instance.status !== 'CAUSE_PENDING') {
      return apiError(res, 400, 'GAP_NOT_PENDING', 'Só é possível responder causa para gaps pendentes.');
    }

    const answersByQid = {};
    for (const a of answers) {
      if (!a.q_id || !a.answer) continue;
      if (!LIKERT_5_VALUES.includes(a.answer)) {
        return apiError(res, 400, 'INVALID_ANSWER', `answer deve ser um de: ${LIKERT_5_VALUES.join(', ')}`);
      }
      answersByQid[a.q_id] = a.answer;
    }

    const catalog = loadCauseCatalog();
    const gapDef = (catalog.gaps || []).find((g) => g.gap_id === gapId);
    if (!gapDef) return apiError(res, 400, 'GAP_NOT_FOUND', 'Gap não encontrado no catálogo.');

    const requiredQids = (gapDef.cause_questions || []).map((q) => q.q_id);
    const missing = requiredQids.filter((qid) => !answersByQid[qid] || answersByQid[qid] === '');
    if (missing.length > 0) {
      return apiError(res, 400, 'DIAG_INCOMPLETE', 'Responda todas as perguntas de causa antes de avaliar.', { missing });
    }

    for (const [qId, answer] of Object.entries(answersByQid)) {
      const { error } = await supabase.schema('public').from('full_cause_answers').upsert({
        company_id: companyId,
        assessment_id: assessmentId,
        gap_id: gapId,
        q_id: qId,
        answer,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'assessment_id,gap_id,q_id' });
      if (error) {
        console.error('Erro ao salvar resposta causa:', error.message);
        return apiError(res, 500, 'INTERNAL_ERROR', 'Erro ao salvar respostas.');
      }
    }

    const result = scoreCause(gapDef, answersByQid);
    await persistGapCause({ companyId, assessmentId, gapId, result, version: catalog.version || '1.0.0' });

    if (result.primary && result.primary !== 'UNKNOWN') {
      emitValueEvent('CAUSE_CLASSIFIED', { assessment_id: assessmentId, company_id: companyId, meta: { gap_id: gapId, cause_primary: result.primary } });
      logEvent(supabase, { event: 'cause_classified', userId, companyId, assessmentId, meta: { gap_id: gapId, cause_primary: result.primary } });
    }

    const { error: updErr } = await supabase
      .schema('public')
      .from('full_gap_instances')
      .update({ status: 'CAUSE_CLASSIFIED' })
      .eq('assessment_id', assessmentId)
      .eq('company_id', companyId)
      .eq('gap_id', gapId);

    if (updErr) {
      console.error('[AUDIT] full_causes_answer gap_instance_update_fail', { assessment_id: assessmentId, gap_id: gapId, error: updErr.message });
      return apiError(res, 500, 'INTERNAL_ERROR', 'Erro ao registrar causa. Tente novamente.');
    }

    const causeLabel = (catalog.cause_classes || []).find((c) => c.id === result.primary)?.label_cliente || result.primary;
    console.log('[AUDIT] full_causes_answer assessment_id=' + assessmentId + ' gap_id=' + gapId + ' cause=' + result.primary);

    return res.status(200).json({
      gap_id: gapId,
      cause_primary: result.primary,
      cause_label: causeLabel,
      cause_secondary: result.secondary,
      evidence: result.evidence,
    });
  } catch (err) {
    console.error('Erro POST /full/causes/answer:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// GET /full/causes?assessment_id=&company_id=
router.get('/full/causes', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.query.assessment_id;
    const companyId = req.query.company_id;
    if (!companyId || !assessmentId) {
      return apiError(res, 400, 'PARAMS_REQUIRED', 'assessment_id e company_id são obrigatórios.');
    }

    const company = await ensureConsultantOrOwnerAccess(userId, companyId, req.user?.email, req.user?.role);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada.');
    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

    const { data: rows } = await supabase
      .schema('public')
      .from('full_gap_causes')
      .select('gap_id, cause_primary, cause_secondary, evidence_json, version')
      .eq('assessment_id', assessmentId);

    const catalog = loadCauseCatalog();
    const causeById = {};
    (catalog.cause_classes || []).forEach((c) => { causeById[c.id] = c; });

    const classifications = (rows || []).map((r) => ({
      gap_id: r.gap_id,
      cause_primary: r.cause_primary,
      cause_label: causeById[r.cause_primary]?.label_cliente || r.cause_primary,
      cause_secondary: r.cause_secondary,
      evidence: Array.isArray(r.evidence_json) ? r.evidence_json : [],
      version: r.version,
    }));

    return res.json({ classifications, assessment_id: assessmentId });
  } catch (err) {
    console.error('Erro GET /full/causes:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado.');
  }
});

module.exports = router;
