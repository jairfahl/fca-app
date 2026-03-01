/**
 * Rotas /consultor/* — área do consultor (CONSULTOR/ADMIN)
 * Acesso transversal read-only: vê qualquer empresa, status, ações, evidências.
 */
const fs = require('fs');
const path = require('path');
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/requireAuth');
const { requireConsultorOrAdmin } = require('../middleware/requireRole');
const { requireCompanyAccess } = require('../middleware/guards');
const { supabase } = require('../lib/supabase');
const { logConsultorAccess } = require('../lib/consultorAudit');
const { auditEvent } = require('../lib/audit');

/** Log de erro com stack trace e contexto (QA — causa raiz). Sem token. */
function logConsultorError(route, req, err, extra = {}) {
  const ctx = {
    route,
    user_id: req?.user?.id ?? null,
    role: req?.user?.role ?? null,
    error_message: err?.message ?? String(err),
    error_stack: err?.stack ?? null,
    ...extra,
  };
  if (err?.code) ctx.supabase_code = err.code;
  if (err?.details) ctx.supabase_details = err.details;
  if (err?.hint) ctx.supabase_hint = err.hint;
  const payload = JSON.stringify(ctx, null, 2);
  console.error('[CONSULTOR_ERROR]', payload);
  if (err?.stack) console.error(err.stack);
  try {
    const logPath = path.resolve(process.cwd(), 'logs', 'consultor-error.json');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${new Date().toISOString()}\n${payload}\n${err?.stack || ''}\n---\n`);
  } catch (_) { /* ignore file write */ }
}

router.use(requireAuth);
router.use(requireConsultorOrAdmin);
router.use((req, _res, next) => {
  logConsultorAccess(req);
  next();
});

// GET /consultor/users — lista usuários (USER) paginada
// DTO: user_id, email, role, company_id, company_name, last_seen_at (company_id opcional)
// Email: user_profiles (canônico) ou fallback auth.admin
router.get('/users', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;
    const companyIdFilter = req.query.company_id || null;

    const { data: companies, error: cErr } = await supabase
      .schema('public')
      .from('companies')
      .select('id, name, owner_user_id')
      .not('owner_user_id', 'is', null);

    if (cErr) {
      console.error('Erro GET /consultor/users:', cErr.message);
      return res.status(500).json({ error: 'Erro ao listar usuários' });
    }

    const companiesByOwner = {};
    (companies || []).forEach((c) => {
      const uid = c.owner_user_id;
      if (!companiesByOwner[uid]) companiesByOwner[uid] = [];
      companiesByOwner[uid].push({ id: c.id, name: c.name });
    });
    let ownerIds = Object.keys(companiesByOwner);

    let filteredOwnerIds = ownerIds;
    if (companyIdFilter) {
      const targetCompany = companies?.find((c) => c.id === companyIdFilter);
      filteredOwnerIds = targetCompany?.owner_user_id ? [targetCompany.owner_user_id] : [];
    }

    if (filteredOwnerIds.length === 0) {
      return res.json({ users: [], pagination: { page, limit, total: 0, offset } });
    }

    const { data: profiles } = await supabase.schema('public').from('user_profiles').select('user_id, email, role').in('user_id', filteredOwnerIds);
    const profileByUid = Object.fromEntries((profiles || []).map((p) => [p.user_id, p]));

    let authUsers = [];
    try {
      const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      authUsers = users || [];
    } catch (_) { /* listUsers pode falhar em alguns projetos */ }

    const list = filteredOwnerIds
      .map((uid) => {
        const profile = profileByUid[uid];
        const authUser = authUsers.find((u) => u.id === uid);
        const email = profile?.email || authUser?.email || null;
        const comps = companiesByOwner[uid] || [];
        const targetCompany = companyIdFilter ? companies?.find((c) => c.id === companyIdFilter) : null;
        const primaryCompany = companyIdFilter && targetCompany ? { id: targetCompany.id, name: targetCompany.name } : comps[0];
        return {
          user_id: uid,
          email,
          role: profile?.role || null,
          company_id: primaryCompany?.id || null,
          company_name: primaryCompany?.name || null,
          companies_count: comps.length,
          created_at: authUser?.created_at || null,
          last_sign_in_at: authUser?.last_sign_in_at || null,
        };
      })
      .sort((a, b) => (a.email || '').localeCompare(b.email || ''));

    const total = list.length;
    const paginated = list.slice(offset, offset + limit);

    return res.json({
      users: paginated,
      pagination: { page, limit, total, offset },
    });
  } catch (err) {
    console.error('Erro GET /consultor/users:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

// GET /consultor/users/:user_id/diagnosticos?company_id= — diagnósticos LIGHT + FULL do usuário
// DTO: user_id, email, company_id, company_name, light[], full[] (sem expor UUID como identificador principal)
router.get('/users/:user_id/diagnosticos', async (req, res) => {
  try {
    const userId = req.params.user_id;
    const companyId = req.query.company_id;

    const { data: company, error: cErr } = await supabase
      .schema('public')
      .from('companies')
      .select('id, name, owner_user_id')
      .eq('id', companyId)
      .maybeSingle();

    if (cErr || !company) return res.status(404).json({ error: 'Empresa não encontrada' });
    if (company.owner_user_id !== userId) return res.status(403).json({ error: 'Empresa não pertence ao usuário' });

    // Email: user_profiles (canônico) ou fallback auth.admin
    let email = null;
    const { data: profile } = await supabase.schema('public').from('user_profiles').select('email').eq('user_id', userId).maybeSingle();
    if (profile?.email) {
      email = profile.email;
    } else {
      try {
        const { data: { user } } = await supabase.auth.admin.getUserById(userId);
        email = user?.email || null;
      } catch (_) { /* listUsers/getUserById pode falhar */ }
    }

    const [lightRes, fullRes] = await Promise.all([
      supabase.schema('public').from('assessments').select('id, status, created_at, completed_at').eq('company_id', companyId).eq('type', 'LIGHT').order('created_at', { ascending: false }),
      supabase.schema('public').from('full_assessments').select('id, status, created_at, submitted_at, closed_at').eq('company_id', companyId).order('created_at', { ascending: false }),
    ]);

    const light = (lightRes.data || []).map((a) => ({
      id: a.id,
      status: a.status,
      created_at: a.created_at,
      last_saved_at: a.created_at,
      submitted_at: a.completed_at,
    }));
    const full = (fullRes.data || []).map((a) => ({
      id: a.id,
      status: a.status,
      created_at: a.created_at,
      last_saved_at: a.created_at,
      submitted_at: a.submitted_at,
      closed_at: a.closed_at,
    }));

    return res.json({
      user_id: userId,
      email: email || null,
      company_id: companyId,
      company_name: company.name || null,
      light,
      full,
    });
  } catch (err) {
    console.error('Erro GET /consultor/users/:user_id/diagnosticos:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

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
    const { ensureConsultantOrOwnerAccess } = require('../lib/companyAccess');

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

// GET /consultor/help-requests?status=OPEN — lista pedidos de ajuda (CONSULTOR/ADMIN)
router.get('/help-requests', async (req, res) => {
  try {
    const status = req.query.status || 'OPEN';
    const { data, error } = await supabase
      .schema('public')
      .from('help_requests')
      .select('id, company_id, user_id, context, status, assigned_to, closed_at, created_at, updated_at')
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro GET /consultor/help-requests:', error.message);
      return res.status(500).json({ error: 'Erro ao listar pedidos de ajuda' });
    }
    return res.json({ help_requests: data || [] });
  } catch (err) {
    console.error('Erro GET /consultor/help-requests:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

// GET /consultor/messages?company_id=&user_id=&unread=1 — lista mensagens (CONSULTOR/ADMIN)
router.get('/messages', async (req, res) => {
  try {
    const companyId = req.query.company_id;
    const userId = req.query.user_id;
    const unreadOnly = req.query.unread === '1' || req.query.unread === 'true';

    let query = supabase
      .schema('public')
      .from('support_messages')
      .select('id, company_id, from_user_id, to_user_id, subject, body, created_at, read_at, created_by_role')
      .order('created_at', { ascending: false })
      .limit(100);

    if (companyId) query = query.eq('company_id', companyId);
    if (userId) query = query.or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`);
    if (unreadOnly) query = query.is('read_at', null);

    const { data, error } = await query;

    if (error) {
      console.error('Erro GET /consultor/messages:', error.message);
      return res.status(500).json({ error: 'Erro ao listar mensagens' });
    }

    const list = (data || []).map((m) => ({
      id: m.id,
      company_id: m.company_id,
      from_user_id: m.from_user_id,
      to_user_id: m.to_user_id,
      subject: m.subject,
      body_preview: (m.body || '').slice(0, 120) + ((m.body || '').length > 120 ? '...' : ''),
      created_at: m.created_at,
      read_at: m.read_at,
      created_by_role: m.created_by_role,
    }));

    return res.json({ messages: list });
  } catch (err) {
    console.error('Erro GET /consultor/messages:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

// POST /consultor/messages/reply — CONSULTOR responde mensagem
router.post('/messages/reply', async (req, res) => {
  try {
    const { company_id, to_user_id, body } = req.body;

    if (!company_id || !to_user_id || !body || typeof body !== 'string' || body.trim().length === 0) {
      return res.status(400).json({ error: 'company_id, to_user_id e body são obrigatórios' });
    }

    const { data: company, error: cErr } = await supabase
      .schema('public')
      .from('companies')
      .select('id, owner_user_id')
      .eq('id', company_id)
      .maybeSingle();

    if (cErr || !company) return res.status(404).json({ error: 'Empresa não encontrada' });
    if (company.owner_user_id !== to_user_id) return res.status(403).json({ error: 'Usuário não é dono da empresa' });

    const { data: msg, error: insErr } = await supabase
      .schema('public')
      .from('support_messages')
      .insert({
        company_id,
        from_user_id: req.user.id,
        to_user_id,
        subject: null,
        body: body.trim(),
        created_by_role: req.user.role === 'ADMIN' ? 'ADMIN' : 'CONSULTOR',
      })
      .select()
      .single();

    if (insErr) {
      console.error('Erro POST /consultor/messages/reply:', insErr.message);
      return res.status(500).json({ error: 'Erro ao enviar resposta' });
    }

    return res.status(201).json(msg);
  } catch (err) {
    console.error('Erro POST /consultor/messages/reply:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

// GET /consultor/support/requests?status=OPEN&company_id= — lista pedidos de apoio (CONSULTOR/ADMIN)
router.get('/support/requests', async (req, res) => {
  try {
    const status = req.query.status || 'OPEN';
    const companyId = req.query.company_id;

    let query = supabase
      .schema('public')
      .from('consulting_requests')
      .select('id, company_id, assessment_id, action_id, created_by_user_id, text, status, created_at, updated_at')
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (companyId) query = query.eq('company_id', companyId);

    const { data, error } = await query;

    if (error) {
      console.error('Erro GET /consultor/support/requests:', error.message);
      return res.status(500).json({ error: 'Erro ao listar pedidos de apoio' });
    }
    return res.json({ requests: data || [] });
  } catch (err) {
    console.error('Erro GET /consultor/support/requests:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

// PATCH /consultor/support/requests/:id — CONSULTOR altera status (única escrita permitida)
router.patch('/support/requests/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { status } = req.body;

    if (!status || !['OPEN', 'IN_PROGRESS', 'CLOSED'].includes(status)) {
      return res.status(400).json({ error: 'status deve ser OPEN, IN_PROGRESS ou CLOSED' });
    }

    const { data: existing, error: fetchErr } = await supabase
      .schema('public')
      .from('consulting_requests')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr || !existing) {
      return res.status(404).json({ error: 'Pedido de apoio não encontrado' });
    }

    const { data: updated, error: updateErr } = await supabase
      .schema('public')
      .from('consulting_requests')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) {
      console.error('Erro PATCH /consultor/support/requests/:id:', updateErr.message);
      return res.status(500).json({ error: 'Erro ao atualizar status' });
    }
    return res.json(updated);
  } catch (err) {
    console.error('Erro PATCH /consultor/support/requests/:id:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

// GET /consultor/support/threads?status=OPEN|CLOSED — lista threads (CONSULTOR/ADMIN)
router.get('/support/threads', async (req, res) => {
  try {
    const status = req.query.status || 'OPEN';
    if (!['OPEN', 'CLOSED'].includes(status)) {
      return res.status(400).json({ error: 'status deve ser OPEN ou CLOSED' });
    }

    const { data: threads, error } = await supabase
      .from('support_threads')
      .select('id, company_id, user_id, status, created_at, closed_at')
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro GET /consultor/support/threads:', error.message);
      return res.status(500).json({ error: 'Erro ao listar threads' });
    }

    return res.json({ threads: threads || [] });
  } catch (err) {
    console.error('Erro GET /consultor/support/threads:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

// GET /consultor/support/threads/:thread_id — lê thread com mensagens (CONSULTOR/ADMIN)
router.get('/support/threads/:thread_id', async (req, res) => {
  try {
    const threadId = req.params.thread_id;

    const { data: thread, error: tErr } = await supabase
      .from('support_threads')
      .select('id, company_id, user_id, status, created_at, closed_at')
      .eq('id', threadId)
      .maybeSingle();

    if (tErr || !thread) {
      return res.status(404).json({ error: 'Thread não encontrado' });
    }

    const { data: messages, error: mErr } = await supabase
      .from('support_thread_messages')
      .select('id, author_user_id, author_role, message, created_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });

    if (mErr) {
      console.error('Erro GET /consultor/support/threads/:id:', mErr.message);
      return res.status(500).json({ error: 'Erro ao carregar mensagens' });
    }

    return res.json({
      thread,
      messages: messages || [],
    });
  } catch (err) {
    console.error('Erro GET /consultor/support/threads/:id:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

// POST /consultor/support/threads/:thread_id/close — fecha thread (CONSULTOR/ADMIN)
router.post('/support/threads/:thread_id/close', async (req, res) => {
  try {
    const threadId = req.params.thread_id;

    const { data: existing, error: fetchErr } = await supabase
      .from('support_threads')
      .select('id, status, company_id')
      .eq('id', threadId)
      .maybeSingle();

    if (fetchErr || !existing) {
      return res.status(404).json({ error: 'Thread não encontrado' });
    }
    if (existing.status === 'CLOSED') {
      return res.json({ id: threadId, status: 'CLOSED', message: 'Já estava fechado' });
    }

    const closedAt = new Date().toISOString();
    const { data: updated, error: updateErr } = await supabase
      .from('support_threads')
      .update({ status: 'CLOSED', closed_at: closedAt })
      .eq('id', threadId)
      .select()
      .single();

    if (updateErr) {
      console.error('Erro POST /consultor/support/threads/:id/close:', updateErr.message);
      return res.status(500).json({ error: 'Erro ao fechar thread' });
    }

    await auditEvent({
      actor_user_id: req.user.id,
      actor_role: req.user.role,
      action: 'SUPPORT_THREAD_CLOSE',
      target_type: 'support_thread',
      target_id: threadId,
      company_id: existing.company_id,
      payload: { thread_id: threadId },
    });

    return res.json(updated);
  } catch (err) {
    console.error('Erro POST /consultor/support/threads/:id/close:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

// POST /consultor/help-requests/:id/close — fecha pedido (CONSULTOR/ADMIN)
router.post('/help-requests/:id/close', async (req, res) => {
  try {
    const id = req.params.id;
    const { data: existing, error: fetchErr } = await supabase
      .schema('public')
      .from('help_requests')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr || !existing) {
      return res.status(404).json({ error: 'Pedido de ajuda não encontrado' });
    }
    if (existing.status === 'CLOSED') {
      return res.json({ id, status: 'CLOSED', message: 'Já estava fechado' });
    }

    const { data: updated, error: updateErr } = await supabase
      .schema('public')
      .from('help_requests')
      .update({ status: 'CLOSED', closed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) {
      console.error('Erro POST /consultor/help-requests/:id/close:', updateErr.message);
      return res.status(500).json({ error: 'Erro ao fechar pedido' });
    }
    return res.json(updated);
  } catch (err) {
    console.error('Erro POST /consultor/help-requests/:id/close:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

module.exports = router;
