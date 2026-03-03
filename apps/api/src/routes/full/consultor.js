/**
 * Rotas de consultor dentro do módulo FULL:
 *   GET  /full/consultor/assessments/:id
 *   POST /full/consultor/assessments/:id/actions/:action_key/notes
 *   GET  /full/assessments/:id/actions/:action_key/notes
 */
const express = require('express');
const router = express.Router();
const { supabase } = require('../../lib/supabase');
const { requireAuth } = require('../../middleware/requireAuth');
const { blockConsultorOnMutation } = require('../../middleware/requireRole');
const { ensureConsultantOrOwnerAccess } = require('../../lib/companyAccess');
const { apiError } = require('../../lib/fullHelpers');
const { getAssessment, getAssessmentById } = require('../../lib/repositories/fullAssessmentRepo');
const { loadFullResultsPayload } = require('./submit');

// GET /full/consultor/assessments/:id
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
    const access = await ensureConsultantOrOwnerAccess(userId, cid, req.user?.email, req.user?.role);
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
    const evMap = {};
    evidence.forEach((e) => { evMap[e.action_key] = e; });

    const { data: dodRows } = await supabase
      .schema('public')
      .from('full_action_dod_confirmations')
      .select('action_key')
      .eq('assessment_id', assessmentId)
      .in('action_key', actionKeys);
    const dodSet = new Set((dodRows || []).map((r) => r.action_key));

    const causeByActionKey = {};
    try {
      const { loadCauseCatalog } = require('../../lib/causeEngine');
      const causeCatalog = loadCauseCatalog();
      const causeById = {};
      (causeCatalog.cause_classes || []).forEach((c) => { causeById[c.id] = c; });
      const { data: gapCauses } = await supabase
        .schema('public')
        .from('full_gap_causes')
        .select('gap_id, cause_primary, evidence_json')
        .eq('assessment_id', assessmentId);
      for (const row of gapCauses || []) {
        const gapDef = (causeCatalog.gaps || []).find((g) => g.gap_id === row.gap_id);
        if (!gapDef || !row.cause_primary) continue;
        const causeLabel = causeById[row.cause_primary]?.label_cliente || row.cause_primary;
        const evidence = Array.isArray(row.evidence_json) ? row.evidence_json : [];
        const why = evidence.map((e) => ({ question_key: e.q_id, answer: e.answer, label: e.texto_cliente }));
        for (const act of gapDef.mechanism_actions || []) {
          if (act.action_key) causeByActionKey[act.action_key] = { cause_label: causeLabel, why };
        }
      }
    } catch (_) { /* ignore */ }

    const dashboard_actions = plan.map((p) => {
      const cat = catalogMap[p.action_key] || {};
      const ev = evMap[p.action_key];
      const causeData = causeByActionKey[p.action_key];
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
        cause_label: causeData?.cause_label ?? null,
        why: causeData?.why ?? null
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

    const access = await ensureConsultantOrOwnerAccess(userId, assessment.company_id, req.user?.email, req.user?.role);
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

// GET /full/assessments/:id/actions/:action_key/notes
router.get('/full/assessments/:id/actions/:action_key/notes', requireAuth, blockConsultorOnMutation, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const actionKey = decodeURIComponent(req.params.action_key || '');
    const companyId = req.query.company_id;

    const assessment = companyId ? await getAssessment(assessmentId, companyId) : await getAssessmentById(assessmentId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

    const cid = assessment.company_id;
    const access = await ensureConsultantOrOwnerAccess(userId, cid, req.user?.email, req.user?.role);
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
