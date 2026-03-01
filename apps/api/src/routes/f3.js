const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');
const { requireAuth } = require('../middleware/requireAuth');
const { blockConsultorOnMutation } = require('../middleware/requireRole');

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
 * Helper: Validar ownership de free_action
 */
async function validateFreeActionOwnership(freeActionId, userId) {
  const { data: freeAction, error: faErr } = await supabase
    .from('assessment_free_actions')
    .select('id, assessment_id, process')
    .eq('id', freeActionId)
    .maybeSingle();

  if (faErr || !freeAction) {
    return { valid: false, error: 'ação gratuita não encontrada' };
  }

  const ownership = await validateAssessmentOwnership(freeAction.assessment_id, userId);
  if (!ownership.valid) {
    return ownership;
  }

  return { valid: true, freeAction, assessment: ownership.assessment };
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

/** Whitelist de processKey (lowercase) -> process (uppercase) */
const PROCESS_KEY_MAP = {
  comercial: 'COMERCIAL',
  operacoes: 'OPERACOES',
  adm_fin: 'ADM_FIN',
  gestao: 'GESTAO',
};

function normalizeProcessKey(processKey) {
  if (!processKey || typeof processKey !== 'string') return null;
  const key = String(processKey).toLowerCase().trim();
  return PROCESS_KEY_MAP[key] || null;
}

/** Fallback LIGHT por processo (LIGHT executável mesmo sem catálogo) */
const FALLBACK_BY_PROCESS = {
  COMERCIAL: {
    title: 'Criar rotina semanal de prospecção',
    why: 'Acelere a entrada de novas oportunidades com rotina simples.',
    risk_tag: 'RISCO: MED',
    impact_tag: 'IMPACTO: HIGH',
    checklist: [
      'Definir dias/horários fixos para prospecção',
      'Listar metas semanais de novos contatos',
      'Registrar resultados em planilha ou CRM',
      'Revisar aprendizados e ajustar abordagem',
    ],
  },
  OPERACOES: {
    title: 'Padronizar entrega com checklist e responsável',
    why: 'Reduza retrabalho e aumente consistência na entrega.',
    risk_tag: 'RISCO: MED',
    impact_tag: 'IMPACTO: HIGH',
    checklist: [
      'Definir as etapas críticas da entrega',
      'Documentar checklist em papel ou digital',
      'Atribuir responsável por etapa',
      'Revisar checklist semanalmente',
    ],
  },
  ADM_FIN: {
    title: 'Organizar fluxo de caixa (D+7)',
    why: 'Tenha previsibilidade mínima para decisões semanais.',
    risk_tag: 'RISCO: HIGH',
    impact_tag: 'IMPACTO: HIGH',
    checklist: [
      'Projetar entradas e saídas dos próximos 7 dias',
      'Atualizar diariamente com lançamentos reais',
      'Comparar projetado vs realizado',
      'Sinalizar alertas se houver gap crítico',
    ],
  },
  GESTAO: {
    title: 'Definir metas trimestrais e ritual de acompanhamento',
    why: 'Direcione a equipe com metas claras e revisão frequente.',
    risk_tag: 'RISCO: MED',
    impact_tag: 'IMPACTO: MED',
    checklist: [
      'Definir 3–5 metas claras para o trimestre',
      'Comunicar metas à equipe',
      'Agendar ritual semanal de acompanhamento',
      'Revisar e ajustar metas conforme resultado',
    ],
  },
};

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
    return [];
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
    let compatibleRecs = processRecs.filter(rec => {
      const minScore = Number(rec.min_score) || 0;
      const maxScore = Number(rec.max_score) || 100;
      return scoreCatalog >= minScore && scoreCatalog <= maxScore;
    });

    if (compatibleRecs.length === 0) {
      // Fallback determinístico: usa catálogo do processo mesmo sem match de score
      compatibleRecs = processRecs;
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

  // Garantir no máximo 10
  return recommendations.slice(0, 10);
}

/**
 * GET /assessments/:id/recommendations
 * Retorna Top 10 recomendações do assessment (gera se não existir)
 */
router.get('/assessments/:id/recommendations', requireAuth, blockConsultorOnMutation, async (req, res) => {
  try {
    const assessmentId = req.params.id;

    // Validar ownership
    const ownership = await validateAssessmentOwnership(assessmentId, req.user.id);
    if (!ownership.valid) {
      return res.status(ownership.error === 'sem acesso' ? 403 : 404).json({ error: ownership.error });
    }

    const companyId = ownership.assessment.company_id;
    // Validar entitlement (LIGHT/FULL) ativo para company
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

    // Se não houver entitlement, tratar como LIGHT/ACTIVE (default)
    const resolvedEntitlement = entitlement || { plan: 'LIGHT', status: 'ACTIVE' };
    if (resolvedEntitlement.status !== 'ACTIVE' || !['LIGHT', 'FULL'].includes(resolvedEntitlement.plan)) {
      return res.status(403).json({ error: 'entitlement inválido' });
    }

    // Verificar se já existe assessment_recommendations_ranked
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
      // Não existe, gerar Top 10
      console.log(`Gerando Top 10 para assessment ${assessmentId}`);

      // Gerar Top 10 (não precisa mais de companySegment)
      const top10 = await generateTop10Recommendations(assessmentId);

      if (!top10 || top10.length === 0) {
        return res.json([]);
      }

      // Limpar registros anteriores se existirem (caso de processos incompletos)
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

      // Persistir em transação
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

    // Validar recommendation_id
    if (!recommendation_id) {
      return res.status(400).json({ error: 'recommendation_id é obrigatório' });
    }

    // Validar ownership
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

    // Verificar se já existe free_action para esse process (idempotente)
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

    // Inserir free_action
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

/**
 * POST /free-actions/:id/evidence
 * Adiciona evidência textual a uma ação gratuita (write-once)
 * Usa assessment_free_action_evidences como fonte de verdade
 */
router.post('/free-actions/:id/evidence', requireAuth, blockConsultorOnMutation, async (req, res) => {
  try {
    const freeActionId = req.params.id;
    const { evidence_text, declared_gain_type, declared_gain_note, done_criteria_json } = req.body;

    // 1. Validar evidence_text
    if (!evidence_text || typeof evidence_text !== 'string' || evidence_text.trim().length === 0) {
      return res.status(400).json({ error: 'evidence_text é obrigatório' });
    }

    if (done_criteria_json !== undefined && !Array.isArray(done_criteria_json)) {
      return res.status(400).json({ error: 'done_criteria_json deve ser uma lista' });
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
        created_by_user_id: req.user.id,
        declared_gain_type: declared_gain_type ? String(declared_gain_type).trim() : null,
        declared_gain_note: declared_gain_note ? String(declared_gain_note).trim() : null,
        done_criteria_json: Array.isArray(done_criteria_json) ? done_criteria_json : null
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

    // Bloquear plano 30d (locked = true) quando evidência é registrada
    await supabase
      .from('light_action_plans')
      .update({ locked: true, updated_at: new Date().toISOString() })
      .eq('free_action_id', freeActionId);

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
router.get('/free-actions/:id', requireAuth, blockConsultorOnMutation, async (req, res) => {
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

    // Buscar recomendação (catálogo ou fallback LIGHT)
    let recommendation;
    if (String(freeAction.recommendation_id).startsWith('fallback-')) {
      const fallback = FALLBACK_BY_PROCESS[freeAction.process];
      recommendation = fallback ? {
        title: fallback.title,
        description: fallback.why,
        checklist: fallback.checklist || []
      } : { title: 'Ação padrão', description: '', checklist: [] };
    } else {
      const { data: catalogRec, error: recErr } = await supabase
        .from('recommendations_catalog')
        .select('title, description')
        .eq('id', freeAction.recommendation_id)
        .single();

      if (recErr) {
        return res.status(500).json({ error: 'erro ao buscar recomendação' });
      }
      recommendation = {
        title: catalogRec.title,
        description: catalogRec.description,
        checklist: [] // Campo mantido por compatibilidade (schema real não tem checklist_json)
      };
    }

    // Buscar evidência se existir (em assessment_free_action_evidences)
    const { data: evidence, error: evErr } = await supabase
      .schema('public')
      .from('assessment_free_action_evidences')
      .select('evidence_text, created_at, declared_gain_type, declared_gain_note, done_criteria_json')
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
        checklist: recommendation.checklist || []
      },
      evidence: evidence ? {
        evidence_text: evidence.evidence_text,
        created_at: evidence.created_at,
        declared_gain_type: evidence.declared_gain_type,
        declared_gain_note: evidence.declared_gain_note,
        done_criteria_json: evidence.done_criteria_json
      } : null
    });
  } catch (error) {
    console.error('Erro ao buscar ação gratuita:', error.message);
    res.status(500).json({ error: 'erro inesperado' });
  }
});

/**
 * GET /light/plans/status?assessment_id=&company_id=
 * Status agregado dos 4 planos (mapa por processo)
 */
router.get('/light/plans/status', requireAuth, blockConsultorOnMutation, async (req, res) => {
  try {
    const assessmentId = req.query.assessment_id;
    const companyId = req.query.company_id;

    if (!assessmentId || !companyId) {
      return res.status(400).json({ error: 'assessment_id e company_id são obrigatórios' });
    }

    const ownership = await validateAssessmentOwnership(assessmentId, req.user.id);
    if (!ownership.valid) {
      return res.status(ownership.error === 'sem acesso' ? 403 : 404).json({ error: ownership.error });
    }

    if (ownership.assessment.company_id !== companyId) {
      return res.status(403).json({ error: 'sem acesso' });
    }

    const processes = ['COMERCIAL', 'OPERACOES', 'ADM_FIN', 'GESTAO'];
    const keyMap = { COMERCIAL: 'comercial', OPERACOES: 'operacoes', ADM_FIN: 'adm_fin', GESTAO: 'gestao' };
    const result = { comercial: {}, operacoes: {}, adm_fin: {}, gestao: {} };

    for (const process of processes) {
      const { data: freeAction, error: faErr } = await supabase
        .from('assessment_free_actions')
        .select('id, assessment_id, process, created_at')
        .eq('assessment_id', assessmentId)
        .eq('process', process)
        .maybeSingle();

      if (faErr || !freeAction) {
        result[keyMap[process]] = { exists: false };
        continue;
      }

      const { data: planRow } = await supabase
        .schema('public')
        .from('light_action_plans')
        .select('id, updated_at, locked')
        .eq('owner_user_id', req.user.id)
        .eq('assessment_id', assessmentId)
        .eq('process', process)
        .maybeSingle();

      const { data: evidenceRows } = await supabase
        .schema('public')
        .from('assessment_free_action_evidences')
        .select('id')
        .eq('free_action_id', freeAction.id)
        .limit(1);

      const completed = evidenceRows && evidenceRows.length > 0;
      const hasPlan = !!planRow;

      result[keyMap[process]] = {
        exists: true,
        plan_id: freeAction.id,
        completed,
        has_plan_30d: hasPlan,
        updated_at: planRow?.updated_at || freeAction.created_at,
      };
    }

    const allDone = processes.every((p) => result[keyMap[p]].exists && result[keyMap[p]].has_plan_30d);

    return res.json({
      by_process: result,
      all_done: allDone,
    });
  } catch (error) {
    console.error('Erro ao buscar status agregado:', error.message);
    return res.status(500).json({ error: 'erro inesperado' });
  }
});

/**
 * GET /light/plans/:processKey/status?assessment_id=&company_id=
 * Status do plano por processo (existe?, plan_id, completed, updated_at)
 */
router.get('/light/plans/:processKey/status', requireAuth, blockConsultorOnMutation, async (req, res) => {
  try {
    const processKey = req.params.processKey;
    const assessmentId = req.query.assessment_id;
    const companyId = req.query.company_id;

    const process = normalizeProcessKey(processKey);
    if (!process) {
      return res.status(400).json({ error: 'processKey inválido. Use: comercial, operacoes, adm_fin, gestao' });
    }

    if (!assessmentId || !companyId) {
      return res.status(400).json({ error: 'assessment_id e company_id são obrigatórios' });
    }

    const ownership = await validateAssessmentOwnership(assessmentId, req.user.id);
    if (!ownership.valid) {
      return res.status(ownership.error === 'sem acesso' ? 403 : 404).json({ error: ownership.error });
    }

    if (ownership.assessment.company_id !== companyId) {
      return res.status(403).json({ error: 'sem acesso' });
    }

    const { data: freeAction, error: faErr } = await supabase
      .from('assessment_free_actions')
      .select('id, assessment_id, process, created_at')
      .eq('assessment_id', assessmentId)
      .eq('process', process)
      .maybeSingle();

    if (faErr) {
      return res.status(500).json({ error: 'erro ao verificar plano' });
    }

    if (!freeAction) {
      return res.json({ exists: false });
    }

    const { data: evidenceRows } = await supabase
      .schema('public')
      .from('assessment_free_action_evidences')
      .select('id, created_at')
      .eq('free_action_id', freeAction.id)
      .limit(1);

    const hasEvidence = evidenceRows && evidenceRows.length > 0;
    const evidence = hasEvidence ? evidenceRows[0] : null;

    const { data: planRow } = await supabase
      .schema('public')
      .from('light_action_plans')
      .select('updated_at')
      .eq('owner_user_id', req.user.id)
      .eq('assessment_id', assessmentId)
      .eq('process', process)
      .maybeSingle();

    const updatedAt = planRow?.updated_at || evidence?.created_at || freeAction.created_at;

    return res.json({
      exists: true,
      plan_id: freeAction.id,
      completed: hasEvidence,
      updated_at: updatedAt || null,
    });
  } catch (error) {
    console.error('Erro ao buscar status do plano:', error.message);
    return res.status(500).json({ error: 'erro inesperado' });
  }
});

/**
 * GET /light/plans/:processKey?assessment_id=&company_id=
 * Retorna o plano salvo para o processo (free_action + light_action_plan)
 */
router.get('/light/plans/:processKey', requireAuth, blockConsultorOnMutation, async (req, res) => {
  try {
    const processKey = req.params.processKey;
    const assessmentId = req.query.assessment_id;
    const companyId = req.query.company_id;

    const process = normalizeProcessKey(processKey);
    if (!process) {
      return res.status(400).json({ error: 'processKey inválido. Use: comercial, operacoes, adm_fin, gestao' });
    }

    if (!assessmentId || !companyId) {
      return res.status(400).json({ error: 'assessment_id e company_id são obrigatórios' });
    }

    const ownership = await validateAssessmentOwnership(assessmentId, req.user.id);
    if (!ownership.valid) {
      return res.status(ownership.error === 'sem acesso' ? 403 : 404).json({ error: ownership.error });
    }

    if (ownership.assessment.company_id !== companyId) {
      return res.status(403).json({ error: 'sem acesso' });
    }

    const { data: freeAction, error: faErr } = await supabase
      .from('assessment_free_actions')
      .select('id, assessment_id, process, recommendation_id, status, created_at')
      .eq('assessment_id', assessmentId)
      .eq('process', process)
      .maybeSingle();

    if (faErr) {
      return res.status(500).json({ error: 'erro ao buscar plano' });
    }

    if (!freeAction) {
      return res.status(404).json({ error: 'plano não encontrado para este processo' });
    }

    const { data: planRow } = await supabase
      .schema('public')
      .from('light_action_plans')
      .select('*')
      .eq('owner_user_id', req.user.id)
      .eq('assessment_id', assessmentId)
      .eq('process', process)
      .maybeSingle();

    const { data: evidenceRows } = await supabase
      .schema('public')
      .from('assessment_free_action_evidences')
      .select('id, evidence_text, created_at, declared_gain_type, declared_gain_note, done_criteria_json')
      .eq('free_action_id', freeAction.id)
      .limit(1);

    const evidence = evidenceRows && evidenceRows.length > 0 ? evidenceRows[0] : null;

    const response = {
      plan_id: freeAction.id,
      free_action: {
        id: freeAction.id,
        assessment_id: freeAction.assessment_id,
        process: freeAction.process,
        recommendation_id: freeAction.recommendation_id,
        status: freeAction.status,
        created_at: freeAction.created_at,
      },
      light_plan: planRow || null,
      evidence: evidence ? {
        evidence_text: evidence.evidence_text,
        created_at: evidence.created_at,
        declared_gain_type: evidence.declared_gain_type,
        declared_gain_note: evidence.declared_gain_note,
        done_criteria_json: evidence.done_criteria_json,
      } : null,
      completed: !!evidence,
    };

    return res.json(response);
  } catch (error) {
    console.error('Erro ao buscar plano:', error.message);
    return res.status(500).json({ error: 'erro inesperado' });
  }
});

/**
 * GET /light/plans?assessment_id=&company_id=
 * Retorna planos LITE do usuário (com status de progresso/evidência)
 */
router.get('/light/plans', requireAuth, blockConsultorOnMutation, async (req, res) => {
  try {
    const assessmentId = req.query.assessment_id;
    const companyId = req.query.company_id;

    if (!assessmentId || !companyId) {
      return res.status(400).json({ error: 'assessment_id e company_id são obrigatórios' });
    }

    const ownership = await validateAssessmentOwnership(assessmentId, req.user.id);
    if (!ownership.valid) {
      return res.status(ownership.error === 'sem acesso' ? 403 : 404).json({ error: ownership.error });
    }

    if (ownership.assessment.company_id !== companyId) {
      return res.status(403).json({ error: 'sem acesso' });
    }

    const { data: plans, error: plansErr } = await supabase
      .schema('public')
      .from('light_action_plans')
      .select('id, assessment_id, company_id, process, assessment_free_action_id, free_action_id, step_1, step_2, step_3, owner_name, metric, checkpoint_date, locked, created_at, updated_at')
      .eq('assessment_id', assessmentId)
      .eq('company_id', companyId)
      .eq('owner_user_id', req.user.id);

    if (plansErr) {
      return res.status(500).json({ error: 'erro ao buscar planos' });
    }

    const processOrder = ['COMERCIAL', 'OPERACOES', 'ADM_FIN', 'GESTAO'];
    const orderedPlans = (plans || []).slice().sort((a, b) => {
      return processOrder.indexOf(a.process) - processOrder.indexOf(b.process);
    });

    return res.json(orderedPlans);
  } catch (error) {
    console.error('Erro ao buscar planos LITE:', error.message);
    return res.status(500).json({ error: 'erro inesperado' });
  }
});

/**
 * POST /light/plans
 * Cria/atualiza plano 30d (permitido apenas antes da evidência)
 */
router.post('/light/plans', requireAuth, blockConsultorOnMutation, async (req, res) => {
  try {
    const {
      assessment_id,
      company_id,
      process,
      free_action_id,
      assessment_free_action_id,
      step_1,
      step_2,
      step_3,
      owner_name,
      metric,
      checkpoint_date,
    } = req.body || {};

    const resolvedFreeActionId = free_action_id || assessment_free_action_id;
    const required = [assessment_id, company_id, process, resolvedFreeActionId, step_1, step_2, step_3, owner_name, metric, checkpoint_date];
    if (required.some((value) => !value || (typeof value === 'string' && value.trim().length === 0))) {
      return res.status(400).json({ error: 'campos obrigatórios ausentes' });
    }

    if (!['COMERCIAL', 'OPERACOES', 'ADM_FIN', 'GESTAO'].includes(process)) {
      return res.status(400).json({ error: 'process inválido' });
    }

    const ownership = await validateAssessmentOwnership(assessment_id, req.user.id);
    if (!ownership.valid) {
      return res.status(ownership.error === 'sem acesso' ? 403 : 404).json({ error: ownership.error });
    }

    if (ownership.assessment.company_id !== company_id) {
      return res.status(403).json({ error: 'sem acesso' });
    }

    const { data: freeAction, error: freeErr } = await supabase
      .from('assessment_free_actions')
      .select('id, assessment_id, process')
      .eq('id', resolvedFreeActionId)
      .maybeSingle();

    if (freeErr || !freeAction) {
      return res.status(404).json({ error: 'ação gratuita não encontrada' });
    }

    if (freeAction.assessment_id !== assessment_id) {
      return res.status(400).json({ error: 'ação não pertence ao assessment' });
    }

    if (freeAction.process !== process) {
      return res.status(400).json({ error: 'process não corresponde à ação' });
    }

    const { data: evidenceRows, error: evErr } = await supabase
      .schema('public')
      .from('assessment_free_action_evidences')
      .select('id')
      .eq('free_action_id', resolvedFreeActionId)
      .limit(2);

    if (evErr) {
      console.error('[LIGHT_PLANS] Erro ao verificar evidência:', {
        free_action_id: resolvedFreeActionId,
        message: evErr.message,
        code: evErr.code,
        details: evErr.details,
        hint: evErr.hint,
      });
      return res.status(500).json({ error: 'erro ao verificar evidência' });
    }

    const existingEvidence = evidenceRows && evidenceRows.length > 0 ? evidenceRows[0] : null;

    const { data: planRows, error: planErr } = await supabase
      .schema('public')
      .from('light_action_plans')
      .select('id, owner_user_id, locked, free_action_id')
      .eq('owner_user_id', req.user.id)
      .eq('assessment_id', assessment_id)
      .eq('process', process)
      .limit(2);

    if (planErr) {
      console.error('[LIGHT_PLANS] Erro ao verificar plano:', {
        assessment_id,
        process,
        message: planErr.message,
        code: planErr.code,
      });
      return res.status(500).json({ error: 'erro ao verificar plano' });
    }

    const existingPlan = planRows && planRows.length > 0 ? planRows[0] : null;

    if (existingPlan && existingPlan.owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'sem acesso' });
    }

    if (existingPlan && existingPlan.locked) {
      const planId = existingPlan.free_action_id || resolvedFreeActionId;
      return res.status(200).json({
        created: false,
        already_exists: true,
        plan_id: planId,
        message: 'Plano já concluído para este processo.',
        locked: true,
      });
    }

    if (existingEvidence) {
      await supabase
        .from('light_action_plans')
        .update({ locked: true, updated_at: new Date().toISOString() })
        .eq('owner_user_id', req.user.id)
        .eq('assessment_id', assessment_id)
        .eq('process', process);
      return res.status(200).json({
        created: false,
        already_exists: true,
        plan_id: resolvedFreeActionId,
        message: 'Plano já concluído para este processo.',
        completed: true,
      });
    }

    const payload = {
      assessment_id,
      company_id,
      process,
      free_action_id: resolvedFreeActionId,
      assessment_free_action_id: resolvedFreeActionId,
      step_1: String(step_1).trim(),
      step_2: String(step_2).trim(),
      step_3: String(step_3).trim(),
      owner_name: String(owner_name).trim(),
      metric: String(metric).trim(),
      checkpoint_date,
      owner_user_id: req.user.id,
      created_by_user_id: req.user.id,
      updated_at: new Date().toISOString(),
    };

    const { data: savedPlan, error: upsertErr } = await supabase
      .schema('public')
      .from('light_action_plans')
      .upsert(payload, { onConflict: 'owner_user_id,assessment_id,process' })
      .select()
      .single();

    if (upsertErr) {
      console.error('[LIGHT_PLANS] Erro ao salvar plano:', {
        message: upsertErr.message,
        code: upsertErr.code,
        details: upsertErr.details,
        hint: upsertErr.hint,
      });
      return res.status(500).json({ error: 'erro ao salvar plano' });
    }

    const isUpdate = !!existingPlan;
    const body = isUpdate
      ? { ...savedPlan, created: false, already_exists: true, plan_id: savedPlan.id, message: 'Plano já existente. Atualizado.' }
      : { ...savedPlan, created: true, already_exists: false, plan_id: savedPlan.id };
    return res.status(isUpdate ? 200 : 201).json(body);
  } catch (error) {
    console.error('Erro ao salvar plano LITE:', error.message);
    return res.status(500).json({ error: 'erro inesperado' });
  }
});

/**
 * POST /light/progress
 * Registra progresso declarado (write-once)
 */
router.post('/light/progress', requireAuth, blockConsultorOnMutation, async (req, res) => {
  try {
    const { free_action_id, done_criteria_json, declared_gain_type, declared_gain_note } = req.body || {};

    if (!free_action_id || !declared_gain_type || !declared_gain_note) {
      return res.status(400).json({ error: 'campos obrigatórios ausentes' });
    }

    if (!Array.isArray(done_criteria_json) || done_criteria_json.length === 0) {
      return res.status(400).json({ error: 'done_criteria_json deve ser uma lista' });
    }

    const ownership = await validateFreeActionOwnership(free_action_id, req.user.id);
    if (!ownership.valid) {
      return res.status(ownership.error === 'sem acesso' ? 403 : 404).json({ error: ownership.error });
    }

    const { data: existingEvidence, error: evErr } = await supabase
      .from('assessment_free_action_evidences')
      .select('id')
      .eq('free_action_id', free_action_id)
      .maybeSingle();

    if (evErr) {
      return res.status(500).json({ error: 'erro ao verificar evidência' });
    }

    if (existingEvidence) {
      return res.status(409).json({ error: 'evidência já registrada' });
    }

    const { data: existingPlan, error: planErr } = await supabase
      .from('light_action_plans')
      .select('id, owner_user_id')
      .eq('free_action_id', free_action_id)
      .maybeSingle();

    if (planErr) {
      return res.status(500).json({ error: 'erro ao verificar plano' });
    }

    if (!existingPlan || existingPlan.owner_user_id !== req.user.id) {
      return res.status(400).json({ error: 'plano 30d não encontrado' });
    }

    const { data: existingProgress, error: progressErr } = await supabase
      .from('light_action_progress')
      .select('id')
      .eq('free_action_id', free_action_id)
      .maybeSingle();

    if (progressErr) {
      return res.status(500).json({ error: 'erro ao verificar progresso' });
    }

    if (existingProgress) {
      return res.status(409).json({ error: 'progresso já registrado' });
    }

    const { data: savedProgress, error: insertErr } = await supabase
      .from('light_action_progress')
      .insert({
        free_action_id,
        done_criteria_json,
        declared_gain_type: String(declared_gain_type).trim(),
        declared_gain_note: String(declared_gain_note).trim(),
        created_by_user_id: req.user.id,
      })
      .select()
      .single();

    if (insertErr) {
      return res.status(500).json({ error: 'erro ao salvar progresso' });
    }

    return res.status(201).json(savedProgress);
  } catch (error) {
    console.error('Erro ao salvar progresso LITE:', error.message);
    return res.status(500).json({ error: 'erro inesperado' });
  }
});

module.exports = router;
