/**
 * Rotas de versionamento FULL:
 *   GET  /full/versions
 *   POST /full/versions/new
 *   GET  /full/versions/:full_version/summary
 *   GET  /full/compare
 */
const express = require('express');
const router = express.Router();
const { supabase } = require('../../lib/supabase');
const { requireAuth } = require('../../middleware/requireAuth');
const { requireFullEntitlement } = require('../../middleware/requireFullEntitlement');
const { blockConsultorOnMutation } = require('../../middleware/requireRole');
const { ensureConsultantOrOwnerAccess } = require('../../lib/companyAccess');
const { getOrCreateCurrentFullAssessment, createNewFullVersion, FullCurrentError, logFullCurrentError } = require('../../lib/fullAssessment');
const { apiError, toExternalScore } = require('../../lib/fullHelpers');

// GET /full/versions?company_id= — lista versões ordenadas desc
router.get('/full/versions', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.query.company_id;
    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada.');

    const access = await ensureConsultantOrOwnerAccess(userId, companyId, req.user?.email, req.user?.role);
    if (!access) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');

    const { data: assessments, error } = await supabase
      .schema('public')
      .from('full_assessments')
      .select('id, full_version, status, created_at, closed_at')
      .eq('company_id', companyId)
      .order('full_version', { ascending: false });

    if (error) {
      console.error('Erro GET /full/versions:', error.message);
      return apiError(res, 500, 'VERSIONS_LOAD_ERROR', 'Erro ao carregar versões.');
    }

    const ids = (assessments || []).map((a) => a.id);
    const { data: answerCounts } = await supabase
      .schema('public')
      .from('full_answers')
      .select('assessment_id')
      .in('assessment_id', ids);
    const countByAssessment = {};
    (answerCounts || []).forEach((r) => {
      countByAssessment[r.assessment_id] = (countByAssessment[r.assessment_id] || 0) + 1;
    });

    const currentDraftOrSubmitted = (assessments || []).find((a) => a.status === 'DRAFT' || a.status === 'SUBMITTED');
    const list = (assessments || []).map((a) => ({
      full_version: a.full_version,
      assessment_id: a.id,
      status: a.status,
      created_at: a.created_at,
      closed_at: a.closed_at,
      answered_count: countByAssessment[a.id] || 0,
      is_current: !!(currentDraftOrSubmitted && currentDraftOrSubmitted.id === a.id),
    }));

    return res.json(list);
  } catch (err) {
    console.error('Erro GET /full/versions:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// POST /full/versions/new?company_id= — refazer diagnóstico (novo DRAFT)
router.post('/full/versions/new', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.query.company_id || req.body.company_id;
    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada.');

    const access = await ensureConsultantOrOwnerAccess(userId, companyId, req.user?.email, req.user?.role);
    if (!access) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');

    const { data: lastSubmitted } = await supabase
      .schema('public')
      .from('full_assessments')
      .select('id, status')
      .eq('company_id', companyId)
      .eq('status', 'SUBMITTED')
      .maybeSingle();
    if (lastSubmitted && lastSubmitted.status === 'SUBMITTED') {
      const { data: plan } = await supabase
        .schema('public')
        .from('full_selected_actions')
        .select('action_key')
        .eq('assessment_id', lastSubmitted.id)
        .limit(1);
      if (plan && plan.length > 0) {
        return apiError(res, 400, 'DIAG_IN_PROGRESS', 'Conclua ou feche o ciclo atual antes de refazer o diagnóstico.');
      }
    }

    const result = await createNewFullVersion(companyId, userId);
    const { assessment } = result;
    return res.status(200).json({
      full_version: assessment.full_version,
      assessment_id: assessment.id,
      is_new: result.isNew,
    });
  } catch (err) {
    if (err instanceof FullCurrentError) {
      logFullCurrentError(err.phase, req.query.company_id, req.user.id, req.user?.email, err.originalError);
      return apiError(res, 500, 'VERSION_CREATE_FAILED', 'Não foi possível criar nova versão. Tente novamente.');
    }
    console.error('Erro POST /full/versions/new:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// GET /full/versions/:full_version/summary?company_id= — snapshot do diagnóstico
router.get('/full/versions/:full_version/summary', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.query.company_id;
    const fullVersion = parseInt(req.params.full_version, 10);
    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada.');
    if (isNaN(fullVersion) || fullVersion < 1) return apiError(res, 400, 'INVALID_VERSION', 'Versão inválida.');

    const access = await ensureConsultantOrOwnerAccess(userId, companyId, req.user?.email, req.user?.role);
    if (!access) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');

    const { data: assessment } = await supabase
      .schema('public')
      .from('full_assessments')
      .select('id')
      .eq('company_id', companyId)
      .eq('full_version', fullVersion)
      .maybeSingle();
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado para esta versão.');

    const { data: snapshot, error } = await supabase
      .schema('public')
      .from('full_diagnostic_snapshot')
      .select('*')
      .eq('full_assessment_id', assessment.id)
      .maybeSingle();

    if (error) {
      console.error('Erro GET /full/versions/summary:', error.message);
      return apiError(res, 500, 'SNAPSHOT_LOAD_ERROR', 'Erro ao carregar resumo.');
    }
    if (!snapshot) return apiError(res, 404, 'SNAPSHOT_NOT_FOUND', 'Resumo ainda não disponível para esta versão.');

    return res.json({
      full_version: snapshot.full_version,
      assessment_id: snapshot.full_assessment_id,
      segment: snapshot.segment,
      processes: (snapshot.processes || []).map((p) => ({ ...p, score_numeric: toExternalScore(p.score_numeric) })),
      raios_x: snapshot.raios_x || { vazamentos: [], alavancas: [] },
      recommendations: snapshot.recommendations || [],
      plan: snapshot.plan || [],
      evidence_summary: snapshot.evidence_summary || [],
      created_at: snapshot.created_at,
      updated_at: snapshot.updated_at,
    });
  } catch (err) {
    console.error('Erro GET /full/versions/summary:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// GET /full/compare?company_id=...&from=1&to=2
router.get('/full/compare', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.query.company_id;
    const fromVer = parseInt(req.query.from, 10);
    const toVer = parseInt(req.query.to, 10);
    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada.');
    if (isNaN(fromVer) || isNaN(toVer) || fromVer < 1 || toVer < 1) {
      return apiError(res, 400, 'INVALID_PARAMS', 'Parâmetros from e to devem ser versões válidas (1, 2, ...).');
    }

    const access = await ensureConsultantOrOwnerAccess(userId, companyId, req.user?.email, req.user?.role);
    if (!access) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');

    const { data: assessments } = await supabase
      .schema('public')
      .from('full_assessments')
      .select('id, full_version')
      .eq('company_id', companyId)
      .in('full_version', [fromVer, toVer]);
    const byVer = {};
    (assessments || []).forEach((a) => { byVer[a.full_version] = a; });
    if (!byVer[fromVer] || !byVer[toVer]) {
      return apiError(res, 404, 'DIAG_NOT_FOUND', 'Uma ou ambas as versões não foram encontradas.');
    }

    const { data: snapshots } = await supabase
      .schema('public')
      .from('full_diagnostic_snapshot')
      .select('*')
      .in('full_assessment_id', [byVer[fromVer].id, byVer[toVer].id]);
    const snapByAssessment = {};
    (snapshots || []).forEach((s) => { snapByAssessment[s.full_assessment_id] = s; });
    const snapFrom = snapByAssessment[byVer[fromVer].id];
    const snapTo = snapByAssessment[byVer[toVer].id];

    const processesFrom = (snapFrom?.processes || []).reduce((acc, p) => { acc[p.process_key] = p; return acc; }, {});
    const processesTo = (snapTo?.processes || []).reduce((acc, p) => { acc[p.process_key] = p; return acc; }, {});
    const allProcessKeys = [...new Set([...Object.keys(processesFrom), ...Object.keys(processesTo)])];
    const evolution_by_process = allProcessKeys.map((pk) => {
      const from = processesFrom[pk];
      const to = processesTo[pk];
      return {
        process_key: pk,
        from: from ? { band: from.band, score_numeric: toExternalScore(from.score_numeric) } : null,
        to: to ? { band: to.band, score_numeric: toExternalScore(to.score_numeric) } : null,
      };
    });

    const raiosFrom = snapFrom?.raios_x || { vazamentos: [], alavancas: [] };
    const raiosTo = snapTo?.raios_x || { vazamentos: [], alavancas: [] };
    const titlesFrom = new Set([
      ...(raiosFrom.vazamentos || []).map((v) => v.title),
      ...(raiosFrom.alavancas || []).map((a) => a.title),
    ]);
    const titlesTo = new Set([
      ...(raiosTo.vazamentos || []).map((v) => v.title),
      ...(raiosTo.alavancas || []).map((a) => a.title),
    ]);
    const raio_x_entered = [...titlesTo].filter((t) => !titlesFrom.has(t));
    const raio_x_left = [...titlesFrom].filter((t) => !titlesTo.has(t));

    const planFrom = snapFrom?.plan || [];
    const evidenceFrom = snapFrom?.evidence_summary || [];
    const gainsFrom = evidenceFrom.filter((e) => e.declared_gain).map((e) => ({
      action_key: e.action_key,
      title: e.title,
      declared_gain: e.declared_gain,
    }));

    return res.json({
      from_version: fromVer,
      to_version: toVer,
      evolution_by_process,
      raio_x_entered,
      raio_x_left,
      actions_completed_previous: planFrom.filter((p) => p.status === 'DONE').length,
      gains_declared_previous: gainsFrom,
    });
  } catch (err) {
    console.error('Erro GET /full/compare:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

module.exports = router;
