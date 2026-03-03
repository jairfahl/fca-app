/**
 * Rotas de dashboard FULL:
 *   GET /full/assessments/:id/dashboard
 *   GET /full/dashboard (legacy redirect)
 */
const express = require('express');
const router = express.Router();
const { supabase } = require('../../lib/supabase');
const { requireAuth } = require('../../middleware/requireAuth');
const { requireFullEntitlement } = require('../../middleware/requireFullEntitlement');
const { blockConsultorOnMutation } = require('../../middleware/requireRole');
const { ensureCompanyAccess } = require('../../lib/companyAccess');
const { apiError } = require('../../lib/fullHelpers');
const { getAssessment } = require('../../lib/repositories/fullAssessmentRepo');

// GET /full/assessments/:id/dashboard
router.get('/full/assessments/:id/dashboard', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
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
        assessment_id: assessmentId,
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
    const { getActionEntryFromCatalog } = require('../../lib/fullCatalog');
    const DEFAULT_DOD_CHECKLIST = ['Definir escopo', 'Executar conforme contexto', 'Documentar resultado'];
    for (const ak of actionKeys) {
      if (!catalogMap[ak]) {
        const fromCatalog = getActionEntryFromCatalog(ak);
        if (fromCatalog) catalogMap[ak] = { action_key: ak, title: fromCatalog.title, dod_checklist: fromCatalog.dod_checklist };
      }
    }
    const missingDod = actionKeys.filter((ak) => {
      const c = catalogMap[ak] || {};
      return !(c.dod_checklist && Array.isArray(c.dod_checklist) && c.dod_checklist.length > 0);
    });
    if (missingDod.length > 0) {
      const { data: mechRows } = await supabase
        .schema('public')
        .from('full_cause_mechanism_actions')
        .select('action_key, primeiro_passo_30d')
        .in('action_key', missingDod)
        .eq('is_active', true);
      for (const row of mechRows || []) {
        if (row.primeiro_passo_30d && (!catalogMap[row.action_key] || !catalogMap[row.action_key].dod_checklist?.length)) {
          if (!catalogMap[row.action_key]) catalogMap[row.action_key] = { action_key: row.action_key };
          catalogMap[row.action_key].dod_checklist = [row.primeiro_passo_30d];
        }
      }
      for (const ak of missingDod) {
        const c = catalogMap[ak] || {};
        if (!(c.dod_checklist && c.dod_checklist.length > 0)) {
          if (!catalogMap[ak]) catalogMap[ak] = { action_key: ak };
          catalogMap[ak].dod_checklist = DEFAULT_DOD_CHECKLIST;
        }
      }
    }
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

    const causeByActionKey = {};
    try {
      const { loadCauseCatalog } = require('../../lib/causeEngine');
      const catalog = loadCauseCatalog();
      const causeById = {};
      (catalog.cause_classes || []).forEach((c) => { causeById[c.id] = c; });
      const { data: gapCauses } = await supabase
        .schema('public')
        .from('full_gap_causes')
        .select('gap_id, cause_primary, evidence_json')
        .eq('assessment_id', assessmentId);
      for (const row of gapCauses || []) {
        const gapDef = (catalog.gaps || []).find((g) => g.gap_id === row.gap_id);
        if (!gapDef || !row.cause_primary) continue;
        const causeLabel = causeById[row.cause_primary]?.label_cliente || row.cause_primary;
        const evidence = Array.isArray(row.evidence_json) ? row.evidence_json : [];
        const why = evidence.map((e) => ({ question_key: e.q_id, answer: e.answer, label: e.texto_cliente }));
        for (const act of gapDef.mechanism_actions || []) {
          if (act.action_key) causeByActionKey[act.action_key] = { cause_label: causeLabel, why };
        }
      }
    } catch (_) { /* ignore */ }

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

      const causeData = causeByActionKey[p.action_key];
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
        consultant_notes: notesByAction[p.action_key] || [],
        cause_label: causeData?.cause_label ?? null,
        why: causeData?.why ?? null
      };
    });

    return res.json({
      assessment_id: assessmentId,
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

// GET /full/dashboard?assessment_id=...&company_id=... (legacy redirect)
router.get('/full/dashboard', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
  const assessmentId = req.query.assessment_id;
  const companyId = req.query.company_id;
  if (!assessmentId) return res.status(400).json({ error: 'assessment_id é obrigatório' });
  if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
  return res.redirect(307, `/full/assessments/${assessmentId}/dashboard?company_id=${companyId}`);
});

module.exports = router;
