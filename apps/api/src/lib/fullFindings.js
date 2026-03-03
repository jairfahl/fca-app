/**
 * Motor de findings FULL: constrói e persiste os findings (vazamentos + alavancas)
 * a partir dos scores, respostas e catálogos.
 */
const { supabase } = require('./supabase');
const { scoreToBand, BANDS_ORDER, BAND_WORST_FIRST, BAND_BEST_FIRST, firstNByOrder, avg } = require('./fullHelpers');
const {
  getOQueEstaAcontecendo,
  getCustoDeNaoAgir,
  getCustoDeNaoAgirFaixa,
  getOQueMudaEm30Dias,
  humanizeAnswerValue,
  getComoPuxouNivel,
  FALLBACK_ACTION_TITLE,
  FALLBACK_CONTENT_NAO_DEFINIDO,
} = require('./fullResultCopy');

const CAUSE_ENGINE_GAP_IDS = ['GAP_CAIXA_PREVISAO', 'GAP_VENDAS_FUNIL', 'GAP_ROTINA_GERENCIAL'];

/** Mapeamento processo+banda LOW → gap_id */
const PROCESS_BAND_TO_GAP = {
  ADM_FIN: 'GAP_CAIXA_PREVISAO',
  COMERCIAL: 'GAP_VENDAS_FUNIL',
  GESTAO: 'GAP_ROTINA_GERENCIAL',
};

const PROCESS_OWNER_LABEL = {
  COMERCIAL: 'Comercial',
  OPERACOES: 'Operações',
  ADM_FIN: 'Adm/Fin',
  GESTAO: 'Gestão',
};

const FALLBACK_PROCESS_META = {
  protects_dimension: 'RISCO',
  protects_text: 'Operação do negócio',
  owner_alert_text: 'Em definição',
  typical_impact_text: 'Indeterminado',
  typical_impact_band: 'MEDIUM',
};

function deriveBandFromCanonical(dimensionScores, overallScore) {
  const rotina = dimensionScores.ROTINA;
  const dono = dimensionScores.DONO;
  const controle = dimensionScores.CONTROLE;
  const existencia = dimensionScores.EXISTENCIA;

  const missingMinimum = rotina == null || dono == null || controle == null;
  const weakMinimum = (rotina ?? 0) < 5 || (dono ?? 0) < 5 || (controle ?? 0) < 5;
  if (missingMinimum || weakMinimum) {
    const fallbackBand = scoreToBand(overallScore);
    if (fallbackBand !== 'LOW') {
      return { band: fallbackBand, rule: 'fallback_score' };
    }
    return { band: 'LOW', rule: 'missing_or_weak_minimum' };
  }

  const allStrong = (rotina ?? 0) >= 8 && (dono ?? 0) >= 8 && (controle ?? 0) >= 8 && (existencia ?? 0) >= 7 && overallScore >= 7;
  if (allStrong) {
    return { band: 'HIGH', rule: 'all_minimum_strong' };
  }

  return { band: 'MEDIUM', rule: 'intermediate' };
}

async function buildAndPersistFindings({ assessmentId, companyId, segment, scores, answers, processCatalog, questionCatalogTex } = {}) {
  try {
    return await _buildAndPersistFindingsInner({ assessmentId, companyId, segment, scores, answers, processCatalog, questionCatalogTex });
  } catch (err) {
    return { findings: [], hadGap: true, error: err, step: 'generate_findings' };
  }
}

async function _buildAndPersistFindingsInner({ assessmentId, companyId, segment, scores, answers, processCatalog, questionCatalogTex } = {}) {
  const { loadCauseCatalog } = require('./causeEngine');

  const processKeys = (scores || []).map((s) => s.process_key);
  const { data: actionCatalog } = await supabase
    .schema('public')
    .from('full_action_catalog')
    .select('process_key, band, action_key, title')
    .in('process_key', processKeys)
    .eq('is_active', true)
    .contains('segment_applicability', [segment]);

  const actionMap = {};
  (actionCatalog || []).forEach((a) => {
    const k = `${a.process_key}:${a.band}`;
    if (!actionMap[k]) actionMap[k] = [];
    actionMap[k].push(a);
  });

  // Gap + causa + mecanismo: priorizar ações do mecanismo para VAZAMENTO (LOW)
  const { data: gapCauses } = await supabase
    .schema('public')
    .from('full_gap_causes')
    .select('gap_id, cause_primary')
    .eq('assessment_id', assessmentId)
    .in('gap_id', CAUSE_ENGINE_GAP_IDS);

  let causeCatalog;
  try {
    causeCatalog = loadCauseCatalog();
  } catch (e) {
    causeCatalog = null;
  }

  const gapCauseByGap = {};
  (gapCauses || []).forEach((r) => { gapCauseByGap[r.gap_id] = r; });

  const causeById = {};
  if (causeCatalog?.cause_classes) {
    causeCatalog.cause_classes.forEach((c) => { causeById[c.id] = c; });
  }

  // Ações do mecanismo (gap+causa) — prioridade sobre action_catalog
  const { data: mechanismActions } = await supabase
    .schema('public')
    .from('full_cause_mechanism_actions')
    .select('gap_id, cause_id, action_key, titulo_cliente, primeiro_passo_30d, sort_order')
    .eq('is_active', true)
    .order('sort_order');

  const mechanismByGapCause = {};
  (mechanismActions || []).forEach((m) => {
    const k = `${m.gap_id}:${m.cause_id}`;
    if (!mechanismByGapCause[k]) mechanismByGapCause[k] = [];
    mechanismByGapCause[k].push(m);
  });

  const catalogMap = {};
  (processCatalog || []).forEach((p) => { catalogMap[p.process_key] = p; });

  function getProcessMeta(processKey) {
    const meta = catalogMap[processKey];
    if (meta) return meta;
    console.log('[AUDIT] full_catalog_missing', { company_id: companyId, assessment_id: assessmentId, process_key: processKey });
    return { ...FALLBACK_PROCESS_META };
  }

  const questionTextMap = {};
  (questionCatalogTex || []).forEach((q) => {
    questionTextMap[`${q.process_key}:${q.question_key}`] = q.question_text || '';
  });

  const answersByProcess = {};
  (answers || []).forEach((a) => {
    if (!answersByProcess[a.process_key]) answersByProcess[a.process_key] = [];
    answersByProcess[a.process_key].push(a);
  });

  const scoreList = (scores || []).map((s) => {
    const meta = getProcessMeta(s.process_key);
    return {
      ...s,
      typical_impact_band: meta.typical_impact_band || 'MEDIUM',
      quick_win: !!meta.quick_win,
    };
  });

  // Vazamentos: processos LOW com maior impacto_tipico (ranking fixo por catálogo)
  let vazamentosBase = scoreList.filter((s) => s.band === 'LOW');
  vazamentosBase = firstNByOrder(
    vazamentosBase,
    3,
    (a, b) => (BAND_BEST_FIRST[a.typical_impact_band] ?? 9) - (BAND_BEST_FIRST[b.typical_impact_band] ?? 9) || b.score_numeric - a.score_numeric
  );

  // Alavancas: processos MED com maior impacto e quick-win (flag no catálogo)
  let alavancaCandidates = scoreList.filter((s) => s.band === 'MEDIUM');
  if (alavancaCandidates.length < 3) {
    const used = new Set(alavancaCandidates.map((s) => s.process_key));
    const lowMed = scoreList.filter((s) => s.band === 'LOW' && !used.has(s.process_key));
    alavancaCandidates = [...alavancaCandidates, ...lowMed];
  }
  alavancaCandidates = alavancaCandidates.sort((a, b) => {
    if (a.quick_win !== b.quick_win) return a.quick_win ? -1 : 1;
    return (BAND_BEST_FIRST[a.typical_impact_band] ?? 9) - (BAND_BEST_FIRST[b.typical_impact_band] ?? 9) || b.score_numeric - a.score_numeric;
  });
  const alavancasBase = alavancaCandidates.slice(0, 3);

  let hadGap = false;
  if (vazamentosBase.length < 3 || alavancasBase.length < 3) hadGap = true;

  function toFinding(type, position, s, forcedGapReason = null) {
    const processLabel = PROCESS_OWNER_LABEL[s.process_key] || s.process_key;
    const processMeta = getProcessMeta(s.process_key);
    const protects = processMeta.protects_dimension || 'RISCO';
    const processAnswers = (answersByProcess[s.process_key] || []).slice().sort((a, b) => a.answer_value - b.answer_value);
    const traceAnswers = (type === 'VAZAMENTO' ? processAnswers : [...processAnswers].reverse()).slice(0, Math.max(4, processAnswers.length));

    const gapId = type === 'VAZAMENTO' && s.band === 'LOW' ? PROCESS_BAND_TO_GAP[s.process_key] : null;
    const gapCause = gapId ? gapCauseByGap[gapId] : null;
    const gapDef = causeCatalog && gapId ? (causeCatalog.gaps || []).find((g) => g.gap_id === gapId) : null;
    const causeDef = gapCause?.cause_primary ? causeById[gapCause.cause_primary] : null;

    let allActions = actionMap[`${s.process_key}:${s.band}`] || [];
    let firstAction = null;
    let gap_label = null;
    let cause_primary = null;
    let mechanism_label = null;
    let custoText = getCustoDeNaoAgir(processMeta, s.band, protects);
    let mudaText = getOQueMudaEm30Dias(type, s.process_key, protects, s.band);
    let isGapCovered = false;

    if (type === 'VAZAMENTO' && gapId && gapDef) {
      if (gapCause && causeDef) {
        isGapCovered = true;
        gap_label = gapDef.titulo_cliente;
        cause_primary = gapCause.cause_primary;
        mechanism_label = causeDef.mecanismo_primario || causeDef.label_cliente;
        custoText = getCustoDeNaoAgirFaixa(s.band, processMeta);
        mudaText = causeDef.mecanismo_primario ? `Em 30 dias: ${causeDef.mecanismo_primario}` : mudaText;

        const mechActions = mechanismByGapCause[`${gapId}:${gapCause.cause_primary}`] || [];
        const catalogMech = (gapDef.mechanism_actions || []).slice(0, 3);
        const mechList = mechActions.length > 0 ? mechActions : catalogMech.map((a) => ({ action_key: a.action_key, titulo_cliente: a.titulo_cliente, primeiro_passo_30d: a.primeiro_passo_30d }));
        if (mechList.length > 0) {
          firstAction = {
            action_key: mechList[0].action_key,
            title: mechList[0].titulo_cliente || mechList[0].action_key,
          };
          allActions = mechList.map((m) => ({ action_key: m.action_key, title: m.titulo_cliente || m.action_key }));
        }
      } else {
        // Gap não coberto: fallback determinístico, sem inventar causa
        firstAction = { action_key: `fallback-${s.process_key}-${s.band}`, title: FALLBACK_CONTENT_NAO_DEFINIDO };
        allActions = [];
        custoText = getCustoDeNaoAgirFaixa(s.band, processMeta);
        mudaText = FALLBACK_CONTENT_NAO_DEFINIDO;
        console.log(`[AUDIT] content_gap process_key=${s.process_key} band=${s.band} gap_id=${gapId} reason=gap_not_classified assessment_id=${assessmentId}`);
      }
    }

    if (!firstAction) {
      const actions = allActions.filter((a) => !a.action_key.startsWith('fallback-'));
      firstAction = actions[0] || {
        action_key: `fallback-${s.process_key}-${s.band}`,
        title: FALLBACK_ACTION_TITLE,
      };
    }

    const actions = allActions.filter((a) => !a.action_key.startsWith('fallback-'));
    const isFallback = !actions.length || !!forcedGapReason || (type === 'VAZAMENTO' && gapId && !gapCause);
    if (isFallback && !actions.length) {
      console.log(`[AUDIT] full_finding action_gap process_key=${s.process_key} band=${s.band} action_key=${firstAction.action_key}`);
    } else {
      console.log(`[AUDIT] full_finding action_selected process_key=${s.process_key} band=${s.band} action_key=${firstAction.action_key}`);
    }

    const whatText = getOQueEstaAcontecendo(type, s.process_key, protects, s.band, processMeta);
    const comoPuxou = getComoPuxouNivel(processAnswers, questionCatalogTex);

    const payload = {
      processo: s.process_key,
      maturity_band: s.band,
      o_que_esta_acontecendo: whatText,
      custo_de_nao_agir: custoText,
      o_que_muda_em_30_dias: mudaText,
      primeiro_passo: {
        action_key: firstAction.action_key,
        action_title: firstAction.title,
      },
      ...(gap_label && { gap_label }),
      ...(cause_primary && { cause_primary }),
      ...(causeDef?.label_cliente && { cause_label: causeDef.label_cliente }),
      ...(mechanism_label && { mechanism_label }),
    };

    const trace = {
      process_keys: [s.process_key],
      como_puxou_nivel: comoPuxou || null,
      question_refs: traceAnswers.map((a) => ({
        process_key: a.process_key,
        question_key: a.question_key,
        question_text: questionTextMap[`${a.process_key}:${a.question_key}`] || '',
        answer_value: a.answer_value,
        answer_text: humanizeAnswerValue(a.answer_value),
      })),
    };

    const gapReason = !actions.length && type === 'VAZAMENTO' && gapId && !gapCause
      ? 'gap_not_classified'
      : !actions.length
        ? 'fallback_action_missing_catalog'
        : (forcedGapReason || null);

    return {
      assessment_id: assessmentId,
      finding_type: type,
      position,
      payload,
      trace,
      is_fallback: isFallback,
      gap_reason: gapReason,
    };
  }

  const vazamentos = [...vazamentosBase];
  const alavancas = [...alavancasBase];

  const findings = [
    ...vazamentos.map((s, i) => toFinding('VAZAMENTO', i + 1, s, null)),
    ...alavancas.map((s, i) => toFinding('ALAVANCA', i + 1, s, null)),
  ];

  const { error: delFindErr } = await supabase
    .schema('public')
    .from('full_findings')
    .delete()
    .eq('assessment_id', assessmentId);
  if (delFindErr) {
    return { findings: [], hadGap: true, error: delFindErr, step: 'delete_findings' };
  }

  const { error: insFindErr } = await supabase
    .schema('public')
    .from('full_findings')
    .insert(findings);
  if (insFindErr) {
    return { findings: [], hadGap: true, error: insFindErr, step: 'insert_findings' };
  }

  return { findings, hadGap, error: null };
}

module.exports = {
  FALLBACK_PROCESS_META,
  CAUSE_ENGINE_GAP_IDS,
  PROCESS_BAND_TO_GAP,
  PROCESS_OWNER_LABEL,
  deriveBandFromCanonical,
  buildAndPersistFindings,
  _buildAndPersistFindingsInner,
};
