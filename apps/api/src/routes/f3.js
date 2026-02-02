const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');
const { requireAuth } = require('../middleware/requireAuth');

/**
 * Helper: Validar ownership de assessment
 */
async function validateAssessmentOwnership(assessmentId, userId) {
  const { data: assessment, error: aErr } = await supabase
    .from('assessments')
    .select('id, company_id')
    .eq('id', assessmentId)
    .maybeSingle();

  if (aErr || !assessment) {
    return { valid: false, error: 'assessment não encontrado' };
  }

  const { data: company, error: cErr } = await supabase
    .from('companies')
    .select('owner_user_id')
    .eq('id', assessment.company_id)
    .maybeSingle();

  if (cErr || !company) {
    return { valid: false, error: 'company não encontrada' };
  }

  if (company.owner_user_id !== userId) {
    return { valid: false, error: 'sem acesso' };
  }

  return { valid: true, assessment };
}

/**
 * Helper: Normalizar category do DB para formato interno
 * Remove acentos, converte para maiúsculas, substitui espaços/hífens por underscore
 */
function normalizeCategory(category) {
  if (!category || typeof category !== 'string') {
    return null;
  }
  
  // Converter para maiúsculas
  let normalized = category.toUpperCase();
  
  // Remover acentos usando NFD (Normalization Form Decomposed)
  normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  // Substituir espaços e hífens por underscore
  normalized = normalized.replace(/[\s\-]/g, '_');
  
  return normalized;
}

/**
 * Helper: Mapear category normalizada para process
 */
function categoryToProcess(normalizedCategory) {
  const mapping = {
    'COMERCIAL': 'COMERCIAL',
    'OPERACOES': 'OPERACOES',
    'ADMINISTRATIVO_FINANCEIRO': 'ADM_FIN',
    'GESTAO': 'GESTAO'
  };
  return mapping[normalizedCategory] || null;
}

/**
 * Helper: Ordenar recomendações determinísticamente
 */
function sortRecommendations(recs) {
  const priorityOrder = { HIGH: 3, MED: 2, LOW: 1 };
  
  return recs.sort((a, b) => {
    // 1. Por priority (HIGH > MED > LOW)
    const priorityDiff = (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
    if (priorityDiff !== 0) return priorityDiff;
    
    // 2. Por title (ASC)
    const titleDiff = (a.title || '').localeCompare(b.title || '');
    if (titleDiff !== 0) return titleDiff;
    
    // 3. Por id (ASC) - último desempate
    return (a.id || '').localeCompare(b.id || '');
  });
}

/**
 * Helper: Gerar Top 10 recomendações determinístico
 * Usa schema real: id, code, title, description, category, priority, min_score, max_score, is_active
 */
async function generateTop10Recommendations(assessmentId) {
  // 1. Buscar scores do assessment
  const { data: scoresData, error: scoresErr } = await supabase
    .from('scores')
    .select('commercial, operations, admin_fin, management')
    .eq('assessment_id', assessmentId)
    .maybeSingle();

  if (scoresErr || !scoresData) {
    throw new Error('scores não encontrados para o assessment');
  }

  // Mapear scores para processos (0-10 conforme schema)
  const processScores = {
    COMERCIAL: Number(scoresData.commercial) || 0,
    OPERACOES: Number(scoresData.operations) || 0,
    ADM_FIN: Number(scoresData.admin_fin) || 0,
    GESTAO: Number(scoresData.management) || 0
  };

  const processes = ['COMERCIAL', 'OPERACOES', 'ADM_FIN', 'GESTAO'];
  const recommendations = [];
  const usedIds = new Set(); // Evitar duplicatas

  // 2. Buscar todas as recomendações ativas do catálogo
  const { data: allCatalogRecs, error: catalogErr } = await supabase
    .from('recommendations_catalog')
    .select('*')
    .eq('is_active', true);

  if (catalogErr) {
    throw new Error(`Erro ao buscar catálogo: ${catalogErr.message}`);
  }

  if (!allCatalogRecs || allCatalogRecs.length === 0) {
    throw new Error('Nenhuma recomendação ativa encontrada no catálogo');
  }

  // 3. Para cada processo, buscar recomendações compatíveis
  for (const process of processes) {
    const processScore = processScores[process];
    // Converter score de 0-10 para 0-100 (escala do catálogo)
    const scoreCatalog = processScore * 10;

    // Filtrar recomendações que pertencem a este processo
    const processRecs = allCatalogRecs.filter(rec => {
      const normalizedCat = normalizeCategory(rec.category);
      const mappedProcess = categoryToProcess(normalizedCat);
      return mappedProcess === process;
    });

    if (processRecs.length === 0) {
      continue;
    }

    // Filtrar por min_score e max_score (scoreCatalog BETWEEN min_score AND max_score)
    const compatibleRecs = processRecs.filter(rec => {
      const minScore = Number(rec.min_score) || 0;
      const maxScore = Number(rec.max_score) || 100;
      return scoreCatalog >= minScore && scoreCatalog <= maxScore;
    });

    if (compatibleRecs.length === 0) {
      continue;
    }

    // Ordenar determinísticamente
    const sortedRecs = sortRecommendations(compatibleRecs);

    // Adicionar ao array com rank (até completar 10)
    for (const rec of sortedRecs) {
      if (recommendations.length >= 10) break;
      
      // Evitar duplicatas
      if (usedIds.has(rec.id)) {
        continue;
      }

      usedIds.add(rec.id);
      const normalizedCat = normalizeCategory(rec.category);
      const processMapped = categoryToProcess(normalizedCat);
      if (!processMapped) continue; // Ignorar categories inválidas

      recommendations.push({
        recommendation_id: rec.id,
        process: processMapped,
        rank: recommendations.length + 1,
        rec: rec
      });
    }

    if (recommendations.length >= 10) break;
  }

  // 4. Se não conseguiu 10, completar com qualquer category válida
  if (recommendations.length < 10) {
    // Filtrar manualmente (remover já incluídas e mapear categories válidas)
    const filteredRecs = allCatalogRecs.filter(rec => {
      if (usedIds.has(rec.id)) return false;
      const normalizedCat = normalizeCategory(rec.category);
      const mappedProcess = categoryToProcess(normalizedCat);
      return mappedProcess !== null; // Apenas categories válidas
    });

    // Ordenar determinísticamente
    const sortedRecs = sortRecommendations(filteredRecs);

    for (const rec of sortedRecs) {
      if (recommendations.length >= 10) break;
      if (usedIds.has(rec.id)) continue;
      
      const normalizedCat = normalizeCategory(rec.category);
      const processMapped = categoryToProcess(normalizedCat);
      if (!processMapped) continue;

      usedIds.add(rec.id);
      recommendations.push({
        recommendation_id: rec.id,
        process: processMapped,
        rank: recommendations.length + 1,
        rec: rec
      });
    }
  }

  // Garantir exatamente 10
  return recommendations.slice(0, 10);
}

/**
 * GET /assessments/:id/recommendations
 * Retorna Top 10 recomendações do assessment (gera se não existir)
 */
router.get('/assessments/:id/recommendations', requireAuth, async (req, res) => {
  try {
    const assessmentId = req.params.id;

    // Validar ownership
    const ownership = await validateAssessmentOwnership(assessmentId, req.user.id);
    if (!ownership.valid) {
      return res.status(ownership.error === 'sem acesso' ? 403 : 404).json({ error: ownership.error });
    }

    // Verificar se já existe assessment_recommendations_ranked
    const { data: existingRecs, error: existingErr } = await supabase
      .from('assessment_recommendations_ranked')
      .select('recommendation_id, process, rank')
      .eq('assessment_id', assessmentId)
      .order('rank', { ascending: true });

    let recommendations = [];

    if (existingErr || !existingRecs || existingRecs.length === 0) {
      // Não existe, gerar Top 10
      console.log(`Gerando Top 10 para assessment ${assessmentId}`);

      // Gerar Top 10 (não precisa mais de companySegment)
      const top10 = await generateTop10Recommendations(assessmentId);

      // Persistir em transação
      const inserts = top10.map(item => ({
        assessment_id: assessmentId,
        recommendation_id: item.recommendation_id,
        process: item.process,
        rank: item.rank
      }));

      const { error: insertErr } = await supabase
        .from('assessment_recommendations_ranked')
        .insert(inserts);

      if (insertErr) {
        console.error('Erro ao persistir recomendações:', insertErr.message);
        return res.status(500).json({ 
          error: 'erro ao persistir recomendações',
          detail: insertErr.message 
        });
      }

      // Buscar dados completos das recomendações do catálogo
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
      // Já existe, buscar do DB
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

    // Buscar free_actions existentes para calcular is_free_eligible e is_selected_free
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

    // Montar resposta (apenas campos que existem no schema real)
    const response = recommendations.map(item => {
      if (!item.rec) {
        // Se não encontrou no catálogo, retornar dados básicos
        return {
          recommendation_id: item.recommendation_id,
          process: item.process,
          rank: item.rank,
          title: null,
          description: null,
          priority: null
        };
      }

      const isFreeEligible = !freeActionsByProcess[item.process];
      const isSelectedFree = !!freeActionsByRec[item.recommendation_id];

      return {
        recommendation_id: item.recommendation_id,
        process: item.process,
        rank: item.rank,
        title: item.rec.title || null,
        description: item.rec.description || null,
        priority: item.rec.priority || null,
        is_free_eligible: isFreeEligible,
        is_selected_free: isSelectedFree
      };
    });

    res.json(response);
  } catch (error) {
    console.error('Erro ao buscar recomendações:', error.message);
    res.status(500).json({ error: 'erro inesperado' });
  }
});

/**
 * POST /assessments/:id/free-actions/select
 * Seleciona uma recomendação como ação gratuita
 */
router.post('/assessments/:id/free-actions/select', requireAuth, async (req, res) => {
  try {
    const assessmentId = req.params.id;
    const { recommendation_id } = req.body;

    // Validar recommendation_id
    if (!recommendation_id) {
      return res.status(400).json({ error: 'recommendation_id é obrigatório' });
    }

    // Validar ownership
    const ownership = await validateAssessmentOwnership(assessmentId, req.user.id);
    if (!ownership.valid) {
      return res.status(ownership.error === 'sem acesso' ? 403 : 404).json({ error: ownership.error });
    }

    // Validar que recommendation_id está no Top 10 do assessment
    const { data: assessmentRec, error: recErr } = await supabase
      .from('assessment_recommendations_ranked')
      .select('process')
      .eq('assessment_id', assessmentId)
      .eq('recommendation_id', recommendation_id)
      .single();

    if (recErr || !assessmentRec) {
      return res.status(400).json({ error: 'recomendação não está no Top 10 deste assessment' });
    }

    // Verificar se já existe free_action para esse process
    const { data: existingFree, error: freeErr } = await supabase
      .from('assessment_free_actions')
      .select('id')
      .eq('assessment_id', assessmentId)
      .eq('process', assessmentRec.process)
      .maybeSingle();

    if (freeErr) {
      return res.status(500).json({ error: 'erro ao verificar ações gratuitas' });
    }

    if (existingFree) {
      return res.status(400).json({ error: `já existe ação gratuita para o processo ${assessmentRec.process}` });
    }

    // Inserir free_action
    const { data: freeAction, error: insertErr } = await supabase
      .from('assessment_free_actions')
      .insert({
        assessment_id: assessmentId,
        recommendation_id: recommendation_id,
        process: assessmentRec.process,
        status: 'ACTIVE'
      })
      .select()
      .single();

    if (insertErr) {
      console.error('Erro ao criar free_action:', insertErr.message);
      return res.status(500).json({ error: 'erro ao criar ação gratuita' });
    }

    res.status(201).json(freeAction);
  } catch (error) {
    console.error('Erro ao selecionar ação gratuita:', error.message);
    res.status(500).json({ error: 'erro inesperado' });
  }
});

/**
 * POST /free-actions/:id/evidence
 * Adiciona evidência textual a uma ação gratuita (write-once)
 * Usa assessment_free_action_evidences como fonte de verdade
 */
router.post('/free-actions/:id/evidence', requireAuth, async (req, res) => {
  try {
    const freeActionId = req.params.id;
    const { evidence_text } = req.body;

    // 1. Validar evidence_text
    if (!evidence_text || typeof evidence_text !== 'string' || evidence_text.trim().length === 0) {
      return res.status(400).json({ error: 'evidence_text é obrigatório' });
    }

    // 2. Buscar action em assessment_free_actions
    const { data: freeAction, error: faErr } = await supabase
      .schema('public')
      .from('assessment_free_actions')
      .select('id, assessment_id, recommendation_id')
      .eq('id', freeActionId)
      .single();

    if (faErr || !freeAction) {
      return res.status(404).json({ error: 'ação gratuita não encontrada' });
    }

    // 3. Validar ownership
    const ownership = await validateAssessmentOwnership(freeAction.assessment_id, req.user.id);
    if (!ownership.valid) {
      if (ownership.error === 'sem acesso') {
        return res.status(403).json({ error: 'sem acesso' });
      }
      return res.status(404).json({ error: ownership.error });
    }

    // 4. Write-once: verificar se já existe evidência
    const { data: existingEvidence, error: evErr } = await supabase
      .schema('public')
      .from('assessment_free_action_evidences')
      .select('id')
      .eq('free_action_id', freeActionId)
      .maybeSingle();

    if (evErr) {
      console.error('Erro ao verificar evidência:', {
        message: evErr.message,
        code: evErr.code,
        details: evErr.details,
        hint: evErr.hint,
        fullError: JSON.stringify(evErr)
      });
      return res.status(500).json({ error: 'erro ao verificar evidência' });
    }

    if (existingEvidence) {
      console.log(`EVIDENCE WRITE-ONCE BLOCK action_id=${freeActionId}`);
      return res.status(409).json({ error: 'evidência já registrada' });
    }

    // 5. Inserir em assessment_free_action_evidences
    const { data: newEvidence, error: insertErr } = await supabase
      .schema('public')
      .from('assessment_free_action_evidences')
      .insert({
        free_action_id: freeActionId,
        evidence_text: evidence_text.trim(),
        created_by_user_id: req.user.id
      })
      .select('id, free_action_id, created_at')
      .single();

    if (insertErr) {
      console.error('Erro ao inserir evidência:', {
        message: insertErr.message,
        code: insertErr.code,
        details: insertErr.details,
        hint: insertErr.hint,
        fullError: JSON.stringify(insertErr)
      });
      return res.status(500).json({ error: 'erro ao inserir evidência' });
    }

    // Atualizar status da ação gratuita para COMPLETED
    const { error: updateErr } = await supabase
      .schema('public')
      .from('assessment_free_actions')
      .update({ status: 'COMPLETED' })
      .eq('id', freeActionId);

    if (updateErr) {
      console.error('Erro ao concluir ação gratuita:', updateErr.message);
      return res.status(500).json({ error: 'erro ao concluir ação gratuita' });
    }

    console.log(`EVIDENCE CREATE action_id=${freeActionId} user_id=${req.user.id}`);

    res.status(201).json(newEvidence);
  } catch (error) {
    console.error('Erro ao adicionar evidência:', error.message);
    res.status(500).json({ error: 'erro inesperado' });
  }
});

/**
 * GET /free-actions/:id
 * Retorna ação gratuita com recomendação e evidência
 */
router.get('/free-actions/:id', requireAuth, async (req, res) => {
  try {
    const freeActionId = req.params.id;

    // Buscar free_action
    const { data: freeAction, error: faErr } = await supabase
      .from('assessment_free_actions')
      .select('*')
      .eq('id', freeActionId)
      .single();

    if (faErr || !freeAction) {
      return res.status(404).json({ error: 'ação gratuita não encontrada' });
    }

    // Validar ownership
    const ownership = await validateAssessmentOwnership(freeAction.assessment_id, req.user.id);
    if (!ownership.valid) {
      return res.status(ownership.error === 'sem acesso' ? 403 : 404).json({ error: ownership.error });
    }

    // Buscar recomendação
    const { data: recommendation, error: recErr } = await supabase
      .from('recommendations_catalog')
      .select('title, description')
      .eq('id', freeAction.recommendation_id)
      .single();

    if (recErr) {
      return res.status(500).json({ error: 'erro ao buscar recomendação' });
    }

    // Buscar evidência se existir (em assessment_free_action_evidences)
    const { data: evidence, error: evErr } = await supabase
      .schema('public')
      .from('assessment_free_action_evidences')
      .select('evidence_text, created_at')
      .eq('free_action_id', freeActionId)
      .maybeSingle();

    res.json({
      id: freeAction.id,
      assessment_id: freeAction.assessment_id,
      recommendation_id: freeAction.recommendation_id,
      process: freeAction.process,
      status: freeAction.status,
      created_at: freeAction.created_at,
      completed_at: freeAction.completed_at,
      recommendation: {
        title: recommendation.title,
        description: recommendation.description,
        checklist: [] // Campo mantido por compatibilidade (schema real não tem checklist_json)
      },
      evidence: evidence ? {
        evidence_text: evidence.evidence_text,
        created_at: evidence.created_at
      } : null
    });
  } catch (error) {
    console.error('Erro ao buscar ação gratuita:', error.message);
    res.status(500).json({ error: 'erro inesperado' });
  }
});

module.exports = router;
