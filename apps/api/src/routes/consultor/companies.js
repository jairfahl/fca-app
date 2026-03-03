const express = require('express');
const router = express.Router();
const { supabase, logConsultorError, requireCompanyAccess, auditEvent } = require('./shared');

// GET /consultor/companies — lista TODAS as empresas (CONSULTOR/ADMIN).
// Usa supabase com SUPABASE_SERVICE_ROLE_KEY (bypass RLS) — leitura transversal server-side.
// Guard requireConsultorOrAdmin garante que USER retorna 403.
router.get('/companies', async (req, res) => {
  const ROUTE = 'GET /consultor/companies';
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const role = req?.user?.role ?? '-';
    console.log(`[CONSULTOR_ACCESS] ${ROUTE} status=${res.statusCode} ms=${ms} role=${role}`);
  });
  try {
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 200));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

    // CONSULTOR: filtrar por empresas vinculadas; ADMIN: sem restrição
    let linkedCompanyIds = null;
    if (req.user?.role !== 'ADMIN') {
      const { data: links, error: linkErr } = await supabase
        .schema('public')
        .from('consultor_companies')
        .select('company_id')
        .eq('consultor_user_id', req.user.id);
      if (linkErr) {
        logConsultorError(ROUTE, req, linkErr, { phase: 'consultor_companies_select' });
        return res.status(500).json({ error: 'Erro ao filtrar empresas do consultor' });
      }
      linkedCompanyIds = (links || []).map((l) => l.company_id);
      if (linkedCompanyIds.length === 0) {
        return res.json({ companies: [] });
      }
    }

    let companiesQuery = supabase
      .schema('public')
      .from('companies')
      .select('id, name, trade_name, owner_user_id, created_at')
      .order('created_at', { ascending: false });
    if (linkedCompanyIds !== null) {
      companiesQuery = companiesQuery.in('id', linkedCompanyIds);
    }
    const { data: companies, error } = await companiesQuery.range(offset, offset + limit - 1);

    if (error) {
      logConsultorError(ROUTE, req, error, { phase: 'companies_select' });
      return res.status(500).json({ error: 'Erro ao listar empresas' });
    }

    const list = companies || [];
    const enriched = await Promise.all(
      list.map(async (c) => {
        const { data: fullRow } = await supabase
          .schema('public')
          .from('full_assessments')
          .select('id, status, full_version')
          .eq('company_id', c.id)
          .order('full_version', { ascending: false })
          .limit(1)
          .maybeSingle();

        let plan_progress = null;
        if (fullRow?.id) {
          const { data: plan } = await supabase
            .schema('public')
            .from('full_selected_actions')
            .select('status')
            .eq('assessment_id', fullRow.id);
          const done = (plan || []).filter((p) => p.status === 'DONE' || p.status === 'DROPPED').length;
          plan_progress = plan?.length ? `${done}/${plan.length}` : null;
        }

        // Entitlement: LIGHT ou FULL/ACTIVE para owner_user_id + company_id
        let entitlement = 'LIGHT';
        if (c.owner_user_id) {
          const { data: ent } = await supabase
            .schema('public')
            .from('entitlements')
            .select('plan, status')
            .eq('user_id', c.owner_user_id)
            .eq('company_id', c.id)
            .maybeSingle();
          if (ent?.plan === 'FULL' && ent?.status === 'ACTIVE') entitlement = 'FULL/ACTIVE';
          else if (ent?.plan) entitlement = `${ent.plan}/${ent.status || 'ACTIVE'}`;
        }

        const companyId = c.id && String(c.id).trim() && c.id !== 'undefined' ? c.id : null;
        if (!companyId) return null; // excluir itens sem ID válido
        const displayName = (c.trade_name && String(c.trade_name).trim()) || (c.name && String(c.name).trim()) || null;
        return {
          company_id: companyId,
          company_name: displayName,
          name: (c.name && String(c.name).trim()) || null, // retrocompat (razão social)
          trade_name: (c.trade_name && String(c.trade_name).trim()) || null,
          owner_user_id: c.owner_user_id || null,
          created_at: c.created_at || null,
          entitlement,
          full_status: fullRow?.status || null,
          full_version: fullRow?.full_version ?? null,
          full_assessment_id: fullRow?.id || null,
          plan_progress,
        };
      })
    );

    const filtered = (enriched || []).filter(Boolean);
    return res.json({ companies: filtered });
  } catch (err) {
    logConsultorError(ROUTE, req, err, { phase: 'enrichment_or_unknown' });
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

// GET /consultor/companies/:company_id/diagnostics — LIGHT + FULL (assessment_id, status, answered_count, last_saved_at, created_at)
router.get('/companies/:company_id/diagnostics', requireCompanyAccess((r) => r.params.company_id), async (req, res) => {
  try {
    const companyId = req.params.company_id;

    await auditEvent({
      actor_user_id: req.user.id,
      actor_role: req.user.role,
      action: 'CONSULTOR_VIEW_COMPANY',
      target_type: 'company',
      target_id: companyId,
      company_id: companyId,
    });

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
      assessment_id: a.id,
      type: 'LIGHT',
      status: a.status,
      answered_count: itemsCountByAssessment[a.id] || 0,
      last_saved_at: a.completed_at || a.created_at,
      created_at: a.created_at,
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
      assessment_id: a.id,
      type: 'FULL',
      status: a.status,
      answered_count: answersCountByAssessment[a.id] || 0,
      last_saved_at: a.submitted_at || a.closed_at || a.created_at,
      created_at: a.created_at,
    }));

    return res.json({
      company_id: companyId,
      light: lightList,
      full: fullList,
    });
  } catch (err) {
    console.error('Erro GET /consultor/companies/:id/diagnostics:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

// GET /consultor/companies/:company_id/diagnostics/:assessment_id — visão completa read-only
router.get('/companies/:company_id/diagnostics/:assessment_id', requireCompanyAccess((r) => r.params.company_id), async (req, res) => {
  try {
    const companyId = req.params.company_id;
    const assessmentId = req.params.assessment_id;

    await auditEvent({
      actor_user_id: req.user.id,
      actor_role: req.user.role,
      action: 'CONSULTOR_VIEW_DIAGNOSTIC',
      target_type: 'assessment',
      target_id: assessmentId,
      company_id: companyId,
    });

    const fullQuery = supabase.schema('public').from('full_assessments').select('*').eq('id', assessmentId).eq('company_id', companyId);
    const { data: fullRow, error: fullErr } = await fullQuery.maybeSingle();

    if (!fullErr && fullRow) {
      const [answersRes, scoresRes, planRes, evRes, snapshotRes, causesRes] = await Promise.all([
        supabase.schema('public').from('full_answers').select('*').eq('assessment_id', assessmentId),
        supabase.schema('public').from('full_process_scores').select('*').eq('assessment_id', assessmentId),
        supabase.schema('public').from('full_selected_actions').select('*').eq('assessment_id', assessmentId).order('position'),
        supabase.schema('public').from('full_action_evidence').select('*').eq('assessment_id', assessmentId),
        supabase.schema('public').from('full_diagnostic_snapshot').select('*').eq('full_assessment_id', assessmentId).maybeSingle(),
        supabase.schema('public').from('full_gap_causes').select('*').eq('assessment_id', assessmentId),
      ]);

      const snapshot = snapshotRes.data;
      return res.json({
        type: 'FULL',
        assessment: fullRow,
        answers: answersRes.data || [],
        scores: scoresRes.data || [],
        plan: planRes.data || [],
        evidence: evRes.data || [],
        snapshot: snapshot || null,
        findings: snapshot?.processes || [],
        resultados: snapshot?.recommendations || snapshot?.raios_x || [],
        causas: causesRes.data || [],
        read_only: true,
      });
    }

    const lightQuery = supabase.schema('public').from('assessments').select('*').eq('id', assessmentId).eq('company_id', companyId).eq('type', 'LIGHT');
    const { data: lightRow, error: lightErr } = await lightQuery.maybeSingle();

    if (!lightErr && lightRow) {
      const [itemsRes, scoresRes] = await Promise.all([
        supabase.schema('public').from('assessment_items').select('*').eq('assessment_id', assessmentId),
        supabase.schema('public').from('scores').select('*').eq('assessment_id', assessmentId).maybeSingle(),
      ]);
      return res.json({
        type: 'LIGHT',
        assessment: lightRow,
        items: itemsRes.data || [],
        scores: scoresRes.data || null,
        read_only: true,
      });
    }

    return res.status(404).json({ error: 'Diagnóstico não encontrado' });
  } catch (err) {
    console.error('Erro GET /consultor/companies/:id/diagnostics/:assessment_id:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

// GET /consultor/company/:company_id/overview — visão consolidada (somente leitura)
router.get('/company/:company_id/overview', async (req, res) => {
  try {
    const companyId = req.params.company_id;

    const { data: company, error: companyErr } = await supabase
      .schema('public')
      .from('companies')
      .select('id, name, segment')
      .eq('id', companyId)
      .maybeSingle();

    if (companyErr || !company) {
      return res.status(404).json({ error: 'Empresa não encontrada' });
    }

    // LIGHT: assessments tipo LIGHT
    const { data: lightAssessments } = await supabase
      .schema('public')
      .from('assessments')
      .select('id, status, type')
      .eq('company_id', companyId)
      .eq('type', 'LIGHT')
      .order('created_at', { ascending: false })
      .limit(1);

    const lightStatus = lightAssessments?.[0]?.status || null;

    // FULL: full_assessments
    const { data: fullAssessments } = await supabase
      .schema('public')
      .from('full_assessments')
      .select('id, status, segment, submitted_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(1);

    const fullStatus = fullAssessments?.[0] || null;

    // Plano atual FULL (se existir)
    let planProgress = null;
    if (fullStatus?.id) {
      const { data: plan } = await supabase
        .schema('public')
        .from('full_selected_actions')
        .select('action_key, status')
        .eq('assessment_id', fullStatus.id);
      const done = (plan || []).filter((p) => p.status === 'DONE' || p.status === 'DROPPED').length;
      planProgress = plan?.length ? `${done}/${plan.length}` : null;
    }

    return res.json({
      company,
      light_status: lightStatus,
      full_status: fullStatus?.status || null,
      full_assessment_id: fullStatus?.id || null,
      plan_progress: planProgress,
    });
  } catch (err) {
    console.error('Erro GET /consultor/company/:id/overview:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

// GET /consultor/company/:company_id/actions — ações do ciclo + evidências
router.get('/company/:company_id/actions', async (req, res) => {
  try {
    const companyId = req.params.company_id;

    const { data: fullAssessment } = await supabase
      .schema('public')
      .from('full_assessments')
      .select('id')
      .eq('company_id', companyId)
      .in('status', ['SUBMITTED', 'CLOSED'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!fullAssessment) {
      return res.json({ actions: [], evidence: [] });
    }

    const { data: plan } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .select('*')
      .eq('assessment_id', fullAssessment.id)
      .order('position');

    const { data: evidence } = await supabase
      .schema('public')
      .from('full_action_evidence')
      .select('*')
      .eq('assessment_id', fullAssessment.id);

    const { data: histRows } = await supabase
      .schema('public')
      .from('full_cycle_history')
      .select('*')
      .eq('assessment_id', fullAssessment.id)
      .order('archived_at', { ascending: false });

    return res.json({
      assessment_id: fullAssessment.id,
      actions: plan || [],
      evidence: evidence || [],
      cycle_history: histRows || [],
    });
  } catch (err) {
    console.error('Erro GET /consultor/company/:id/actions:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

module.exports = router;
