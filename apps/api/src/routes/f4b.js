const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');
const { requireAuth } = require('../middleware/requireAuth');
const { requireFullEntitlement } = require('../middleware/requireFullEntitlement');

const safeArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(JSON.stringify(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const ensureFullInitiatives = async ({ assessmentId, companyId, userId }) => {
  const { data: assessment, error: assessErr } = await supabase
    .schema('public')
    .from('assessments')
    .select('id, company_id')
    .eq('id', assessmentId)
    .maybeSingle();

  if (assessErr) {
    throw new Error(`Erro ao buscar assessment (ensureFullInitiatives): ${assessErr.message}`);
  }

  if (!assessment) {
    const err = new Error('assessment não encontrado');
    err.status = 404;
    throw err;
  }

  if (companyId && assessment.company_id !== companyId) {
    const err = new Error('company_id não corresponde ao assessment');
    err.status = 400;
    throw err;
  }

  const { data: company, error: companyErr } = await supabase
    .schema('public')
    .from('companies')
    .select('owner_user_id')
    .eq('id', assessment.company_id)
    .maybeSingle();

  if (companyErr) {
    throw new Error(`Erro ao buscar company (ensureFullInitiatives): ${companyErr.message}`);
  }

  if (!company || company.owner_user_id !== userId) {
    const err = new Error('sem acesso');
    err.status = 403;
    throw err;
  }

  const { data: scores, error: scoresErr } = await supabase
    .schema('public')
    .from('scores')
    .select('commercial, operations, admin_fin, management, overall')
    .eq('assessment_id', assessmentId)
    .maybeSingle();

  if (scoresErr) {
    throw new Error(`Erro ao buscar scores (ensureFullInitiatives): ${scoresErr.message}`);
  }

  if (!scores) {
    console.warn('[FULL] scores ausentes ao gerar iniciativas', { assessment_id: assessmentId });
  }

  const { data: catalog, error: catalogFetchErr } = await supabase
    .schema('public')
    .from('full_initiatives_catalog')
    .select('*')
    .eq('active', true)
    .eq('segment', 'ALL')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (catalogFetchErr) {
    throw new Error(`Erro ao buscar catálogo (ensureFullInitiatives): ${catalogFetchErr.message}`);
  }

  if (!catalog || catalog.length === 0) {
    console.warn('[FULL] catálogo vazio ao gerar iniciativas', { assessment_id: assessmentId });
    return { inserted: 0 };
  }

  const sortedCatalog = catalog.sort((a, b) => {
    const impactOrder = { HIGH: 1, MED: 2, LOW: 3 };
    const impactDiff = impactOrder[a.impact] - impactOrder[b.impact];
    if (impactDiff !== 0) return impactDiff;

    const horizonOrder = { CURTO: 1, MEDIO: 2 };
    const horizonDiff = horizonOrder[a.horizon] - horizonOrder[b.horizon];
    if (horizonDiff !== 0) return horizonDiff;

    const dateA = new Date(a.created_at || 0);
    const dateB = new Date(b.created_at || 0);
    const dateDiff = dateA - dateB;
    if (dateDiff !== 0) return dateDiff;

    return a.id.localeCompare(b.id);
  });

  const top12 = sortedCatalog.slice(0, 12);

  if (top12.length < 12) {
    console.warn('[FULL] catálogo insuficiente para Top-12', {
      assessment_id: assessmentId,
      found: top12.length
    });
  }

  if (top12.length === 0) {
    return { inserted: 0 };
  }

  const inserts = top12.map((initiative, index) => ({
    assessment_id: assessmentId,
    initiative_id: initiative.id,
    rank: index + 1,
    process: initiative.process
  }));

  const { error: insertErr } = await supabase
    .schema('public')
    .from('full_assessment_initiatives')
    .insert(inserts);

  if (insertErr) {
    throw new Error(`Erro ao persistir ranking (ensureFullInitiatives): ${insertErr.message}`);
  }

  return { inserted: inserts.length };
};

const buildInitiativesFromRanking = ({ ranking, catalogMap }) => {
  return (ranking || []).map(rank => {
    const catalog = (catalogMap && catalogMap[rank.initiative_id]) || {};
    return {
      rank: rank.rank,
      process: rank.process,
      initiative_id: rank.initiative_id,
      title: catalog.title || null,
      impact: catalog.impact || null,
      horizon: catalog.horizon || null,
      rationale: catalog.rationale || null,
      prerequisites: safeArray(catalog.prerequisites_json),
      dependencies: safeArray(catalog.dependencies_json)
    };
  });
};

/**
 * GET /full/assessments/:id/initiatives
 * Retorna Top 12 de iniciativas FULL determinísticas e persistidas por assessment
 */
router.get('/full/assessments/:id/initiatives', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const assessmentId = req.params.id;
    const userId = req.user.id;
    const companyId = req.query.company_id;

    // A) Validar que assessment existe
    const { data: assessment, error: assessErr } = await supabase
      .schema('public')
      .from('assessments')
      .select('id, company_id')
      .eq('id', assessmentId)
      .maybeSingle();

    if (assessErr) {
      console.error('Erro ao buscar assessment:', assessErr.message);
      return res.status(500).json({ error: 'erro inesperado' });
    }

    if (!assessment) {
      return res.status(404).json({ error: 'assessment não encontrado' });
    }

    // Validar ownership: assessment.company_id -> companies.owner_user_id == req.user.id
    const { data: company, error: companyErr } = await supabase
      .schema('public')
      .from('companies')
      .select('owner_user_id')
      .eq('id', assessment.company_id)
      .maybeSingle();

    if (companyErr) {
      console.error('Erro ao buscar company:', companyErr.message);
      return res.status(500).json({ error: 'erro inesperado' });
    }

    if (!company) {
      return res.status(404).json({ error: 'assessment não encontrado' });
    }

    if (company.owner_user_id !== userId) {
      return res.status(403).json({ error: 'sem acesso' });
    }

    if (companyId && assessment.company_id !== companyId) {
      return res.status(400).json({ error: 'company_id não corresponde ao assessment' });
    }

    // B) Contar linhas persistidas
    const { count, error: countErr } = await supabase
      .schema('public')
      .from('full_assessment_initiatives')
      .select('*', { count: 'exact', head: true })
      .eq('assessment_id', assessmentId);

    if (countErr) {
      console.error('Erro ao contar ranking existente:', {
        assessment_id: assessmentId,
        company_id: companyId || null,
        message: countErr.message,
        detail: countErr.detail || null
      });
      return res.status(500).json({ error: 'erro inesperado' });
    }

    if (Number(count || 0) === 0) {
      try {
        await ensureFullInitiatives({ assessmentId, companyId, userId });
      } catch (ensureErr) {
        if (ensureErr && ensureErr.status) {
          return res.status(ensureErr.status).json({ error: ensureErr.message });
        }
        console.error('Erro ao garantir iniciativas FULL:', {
          assessment_id: assessmentId,
          company_id: companyId || null,
          message: ensureErr.message
        });
        return res.status(500).json({ error: 'erro inesperado' });
      }
    }

    // C) Ler ranking persistido (idempotente)
    const { data: existingRanking, error: rankErr } = await supabase
      .schema('public')
      .from('full_assessment_initiatives')
      .select('*')
      .eq('assessment_id', assessmentId)
      .order('rank', { ascending: true });

    if (rankErr) {
      console.error('Erro ao buscar ranking existente:', {
        assessment_id: assessmentId,
        company_id: companyId || null,
        message: rankErr.message,
        detail: rankErr.detail || null
      });
      return res.status(500).json({ error: 'erro inesperado' });
    }

    if (!existingRanking || existingRanking.length === 0) {
      return res.status(200).json({
        assessment_id: assessmentId,
        initiatives: []
      });
    }

    const initiativeIds = existingRanking.map(r => r.initiative_id);
    const { data: catalogItems, error: catalogErr } = await supabase
      .schema('public')
      .from('full_initiatives_catalog')
      .select('id, title, rationale, impact, horizon, prerequisites_json, dependencies_json')
      .in('id', initiativeIds);

    if (catalogErr) {
      console.error('Erro ao buscar catálogo:', {
        assessment_id: assessmentId,
        company_id: companyId || null,
        message: catalogErr.message,
        detail: catalogErr.detail || null
      });
      console.warn('[FULL] fallback: retornando ranking sem catálogo', {
        assessment_id: assessmentId,
        company_id: companyId || null
      });
      return res.status(200).json({
        assessment_id: assessmentId,
        initiatives: buildInitiativesFromRanking({ ranking: existingRanking, catalogMap: {} })
      });
    }

    const catalogMap = {};
    (catalogItems || []).forEach(item => {
      catalogMap[item.id] = item;
    });

    const initiatives = buildInitiativesFromRanking({ ranking: existingRanking, catalogMap });

    return res.status(200).json({
      assessment_id: assessmentId,
      initiatives
    });

  } catch (error) {
    console.error('Erro inesperado ao buscar iniciativas FULL:', error.message);
    res.status(500).json({ error: 'erro inesperado' });
  }
});

module.exports = router;
