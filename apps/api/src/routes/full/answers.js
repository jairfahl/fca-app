/**
 * Rotas de respostas FULL:
 *   PUT  /full/assessments/:id/answers
 *   POST /full/assessments/:id/answers
 *   GET  /full/answers (legacy redirect)
 *   GET  /full/assessments/:id/answers
 */
const express = require('express');
const router = express.Router();
const { supabase } = require('../../lib/supabase');
const { requireAuth } = require('../../middleware/requireAuth');
const { requireFullEntitlement } = require('../../middleware/requireFullEntitlement');
const { blockConsultorOnMutation } = require('../../middleware/requireRole');
const { ensureConsultantOrOwnerAccess } = require('../../lib/companyAccess');
const { apiError } = require('../../lib/fullHelpers');
const { getAssessment } = require('../../lib/repositories/fullAssessmentRepo');

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

    const company = await ensureConsultantOrOwnerAccess(userId, companyId, req.user?.email, req.user?.role);
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

    const first = rows[0];
    const processQ = first ? ` process=${first.process_key} q=${first.question_key}` : '';
    console.log('[AUDIT] full_answer_upsert assessment_id=' + assessmentId + ' user=' + userId + ' company=' + companyId + ' count=' + rows.length + processQ);

    return res.status(200).json({ ok: true, count: rows.length });
  } catch (err) {
    console.error('Erro answers upsert:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
}

router.put('/full/assessments/:id/answers', requireAuth, blockConsultorOnMutation, requireFullEntitlement, handleAnswersUpsert);
router.post('/full/assessments/:id/answers', requireAuth, blockConsultorOnMutation, requireFullEntitlement, handleAnswersUpsert);

async function handleGetAnswers(req, res) {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id || req.query.assessment_id;
    const companyId = req.query.company_id;
    const processKey = req.query.process_key;

    if (!assessmentId || !companyId) {
      return apiError(res, 400, 'PARAMS_REQUIRED', 'assessment_id e company_id são obrigatórios.');
    }

    const company = await ensureConsultantOrOwnerAccess(userId, companyId, req.user?.email, req.user?.role);
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

    const count = (data || []).length;
    console.log('[AUDIT] full_answers_load assessment_id=' + assessmentId + ' count=' + count);

    return res.json({ answers: data || [], count });
  } catch (err) {
    console.error('Erro GET full answers:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
}

router.get('/full/answers', requireAuth, blockConsultorOnMutation, requireFullEntitlement, (req, res) => {
  req.params = { ...req.params, id: req.query.assessment_id };
  return handleGetAnswers(req, res);
});

router.get('/full/assessments/:id/answers', requireAuth, blockConsultorOnMutation, requireFullEntitlement, handleGetAnswers);

module.exports = router;
