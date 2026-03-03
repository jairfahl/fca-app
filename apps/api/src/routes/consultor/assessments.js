const express = require('express');
const router = express.Router();
const { supabase, logConsultorError } = require('./shared');

// GET /consultor/light/:assessment_id?company_id= — LIGHT completo em modo leitura
router.get('/light/:assessment_id', async (req, res) => {
  try {
    const assessmentId = req.params.assessment_id;
    const companyId = req.query.company_id;

    const { data: assessment, error: aErr } = await supabase
      .schema('public')
      .from('assessments')
      .select('*')
      .eq('id', assessmentId)
      .eq('type', 'LIGHT')
      .maybeSingle();

    if (aErr || !assessment) return res.status(404).json({ error: 'Diagnóstico LIGHT não encontrado' });
    if (companyId && assessment.company_id !== companyId) return res.status(403).json({ error: 'Company não confere' });

    const { data: items } = await supabase.from('assessment_items').select('*').eq('assessment_id', assessmentId);
    const { data: scores } = await supabase.from('scores').select('*').eq('assessment_id', assessmentId).maybeSingle();

    return res.json({
      assessment,
      items: items || [],
      scores: scores || null,
      read_only: true,
    });
  } catch (err) {
    console.error('Erro GET /consultor/light/:assessment_id:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

// GET /consultor/full/:assessment_id?company_id= — FULL completo em modo leitura
// Usa o mesmo contrato que GET /full/consultor/assessments/:id (frontend pode usar qualquer um)
router.get('/full/:assessment_id', async (req, res) => {
  try {
    const assessmentId = req.params.assessment_id;
    const companyId = req.query.company_id;
    const { ensureConsultantOrOwnerAccess } = require('../../lib/companyAccess');

    let assessQuery = supabase.schema('public').from('full_assessments').select('*').eq('id', assessmentId);
    if (companyId) assessQuery = assessQuery.eq('company_id', companyId);
    const { data: row, error: assessErr } = await assessQuery.maybeSingle();

    if (assessErr || !row) return res.status(404).json({ error: 'Diagnóstico FULL não encontrado' });

    const access = await ensureConsultantOrOwnerAccess(req.user.id, row.company_id, req.user?.email, req.user?.role);
    if (!access) return res.status(403).json({ error: 'Sem acesso' });

    const [answersRes, scoresRes, planRes, evRes] = await Promise.all([
      supabase.schema('public').from('full_answers').select('*').eq('assessment_id', assessmentId),
      supabase.schema('public').from('full_process_scores').select('*').eq('assessment_id', assessmentId),
      supabase.schema('public').from('full_selected_actions').select('*').eq('assessment_id', assessmentId).order('position'),
      supabase.schema('public').from('full_action_evidence').select('*').eq('assessment_id', assessmentId),
    ]);

    const answers = answersRes.data || [];
    const scores = scoresRes.data || [];
    const plan = planRes.data || [];
    const evidence = evRes.data || [];

    const { data: companyRow } = await supabase.schema('public').from('companies').select('name, trade_name').eq('id', row.company_id).maybeSingle();
    const companyName = companyRow?.trade_name || companyRow?.name || null;

    return res.json({
      assessment: { id: row.id, company_id: row.company_id, company_name: companyName, segment: row.segment, status: row.status },
      answers,
      scores,
      plan,
      evidence,
      read_only: true,
    });
  } catch (err) {
    console.error('Erro GET /consultor/full/:assessment_id:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

// GET /consultor/assessments?company_id= — lista LIGHT + FULL: status, answered_count, last_saved_at, cycle_index
router.get('/assessments', async (req, res) => {
  try {
    const companyId = req.query.company_id;
    if (!companyId || typeof companyId !== 'string' || companyId.trim().length === 0) {
      return res.status(400).json({ error: 'company_id é obrigatório' });
    }

    const { data: company, error: cErr } = await supabase
      .schema('public')
      .from('companies')
      .select('id')
      .eq('id', companyId)
      .maybeSingle();

    if (cErr || !company) return res.status(404).json({ error: 'Empresa não encontrada' });

    const [lightRes, fullRes] = await Promise.all([
      supabase
        .schema('public')
        .from('assessments')
        .select('id, status, created_at, completed_at')
        .eq('company_id', companyId)
        .eq('type', 'LIGHT')
        .order('created_at', { ascending: false }),
      supabase
        .schema('public')
        .from('full_assessments')
        .select('id, status, created_at, submitted_at, closed_at, full_version')
        .eq('company_id', companyId)
        .order('full_version', { ascending: false }),
    ]);

    const lightIds = (lightRes.data || []).map((a) => a.id);
    let itemsCountByAssessment = {};
    if (lightIds.length > 0) {
      const { data: allItems } = await supabase
        .schema('public')
        .from('assessment_items')
        .select('assessment_id')
        .in('assessment_id', lightIds);
      (allItems || []).forEach((i) => {
        itemsCountByAssessment[i.assessment_id] = (itemsCountByAssessment[i.assessment_id] || 0) + 1;
      });
    }

    const lightList = (lightRes.data || []).map((a) => ({
      id: a.id,
      type: 'LIGHT',
      status: a.status,
      answered_count: itemsCountByAssessment[a.id] || 0,
      last_saved_at: a.completed_at || a.created_at,
      cycle_index: null,
    }));

    const fullIds = (fullRes.data || []).map((a) => a.id);
    let answersCountByAssessment = {};
    if (fullIds.length > 0) {
      const { data: allAnswers } = await supabase
        .schema('public')
        .from('full_answers')
        .select('assessment_id')
        .in('assessment_id', fullIds);
      (allAnswers || []).forEach((r) => {
        answersCountByAssessment[r.assessment_id] = (answersCountByAssessment[r.assessment_id] || 0) + 1;
      });
    }

    const fullList = (fullRes.data || []).map((a) => ({
      id: a.id,
      type: 'FULL',
      status: a.status,
      answered_count: answersCountByAssessment[a.id] || 0,
      last_saved_at: a.submitted_at || a.closed_at || a.created_at,
      cycle_index: a.full_version,
    }));

    return res.json({
      company_id: companyId,
      light: lightList,
      full: fullList,
    });
  } catch (err) {
    console.error('Erro GET /consultor/assessments:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

// GET /consultor/assessment/:assessment_id/summary — resumo: scores/gaps, causas (FULL), recomendações, plano, ações, evidências, ganhos
router.get('/assessment/:assessment_id/summary', async (req, res) => {
  try {
    const assessmentId = req.params.assessment_id;
    const companyId = req.query.company_id;

    // Tentar FULL primeiro
    let fullQuery = supabase.schema('public').from('full_assessments').select('*').eq('id', assessmentId);
    if (companyId) fullQuery = fullQuery.eq('company_id', companyId);
    const { data: fullRow, error: fullErr } = await fullQuery.maybeSingle();

    if (!fullErr && fullRow) {
      const [snapshotRes, scoresRes, planRes, evidenceRes, causesRes] = await Promise.all([
        supabase.schema('public').from('full_diagnostic_snapshot').select('*').eq('full_assessment_id', assessmentId).maybeSingle(),
        supabase.schema('public').from('full_process_scores').select('process_key, band, score_numeric').eq('assessment_id', assessmentId),
        supabase.schema('public').from('full_selected_actions').select('*').eq('assessment_id', assessmentId).order('position'),
        supabase.schema('public').from('full_action_evidence').select('*').eq('assessment_id', assessmentId),
        supabase.schema('public').from('full_gap_causes').select('gap_id, cause_primary, evidence_json').eq('assessment_id', assessmentId),
      ]);

      const snapshot = snapshotRes.data;
      const scores = scoresRes.data || [];
      const plan = planRes.data || [];
      const evidence = evidenceRes.data || [];
      const causes = causesRes.data || [];

      return res.json({
        type: 'FULL',
        assessment_id: assessmentId,
        company_id: fullRow.company_id,
        status: fullRow.status,
        scores: scores.map((s) => ({ process_key: s.process_key, band: s.band, score_numeric: s.score_numeric })),
        gaps: snapshot?.processes || [],
        causas: causes.map((c) => ({ gap_id: c.gap_id, cause_primary: c.cause_primary })),
        recommendations: snapshot?.recommendations || snapshot?.raios_x || [],
        plan_30_dias: snapshot?.plan || plan,
        actions: plan,
        evidence: evidence.map((e) => ({
          action_key: e.action_key,
          before_baseline: e.before_baseline,
          after_result: e.after_result,
          declared_gain: e.declared_gain,
        })),
        ganhos_declarados: evidence.filter((e) => e.declared_gain).map((e) => ({ action_key: e.action_key, declared_gain: e.declared_gain })),
      });
    }

    // Tentar LIGHT
    let lightQuery = supabase.schema('public').from('assessments').select('*').eq('id', assessmentId).eq('type', 'LIGHT');
    if (companyId) lightQuery = lightQuery.eq('company_id', companyId);
    const { data: lightRow, error: lightErr } = await lightQuery.maybeSingle();

    if (!lightErr && lightRow) {
      const [scoresRes, itemsRes] = await Promise.all([
        supabase.schema('public').from('scores').select('*').eq('assessment_id', assessmentId),
        supabase.schema('public').from('assessment_items').select('id').eq('assessment_id', assessmentId),
      ]);
      const scores = scoresRes.data || [];
      const items = itemsRes.data || [];

      return res.json({
        type: 'LIGHT',
        assessment_id: assessmentId,
        company_id: lightRow.company_id,
        status: lightRow.status,
        scores: scores.map((s) => ({ category: s.category, score: s.score, percentage: s.percentage })),
        gaps: [],
        causas: [],
        recommendations: [],
        plan_30_dias: [],
        actions: [],
        evidence: [],
        ganhos_declarados: [],
        answered_count: items.length,
      });
    }

    return res.status(404).json({ error: 'Diagnóstico não encontrado' });
  } catch (err) {
    console.error('Erro GET /consultor/assessment/:id/summary:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

module.exports = router;
