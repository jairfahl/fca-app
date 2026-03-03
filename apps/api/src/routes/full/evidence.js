/**
 * Rotas de evidência FULL:
 *   POST /full/assessments/:id/plan/:action_key/evidence
 *   POST /full/cycle/actions/:id/evidence
 *   POST /full/cycle/actions/:id/mark-done
 *   POST /full/actions/:action_key/evidence
 */
const express = require('express');
const router = express.Router();
const { supabase } = require('../../lib/supabase');
const { requireAuth } = require('../../middleware/requireAuth');
const { requireFullEntitlement } = require('../../middleware/requireFullEntitlement');
const { blockConsultorOnMutation } = require('../../middleware/requireRole');
const { ensureCompanyAccess } = require('../../lib/companyAccess');
const { logEvent } = require('../../lib/auditLog');
const { apiError, cycleClosed, buildDeclaredGain } = require('../../lib/fullHelpers');
const { getAssessment, getAssessmentById } = require('../../lib/repositories/fullAssessmentRepo');

// POST /full/assessments/:id/plan/:action_key/evidence — write-once
router.post('/full/assessments/:id/plan/:action_key/evidence', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
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
      return apiError(res, 409, 'EVIDENCE_WRITE_ONCE', 'Evidência já registrada. Não é possível editar.');
    }

    const declared_gain = buildDeclaredGain(beforeStr, afterStr);

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
        return apiError(res, 409, 'EVIDENCE_WRITE_ONCE', 'Evidência já registrada. Não é possível editar.');
      }
      console.error('Erro ao salvar evidência:', insErr.message);
      return apiError(res, 500, 'EVIDENCE_SAVE_ERROR', 'Erro ao registrar evidência. Tente novamente.');
    }

    const { emitValueEvent } = require('../../lib/fullValueEvents');
    emitValueEvent('GAIN_DECLARED', { assessment_id: assessmentId, company_id: companyId, meta: { action_key: actionKey } });
    logEvent(supabase, { event: 'evidence_recorded', userId, companyId, assessmentId, meta: { action_key: actionKey } });
    logEvent(supabase, { event: 'gain_declared', userId, companyId, assessmentId, meta: { action_key: actionKey, declared_gain: declared_gain } });

    return res.status(201).json({ evidence: created });
  } catch (err) {
    console.error('Erro POST evidence:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// POST /full/cycle/actions/:id/evidence (write-once)
router.post('/full/cycle/actions/:id/evidence', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
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
    if (existing) return apiError(res, 409, 'EVIDENCE_WRITE_ONCE', 'Evidência já registrada. Não é possível editar.');

    const beforeStr = String(beforeText || '').trim();
    const afterStr = String(afterText || '').trim();
    const declaredGain = buildDeclaredGain(beforeStr, afterStr);
    const { data: created, error: insErr } = await supabase
      .schema('public')
      .from('full_action_evidence')
      .insert({
        assessment_id: assessmentId,
        action_key: actionKey,
        evidence_text: String(evidenceText),
        before_baseline: beforeStr,
        after_result: afterStr,
        declared_gain: declaredGain,
      })
      .select()
      .single();
    if (insErr) return res.status(500).json({ error: 'erro ao registrar evidência' });

    const { emitValueEvent } = require('../../lib/fullValueEvents');
    emitValueEvent('GAIN_DECLARED', { assessment_id: assessmentId, company_id: existingAssessment.company_id, meta: { action_key: actionKey } });

    return res.status(201).json({ evidence: created });
  } catch (err) {
    console.error('Erro POST /full/cycle/actions/:id/evidence:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// POST /full/cycle/actions/:id/mark-done
router.post('/full/cycle/actions/:id/mark-done', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
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
    let expected = Array.isArray(cat?.dod_checklist) ? cat.dod_checklist : [];
    if (expected.length === 0) {
      const { getActionEntryFromCatalog } = require('../../lib/fullCatalog');
      const fromCatalog = getActionEntryFromCatalog(actionKey);
      if (fromCatalog?.dod_checklist?.length) expected = fromCatalog.dod_checklist;
    }
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

// POST /full/actions/:action_key/evidence (write-once) — aceita evidência, antes, depois
router.post('/full/actions/:action_key/evidence', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
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

  if (existing) return apiError(res, 409, 'EVIDENCE_WRITE_ONCE', 'Evidência já registrada. Não é possível editar.');

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
  logEvent(supabase, { event: 'evidence_recorded', userId: req.user.id, companyId, assessmentId, meta: { action_key: actionKey } });
  logEvent(supabase, { event: 'gain_declared', userId: req.user.id, companyId, assessmentId, meta: { action_key: actionKey, declared_gain: ganhoDeclarado } });
  return res.status(201).json({ evidence: created, ganho_declarado: ganhoDeclarado });
});

module.exports = router;
