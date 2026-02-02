const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');
const { requireAuth } = require('../middleware/requireAuth');

/**
 * GET /full/assessments/:id/initiatives
 * Retorna Top 10 de iniciativas FULL determinísticas e persistidas por assessment
 */
router.get('/full/assessments/:id/initiatives', requireAuth, async (req, res) => {
  try {
    const assessmentId = req.params.id;
    const userId = req.user.id;

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

    // B) Verificar se já existe ranking persistido
    const { data: existingRanking, error: rankErr } = await supabase
      .schema('public')
      .from('full_assessment_initiatives')
      .select('*')
      .eq('assessment_id', assessmentId)
      .order('rank', { ascending: true });

    if (rankErr) {
      console.error('Erro ao buscar ranking existente:', rankErr.message);
      return res.status(500).json({ error: 'erro inesperado' });
    }

    // Se já existe ranking persistido, retornar ele
    if (existingRanking && existingRanking.length > 0) {
      // Buscar dados do catálogo para cada iniciativa
      const initiativeIds = existingRanking.map(r => r.initiative_id);
      
      const { data: catalogItems, error: catalogErr } = await supabase
        .schema('public')
        .from('full_initiatives_catalog')
        .select('id, title, rationale, impact, horizon, prerequisites_json, dependencies_json')
        .in('id', initiativeIds);

      if (catalogErr) {
        console.error('Erro ao buscar catálogo:', catalogErr.message);
        return res.status(500).json({ error: 'erro inesperado' });
      }

      // Montar mapa de catálogo por ID
      const catalogMap = {};
      (catalogItems || []).forEach(item => {
        catalogMap[item.id] = item;
      });

      // Montar resposta com dados do catálogo
      const initiatives = existingRanking.map(rank => {
        const catalog = catalogMap[rank.initiative_id] || {};
        return {
          rank: rank.rank,
          process: rank.process,
          initiative_id: rank.initiative_id,
          title: catalog.title || null,
          impact: catalog.impact || null,
          horizon: catalog.horizon || null,
          rationale: catalog.rationale || null,
          prerequisites: catalog.prerequisites_json ? JSON.parse(JSON.stringify(catalog.prerequisites_json)) : [],
          dependencies: catalog.dependencies_json ? JSON.parse(JSON.stringify(catalog.dependencies_json)) : []
        };
      });

      return res.status(200).json({
        assessment_id: assessmentId,
        initiatives
      });
    }

    // C) Gerar Top 10 determinístico (se não existe ranking)
    // Ordenação determinística:
    // 1) impact (HIGH antes de MED)
    // 2) horizon (CURTO antes de MEDIO)
    // 3) created_at asc
    const { data: catalog, error: catalogFetchErr } = await supabase
      .schema('public')
      .from('full_initiatives_catalog')
      .select('*')
      .eq('active', true)
      .eq('segment', 'ALL')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });

    if (catalogFetchErr) {
      console.error('Erro ao buscar catálogo:', catalogFetchErr.message);
      return res.status(500).json({ error: 'erro inesperado' });
    }

    if (!catalog || catalog.length === 0) {
      return res.status(500).json({ error: 'catálogo de iniciativas vazio' });
    }

    // Ordenação determinística em memória
    const sortedCatalog = catalog.sort((a, b) => {
      // 1) impact: HIGH antes de MED
      const impactOrder = { 'HIGH': 1, 'MED': 2, 'LOW': 3 };
      const impactDiff = impactOrder[a.impact] - impactOrder[b.impact];
      if (impactDiff !== 0) return impactDiff;

      // 2) horizon: CURTO antes de MEDIO
      const horizonOrder = { 'CURTO': 1, 'MEDIO': 2 };
      const horizonDiff = horizonOrder[a.horizon] - horizonOrder[b.horizon];
      if (horizonDiff !== 0) return horizonDiff;

      // 3) created_at asc
      const dateA = new Date(a.created_at || 0);
      const dateB = new Date(b.created_at || 0);
      const dateDiff = dateA - dateB;
      if (dateDiff !== 0) return dateDiff;

      // 4) id asc (desempate final para garantir determinismo)
      return a.id.localeCompare(b.id);
    });

    // Pegar Top 10
    const top10 = sortedCatalog.slice(0, 10);

    if (top10.length === 0) {
      return res.status(500).json({ error: 'não foi possível gerar ranking' });
    }

    // Persistir Top 10 em full_assessment_initiatives
    const inserts = top10.map((initiative, index) => ({
      assessment_id: assessmentId,
      initiative_id: initiative.id,
      rank: index + 1,
      process: initiative.process
    }));

    const { data: insertedRanking, error: insertErr } = await supabase
      .schema('public')
      .from('full_assessment_initiatives')
      .insert(inserts)
      .select();

    if (insertErr) {
      console.error('Erro ao persistir ranking:', insertErr.message);
      return res.status(500).json({ error: 'erro inesperado' });
    }

    // Montar resposta
    const initiatives = top10.map((initiative, index) => ({
      rank: index + 1,
      process: initiative.process,
      initiative_id: initiative.id,
      title: initiative.title,
      impact: initiative.impact,
      horizon: initiative.horizon,
      rationale: initiative.rationale,
      prerequisites: initiative.prerequisites_json ? JSON.parse(JSON.stringify(initiative.prerequisites_json)) : [],
      dependencies: initiative.dependencies_json ? JSON.parse(JSON.stringify(initiative.dependencies_json)) : []
    }));

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
