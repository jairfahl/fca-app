/**
 * Rotas de recomendações LIGHT (F3):
 *   GET  /assessments/:id/recommendations
 *   POST /assessments/:id/free-actions/select
 */
const express = require('express');
const router = express.Router();
const { supabase } = require('../../lib/supabase');
const { requireAuth } = require('../../middleware/requireAuth');
const { blockConsultorOnMutation } = require('../../middleware/requireRole');
const {
  validateAssessmentOwnership,
  generateTop10Recommendations,
  FALLBACK_BY_PROCESS,
} = require('./helpers');

/**
 * GET /assessments/:id/recommendations
 * Retorna Top 10 recomendações do assessment (gera se não existir)
 */
router.get('/assessments/:id/recommendations', requireAuth, blockConsultorOnMutation, async (req, res) => {
  try {
    const assessmentId = req.params.id;

    const ownership = await validateAssessmentOwnership(assessmentId, req.user.id);
    if (!ownership.valid) {
      return res.status(ownership.error === 'sem acesso' ? 403 : 404).json({ error: ownership.error });
    }

    const companyId = ownership.assessment.company_id;
    const { data: entitlement, error: entErr } = await supabase
      .from('entitlements')
      .select('plan, status')
      .eq('user_id', req.user.id)
      .eq('company_id', companyId)
      .maybeSingle();

    if (entErr) {
      console.error('Erro ao buscar entitlement:', entErr.message);
      return res.status(500).json({ error: 'erro ao validar entitlement' });
    }

    const resolvedEntitlement = entitlement || { plan: 'LIGHT', status: 'ACTIVE' };
    if (resolvedEntitlement.status !== 'ACTIVE' || !['LIGHT', 'FULL'].includes(resolvedEntitlement.plan)) {
      return res.status(403).json({ error: 'entitlement inválido' });
    }

    const { data: existingRecs, error: existingErr } = await supabase
      .from('assessment_recommendations_ranked')
      .select('recommendation_id, process, rank')
      .eq('assessment_id', assessmentId)
      .order('rank', { ascending: true });

    let recommendations = [];

    const existingProcesses = new Set((existingRecs || []).map((item) => item.process));
    const hasAllProcesses = ['COMERCIAL', 'OPERACOES', 'ADM_FIN', 'GESTAO'].every((p) => existingProcesses.has(p));

    if (existingErr || !existingRecs || existingRecs.length === 0 || !hasAllProcesses) {
      if (!existingErr && existingRecs && existingRecs.length > 0 && !hasAllProcesses) {
        console.log(`Regerando Top 10 (processos incompletos) para assessment ${assessmentId}`);
      }
      console.log(`Gerando Top 10 para assessment ${assessmentId}`);

      const top10 = await generateTop10Recommendations(assessmentId);

      if (!top10 || top10.length === 0) {
        return res.json([]);
      }

      if (existingRecs && existingRecs.length > 0) {
        const { error: deleteErr } = await supabase
          .from('assessment_recommendations_ranked')
          .delete()
          .eq('assessment_id', assessmentId);
        if (deleteErr) {
          console.error('Erro ao limpar recomendações existentes:', deleteErr.message);
          return res.status(500).json({ error: 'erro ao limpar recomendações' });
        }
      }

      const inserts = top10.map(item => ({
        assessment_id: assessmentId,
        recommendation_id: item.recommendation_id,
        process: item.process,
        rank: item.rank
      }));

      const { error: insertErr } = await supabase
        .from('assessment_recommendations_ranked')
        .upsert(inserts, { onConflict: 'assessment_id,rank' });

      if (insertErr) {
        console.error('Erro ao persistir recomendações:', insertErr.message);
        return res.status(500).json({
          error: 'erro ao persistir recomendações',
          detail: insertErr.message
        });
      }

      const recIds = top10.map(r => r.recommendation_id);
      const { data: catalogData, error: catalogErr } = await supabase
        .from('recommendations_catalog')
        .select('id, title, description, priority')
        .in('id', recIds);

      if (catalogErr) {
        return res.status(500).json({ error: 'erro ao buscar catálogo', detail: catalogErr.message });
      }

      const catalogMap = {};
      catalogData.forEach(rec => { catalogMap[rec.id] = rec; });

      recommendations = top10.map(item => ({
        recommendation_id: item.recommendation_id,
        process: item.process,
        rank: item.rank,
        rec: catalogMap[item.recommendation_id]
      }));
    } else {
      const recIds = existingRecs.map(r => r.recommendation_id);
      const { data: catalogData, error: catalogErr } = await supabase
        .from('recommendations_catalog')
        .select('id, title, description, priority')
        .in('id', recIds);

      if (catalogErr) {
        return res.status(500).json({ error: 'erro ao buscar catálogo', detail: catalogErr.message });
      }

      const catalogMap = {};
      catalogData.forEach(rec => { catalogMap[rec.id] = rec; });

      recommendations = existingRecs.map(item => ({
        recommendation_id: item.recommendation_id,
        process: item.process,
        rank: item.rank,
        rec: catalogMap[item.recommendation_id]
      }));
    }

    const { data: freeActions, error: freeErr } = await supabase
      .from('assessment_free_actions')
      .select('recommendation_id, process')
      .eq('assessment_id', assessmentId);

    const freeActionsByProcess = {};
    const freeActionsByRec = {};
    if (!freeErr && freeActions) {
      freeActions.forEach(fa => {
        freeActionsByProcess[fa.process] = true;
        freeActionsByRec[fa.recommendation_id] = true;
      });
    }

    const processOrder = ['COMERCIAL', 'OPERACOES', 'ADM_FIN', 'GESTAO'];
    const fallbackByProcess = FALLBACK_BY_PROCESS;

    const sortedRecs = recommendations
      .filter(item => processOrder.includes(item.process))
      .sort((a, b) => (a.rank || 0) - (b.rank || 0));

    const byProcess = {};
    sortedRecs.forEach((item) => {
      if (!byProcess[item.process]) {
        byProcess[item.process] = item;
      }
    });

    const response = processOrder.map((process, idx) => {
      const item = byProcess[process];
      const fallback = fallbackByProcess[process];
      if (!item) {
        return {
          recommendation_id: `fallback-${process}`,
          action_id: `fallback-${process}`,
          process,
          rank: idx + 1,
          title: fallback.title,
          description: fallback.why,
          why: fallback.why,
          risk: fallback.risk_tag.includes('HIGH') ? 'HIGH' : fallback.risk_tag.includes('MED') ? 'MED' : 'LOW',
          impact: fallback.impact_tag.includes('HIGH') ? 'HIGH' : fallback.impact_tag.includes('MED') ? 'MED' : 'LOW',
          risk_tag: fallback.risk_tag,
          impact_tag: fallback.impact_tag,
          checklist: fallback.checklist || [],
          priority: null,
          is_free_eligible: false,
          is_selected_free: false,
          is_locked: false,
          is_fallback: true,
        };
      }

      const isFreeEligible = !freeActionsByProcess[item.process];
      const isSelectedFree = !!freeActionsByRec[item.recommendation_id];
      const title = item.rec?.title || fallback.title;
      const description = item.rec?.description || fallback.why;
      const why = description || 'Ação direta para melhorar o resultado desta área.';
      return {
        recommendation_id: item.recommendation_id,
        action_id: item.recommendation_id,
        process: item.process,
        rank: idx + 1,
        title,
        description,
        why,
        risk: 'MED',
        impact: 'HIGH',
        risk_tag: 'RISCO: MED',
        impact_tag: 'IMPACTO: HIGH',
        checklist: [],
        priority: item.rec?.priority || null,
        is_free_eligible: isFreeEligible,
        is_selected_free: isSelectedFree,
        is_locked: false,
      };
    });

    console.log('[LIGHT_RECS]', {
      assessment_id: assessmentId,
      company_id: companyId,
      entitlement: `${resolvedEntitlement.plan}/${resolvedEntitlement.status}`,
      processes: response.map((item) => item.process),
    });

    res.json(response);
  } catch (error) {
    console.error('Erro ao buscar recomendações:', error);
    res.status(500).json({ error: 'erro inesperado' });
  }
});

/**
 * POST /assessments/:id/free-actions/select
 * Seleciona uma recomendação como ação gratuita
 */
router.post('/assessments/:id/free-actions/select', requireAuth, blockConsultorOnMutation, async (req, res) => {
  try {
    const assessmentId = req.params.id;
    const { recommendation_id } = req.body;

    if (!recommendation_id) {
      return res.status(400).json({ error: 'recommendation_id é obrigatório' });
    }

    const ownership = await validateAssessmentOwnership(assessmentId, req.user.id);
    if (!ownership.valid) {
      return res.status(ownership.error === 'sem acesso' ? 403 : 404).json({ error: ownership.error });
    }

    let process;
    if (String(recommendation_id).startsWith('fallback-')) {
      process = String(recommendation_id).replace(/^fallback-/, '');
      if (!['COMERCIAL', 'OPERACOES', 'ADM_FIN', 'GESTAO'].includes(process)) {
        return res.status(400).json({ error: 'processo inválido no fallback' });
      }
    } else {
      const { data: assessmentRec, error: recErr } = await supabase
        .from('assessment_recommendations_ranked')
        .select('process')
        .eq('assessment_id', assessmentId)
        .eq('recommendation_id', recommendation_id)
        .single();

      if (recErr || !assessmentRec) {
        return res.status(400).json({ error: 'recomendação não está no Top 10 deste assessment' });
      }
      process = assessmentRec.process;
    }

    const { data: existingFree, error: freeErr } = await supabase
      .from('assessment_free_actions')
      .select('id, assessment_id, recommendation_id, process, status, created_at')
      .eq('assessment_id', assessmentId)
      .eq('process', process)
      .maybeSingle();

    if (freeErr) {
      return res.status(500).json({ error: 'erro ao verificar ações gratuitas' });
    }

    if (existingFree) {
      const body = {
        id: existingFree.id,
        assessment_id: existingFree.assessment_id,
        company_id: ownership.assessment.company_id,
        process: existingFree.process,
        recommendation_id: existingFree.recommendation_id,
        status: existingFree.status,
        created_at: existingFree.created_at,
        created: false,
        already_exists: true,
        plan_id: existingFree.id,
        message: 'Plano já existe para este processo.',
      };
      return res.status(200).json(body);
    }

    const { data: freeAction, error: insertErr } = await supabase
      .from('assessment_free_actions')
      .insert({
        assessment_id: assessmentId,
        recommendation_id: recommendation_id,
        process,
        status: 'ACTIVE'
      })
      .select()
      .single();

    if (insertErr) {
      console.error('Erro ao criar free_action:', insertErr.message);
      return res.status(500).json({ error: 'erro ao criar ação gratuita' });
    }

    const createdBody = {
      ...freeAction,
      company_id: ownership.assessment.company_id,
      created: true,
      already_exists: false,
      plan_id: freeAction.id,
    };
    res.status(201).json(createdBody);
  } catch (error) {
    console.error('Erro ao selecionar ação gratuita:', error.message);
    res.status(500).json({ error: 'erro inesperado' });
  }
});

module.exports = router;
