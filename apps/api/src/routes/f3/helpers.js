/**
 * Helpers compartilhados do módulo F3 (LIGHT).
 * Usados por recommendations.js, evidence.js e lightPlans.js.
 */
const { supabase } = require('../../lib/supabase');

/**
 * Validar ownership de assessment
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
 * Validar ownership de free_action
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
 * Normalizar category do DB para formato interno.
 * Remove acentos, converte para maiúsculas, substitui espaços/hífens por underscore.
 */
function normalizeCategory(category) {
  if (!category || typeof category !== 'string') {
    return null;
  }

  let normalized = category.toUpperCase();
  normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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

/** Fallback LIGHT por processo (executável mesmo sem catálogo) */
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
 * Mapear category normalizada para process
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
 * Ordenar recomendações determinísticamente
 */
function sortRecommendations(recs) {
  const priorityOrder = { HIGH: 3, MED: 2, LOW: 1 };

  return recs.sort((a, b) => {
    const priorityDiff = (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
    if (priorityDiff !== 0) return priorityDiff;

    const titleDiff = (a.title || '').localeCompare(b.title || '');
    if (titleDiff !== 0) return titleDiff;

    return (a.id || '').localeCompare(b.id || '');
  });
}

/**
 * Gerar Top 10 recomendações determinístico.
 * Usa schema real: id, code, title, description, category, priority, min_score, max_score, is_active
 */
async function generateTop10Recommendations(assessmentId) {
  const { data: scoresData, error: scoresErr } = await supabase
    .from('scores')
    .select('commercial, operations, admin_fin, management')
    .eq('assessment_id', assessmentId)
    .maybeSingle();

  if (scoresErr || !scoresData) {
    throw new Error('scores não encontrados para o assessment');
  }

  const processScores = {
    COMERCIAL: Number(scoresData.commercial) || 0,
    OPERACOES: Number(scoresData.operations) || 0,
    ADM_FIN: Number(scoresData.admin_fin) || 0,
    GESTAO: Number(scoresData.management) || 0
  };

  const processes = ['COMERCIAL', 'OPERACOES', 'ADM_FIN', 'GESTAO'];
  const recommendations = [];
  const usedIds = new Set();

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

  for (const process of processes) {
    const processScore = processScores[process];
    const scoreCatalog = processScore * 10;

    const processRecs = allCatalogRecs.filter(rec => {
      const normalizedCat = normalizeCategory(rec.category);
      const mappedProcess = categoryToProcess(normalizedCat);
      return mappedProcess === process;
    });

    if (processRecs.length === 0) {
      continue;
    }

    let compatibleRecs = processRecs.filter(rec => {
      const minScore = Number(rec.min_score) || 0;
      const maxScore = Number(rec.max_score) || 100;
      return scoreCatalog >= minScore && scoreCatalog <= maxScore;
    });

    if (compatibleRecs.length === 0) {
      compatibleRecs = processRecs;
    }

    const sortedRecs = sortRecommendations(compatibleRecs);

    for (const rec of sortedRecs) {
      if (recommendations.length >= 10) break;

      if (usedIds.has(rec.id)) {
        continue;
      }

      usedIds.add(rec.id);
      const normalizedCat = normalizeCategory(rec.category);
      const processMapped = categoryToProcess(normalizedCat);
      if (!processMapped) continue;

      recommendations.push({
        recommendation_id: rec.id,
        process: processMapped,
        rank: recommendations.length + 1,
        rec: rec
      });
    }

    if (recommendations.length >= 10) break;
  }

  if (recommendations.length < 10) {
    const filteredRecs = allCatalogRecs.filter(rec => {
      if (usedIds.has(rec.id)) return false;
      const normalizedCat = normalizeCategory(rec.category);
      const mappedProcess = categoryToProcess(normalizedCat);
      return mappedProcess !== null;
    });

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

  return recommendations.slice(0, 10);
}

module.exports = {
  validateAssessmentOwnership,
  validateFreeActionOwnership,
  normalizeCategory,
  normalizeProcessKey,
  PROCESS_KEY_MAP,
  FALLBACK_BY_PROCESS,
  categoryToProcess,
  sortRecommendations,
  generateTop10Recommendations,
};
