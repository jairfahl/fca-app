/**
 * Rotas de encerramento de ciclo FULL:
 *   GET  /full/assessments/:id/close-summary
 *   POST /full/assessments/:id/close
 *   POST /full/assessments/:id/new-cycle
 */
const express = require('express');
const router = express.Router();
const { supabase } = require('../../lib/supabase');
const { requireAuth } = require('../../middleware/requireAuth');
const { requireFullEntitlement } = require('../../middleware/requireFullEntitlement');
const { blockConsultorOnMutation } = require('../../middleware/requireRole');
const { ensureCompanyAccess, ensureConsultantOrOwnerAccess } = require('../../lib/companyAccess');
const { apiError } = require('../../lib/fullHelpers');
const { getAssessment } = require('../../lib/repositories/fullAssessmentRepo');

// GET /full/assessments/:id/close-summary
router.get('/full/assessments/:id/close-summary', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
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

// POST /full/assessments/:id/close
router.post('/full/assessments/:id/close', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
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

    const now = new Date().toISOString();
    const { error: updErr } = await supabase
      .schema('public')
      .from('full_assessments')
      .update({ status: 'CLOSED', closed_at: now, updated_at: now })
      .eq('id', assessmentId);

    if (updErr) {
      console.error('Erro ao fechar ciclo:', updErr.message);
      return apiError(res, 500, 'CYCLE_CLOSE_ERROR', 'Erro ao fechar ciclo. Tente novamente.');
    }

    const { persistSnapshotOnClose } = require('../../lib/fullSnapshot');
    await persistSnapshotOnClose(assessmentId, companyId, plan);

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

// POST /full/assessments/:id/new-cycle
router.post('/full/assessments/:id/new-cycle', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const companyId = req.query.company_id || req.body.company_id;

    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');

    const company = await ensureConsultantOrOwnerAccess(userId, companyId, req.user?.email, req.user?.role);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

    if (assessment.status !== 'CLOSED') {
      return res.status(400).json({
        error: 'só é possível iniciar novo ciclo a partir de um assessment CLOSED',
        hint: 'Feche o ciclo atual primeiro (POST /full/assessments/:id/close)'
      });
    }

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

    const evMap = {};
    (evRows || []).forEach((e) => { evMap[e.action_key] = e; });

    const { data: maxCycle } = await supabase
      .schema('public')
      .from('full_cycle_history')
      .select('cycle_no')
      .eq('assessment_id', assessmentId)
      .order('cycle_no', { ascending: false })
      .limit(1)
      .maybeSingle();

    const cycleNo = (maxCycle?.cycle_no ?? 0) + 1;

    if (plan?.length) {
      const toArchive = plan.map((p) => ({
        assessment_id: assessmentId,
        cycle_no: cycleNo,
        action_key: p.action_key,
        process_key: p.process_key,
        position: p.position,
        status: p.status,
        owner_name: p.owner_name,
        metric_text: p.metric_text,
        checkpoint_date: p.checkpoint_date,
        dropped_reason: p.dropped_reason ?? null,
        declared_gain: evMap[p.action_key]?.declared_gain ?? null,
      }));
      const { error: archErr } = await supabase.schema('public').from('full_cycle_history').insert(toArchive);
      if (archErr) console.error('[new-cycle] Erro ao arquivar plano:', archErr.message);

      const { error: delErr } = await supabase
        .schema('public')
        .from('full_selected_actions')
        .delete()
        .eq('assessment_id', assessmentId);
      if (delErr) {
        console.error('[new-cycle] Erro ao limpar plano:', delErr.message);
        return apiError(res, 500, 'CYCLE_NEW_ERROR', 'Erro ao iniciar novo ciclo. Tente novamente.');
      }
    }

    const { error: updErr } = await supabase
      .schema('public')
      .from('full_assessments')
      .update({ status: 'SUBMITTED', updated_at: new Date().toISOString() })
      .eq('id', assessmentId);
    if (updErr) {
      console.error('[new-cycle] Erro ao reabrir assessment:', updErr.message);
      return apiError(res, 500, 'CYCLE_NEW_ERROR', 'Erro ao iniciar novo ciclo. Tente novamente.');
    }

    console.log('[AUDIT] full_new_cycle assessment_id=' + assessmentId + ' cycle_no=' + cycleNo);

    return res.status(200).json({ ok: true, assessment_id: assessmentId, cycle_no: cycleNo });
  } catch (err) {
    console.error('Erro POST /full/assessments/:id/new-cycle:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

module.exports = router;
