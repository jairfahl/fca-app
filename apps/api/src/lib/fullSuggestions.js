/**
 * Sugestões de ações FULL: causa engine + fullActionFit.
 */
const { supabase } = require('./supabase');
const { getCustoDeNaoAgirFaixa } = require('./fullResultCopy');

const CAUSE_ENGINE_GAP_IDS = ['GAP_CAIXA_PREVISAO', 'GAP_VENDAS_FUNIL', 'GAP_ROTINA_GERENCIAL'];

/**
 * Retorna as action_keys do mecanismo que o usuário deve incluir (gap com causa classificada).
 * Usado por GET /full/actions e validateMechanismActionRequired.
 */
async function getMechanismRequiredActionKeys(assessmentId) {
  const { data: gapCauses } = await supabase
    .schema('public')
    .from('full_gap_causes')
    .select('gap_id, cause_primary')
    .eq('assessment_id', assessmentId)
    .in('gap_id', CAUSE_ENGINE_GAP_IDS);

  if (!gapCauses || gapCauses.length === 0) return [];

  const { data: mechActions } = await supabase
    .schema('public')
    .from('full_cause_mechanism_actions')
    .select('gap_id, cause_id, action_key')
    .eq('is_active', true);

  const gapCauseSet = new Set(gapCauses.map((gc) => `${gc.gap_id}:${gc.cause_primary}`));
  return [...new Set(
    (mechActions || [])
      .filter((m) => gapCauseSet.has(`${m.gap_id}:${m.cause_id}`))
      .map((m) => m.action_key)
  )];
}

/**
 * Valida que pelo menos 1 das ações selecionadas pertence ao mecanismo de um gap com causa classificada.
 * Retorna { valid: false, mechanism_action_keys } se violar; { valid: true } caso contrário.
 */
async function validateMechanismActionRequired(assessmentId, selectedActionKeys) {
  const mechanismActionKeys = await getMechanismRequiredActionKeys(assessmentId);
  if (mechanismActionKeys.length === 0) return { valid: true };

  const mechSet = new Set(mechanismActionKeys);
  const hasMechanismAction = selectedActionKeys.some((k) => mechSet.has(k));
  return hasMechanismAction
    ? { valid: true }
    : { valid: false, mechanism_action_keys: mechanismActionKeys };
}

/**
 * Monta sugestões (cause engine + fullActionFit) para um assessment.
 * @param {Set<string>} excludeActionKeys - actions já no plano/histórico
 * @param {boolean} [includeFullPayload] - se true, retorna objetos completos para UI
 */
async function buildSuggestionsForAssessment(assessmentId, excludeActionKeys, includeFullPayload = false) {
  const { loadCauseCatalog } = require('./causeEngine');

  const { data: answers } = await supabase
    .schema('public')
    .from('full_answers')
    .select('process_key, question_key, answer_value')
    .eq('assessment_id', assessmentId);
  const { data: scores } = await supabase
    .schema('public')
    .from('full_process_scores')
    .select('process_key, band, score_numeric')
    .eq('assessment_id', assessmentId);
  const scoresByProcess = {};
  (scores || []).forEach((s) => { scoresByProcess[s.process_key] = s; });

  const suggestions = [];
  const causeActionKeys = new Set();
  const { data: gapCauses } = await supabase
    .schema('public')
    .from('full_gap_causes')
    .select('gap_id, cause_primary, evidence_json')
    .eq('assessment_id', assessmentId)
    .in('gap_id', CAUSE_ENGINE_GAP_IDS);

  let catalog;
  try {
    catalog = loadCauseCatalog();
  } catch (e) {
    catalog = null;
  }

  if (catalog && gapCauses && gapCauses.length > 0) {
    const causeById = {};
    (catalog.cause_classes || []).forEach((c) => { causeById[c.id] = c; });
    for (const row of gapCauses) {
      const gapDef = (catalog.gaps || []).find((g) => g.gap_id === row.gap_id);
      if (!gapDef || !row.cause_primary) continue;
      const causeDef = causeById[row.cause_primary];
      const causeLabel = causeDef?.label_cliente || row.cause_primary;
      const mechanismLabel = causeDef?.mecanismo_primario || causeLabel;
      const actions = (gapDef.mechanism_actions || []).slice(0, 3);
      const firstAction = actions[0];
      const evidence = Array.isArray(row.evidence_json) ? row.evidence_json : [];
      for (const act of actions) {
        if (!act.action_key || excludeActionKeys.has(act.action_key)) continue;
        causeActionKeys.add(act.action_key);
        if (includeFullPayload) {
          suggestions.push({
            process_key: gapDef.processo,
            band: 'LOW',
            band_backend: 'LOW',
            action_key: act.action_key,
            title: act.titulo_cliente || act.action_key,
            benefit_text: act.porque,
            metric_hint: act.primeiro_passo_30d,
            gap_id: row.gap_id,
            gap_label: gapDef.titulo_cliente,
            cause_primary: row.cause_primary,
            cause_label: causeLabel,
            mechanism_label: mechanismLabel,
            custo_de_nao_agir: getCustoDeNaoAgirFaixa('LOW', {}),
            mudanca_em_30_dias: causeDef?.mecanismo_primario ? `Em 30 dias: ${causeDef.mecanismo_primario}` : null,
            primeiro_passo: firstAction ? { action_key: firstAction.action_key, action_title: firstAction.titulo_cliente || firstAction.action_key } : null,
            why: evidence.map((e) => ({ question_key: e.q_id, answer: e.answer, label: e.texto_cliente })),
            evidence_keys: evidence.map((e) => `${e.process_key || gapDef.processo}_${e.q_id || e.question_key || ''}`).filter(Boolean),
            is_gap_content: false,
            steps_3: [],
            dod_checklist: [],
            owner_suggestions: [],
            metric_suggestions: act.primeiro_passo_30d ? [act.primeiro_passo_30d] : [],
            recommendation: { title: gapDef.titulo_cliente },
            action: { action_key: act.action_key, title: act.titulo_cliente },
          });
        } else {
          suggestions.push({ action_key: act.action_key });
        }
      }
    }
  }

  const { deriveSuggestionsFromAnswers } = require('./fullActionFit');
  const fitExclude = new Set([...excludeActionKeys, ...causeActionKeys]);
  const { suggestions: fitSuggestions } = deriveSuggestionsFromAnswers(
    answers || [],
    scoresByProcess,
    fitExclude,
    { includeMatchDebug: includeFullPayload && process.env.NODE_ENV === 'development' }
  );
  for (const s of fitSuggestions) {
    if (!excludeActionKeys.has(s.action_key)) {
      suggestions.push(includeFullPayload ? s : { action_key: s.action_key });
    }
  }
  return suggestions;
}

/**
 * Calcula remaining_count e required_count para um assessment (ações elegíveis restantes).
 */
async function computeRemainingAndRequired(assessmentId) {
  const { data: currentPlan } = await supabase
    .schema('public')
    .from('full_selected_actions')
    .select('action_key')
    .eq('assessment_id', assessmentId);
  const { data: histRows } = await supabase
    .schema('public')
    .from('full_cycle_history')
    .select('action_key')
    .eq('assessment_id', assessmentId);
  const excludeActionKeys = new Set([
    ...(currentPlan || []).map((p) => p.action_key),
    ...(histRows || []).map((h) => h.action_key),
  ]);

  const suggestions = await buildSuggestionsForAssessment(assessmentId, excludeActionKeys, false);
  const remaining_count = suggestions.length;
  const required_count = Math.min(3, Math.max(0, remaining_count));
  return { remaining_count, required_count };
}

module.exports = {
  CAUSE_ENGINE_GAP_IDS,
  getMechanismRequiredActionKeys,
  validateMechanismActionRequired,
  buildSuggestionsForAssessment,
  computeRemainingAndRequired,
};
