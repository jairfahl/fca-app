/**
 * Rotas FULL: Ciclo completo DRAFT → SUBMITTED → Results → Plan (3 ações)
 * Contratos determinísticos, DB-backed.
 */
const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');
const { requireAuth } = require('../middleware/requireAuth');
const { requireFullEntitlement } = require('../middleware/requireFullEntitlement');
const { ensureCompanyAccess, ensureConsultantOrOwnerAccess } = require('../lib/companyAccess');
const { getOrCreateCurrentFullAssessment, companySegmentToFull, FullCurrentError, logFullCurrentError } = require('../lib/fullAssessment');
const {
  getOQueEstaAcontecendo,
  getCustoDeNaoAgir,
  getCustoDeNaoAgirFaixa,
  getOQueMudaEm30Dias,
  humanizeAnswerValue,
  getComoPuxouNivel,
  FALLBACK_ACTION_TITLE,
  FALLBACK_CONTENT_NAO_DEFINIDO,
} = require('../lib/fullResultCopy');

const BANDS_ORDER = ['LOW', 'MEDIUM', 'HIGH'];
const BAND_WORST_FIRST = { LOW: 0, MEDIUM: 1, HIGH: 2 };
const BAND_BEST_FIRST = { HIGH: 0, MEDIUM: 1, LOW: 2 };

function scoreToBand(score) {
  if (score < 4) return 'LOW';
  if (score < 7) return 'MEDIUM';
  return 'HIGH';
}

async function getAssessment(assessmentId, companyId) {
  const { data, error } = await supabase
    .schema('public')
    .from('full_assessments')
    .select('*')
    .eq('id', assessmentId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

async function getAssessmentById(assessmentId) {
  const { data, error } = await supabase
    .schema('public')
    .from('full_assessments')
    .select('*')
    .eq('id', assessmentId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

async function getLatestClosedAssessment(companyId) {
  const { data, error } = await supabase
    .schema('public')
    .from('full_assessments')
    .select('*')
    .eq('company_id', companyId)
    .eq('status', 'CLOSED')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

async function getLatestSubmittedOrClosedAssessment(companyId) {
  const { data, error } = await supabase
    .schema('public')
    .from('full_assessments')
    .select('*')
    .eq('company_id', companyId)
    .in('status', ['SUBMITTED', 'CLOSED'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

/**
 * Resposta de erro padronizada para UI: code (técnico) + message_user (texto para usuário).
 * O campo error é mantido como fallback para clientes legados.
 * @param {object} [extra] - campos extras (ex: missing) para incluir no JSON
 */
function apiError(res, status, code, messageUser, extra = {}) {
  return res.status(status).json({
    code,
    message_user: messageUser,
    error: messageUser,
    ...extra,
  });
}

function cycleClosed(res) {
  return apiError(res, 409, 'CYCLE_CLOSED', 'Ciclo fechado. Somente leitura.');
}

/** Gera ganho declarado determinístico (frase curta). */
function buildDeclaredGain(beforeStr, afterStr) {
  const b = String(beforeStr || '').trim() || '—';
  const a = String(afterStr || '').trim() || '—';
  return `De ${b} para ${a}`;
}

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
 * Usado por GET /full/actions e computeRemainingAndRequired.
 * @param {Set<string>} excludeActionKeys - actions já no plano/histórico
 * @param {boolean} [includeFullPayload] - se true, retorna objetos completos para UI
 */
async function buildSuggestionsForAssessment(assessmentId, excludeActionKeys, includeFullPayload = false) {
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

  const { deriveSuggestionsFromAnswers } = require('../lib/fullActionFit');
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
 * Usado por POST /full/plan e POST /full/cycle/select-actions.
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

const PROCESS_OWNER_LABEL = {
  COMERCIAL: 'Comercial',
  OPERACOES: 'Operações',
  ADM_FIN: 'Adm/Fin',
  GESTAO: 'Gestão',
};

function avg(values) {
  if (!values || values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

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

function firstNByOrder(arr, n, sorter) {
  return [...arr].sort(sorter).slice(0, n);
}

const FALLBACK_PROCESS_META = {
  protects_dimension: 'RISCO',
  protects_text: 'Operação do negócio',
  owner_alert_text: 'Em definição',
  typical_impact_text: 'Indeterminado',
  typical_impact_band: 'MEDIUM',
};

async function buildAndPersistFindings({ assessmentId, companyId, segment, scores, answers, processCatalog, questionCatalogTex } = {}) {
  try {
    return await _buildAndPersistFindingsInner({ assessmentId, companyId, segment, scores, answers, processCatalog, questionCatalogTex });
  } catch (err) {
    return { findings: [], hadGap: true, error: err, step: 'generate_findings' };
  }
}

async function _buildAndPersistFindingsInner({ assessmentId, companyId, segment, scores, answers, processCatalog, questionCatalogTex } = {}) {
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

// ---------------------------------------------------------------------------
// 1) POST /full/assessments/start — criar/obter assessment (idempotente)
// ---------------------------------------------------------------------------
router.post('/full/assessments/start', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const { company_id, segment } = req.body;

    if (!company_id || !segment) {
      return res.status(400).json({ error: 'company_id e segment são obrigatórios' });
    }
    if (!['C', 'I', 'S'].includes(segment)) {
      return res.status(400).json({ error: 'segment deve ser C, I ou S' });
    }

    const company = await ensureCompanyAccess(userId, company_id);
    if (!company) {
      return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');
    }

    const forceNew =
      req.query.force_new === '1' ||
      req.query.force_new === 'true' ||
      req.body.force_new === true ||
      req.body.force_new === '1' ||
      req.body.force_new === 'true';

    // Idempotente: retornar DRAFT existente se houver (a menos que force_new)
    const { data: existing, error: findErr } = await supabase
      .schema('public')
      .from('full_assessments')
      .select('*')
      .eq('company_id', company_id)
      .in('status', ['DRAFT', 'SUBMITTED'])
      .maybeSingle();

    if (findErr) {
      console.error('Erro ao buscar assessment:', findErr.message);
      return res.status(500).json({ error: 'erro ao buscar assessment' });
    }

    if (existing && !forceNew) {
      return res.status(200).json({ assessment_id: existing.id, assessment: existing });
    }

    if (existing && forceNew) {
      const { error: updateErr } = await supabase
        .schema('public')
        .from('full_assessments')
        .update({ status: 'CLOSED', updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (updateErr) {
        console.error('Erro ao fechar assessment (force_new):', updateErr.message);
        return res.status(500).json({ error: 'erro ao fechar assessment anterior' });
      }
    }

    const { data: created, error: insertErr } = await supabase
      .schema('public')
      .from('full_assessments')
      .insert({
        company_id,
        created_by_user_id: userId,
        segment,
        status: 'DRAFT'
      })
      .select()
      .single();

    if (insertErr) {
      console.error('Erro ao criar assessment:', insertErr.message);
      return res.status(500).json({ error: 'erro ao criar assessment' });
    }

    return res.status(201).json({ assessment_id: created.id, assessment: created });
  } catch (err) {
    console.error('Erro POST /full/assessments/start:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// GET /full/assessments/current?company_id= — retorna assessment FULL ativo (cria DRAFT se não existir)
router.get('/full/assessments/current', requireAuth, requireFullEntitlement, async (req, res) => {
  const userId = req.user.id;
  const userEmail = req.user.email || null;
  const companyId = req.query.company_id;

  try {
    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');

    const company = await ensureConsultantOrOwnerAccess(userId, companyId, req.user?.email);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');

    const forWizard = req.query.for_wizard === '1' || req.query.for_wizard === 'true';
    const result = await getOrCreateCurrentFullAssessment(companyId, userId, { forWizard });

    const { assessment } = result;
    const { data: answers } = await supabase
      .schema('public')
      .from('full_answers')
      .select('process_key, question_key, answer_value, answered_at, updated_at')
      .eq('assessment_id', assessment.id)
      .order('process_key', { ascending: true })
      .order('question_key', { ascending: true });

    const payload = { ...assessment, type: 'FULL', answers: answers || [] };

    console.log('[AUDIT] full_answers_load assessment_id=' + assessment.id + ' count=' + (answers || []).length + ' (via /current)');

    return res.json(payload);
  } catch (err) {
    if (err instanceof FullCurrentError) {
      logFullCurrentError(err.phase, companyId, userId, userEmail, err.originalError);
      const isDev = process.env.NODE_ENV !== 'production';
      return res.status(500).json({
        code: 'FULL_CURRENT_FAILED',
        error: err.message,
        message_user: 'Não foi possível carregar o diagnóstico. Tente novamente.',
        ...(isDev && { phase: err.phase }),
      });
    }
    console.error('Erro GET /full/assessments/current:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// ---------------------------------------------------------------------------
// 2) GET /full/assessments/:id
// ---------------------------------------------------------------------------
router.get('/full/assessments/:id', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const companyId = req.query.company_id;

    if (!companyId) {
      return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
    }

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) {
      return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');
    }

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) {
      return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    }

    return res.json(assessment);
  } catch (err) {
    console.error('Erro GET /full/assessments/:id:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// GET /full/assessments/:id/status?company_id= — status do diagnóstico (fonte de verdade para UI)
router.get('/full/assessments/:id/status', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const assessmentId = req.params.id;
    const companyId = req.query.company_id;
    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada.');

    const company = await ensureCompanyAccess(req.user.id, companyId);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada.');

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

    const { data: answers } = await supabase
      .schema('public')
      .from('full_answers')
      .select('process_key, question_key, answer_value, updated_at')
      .eq('assessment_id', assessmentId);

    const processesAnswered = [...new Set((answers || []).map((a) => a.process_key))];
    const lastSaved = (answers || []).reduce((acc, a) => {
      const t = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      return t > acc ? t : acc;
    }, 0);

    return res.json({
      assessment_id: assessmentId,
      company_id: companyId,
      status: assessment.status,
      answered_count: (answers || []).length,
      processes_answered: processesAnswered,
      last_saved_at: lastSaved ? new Date(lastSaved).toISOString() : null,
    });
  } catch (err) {
    console.error('Erro GET /full/assessments/:id/status:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

async function resolveCatalogSegmentForRequest(req) {
  const companyId = req.query.company_id;
  if (companyId) {
    const { data: company } = await supabase
      .schema('public')
      .from('companies')
      .select('segment')
      .eq('id', companyId)
      .maybeSingle();
    if (company?.segment) {
      return companySegmentToFull(company.segment);
    }
  }
  const seg = req.query.segment || 'C';
  return ['C', 'I', 'S'].includes(seg) ? seg : null;
}

/** Segmento padrão quando raw é inválido ou retorna 0 processos. Deve existir no catálogo. */
const FALLBACK_SEGMENT = 'C';

function isRawSegmentValid(raw) {
  if (raw == null || String(raw).trim() === '') return false;
  const u = String(raw).toUpperCase();
  return ['COMERCIO', 'INDUSTRIA', 'SERVICOS', 'C', 'I', 'S'].includes(u);
}

/** Retorna { rawSegment, appliedSegment, usedFallback } para auditoria do catálogo. */
async function resolveCatalogSegmentWithRaw(req) {
  const companyId = req.query.company_id;
  let rawSegment = req.query.segment ?? null;
  if (companyId) {
    const { data: company } = await supabase
      .schema('public')
      .from('companies')
      .select('segment')
      .eq('id', companyId)
      .maybeSingle();
    rawSegment = company?.segment ?? null;
    if (company?.segment && isRawSegmentValid(company.segment)) {
      return { rawSegment: company.segment, appliedSegment: companySegmentToFull(company.segment), usedFallback: false };
    }
    return { rawSegment, appliedSegment: FALLBACK_SEGMENT, usedFallback: true };
  }
  const seg = req.query.segment || FALLBACK_SEGMENT;
  const appliedSegment = ['C', 'I', 'S'].includes(seg) ? seg : FALLBACK_SEGMENT;
  return { rawSegment: rawSegment ?? seg, appliedSegment, usedFallback: !['C', 'I', 'S'].includes(String(rawSegment || seg)) };
}

async function loadCatalogBySegment(segment) {
  const normalizeCostAxis = (axis) => {
    const normalized = String(axis || '').toUpperCase().trim();
    return ['DINHEIRO', 'CLIENTE', 'RISCO', 'GARGALO', 'TRAVAMENTO'].includes(normalized)
      ? normalized
      : 'TRAVAMENTO';
  };

  // Processos aplicáveis ao segmento; se vazio/nulo -> considera global
  const { data: procs, error: procErr } = await supabase
    .schema('public')
    .from('full_process_catalog')
    .select('*')
    .eq('is_active', true)
    .contains('segment_applicability', [segment])
    .order('area_key')
    .order('process_key');
  if (procErr) throw procErr;

  if (!procs || procs.length === 0) return { areas: [], processes: [], questionsCount: 0 };

  const processKeys = procs.map((p) => p.process_key);
  const { data: questions, error: qErr } = await supabase
    .schema('public')
    .from('full_question_catalog')
    .select('*')
    .in('process_key', processKeys)
    .eq('is_active', true)
    .contains('segment_applicability', [segment])
    .order('process_key')
    .order('sort_order');
  if (qErr) throw qErr;

  const questionsByProcess = {};
  (questions || []).forEach((q) => {
    if (!questionsByProcess[q.process_key]) questionsByProcess[q.process_key] = [];
    questionsByProcess[q.process_key].push(q);
  });

  const areasMap = {};
  const processes = procs.map((p) => {
    const processCostAxis = normalizeCostAxis(p.protects_dimension);
    const processQuestions = (questionsByProcess[p.process_key] || []).map((q) => ({
      ...q,
      cost_axis: normalizeCostAxis(q.cost_axis || q.dimension || processCostAxis)
    }));
    const processOut = {
      ...p,
      // aliases de microvalor exigidos no prompt
      o_que_protege: p.protects_dimension || 'EM DEFINIÇÃO',
      sinal_alerta: p.owner_alert_text || 'EM DEFINIÇÃO',
      impacto_tipico: p.typical_impact_text || p.typical_impact_band || 'EM DEFINIÇÃO',
      questions: processQuestions,
    };
    if (!areasMap[p.area_key]) {
      areasMap[p.area_key] = { area: p.area_key, processes: [] };
    }
    areasMap[p.area_key].processes.push(processOut);
    return processOut;
  });

  const areas = Object.values(areasMap);
  return { areas, processes, questionsCount: (questions || []).length };
}

/** Retorna segmentos disponíveis no catalog (para diagnóstico quando process_count=0). */
async function getCatalogAvailableSegments() {
  const { data: procs } = await supabase
    .schema('public')
    .from('full_process_catalog')
    .select('segment_applicability')
    .eq('is_active', true);
  const segments = new Set();
  (procs || []).forEach((p) => {
    const arr = p.segment_applicability;
    if (Array.isArray(arr)) arr.forEach((s) => segments.add(String(s)));
  });
  return Array.from(segments).sort();
}

// ---------------------------------------------------------------------------
// 3) GET /full/catalog?company_id=... (ou ?segment=C|I|S)
// ---------------------------------------------------------------------------
router.get('/full/catalog', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.query.company_id;
    const assessmentId = req.query.assessment_id;

    if (companyId) {
      const access = await ensureConsultantOrOwnerAccess(userId, companyId, req.user?.email);
      if (!access) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');
    }

    const { rawSegment, appliedSegment, usedFallback } = await resolveCatalogSegmentWithRaw(req);
    if (!appliedSegment) {
      return res.status(400).json({ error: 'segment inválido. Use C, I ou S, ou informe company_id válido' });
    }

    if (usedFallback) {
      console.log('[AUDIT] full_segment_fallback', { company_id: companyId, raw_segment: rawSegment, applied_segment: appliedSegment });
    }

    let out = await loadCatalogBySegment(appliedSegment);
    let finalSegment = appliedSegment;
    let availableSegments = null;

    if (out.processes.length === 0) {
      availableSegments = await getCatalogAvailableSegments();
      const fallbackSegment = availableSegments.includes(FALLBACK_SEGMENT)
        ? FALLBACK_SEGMENT
        : (availableSegments[0] || FALLBACK_SEGMENT);
      const fallbackOut = await loadCatalogBySegment(fallbackSegment);
      if (fallbackOut.processes.length > 0) {
        out = fallbackOut;
        finalSegment = fallbackSegment;
        console.log('[AUDIT] full_segment_fallback', {
          company_id: companyId,
          raw_segment: rawSegment,
          applied_segment: appliedSegment,
          fallback_reason: 'process_count_zero',
          final_segment: fallbackSegment,
          process_count: fallbackOut.processes.length,
        });
      }
    }

    const processCount = out.processes.length;
    const auditPayload = {
      company_id: companyId,
      assessment_id: assessmentId || null,
      raw_segment: rawSegment,
      applied_segment: finalSegment,
      process_count: processCount,
    };
    if (processCount === 0 && !availableSegments) {
      auditPayload.catalog_available_segments = await getCatalogAvailableSegments();
    } else if (availableSegments) {
      auditPayload.catalog_available_segments = availableSegments;
    }
    console.log('[AUDIT] full_wizard_catalog', auditPayload);

    const hasGap = out.processes.some((p) => !p.o_que_protege || !p.sinal_alerta || !p.impacto_tipico || p.questions.length === 0);
    if (hasGap) {
      console.warn(`[AUDIT] full_catalog_gap segment=${finalSegment} gaps_detected=true`);
    }
    return res.json({ segment: finalSegment, areas: out.areas, processes: out.processes });
  } catch (err) {
    console.error('Erro GET /full/catalog:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// GET /full/catalog/process/:process_key?company_id=... (opcional)
router.get('/full/catalog/process/:process_key', requireAuth, async (req, res) => {
  try {
    const segment = await resolveCatalogSegmentForRequest(req);
    if (!segment) return res.status(400).json({ error: 'segment inválido' });
    const processKey = req.params.process_key;
    const out = await loadCatalogBySegment(segment);
    const process = out.processes.find((p) => p.process_key === processKey);
    if (!process) return res.status(404).json({ error: 'processo não encontrado para o segmento informado' });
    return res.json({ segment, process });
  } catch (err) {
    console.error('Erro GET /full/catalog/process/:process_key:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// ---------------------------------------------------------------------------
// 4) PUT/POST /full/assessments/:id/answers — salvar respostas (DRAFT, upsert idempotente)
// Body: { process_key, answers: [{ question_key, answer_value }] }
// ou { answers: [{ question_id: "PROCESS:Q01", answer_value }] }
// ---------------------------------------------------------------------------
async function handleAnswersUpsert(req, res) {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const companyId = req.query.company_id || req.body.company_id;
    const { process_key, question_key, answer_value, answered_at, answers } = req.body;

    if (!companyId) {
      return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
    }

    let rows = [];
    if (process_key && question_key && typeof answer_value === 'number') {
      rows = [{
        assessment_id: assessmentId,
        process_key,
        question_key,
        answer_value: Math.max(0, Math.min(10, answer_value)),
        answered_at: answered_at || new Date().toISOString()
      }];
    } else if (process_key && Array.isArray(answers)) {
      rows = answers
        .filter((a) => a.question_key && typeof a.answer_value === 'number')
        .map((a) => ({
          assessment_id: assessmentId,
          process_key,
          question_key: a.question_key,
          answer_value: Math.max(0, Math.min(10, a.answer_value)),
          answered_at: a.answered_at || new Date().toISOString()
        }));
    } else if (Array.isArray(req.body.answers)) {
      // Formato: { answers: [{ question_id: "COMERCIAL:Q01", answer_value }] }
      rows = req.body.answers
        .filter((a) => a.question_id && typeof a.answer_value === 'number')
        .map((a) => {
          const [pk, qk] = String(a.question_id).split(':');
          return pk && qk ? { process_key: pk, question_key: qk, answer_value: a.answer_value } : null;
        })
        .filter(Boolean)
        .map((a) => ({
          assessment_id: assessmentId,
          process_key: a.process_key,
          question_key: a.question_key,
          answer_value: Math.max(0, Math.min(10, a.answer_value)),
          answered_at: a.answered_at || new Date().toISOString()
        }));
    }

    if (rows.length === 0) {
      return res.status(400).json({ error: 'process_key e answers (array) ou answers com question_id são obrigatórios; answer_value 0-10' });
    }

    const company = await ensureConsultantOrOwnerAccess(userId, companyId, req.user?.email);
    if (!company) {
      return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');
    }

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) {
      return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    }
    if (assessment.status !== 'DRAFT') {
      return apiError(res, 400, 'DIAG_NOT_DRAFT', 'Apenas diagnósticos em andamento podem receber respostas.');
    }

    const { error: upsertErr } = await supabase
      .schema('public')
      .from('full_answers')
      .upsert(rows, {
        onConflict: 'assessment_id,process_key,question_key',
        ignoreDuplicates: false
      });

    if (upsertErr) {
      console.error('Erro ao salvar respostas:', upsertErr.message);
      return res.status(500).json({ error: 'erro ao salvar respostas' });
    }

    const first = rows[0];
    const processQ = first ? ` process=${first.process_key} q=${first.question_key}` : '';
    console.log('[AUDIT] full_answer_upsert assessment_id=' + assessmentId + ' user=' + userId + ' company=' + companyId + ' count=' + rows.length + processQ);

    return res.status(200).json({ ok: true, count: rows.length });
  } catch (err) {
    console.error('Erro answers upsert:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
}

router.put('/full/assessments/:id/answers', requireAuth, requireFullEntitlement, handleAnswersUpsert);
router.post('/full/assessments/:id/answers', requireAuth, requireFullEntitlement, handleAnswersUpsert);

// ---------------------------------------------------------------------------
// 5) GET /full/assessments/:id/answers?process_key=  e  GET /full/answers?assessment_id=&company_id=
// ---------------------------------------------------------------------------
async function handleGetAnswers(req, res) {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id || req.query.assessment_id;
    const companyId = req.query.company_id;
    const processKey = req.query.process_key;

    if (!assessmentId || !companyId) {
      return apiError(res, 400, 'PARAMS_REQUIRED', 'assessment_id e company_id são obrigatórios.');
    }

    const company = await ensureConsultantOrOwnerAccess(userId, companyId, req.user?.email);
    if (!company) {
      return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');
    }

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) {
      return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    }

    let q = supabase
      .schema('public')
      .from('full_answers')
      .select('process_key, question_key, answer_value, answered_at, updated_at')
      .eq('assessment_id', assessmentId);

    if (processKey) {
      q = q.eq('process_key', processKey);
    }

    const { data, error } = await q;

    if (error) {
      console.error('Erro ao buscar respostas:', error.message);
      return res.status(500).json({ error: 'erro ao buscar respostas' });
    }

    const count = (data || []).length;
    console.log('[AUDIT] full_answers_load assessment_id=' + assessmentId + ' count=' + count);

    return res.json({ answers: data || [], count });
  } catch (err) {
    console.error('Erro GET full answers:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
}

router.get('/full/answers', requireAuth, requireFullEntitlement, (req, res) => {
  req.params = { ...req.params, id: req.query.assessment_id };
  return handleGetAnswers(req, res);
});

router.get('/full/assessments/:id/answers', requireAuth, requireFullEntitlement, handleGetAnswers);

// ---------------------------------------------------------------------------
// Motor de Causa: respostas e avaliação por gap
// ---------------------------------------------------------------------------
const { loadCauseCatalog, scoreCause, persistGapCause, getCauseAnswersByGap, getGapCause } = require('../lib/causeEngine');
const { emitValueEvent } = require('../lib/fullValueEvents');

const CAUSE_ENGINE_GAP_IDS = ['GAP_CAIXA_PREVISAO', 'GAP_VENDAS_FUNIL', 'GAP_ROTINA_GERENCIAL'];
const LIKERT_5_VALUES = ['DISCORDO_PLENAMENTE', 'DISCORDO', 'NEUTRO', 'CONCORDO', 'CONCORDO_PLENAMENTE'];

/** Mapeamento processo+banda LOW → gap_id (regra existente) */
const PROCESS_BAND_TO_GAP = {
  ADM_FIN: 'GAP_CAIXA_PREVISAO',
  COMERCIAL: 'GAP_VENDAS_FUNIL',
  GESTAO: 'GAP_ROTINA_GERENCIAL',
};

// GET /full/status?company_id=&assessment_id=
router.get('/full/status', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const assessmentId = req.query.assessment_id;
    const companyId = req.query.company_id;
    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada.');
    if (!assessmentId) return apiError(res, 400, 'ASSESSMENT_REQUIRED', 'Diagnóstico não informado.');

    const company = await ensureCompanyAccess(req.user.id, companyId);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada.');

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

    const { data: answers } = await supabase
      .schema('public')
      .from('full_answers')
      .select('process_key, question_key, answer_value, updated_at')
      .eq('assessment_id', assessmentId);

    const processesAnswered = [...new Set((answers || []).map((a) => a.process_key))];
    const lastSaved = (answers || []).reduce((acc, a) => {
      const t = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      return t > acc ? t : acc;
    }, 0);

    return res.json({
      status: assessment.status,
      answered_count: (answers || []).length,
      processes_answered: processesAnswered,
      last_saved_at: lastSaved ? new Date(lastSaved).toISOString() : null,
    });
  } catch (err) {
    console.error('Erro GET /full/status:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// GET /full/cause/catalog — catálogo de gaps e perguntas (para frontend)
router.get('/full/cause/catalog', requireAuth, async (req, res) => {
  try {
    const catalog = loadCauseCatalog();
    return res.json({
      version: catalog.version,
      cause_classes: catalog.cause_classes,
      gaps: catalog.gaps,
    });
  } catch (err) {
    console.error('Erro GET /full/cause/catalog:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro ao carregar catálogo.');
  }
});

// GET /full/cause/answers?company_id=&assessment_id=&gap_id= — respostas já salvas
router.get('/full/cause/answers', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const companyId = req.query.company_id;
    const assessmentId = req.query.assessment_id;
    const gapId = req.query.gap_id;
    if (!companyId || !assessmentId || !gapId) {
      return apiError(res, 400, 'PARAMS_REQUIRED', 'company_id, assessment_id e gap_id são obrigatórios.');
    }
    const company = await ensureConsultantOrOwnerAccess(req.user.id, companyId, req.user?.email);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada.');
    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    const answersByQid = await getCauseAnswersByGap(assessmentId, gapId);
    return res.json({ answers: answersByQid });
  } catch (err) {
    console.error('Erro GET /full/cause/answers:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado.');
  }
});

// GET /full/cause/result?company_id=&assessment_id=&gap_id= — causa já avaliada
router.get('/full/cause/result', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const companyId = req.query.company_id;
    const assessmentId = req.query.assessment_id;
    const gapId = req.query.gap_id;
    if (!companyId || !assessmentId || !gapId) {
      return apiError(res, 400, 'PARAMS_REQUIRED', 'company_id, assessment_id e gap_id são obrigatórios.');
    }
    const company = await ensureConsultantOrOwnerAccess(req.user.id, companyId, req.user?.email);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada.');
    const cause = await getGapCause(assessmentId, gapId);
    return res.json(cause || null);
  } catch (err) {
    console.error('Erro GET /full/cause/result:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado.');
  }
});

// POST /full/cause/answer?company_id=&assessment_id=&gap_id=
router.post('/full/cause/answer', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.query.company_id || req.body.company_id;
    const assessmentId = req.query.assessment_id || req.body.assessment_id;
    const gapId = req.query.gap_id || req.body.gap_id;
    const { q_id, answer } = req.body;

    if (!companyId || !assessmentId || !gapId) {
      return apiError(res, 400, 'PARAMS_REQUIRED', 'company_id, assessment_id e gap_id são obrigatórios.');
    }
    if (!q_id || !answer) {
      return apiError(res, 400, 'BODY_REQUIRED', 'q_id e answer são obrigatórios no body.');
    }
    if (!LIKERT_5_VALUES.includes(answer)) {
      return apiError(res, 400, 'INVALID_ANSWER', `answer deve ser um de: ${LIKERT_5_VALUES.join(', ')}`);
    }

    const company = await ensureConsultantOrOwnerAccess(userId, companyId, req.user?.email);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada.');
    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    if (assessment.status !== 'DRAFT' && assessment.status !== 'SUBMITTED') {
      return apiError(res, 400, 'DIAG_ALREADY_SUBMITTED', 'Só é possível responder perguntas de causa em diagnóstico em andamento ou concluído.');
    }

    const { error } = await supabase
      .schema('public')
      .from('full_cause_answers')
      .upsert({
        company_id: companyId,
        assessment_id: assessmentId,
        gap_id: gapId,
        q_id,
        answer,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'assessment_id,gap_id,q_id' });

    if (error) {
      console.error('Erro POST /full/cause/answer:', error.message);
      return apiError(res, 500, 'INTERNAL_ERROR', 'Erro ao salvar resposta.');
    }

    return res.status(200).json({ ok: true, q_id, answer });
  } catch (err) {
    console.error('Erro POST /full/cause/answer:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// POST /full/cause/evaluate?company_id=&assessment_id=&gap_id=
router.post('/full/cause/evaluate', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.query.company_id || req.body.company_id;
    const assessmentId = req.query.assessment_id || req.body.assessment_id;
    const gapId = req.query.gap_id || req.body.gap_id;

    if (!companyId || !assessmentId || !gapId) {
      return apiError(res, 400, 'PARAMS_REQUIRED', 'company_id, assessment_id e gap_id são obrigatórios.');
    }

    const company = await ensureConsultantOrOwnerAccess(userId, companyId, req.user?.email);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada.');
    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

    const catalog = loadCauseCatalog();
    const gapDef = (catalog.gaps || []).find((g) => g.gap_id === gapId);
    if (!gapDef) {
      return apiError(res, 400, 'GAP_NOT_FOUND', `Gap "${gapId}" não encontrado no catálogo.`);
    }

    const answersByQid = await getCauseAnswersByGap(assessmentId, gapId);
    const requiredQids = (gapDef.cause_questions || []).map((q) => q.q_id);
    const missing = requiredQids.filter((qid) => !answersByQid[qid] || answersByQid[qid] === '');

    if (missing.length > 0) {
      return apiError(res, 400, 'DIAG_INCOMPLETE', 'Responda todas as perguntas de causa antes de avaliar.', { missing });
    }

    const result = scoreCause(gapDef, answersByQid);
    await persistGapCause({
      companyId,
      assessmentId,
      gapId,
      result,
      version: catalog.version || '1.0.0',
    });

    return res.json({
      gap_id: gapId,
      cause_primary: result.primary,
      cause_secondary: result.secondary,
      scores: result.scores,
      evidence: result.evidence,
    });
  } catch (err) {
    console.error('Erro POST /full/cause/evaluate:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// ---------------------------------------------------------------------------
// Motor de Causa: endpoints /full/causes/* (gap_instances + classificação)
// ---------------------------------------------------------------------------

// GET /full/causes/pending?assessment_id=&company_id= — gaps pendentes e perguntas
router.get('/full/causes/pending', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.query.assessment_id;
    const companyId = req.query.company_id;
    if (!companyId || !assessmentId) {
      return apiError(res, 400, 'PARAMS_REQUIRED', 'assessment_id e company_id são obrigatórios.');
    }

    const company = await ensureConsultantOrOwnerAccess(userId, companyId, req.user?.email);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada.');
    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    if (assessment.status !== 'SUBMITTED' && assessment.status !== 'CLOSED') {
      return apiError(res, 400, 'DIAG_NOT_READY', 'Conclua o diagnóstico para responder sobre causas.');
    }

    const { data: instances } = await supabase
      .schema('public')
      .from('full_gap_instances')
      .select('id, gap_id, process_key, status, detected_at')
      .eq('assessment_id', assessmentId)
      .eq('company_id', companyId)
      .eq('status', 'CAUSE_PENDING');

    if (!instances || instances.length === 0) {
      return res.json({ pending: [], assessment_id: assessmentId });
    }

    const catalog = loadCauseCatalog();
    const pending = [];
    for (const inst of instances) {
      const gapDef = (catalog.gaps || []).find((g) => g.gap_id === inst.gap_id);
      if (!gapDef) continue;
      pending.push({
        gap_instance_id: inst.id,
        gap_id: inst.gap_id,
        process_key: inst.process_key,
        titulo_cliente: gapDef.titulo_cliente,
        descricao_cliente: gapDef.descricao_cliente,
        cause_questions: gapDef.cause_questions || [],
      });
    }

    console.log('[AUDIT] full_causes_pending assessment_id=' + assessmentId + ' count=' + pending.length);
    return res.json({ pending, assessment_id: assessmentId });
  } catch (err) {
    console.error('Erro GET /full/causes/pending:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado.');
  }
});

// POST /full/causes/answer — respostas + classificação determinística + persist
// Body: { gap_id, answers: [{ q_id, answer }] }
router.post('/full/causes/answer', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.query.company_id || req.body.company_id;
    const assessmentId = req.query.assessment_id || req.body.assessment_id;
    const { gap_id: gapId, answers } = req.body;

    if (!companyId || !assessmentId || !gapId) {
      return apiError(res, 400, 'PARAMS_REQUIRED', 'company_id, assessment_id e gap_id são obrigatórios.');
    }
    if (!Array.isArray(answers) || answers.length === 0) {
      return apiError(res, 400, 'BODY_REQUIRED', 'answers (array de {q_id, answer}) é obrigatório.');
    }

    const company = await ensureConsultantOrOwnerAccess(userId, companyId, req.user?.email);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada.');
    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

    const { data: instance } = await supabase
      .schema('public')
      .from('full_gap_instances')
      .select('id, status')
      .eq('assessment_id', assessmentId)
      .eq('gap_id', gapId)
      .maybeSingle();

    if (!instance || instance.status !== 'CAUSE_PENDING') {
      return apiError(res, 400, 'GAP_NOT_PENDING', 'Só é possível responder causa para gaps pendentes.');
    }

    const answersByQid = {};
    for (const a of answers) {
      if (!a.q_id || !a.answer) continue;
      if (!LIKERT_5_VALUES.includes(a.answer)) {
        return apiError(res, 400, 'INVALID_ANSWER', `answer deve ser um de: ${LIKERT_5_VALUES.join(', ')}`);
      }
      answersByQid[a.q_id] = a.answer;
    }

    const catalog = loadCauseCatalog();
    const gapDef = (catalog.gaps || []).find((g) => g.gap_id === gapId);
    if (!gapDef) return apiError(res, 400, 'GAP_NOT_FOUND', 'Gap não encontrado no catálogo.');

    const requiredQids = (gapDef.cause_questions || []).map((q) => q.q_id);
    const missing = requiredQids.filter((qid) => !answersByQid[qid] || answersByQid[qid] === '');
    if (missing.length > 0) {
      return apiError(res, 400, 'DIAG_INCOMPLETE', 'Responda todas as perguntas de causa antes de avaliar.', { missing });
    }

    for (const [qId, answer] of Object.entries(answersByQid)) {
      const { error } = await supabase.schema('public').from('full_cause_answers').upsert({
        company_id: companyId,
        assessment_id: assessmentId,
        gap_id: gapId,
        q_id: qId,
        answer,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'assessment_id,gap_id,q_id' });
      if (error) {
        console.error('Erro ao salvar resposta causa:', error.message);
        return apiError(res, 500, 'INTERNAL_ERROR', 'Erro ao salvar respostas.');
      }
    }

    const result = scoreCause(gapDef, answersByQid);
    await persistGapCause({ companyId, assessmentId, gapId, result, version: catalog.version || '1.0.0' });

    if (result.primary && result.primary !== 'UNKNOWN') {
      emitValueEvent('CAUSE_CLASSIFIED', { assessment_id: assessmentId, company_id: companyId, meta: { gap_id: gapId, cause_primary: result.primary } });
    }

    const { error: updErr } = await supabase
      .schema('public')
      .from('full_gap_instances')
      .update({ status: 'CAUSE_CLASSIFIED' })
      .eq('assessment_id', assessmentId)
      .eq('company_id', companyId)
      .eq('gap_id', gapId);

    if (updErr) {
      console.error('[AUDIT] full_causes_answer gap_instance_update_fail', { assessment_id: assessmentId, gap_id: gapId, error: updErr.message });
      return apiError(res, 500, 'INTERNAL_ERROR', 'Erro ao registrar causa. Tente novamente.');
    }

    const causeLabel = (catalog.cause_classes || []).find((c) => c.id === result.primary)?.label_cliente || result.primary;
    console.log('[AUDIT] full_causes_answer assessment_id=' + assessmentId + ' gap_id=' + gapId + ' cause=' + result.primary);

    return res.status(200).json({
      gap_id: gapId,
      cause_primary: result.primary,
      cause_label: causeLabel,
      cause_secondary: result.secondary,
      evidence: result.evidence,
    });
  } catch (err) {
    console.error('Erro POST /full/causes/answer:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// GET /full/causes?assessment_id=&company_id= — classificações concluídas com rastreabilidade
router.get('/full/causes', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.query.assessment_id;
    const companyId = req.query.company_id;
    if (!companyId || !assessmentId) {
      return apiError(res, 400, 'PARAMS_REQUIRED', 'assessment_id e company_id são obrigatórios.');
    }

    const company = await ensureConsultantOrOwnerAccess(userId, companyId, req.user?.email);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada.');
    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

    const { data: rows } = await supabase
      .schema('public')
      .from('full_gap_causes')
      .select('gap_id, cause_primary, cause_secondary, evidence_json, version')
      .eq('assessment_id', assessmentId);

    const catalog = loadCauseCatalog();
    const causeById = {};
    (catalog.cause_classes || []).forEach((c) => { causeById[c.id] = c; });

    const classifications = (rows || []).map((r) => ({
      gap_id: r.gap_id,
      cause_primary: r.cause_primary,
      cause_label: causeById[r.cause_primary]?.label_cliente || r.cause_primary,
      cause_secondary: r.cause_secondary,
      evidence: Array.isArray(r.evidence_json) ? r.evidence_json : [],
      version: r.version,
    }));

    return res.json({ classifications, assessment_id: assessmentId });
  } catch (err) {
    console.error('Erro GET /full/causes:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado.');
  }
});

// ---------------------------------------------------------------------------
// 6) POST /full/assessments/:id/submit — calcular scoring e SUBMITTED
// ---------------------------------------------------------------------------
function makeDebugId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `sub_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

router.post('/full/assessments/:id/submit', requireAuth, requireFullEntitlement, async (req, res) => {
  const debugId = makeDebugId();
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const companyId = req.query.company_id || req.body.company_id;

    if (!companyId) {
      return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
    }

    const company = await ensureConsultantOrOwnerAccess(userId, companyId, req.user?.email);
    if (!company) {
      return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');
    }

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) {
      return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    }
    if (assessment.status !== 'DRAFT') {
      return apiError(res, 400, 'DIAG_ALREADY_SUBMITTED', 'Diagnóstico já foi concluído.');
    }

    const segment = assessment.segment || 'C';
    console.log('[AUDIT] full_submit_start', {
      debug_id: debugId,
      company_id: companyId,
      assessment_id: assessmentId,
      user_id: userId,
      status: assessment.status,
      segment,
    });

    // 1) Carregar catálogo (processos + perguntas obrigatórias)
    const { data: processesForSegment, error: procErr } = await supabase
      .schema('public')
      .from('full_process_catalog')
      .select('process_key')
      .eq('is_active', true)
      .contains('segment_applicability', [segment]);

    let processKeys = (!procErr && processesForSegment?.length)
      ? processesForSegment.map((p) => p.process_key)
      : [];
    if (processKeys.length === 0) {
      console.warn('[AUDIT] full_submit processKeys vazio segment=' + segment + ' usando fallback COMERCIAL,OPERACOES,ADM_FIN,GESTAO');
      processKeys = ['COMERCIAL', 'OPERACOES', 'ADM_FIN', 'GESTAO'];
    }

    const { data: requiredQuestions } = await supabase
      .schema('public')
      .from('full_question_catalog')
      .select('process_key, question_key')
      .in('process_key', processKeys)
      .eq('is_active', true);

    const requiredSet = new Set((requiredQuestions || []).map((q) => `${q.process_key}:${q.question_key}`));
    const totalExpected = requiredSet.size;

    // 2) Validar catálogo: cada processo deve ter ao menos 1 pergunta
    const questionsByProcess = {};
    (requiredQuestions || []).forEach((q) => {
      if (!questionsByProcess[q.process_key]) questionsByProcess[q.process_key] = [];
      questionsByProcess[q.process_key].push(q.question_key);
    });
    const processesWithoutQuestions = processKeys.filter((pk) => !questionsByProcess[pk]?.length);
    if (totalExpected === 0 || processesWithoutQuestions.length > 0) {
      console.error('[AUDIT] full_submit CATALOG_INVALID', {
        assessment_id: assessmentId,
        segment,
        process_keys: processKeys,
        total_expected: totalExpected,
        processes_without_questions: processesWithoutQuestions,
      });
      return apiError(res, 500, 'CATALOG_INVALID', 'Catálogo inconsistente. Contate o suporte.');
    }

    // 3) Carregar respostas e validar completude
    const { data: answers, error: ansErr } = await supabase
      .schema('public')
      .from('full_answers')
      .select('process_key, question_key, answer_value')
      .eq('assessment_id', assessmentId);

    if (ansErr) {
      console.error('Erro ao buscar respostas:', ansErr.message);
      return res.status(500).json({ error: 'erro ao calcular scores' });
    }

    const answered_count = (answers || []).length;
    const processes_answered = [...new Set((answers || []).map((a) => a.process_key))];
    const answeredSet = new Set((answers || []).map((a) => `${a.process_key}:${a.question_key}`));
    const missing = [...requiredSet].filter((k) => !answeredSet.has(k));

    const allProcessesAnswered = processKeys.every((pk) => processes_answered.includes(pk));
    const answeredCountOk = answered_count >= totalExpected;

    if (missing.length > 0 || !answers || answers.length === 0 || !allProcessesAnswered || !answeredCountOk) {
      const missingByProcess = {};
      const keysToUse = missing.length > 0 ? missing : [...requiredSet];
      for (const k of keysToUse) {
        const [pk, qk] = String(k).split(':');
        if (pk && qk) {
          if (!missingByProcess[pk]) missingByProcess[pk] = [];
          missingByProcess[pk].push(qk);
        }
      }
      const missing_process_keys = [...new Set(
        Object.keys(missingByProcess).length > 0 ? Object.keys(missingByProcess) : processKeys.filter((pk) => !processes_answered.includes(pk))
      )].sort();
      const missingPayload = Object.entries(missingByProcess).map(([process_key, missing_question_keys]) => ({
        process_key,
        missing_question_keys: [...new Set(missing_question_keys)].sort(),
      }));
      if (missingPayload.length === 0 && missing_process_keys.length > 0) {
        missing_process_keys.forEach((pk) => {
          missingPayload.push({ process_key: pk, missing_question_keys: (questionsByProcess[pk] || []).sort() });
        });
      }
      const firstMissingLabel = PROCESS_OWNER_LABEL[missing_process_keys[0]] || missing_process_keys[0];
      const message_user = missing_process_keys.length === 1
        ? `Faltam respostas. Complete o processo ${firstMissingLabel}.`
        : `Faltam respostas. Complete os processos: ${missing_process_keys.map((pk) => PROCESS_OWNER_LABEL[pk] || pk).join(', ')}.`;

      console.log('[AUDIT] full_submit_incomplete', {
        assessment_id: assessmentId,
        missing_process_keys,
        answered_count,
        total_expected: totalExpected,
      });

      return apiError(res, 400, 'DIAG_INCOMPLETE', message_user, {
        missing: missingPayload,
        missing_process_keys,
        answered_count,
        total_expected: totalExpected,
      });
    }

    const { data: questionCatalog, error: qCatErr } = await supabase
      .schema('public')
      .from('full_question_catalog')
      .select('process_key, question_key, dimension')
      .in('process_key', processKeys)
      .eq('is_active', true);
    if (qCatErr) {
      console.error('Erro ao buscar question_catalog:', qCatErr.message);
      return res.status(500).json({ error: 'erro ao calcular scores' });
    }

    const qDimMap = {};
    (questionCatalog || []).forEach((q) => {
      qDimMap[`${q.process_key}:${q.question_key}`] = q.dimension;
    });

    const byProcess = {};
    answers.forEach((a) => {
      if (!byProcess[a.process_key]) byProcess[a.process_key] = [];
      byProcess[a.process_key].push(a);
    });

    const scoresToInsert = [];
    for (const [processKey, items] of Object.entries(byProcess)) {
      const sum = items.reduce((s, i) => s + i.answer_value, 0);
      const overallScore = sum / items.length;
      const dimBuckets = { EXISTENCIA: [], ROTINA: [], DONO: [], CONTROLE: [] };
      items.forEach((it) => {
        const dim = qDimMap[`${processKey}:${it.question_key}`];
        if (dim && dimBuckets[dim]) dimBuckets[dim].push(it.answer_value);
      });
      const dimensionScores = {
        EXISTENCIA: avg(dimBuckets.EXISTENCIA),
        ROTINA: avg(dimBuckets.ROTINA),
        DONO: avg(dimBuckets.DONO),
        CONTROLE: avg(dimBuckets.CONTROLE),
      };
      const derived = deriveBandFromCanonical(dimensionScores, overallScore);

      const support = {
        answers: items.map((i) => ({ question_key: i.question_key, answer_value: i.answer_value })),
        score_numeric: overallScore,
        dimension_scores: dimensionScores,
        band_rule: derived.rule,
      };
      scoresToInsert.push({
        assessment_id: assessmentId,
        process_key: processKey,
        score_numeric: Math.round(overallScore * 100) / 100,
        band: derived.band,
        support
      });
    }

    const { error: delErr } = await supabase
      .schema('public')
      .from('full_process_scores')
      .delete()
      .eq('assessment_id', assessmentId);

    if (delErr) {
      console.error('Erro ao limpar scores:', delErr.message);
      return res.status(500).json({ error: 'erro ao calcular scores' });
    }

    const { error: insertErr } = await supabase
      .schema('public')
      .from('full_process_scores')
      .insert(scoresToInsert);

    if (insertErr) {
      console.error('[AUDIT] full_submit_scoring_fail', { debug_id: debugId, assessment_id: assessmentId, error: insertErr.message });
      return res.status(500).json({ error: 'erro ao calcular scores' });
    }
    console.log('[AUDIT] full_submit_scoring_ok', {
      debug_id: debugId,
      assessment_id: assessmentId,
      scores_count: scoresToInsert.length,
      process_keys: scoresToInsert.map((s) => s.process_key),
    });

    const { error: updErr } = await supabase
      .schema('public')
      .from('full_assessments')
      .update({
        status: 'SUBMITTED',
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', assessmentId);

    if (updErr) {
      console.error('Erro ao atualizar status:', updErr.message);
      return apiError(res, 500, 'SUBMIT_ERROR', 'Erro ao enviar diagnóstico. Tente novamente.');
    }

    // Criar gap_instances para processos LOW que mapeiam a gaps do Motor de Causa
    try {
      const toInsert = [];
      for (const s of scoresToInsert) {
        if (s.band !== 'LOW') continue;
        const gapId = PROCESS_BAND_TO_GAP[s.process_key];
        if (!gapId) continue;
        toInsert.push({
          assessment_id: assessmentId,
          company_id: companyId,
          gap_id: gapId,
          process_key: s.process_key,
          source: 'submit',
          status: 'CAUSE_PENDING',
        });
      }
      if (toInsert.length > 0) {
        const { error: giErr } = await supabase
          .schema('public')
          .from('full_gap_instances')
          .upsert(toInsert, { onConflict: 'assessment_id,gap_id', ignoreDuplicates: false });
        if (giErr) console.warn('[AUDIT] full_submit gap_instances skip:', giErr.message);
        else console.log('[AUDIT] full_submit_gaps_ok', { debug_id: debugId, assessment_id: assessmentId, gap_count: toInsert.length });
      } else {
        console.log('[AUDIT] full_submit_gaps_ok', { debug_id: debugId, assessment_id: assessmentId, gap_count: 0 });
      }
    } catch (giEx) {
      console.warn('[AUDIT] full_submit gap_instances skip:', giEx.message);
    }

    // Motor de Causa: avaliar gaps MVP quando houver respostas completas (não quebra se faltar)
    try {
      const catalog = loadCauseCatalog();
      for (const gapId of CAUSE_ENGINE_GAP_IDS) {
        const gapDef = (catalog.gaps || []).find((g) => g.gap_id === gapId);
        if (!gapDef) continue;
        const answersByQid = await getCauseAnswersByGap(assessmentId, gapId);
        const requiredQids = (gapDef.cause_questions || []).map((q) => q.q_id);
        const missing = requiredQids.filter((qid) => !answersByQid[qid] || answersByQid[qid] === '');
        if (missing.length === 0) {
          const result = scoreCause(gapDef, answersByQid);
          await persistGapCause({ companyId, assessmentId, gapId, result, version: catalog.version || '1.0.0' });
          if (result.primary && result.primary !== 'UNKNOWN') {
            emitValueEvent('CAUSE_CLASSIFIED', { assessment_id: assessmentId, company_id: companyId, meta: { gap_id: gapId, cause_primary: result.primary } });
          }
        }
      }
    } catch (causeErr) {
      console.warn('[AUDIT] full_submit cause_eval skip:', causeErr.message);
    }

    const { data: processCatalog } = await supabase
      .schema('public')
      .from('full_process_catalog')
      .select('process_key, protects_dimension, protects_text, owner_alert_text, typical_impact_band, typical_impact_text, quick_win')
      .in('process_key', scoresToInsert.map((s) => s.process_key));

    const { data: questionCatalogTex } = await supabase
      .schema('public')
      .from('full_question_catalog')
      .select('process_key, question_key, question_text, dimension')
      .in('process_key', processKeys)
      .eq('is_active', true);

    let findingsResult;
    try {
      findingsResult = await buildAndPersistFindings({
        assessmentId,
        companyId,
        segment,
        scores: scoresToInsert,
        answers,
        processCatalog: processCatalog || [],
        questionCatalogTex: questionCatalogTex || []
      });
    } catch (findingsErr) {
      const step = 'generate_findings';
      console.error('[AUDIT] full_submit_findings_fail', {
        debug_id: debugId,
        company_id: companyId,
        assessment_id: assessmentId,
        user_id: userId,
        step,
        error_message: findingsErr?.message || String(findingsErr),
        stack: findingsErr?.stack,
      });
      return res.status(500).json({
        code: 'FINDINGS_FAILED',
        error: 'Falha ao concluir diagnóstico. Tente novamente.',
        message_user: 'Falha ao concluir diagnóstico. Tente novamente.',
        debug_id: debugId,
      });
    }

    if (findingsResult.error) {
      const step = findingsResult.step || 'unknown';
      const errMsg = findingsResult.error?.message || String(findingsResult.error);
      console.error('[AUDIT] full_submit_findings_fail', {
        debug_id: debugId,
        company_id: companyId,
        assessment_id: assessmentId,
        user_id: userId,
        step,
        answered_count: answers?.length,
        process_keys: scoresToInsert?.map((s) => s.process_key),
        segment,
        scores_count: scoresToInsert?.length,
        error_message: errMsg,
        stack: findingsResult.error?.stack,
      });
      return res.status(500).json({
        code: 'FINDINGS_FAILED',
        error: 'Falha ao concluir diagnóstico. Tente novamente.',
        message_user: 'Falha ao concluir diagnóstico. Tente novamente.',
        debug_id: debugId,
      });
    }

    if (findingsResult.hadGap) {
      console.warn('[AUDIT] full_submit findings_gap assessment_id=' + assessmentId);
    }

    console.log('[AUDIT] full_submit assessment_id=' + assessmentId + ' status=SUBMITTED');

    return res.status(200).json({
      ok: true,
      status: 'SUBMITTED',
      scores: scoresToInsert,
      findings_count: findingsResult.findings.length
    });
  } catch (err) {
    console.error('Erro POST /full/assessments/:id/submit:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

async function loadFullResultsPayload(assessmentId) {
  const { data: scores, error: scoresErr } = await supabase
    .schema('public')
    .from('full_process_scores')
    .select('*')
    .eq('assessment_id', assessmentId)
    .order('process_key');
  if (scoresErr || !scores) {
    return { error: scoresErr || new Error('scores_not_found') };
  }

  const { data: findingsRows, error: findErr } = await supabase
    .schema('public')
    .from('full_findings')
    .select('*')
    .eq('assessment_id', assessmentId)
    .order('finding_type')
    .order('position');
  if (findErr) {
    return { error: findErr };
  }

  const findings = (findingsRows || []).map((f) => ({
    id: f.id,
    type: f.finding_type,
    position: f.position,
    ...f.payload,
    trace: f.trace || {},
    is_fallback: !!f.is_fallback,
    gap_reason: f.gap_reason || null,
  }));

  const trace = findings.map((f) => ({
    id: f.id,
    type: f.type,
    position: f.position,
    trace: f.trace,
  }));

  const vazamentosFindings = findings.filter((f) => f.type === 'VAZAMENTO').slice(0, 3);
  const alavancasFindings = findings.filter((f) => f.type === 'ALAVANCA').slice(0, 3);

  function toSixPackItem(f) {
    const processLabel = PROCESS_OWNER_LABEL[f.processo] || f.processo;
    const title = f.gap_label ? f.gap_label : `${processLabel} (${f.maturity_band})`;
    const questionRefs = f.trace?.question_refs || [];
    return {
      title,
      o_que_acontece: f.gap_label || f.o_que_esta_acontecendo,
      causa_porque: f.cause_label || f.mechanism_label || null,
      custo_nao_agir: f.custo_de_nao_agir,
      muda_em_30_dias: f.o_que_muda_em_30_dias,
      primeiro_passo_action_id: f.primeiro_passo?.action_key || null,
      primeiro_passo: f.primeiro_passo?.action_title || null,
      is_fallback: !!f.is_fallback,
      supporting: {
        processes: f.trace?.process_keys || [f.processo],
        como_puxou_nivel: f.trace?.como_puxou_nivel || null,
        questions: questionRefs.map((q) => ({
          process_key: q.process_key,
          question_key: q.question_key,
          question_text: q.question_text || '',
          answer_value: q.answer_value,
          answer_text: q.answer_text || (q.answer_value != null ? humanizeAnswerValue(q.answer_value) : null),
        })),
      },
    };
  }

  const six_pack = {
    vazamentos: vazamentosFindings.map(toSixPackItem),
    alavancas: alavancasFindings.map(toSixPackItem),
  };

  return {
    error: null,
    payload: {
      six_pack,
      findings,
      scores_by_process: scores,
      trace,
      items: findings.map((f) => ({
        type: f.type,
        title: `${f.type}: ${f.processo || ''}`.trim(),
        what_is_happening: f.o_que_esta_acontecendo,
        cost_of_inaction_band: f.custo_de_nao_agir,
        change_in_30_days: f.o_que_muda_em_30_dias,
        first_step_action_key: f.primeiro_passo?.action_key || null,
        trace: f.trace,
      })),
    }
  };
}

// ---------------------------------------------------------------------------
// 7) GET /full/assessments/:id/results — compat (usa findings persistidos)
// ---------------------------------------------------------------------------
router.get('/full/assessments/:id/results', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const companyId = req.query.company_id;

    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    if (assessment.status !== 'SUBMITTED' && assessment.status !== 'CLOSED') {
      return apiError(res, 400, 'DIAG_NOT_READY', 'Conclua o diagnóstico para ver o resultado.');
    }

    const loaded = await loadFullResultsPayload(assessmentId);
    if (loaded.error) return apiError(res, 500, 'RESULTS_LOAD_ERROR', 'Erro ao carregar resultados. Tente novamente.');
    return res.json(loaded.payload);
  } catch (err) {
    console.error('Erro GET /full/assessments/:id/results:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// GET /full/results?assessment_id=...&company_id=...
router.get('/full/results', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.query.assessment_id;
    const companyId = req.query.company_id;
    if (!assessmentId) return res.status(400).json({ error: 'assessment_id é obrigatório' });

    const assessment = companyId
      ? await getAssessment(assessmentId, companyId)
      : await getAssessmentById(assessmentId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

    let sourceAssessment = assessment;
    if (assessment.status === 'DRAFT' && companyId) {
      const closed = await getLatestClosedAssessment(companyId);
      if (!closed) return apiError(res, 400, 'DIAG_NOT_READY', 'Conclua o diagnóstico para ver o resultado.');
      sourceAssessment = closed;
    } else if (assessment.status !== 'SUBMITTED' && assessment.status !== 'CLOSED') {
      return apiError(res, 400, 'DIAG_NOT_READY', 'Conclua o diagnóstico para ver o resultado.');
    }

    const access = await ensureConsultantOrOwnerAccess(userId, assessment.company_id, req.user?.email);
    if (!access) return apiError(res, 403, 'ACCESS_DENIED', 'Sem acesso a este recurso.');

    let loaded = await loadFullResultsPayload(sourceAssessment.id);
    if (loaded.error) return apiError(res, 500, 'RESULTS_LOAD_ERROR', 'Erro ao carregar resultados. Tente novamente.');

    const hasFindings = (loaded.payload?.findings?.length ?? 0) > 0;
    const hasScores = (loaded.payload?.scores_by_process?.length ?? 0) > 0;
    if (!hasFindings && hasScores) {
      const segment = assessment.segment || 'C';
      const scores = loaded.payload.scores_by_process;
      const processKeys = [...new Set(scores.map((s) => s.process_key))];

      const { data: answersRows } = await supabase
        .schema('public')
        .from('full_answers')
        .select('process_key, question_key, answer_value')
        .eq('assessment_id', sourceAssessment.id);
      const answers = (answersRows || []).map((a) => ({
        process_key: a.process_key,
        question_key: a.question_key,
        answer_value: a.answer_value,
      }));

      const { data: processCatalog } = await supabase
        .schema('public')
        .from('full_process_catalog')
        .select('process_key, protects_dimension, protects_text, owner_alert_text, typical_impact_band, typical_impact_text, quick_win')
        .in('process_key', processKeys);

      const { data: questionCatalogTex } = await supabase
        .schema('public')
        .from('full_question_catalog')
        .select('process_key, question_key, question_text, dimension')
        .in('process_key', processKeys)
        .eq('is_active', true);

      const findingsResult = await buildAndPersistFindings({
        assessmentId: sourceAssessment.id,
        segment,
        scores,
        answers,
        processCatalog: processCatalog || [],
        questionCatalogTex: questionCatalogTex || [],
      });
      if (!findingsResult.error) {
        console.log('[AUDIT] full_results findings_backfill assessment_id=' + sourceAssessment.id);
        loaded = await loadFullResultsPayload(sourceAssessment.id);
      }
    }

    return res.json(loaded.payload);
  } catch (err) {
    console.error('Erro GET /full/results:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// GET /full/plan/status?assessment_id=...&company_id=...
router.get('/full/plan/status', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.query.assessment_id;
    const companyId = req.query.company_id;
    if (!assessmentId) return res.status(400).json({ error: 'assessment_id é obrigatório' });
    if (!companyId) return res.status(400).json({ error: 'company_id é obrigatório' });

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

    const access = await ensureConsultantOrOwnerAccess(userId, assessment.company_id, req.user?.email);
    if (!access) return apiError(res, 403, 'ACCESS_DENIED', 'Sem acesso a este recurso.');

    const { data: plan, error } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .select('action_key, status')
      .eq('assessment_id', assessmentId)
      .order('position');

    if (error) {
      console.error('Erro ao buscar plan status:', error.message);
      return apiError(res, 500, 'PLAN_STATUS_ERROR', 'Erro ao verificar plano.');
    }

    const rows = plan || [];
    const exists = rows.length > 0;
    const doneCount = rows.filter((p) => p.status === 'DONE' || p.status === 'DROPPED').length;
    const progress = exists ? `${doneCount}/3` : '0/3';

    let next_action_title = null;
    if (exists) {
      const next = rows.find((p) => p.status === 'NOT_STARTED' || p.status === 'IN_PROGRESS');
      if (next) {
        const { data: cat } = await supabase
          .schema('public')
          .from('full_action_catalog')
          .select('title')
          .eq('action_key', next.action_key)
          .maybeSingle();
        next_action_title = cat?.title || next.action_key;
      }
    }

    return res.json({ exists, progress, next_action_title });
  } catch (err) {
    console.error('Erro GET /full/plan/status:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// ---------------------------------------------------------------------------
// 8) GET /full/assessments/:id/recommendations — recs + ações do catálogo
// ---------------------------------------------------------------------------
router.get('/full/assessments/:id/recommendations', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const companyId = req.query.company_id;

    if (!companyId) {
      return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
    }

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) {
      return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');
    }

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) {
      return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    }
    if (assessment.status !== 'SUBMITTED' && assessment.status !== 'CLOSED') {
      return apiError(res, 400, 'DIAG_NOT_READY', 'Conclua o diagnóstico para ver recomendações.');
    }

    const { data: scores } = await supabase
      .schema('public')
      .from('full_process_scores')
      .select('*')
      .eq('assessment_id', assessmentId);

    if (!scores || scores.length === 0) {
      return res.status(404).json({ error: 'scores não encontrados' });
    }

    const segment = assessment.segment;
    const processKeys = [...new Set(scores.map((s) => s.process_key))];

    const { data: gapCauses } = await supabase
      .schema('public')
      .from('full_gap_causes')
      .select('gap_id, cause_primary')
      .eq('assessment_id', assessmentId)
      .in('gap_id', CAUSE_ENGINE_GAP_IDS);

    const { data: mechanismActions } = await supabase
      .schema('public')
      .from('full_cause_mechanism_actions')
      .select('gap_id, cause_id, action_key, titulo_cliente, porque, primeiro_passo_30d, sort_order')
      .eq('is_active', true)
      .order('sort_order');

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

    const mechByGapCause = {};
    (mechanismActions || []).forEach((m) => {
      const key = `${m.gap_id}:${m.cause_id}`;
      if (!mechByGapCause[key]) mechByGapCause[key] = [];
      mechByGapCause[key].push(m);
    });

    const { data: recCatalog } = await supabase
      .schema('public')
      .from('full_recommendation_catalog')
      .select('*')
      .in('process_key', processKeys)
      .eq('is_active', true);

    const { data: actCatalog } = await supabase
      .schema('public')
      .from('full_action_catalog')
      .select('*')
      .in('process_key', processKeys)
      .eq('is_active', true)
      .contains('segment_applicability', [segment]);

    const recByProcessBand = {};
    (recCatalog || []).forEach((r) => {
      const k = `${r.process_key}:${r.band}`;
      if (!recByProcessBand[k]) recByProcessBand[k] = [];
      recByProcessBand[k].push(r);
    });

    const actByProcessBand = {};
    (actCatalog || []).forEach((a) => {
      const k = `${a.process_key}:${a.band}`;
      if (!actByProcessBand[k]) actByProcessBand[k] = [];
      actByProcessBand[k].push(a);
    });

    const recommendations = [];
    for (const s of scores) {
      const k = `${s.process_key}:${s.band}`;
      const gapId = s.band === 'LOW' ? PROCESS_BAND_TO_GAP[s.process_key] : null;
      const gapCause = gapId ? gapCauseByGap[gapId] : null;
      const gapDef = causeCatalog && gapId ? (causeCatalog.gaps || []).find((g) => g.gap_id === gapId) : null;
      const causeDef = gapCause?.cause_primary ? causeById[gapCause.cause_primary] : null;

      let recs = recByProcessBand[k] || [];
      let acts = actByProcessBand[k] || [];
      let isFallback = false;
      let gapReason = null;
      let gap_label = null;
      let cause_primary = null;
      let mechanism_label = null;
      let custo_de_nao_agir = null;
      let mudanca_em_30_dias = null;
      let primeiro_passo = null;

      if (gapId && gapDef) {
        if (gapCause && causeDef) {
          gap_label = gapDef.titulo_cliente;
          cause_primary = gapCause.cause_primary;
          mechanism_label = causeDef.mecanismo_primario || causeDef.label_cliente;
          custo_de_nao_agir = getCustoDeNaoAgirFaixa(s.band, {});
          mudanca_em_30_dias = causeDef.mecanismo_primario ? `Em 30 dias: ${causeDef.mecanismo_primario}` : null;

          const mechList = mechByGapCause[`${gapId}:${gapCause.cause_primary}`] || [];
          const catalogMech = (gapDef.mechanism_actions || []).slice(0, 3);
          if (mechList.length > 0) {
            acts = mechList.map((m) => ({
              action_key: m.action_key,
              title: m.titulo_cliente || m.action_key,
              benefit_text: m.porque,
              dod_checklist: m.primeiro_passo_30d ? [m.primeiro_passo_30d] : [],
            }));
            primeiro_passo = acts[0] ? { action_key: acts[0].action_key, action_title: acts[0].title } : null;
          } else if (catalogMech.length > 0) {
            acts = catalogMech.map((a) => ({
              action_key: a.action_key,
              title: a.titulo_cliente || a.action_key,
              benefit_text: a.porque,
              dod_checklist: a.primeiro_passo_30d ? [a.primeiro_passo_30d] : [],
            }));
            primeiro_passo = acts[0] ? { action_key: acts[0].action_key, action_title: acts[0].title } : null;
          }
          recs = [{
            recommendation_key: `gap-${gapId}-${gapCause.cause_primary}`,
            title: gapDef.titulo_cliente,
            owner_language_explanation: causeDef.descricao_cliente || mechanism_label,
          }];
        } else {
          isFallback = true;
          gapReason = 'gap_not_classified';
          recs = [{
            recommendation_key: `fallback-${s.process_key}-${s.band}`,
            title: FALLBACK_CONTENT_NAO_DEFINIDO,
            owner_language_explanation: FALLBACK_CONTENT_NAO_DEFINIDO,
          }];
          acts = [{
            action_key: `fallback-${s.process_key}-${s.band}`,
            title: FALLBACK_CONTENT_NAO_DEFINIDO,
            benefit_text: FALLBACK_CONTENT_NAO_DEFINIDO,
            dod_checklist: [],
          }];
          custo_de_nao_agir = getCustoDeNaoAgirFaixa(s.band, {});
          mudanca_em_30_dias = FALLBACK_CONTENT_NAO_DEFINIDO;
          console.log('[AUDIT] content_gap process_key=' + s.process_key + ' band=' + s.band + ' gap_id=' + gapId + ' reason=gap_not_classified assessment_id=' + assessmentId);
        }
      }

      if (recs.length === 0) {
        recs = [{
          recommendation_key: `fallback-${s.process_key}-${s.band}`,
          title: FALLBACK_CONTENT_NAO_DEFINIDO,
          owner_language_explanation: FALLBACK_CONTENT_NAO_DEFINIDO,
        }];
        isFallback = true;
        gapReason = gapReason || 'catálogo vazio para processo/banda';
        console.log('[AUDIT] content_gap process_key=' + s.process_key + ' band=' + s.band + ' missing_rule=true assessment_id=' + assessmentId + ' type=recommendation');
      }

      if (acts.length === 0 && !gapId) {
        acts = [{
          action_key: `fallback-${s.process_key}-${s.band}`,
          title: FALLBACK_ACTION_TITLE,
          benefit_text: FALLBACK_CONTENT_NAO_DEFINIDO,
          dod_checklist: ['Definir escopo', 'Executar conforme contexto', 'Documentar resultado'],
        }];
        isFallback = true;
        gapReason = gapReason || 'ações não encontradas no catálogo';
        console.log('[AUDIT] content_gap process_key=' + s.process_key + ' band=' + s.band + ' missing_rule=true assessment_id=' + assessmentId + ' type=action');
      }

      const rec = recs[0];
      const actionKeys = acts.map((a) => a.action_key);

      const { error: genErr } = await supabase
        .schema('public')
        .from('full_generated_recommendations')
        .upsert({
          assessment_id: assessmentId,
          process_key: s.process_key,
          band: s.band,
          recommendation_key: rec.recommendation_key,
          action_keys: actionKeys,
          is_fallback: isFallback,
          gap_reason: gapReason,
        }, { onConflict: 'assessment_id,process_key,recommendation_key' });

      if (genErr) {
        console.warn('Aviso ao persistir generated_rec:', genErr.message);
      }

      recommendations.push({
        process_key: s.process_key,
        band: s.band,
        recommendation: rec,
        actions: acts,
        is_fallback: isFallback,
        gap_label: gap_label ?? undefined,
        cause_primary: cause_primary ?? undefined,
        mechanism_label: mechanism_label ?? undefined,
        custo_de_nao_agir: custo_de_nao_agir ?? undefined,
        mudanca_em_30_dias: mudanca_em_30_dias ?? undefined,
        primeiro_passo: primeiro_passo ?? undefined,
      });
    }

    return res.json({ recommendations });
  } catch (err) {
    console.error('Erro GET /full/assessments/:id/recommendations:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// ---------------------------------------------------------------------------
// 9) POST /full/assessments/:id/plan/select — exatamente 3 ações
// ---------------------------------------------------------------------------
router.post('/full/assessments/:id/plan/select', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const companyId = req.query.company_id || req.body.company_id;
    const items = req.body.items || req.body;

    if (!companyId) {
      return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
    }

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) {
      return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');
    }

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) {
      return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    }
    if (assessment.status === 'CLOSED') return cycleClosed(res);

    const { remaining_count, required_count } = await computeRemainingAndRequired(assessmentId);
    if (remaining_count === 0) {
      return apiError(res, 400, 'NO_ACTIONS_LEFT', 'Não há mais ações sugeridas. Acesse os resultados ou o dashboard.');
    }

    const arr = Array.isArray(items) ? items : [items];
    if (arr.length !== required_count) {
      return res.status(400).json({
        error: required_count === 1 ? 'Selecione exatamente 1 ação.' : `Selecione exatamente ${required_count} ações.`,
        required_count,
        remaining_count,
      });
    }

    const validated = [];
    const seenKeys = new Set();
    const seenPos = new Set();

    for (const it of arr) {
      const pos = it.position ?? it.pos;
      const actionKey = it.action_key;
      const ownerName = it.owner_name ?? it.owner;
      const metricText = it.metric_text ?? it.metric;
      const checkpointDate = it.checkpoint_date ?? it.checkpoint;

      if (!pos || !actionKey || !ownerName || !metricText || !checkpointDate) {
        return res.status(400).json({
          error: `cada item deve ter position (1-${required_count}), action_key, owner_name, metric_text, checkpoint_date`
        });
      }
      if (pos < 1 || pos > required_count) {
        return res.status(400).json({ error: 'position deve ser 1 a ' + required_count });
      }
      if (seenKeys.has(actionKey)) {
        return res.status(400).json({ error: 'action_key não pode ser duplicado' });
      }
      if (seenPos.has(pos)) {
        return res.status(400).json({ error: 'position não pode ser duplicado' });
      }

      seenKeys.add(actionKey);
      seenPos.add(pos);
      validated.push({ position: pos, action_key: actionKey, owner_name: ownerName, metric_text: metricText, checkpoint_date: checkpointDate });
    }

    const { data: scores } = await supabase
      .schema('public')
      .from('full_process_scores')
      .select('process_key, band')
      .eq('assessment_id', assessmentId);

    const { data: actCatalog } = await supabase
      .schema('public')
      .from('full_action_catalog')
      .select('process_key, band, action_key')
      .in('action_key', validated.map((v) => v.action_key));

    const catalogMap = {};
    (actCatalog || []).forEach((a) => {
      catalogMap[a.action_key] = a;
    });

    let toInsert = [];
    for (const v of validated) {
      const cat = catalogMap[v.action_key];
      const processKey = cat?.process_key || 'GESTAO';
      const band = cat?.band || 'MEDIUM';
      toInsert.push({
        assessment_id: assessmentId,
        action_key: v.action_key,
        process_key: processKey,
        band,
        position: v.position,
        owner_name: v.owner_name,
        metric_text: v.metric_text,
        checkpoint_date: v.checkpoint_date,
        status: 'NOT_STARTED'
      });
    }

    const { error: delErr } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .delete()
      .eq('assessment_id', assessmentId);

    if (delErr) {
      console.error('Erro ao limpar plano:', delErr.message);
      return res.status(500).json({ error: 'erro ao salvar plano' });
    }

    const { error: insertErr } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .insert(toInsert);

    if (insertErr) {
      console.error('Erro ao inserir plano:', insertErr.message);
      return res.status(500).json({ error: 'erro ao salvar plano' });
    }

    return res.status(200).json({ ok: true, plan: toInsert });
  } catch (err) {
    console.error('Erro POST /full/assessments/:id/plan/select:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// ---------------------------------------------------------------------------
// DoD + Evidência (feito de verdade)
// ---------------------------------------------------------------------------

// GET /full/actions/:action_key/dod — DoD do catálogo
router.get('/full/actions/:action_key/dod', requireAuth, async (req, res) => {
  try {
    const actionKey = decodeURIComponent(req.params.action_key || '');
    if (!actionKey) {
      return res.status(400).json({ error: 'action_key é obrigatório' });
    }

    const { data: catalog, error } = await supabase
      .schema('public')
      .from('full_action_catalog')
      .select('action_key, dod_checklist')
      .eq('action_key', actionKey)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Erro ao buscar DoD:', error.message);
      return apiError(res, 500, 'CHECKLIST_FETCH_ERROR', 'Erro ao buscar checklist. Tente novamente.');
    }

    let dodChecklist = [];
    if (catalog && catalog.dod_checklist) {
      dodChecklist = Array.isArray(catalog.dod_checklist) ? catalog.dod_checklist : [];
    }
    if (dodChecklist.length === 0) {
      const { getActionEntryFromCatalog } = require('../lib/fullCatalog');
      const fromCatalog = getActionEntryFromCatalog(actionKey);
      if (fromCatalog?.dod_checklist?.length) {
        dodChecklist = fromCatalog.dod_checklist;
      } else if (actionKey.startsWith('fallback-')) {
        dodChecklist = ['Definir escopo', 'Executar conforme contexto', 'Documentar resultado'];
      }
    }

    return res.json({ action_key: actionKey, dod_checklist: dodChecklist });
  } catch (err) {
    console.error('Erro GET /full/actions/:action_key/dod:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// POST /full/assessments/:id/plan/:action_key/dod/confirm
router.post('/full/assessments/:id/plan/:action_key/dod/confirm', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const actionKey = decodeURIComponent(req.params.action_key || '');
    const companyId = req.query.company_id || req.body.company_id;
    const { confirmed_items } = req.body;

    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
    if (!actionKey) return res.status(400).json({ error: 'action_key é obrigatório' });
    if (!Array.isArray(confirmed_items)) {
      return apiError(res, 400, 'CHECKLIST_INVALID', 'Falta confirmar o que conta como feito.');
    }

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    if (assessment.status === 'CLOSED') return cycleClosed(res);

    const { data: planRow } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .select('action_key')
      .eq('assessment_id', assessmentId)
      .eq('action_key', actionKey)
      .maybeSingle();
    if (!planRow) return apiError(res, 404, 'ACTION_NOT_FOUND', 'Ação não encontrada no plano.');

    const { data: catalog } = await supabase
      .schema('public')
      .from('full_action_catalog')
      .select('dod_checklist')
      .eq('action_key', actionKey)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    let expectedItems = [];
    if (catalog && catalog.dod_checklist && Array.isArray(catalog.dod_checklist)) {
      expectedItems = catalog.dod_checklist;
    } else {
      const { getActionEntryFromCatalog } = require('../lib/fullCatalog');
      const fromCatalog = getActionEntryFromCatalog(actionKey);
      if (fromCatalog?.dod_checklist?.length) {
        expectedItems = fromCatalog.dod_checklist;
      } else if (actionKey.startsWith('fallback-')) {
        expectedItems = ['Definir escopo', 'Executar conforme contexto', 'Documentar resultado'];
      }
    }

    const confirmedSet = new Set(confirmed_items.map((s) => String(s).trim()).filter(Boolean));
    const missing = expectedItems.filter((e) => !confirmedSet.has(e));
    if (missing.length > 0) {
      return apiError(res, 400, 'CHECKLIST_INCOMPLETE', 'Falta confirmar o que conta como feito.');
    }

    const { data: existing } = await supabase
      .schema('public')
      .from('full_action_dod_confirmations')
      .select('*')
      .eq('assessment_id', assessmentId)
      .eq('action_key', actionKey)
      .maybeSingle();

    if (existing) {
      const { error: updErr } = await supabase
        .schema('public')
        .from('full_action_dod_confirmations')
        .update({ confirmed_items, confirmed_at: new Date().toISOString() })
        .eq('assessment_id', assessmentId)
        .eq('action_key', actionKey);
      if (updErr) {
        console.error('Erro ao atualizar DoD:', updErr.message);
        return apiError(res, 500, 'CHECKLIST_CONFIRM_ERROR', 'Erro ao confirmar o que conta como feito. Tente novamente.');
      }
    } else {
      const { error: insErr } = await supabase
        .schema('public')
        .from('full_action_dod_confirmations')
        .insert({ assessment_id: assessmentId, action_key: actionKey, confirmed_items });
      if (insErr) {
        console.error('Erro ao inserir DoD:', insErr.message);
        return apiError(res, 500, 'CHECKLIST_CONFIRM_ERROR', 'Erro ao confirmar o que conta como feito. Tente novamente.');
      }
    }

    const { data: updated } = await supabase
      .schema('public')
      .from('full_action_dod_confirmations')
      .select('*')
      .eq('assessment_id', assessmentId)
      .eq('action_key', actionKey)
      .single();

    return res.status(200).json({ ok: true, confirmation: updated });
  } catch (err) {
    console.error('Erro POST dod/confirm:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// POST /full/assessments/:id/plan/:action_key/evidence — write-once
router.post('/full/assessments/:id/plan/:action_key/evidence', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const actionKey = decodeURIComponent(req.params.action_key || '');
    const companyId = req.query.company_id || req.body.company_id;
    const { evidence_text, before_baseline, after_result } = req.body;

    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
    if (!actionKey) return res.status(400).json({ error: 'action_key é obrigatório' });
    if (!evidence_text || typeof evidence_text !== 'string' || evidence_text.trim().length === 0) {
      return res.status(400).json({ error: 'evidence_text é obrigatório' });
    }
    if (!before_baseline || (typeof before_baseline !== 'string' && typeof before_baseline !== 'number')) {
      return res.status(400).json({ error: 'before_baseline é obrigatório (texto ou número)' });
    }
    if (!after_result || (typeof after_result !== 'string' && typeof after_result !== 'number')) {
      return res.status(400).json({ error: 'after_result é obrigatório (texto ou número)' });
    }

    const beforeStr = String(before_baseline).trim();
    const afterStr = String(after_result).trim();
    if (!beforeStr || !afterStr) {
      return res.status(400).json({ error: 'before_baseline e after_result não podem ser vazios' });
    }

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    if (assessment.status === 'CLOSED') return cycleClosed(res);

    const { data: planRow } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .select('action_key')
      .eq('assessment_id', assessmentId)
      .eq('action_key', actionKey)
      .maybeSingle();
    if (!planRow) return apiError(res, 404, 'ACTION_NOT_FOUND', 'Ação não encontrada no plano.');

    const { data: existing } = await supabase
      .schema('public')
      .from('full_action_evidence')
      .select('*')
      .eq('assessment_id', assessmentId)
      .eq('action_key', actionKey)
      .maybeSingle();

    if (existing) {
      return res.status(200).json({
        already_exists: true,
        evidence: existing
      });
    }

    const declared_gain = buildDeclaredGain(beforeStr, afterStr);

    const { data: created, error: insErr } = await supabase
      .schema('public')
      .from('full_action_evidence')
      .insert({
        assessment_id: assessmentId,
        action_key: actionKey,
        evidence_text: evidence_text.trim(),
        before_baseline: beforeStr,
        after_result: afterStr,
        declared_gain
      })
      .select()
      .single();

    if (insErr) {
      if (insErr.code === '23505') {
        const { data: again } = await supabase
          .schema('public')
          .from('full_action_evidence')
          .select('*')
          .eq('assessment_id', assessmentId)
          .eq('action_key', actionKey)
          .single();
        return res.status(200).json({ already_exists: true, evidence: again });
      }
      console.error('Erro ao salvar evidência:', insErr.message);
      return apiError(res, 500, 'EVIDENCE_SAVE_ERROR', 'Erro ao registrar evidência. Tente novamente.');
    }

    emitValueEvent('GAIN_DECLARED', { assessment_id: assessmentId, company_id: companyId, meta: { action_key: actionKey } });

    return res.status(201).json({ evidence: created });
  } catch (err) {
    console.error('Erro POST evidence:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// ---------------------------------------------------------------------------
// Dashboard FULL (progresso + próxima ação determinística)
// ---------------------------------------------------------------------------
router.get('/full/assessments/:id/dashboard', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const companyId = req.query.company_id;

    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

    const { data: plan, error: planErr } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .select('*')
      .eq('assessment_id', assessmentId)
      .order('position');

    if (planErr || !plan || plan.length === 0) {
      return res.json({
        progress: '0/3',
        next_action_key: null,
        actions: [],
        assessment_status: assessment.status
      });
    }

    const actionKeys = plan.map((p) => p.action_key);
    const { data: catalog } = await supabase
      .schema('public')
      .from('full_action_catalog')
      .select('action_key, title, dod_checklist')
      .in('action_key', actionKeys);

    const { data: dodRows } = await supabase
      .schema('public')
      .from('full_action_dod_confirmations')
      .select('action_key')
      .eq('assessment_id', assessmentId)
      .in('action_key', actionKeys);

    const { data: evRows } = await supabase
      .schema('public')
      .from('full_action_evidence')
      .select('*')
      .eq('assessment_id', assessmentId)
      .in('action_key', actionKeys);

    const catalogMap = {};
    (catalog || []).forEach((c) => { catalogMap[c.action_key] = c; });
    const { getActionEntryFromCatalog } = require('../lib/fullCatalog');
    for (const ak of actionKeys) {
      if (!catalogMap[ak]) {
        const fromCatalog = getActionEntryFromCatalog(ak);
        if (fromCatalog) catalogMap[ak] = { action_key: ak, title: fromCatalog.title, dod_checklist: fromCatalog.dod_checklist };
      }
    }
    const dodSet = new Set((dodRows || []).map((r) => r.action_key));
    const evMap = {};
    (evRows || []).forEach((e) => { evMap[e.action_key] = e; });

    const { data: notesRows } = await supabase
      .schema('public')
      .from('full_consultant_notes')
      .select('action_key, note_type, note_text, created_at')
      .eq('assessment_id', assessmentId)
      .in('action_key', actionKeys)
      .order('created_at', { ascending: false });

    const notesByAction = {};
    (notesRows || []).forEach((n) => {
      if (!notesByAction[n.action_key]) notesByAction[n.action_key] = [];
      if (notesByAction[n.action_key].length < 3) {
        notesByAction[n.action_key].push({ note_type: n.note_type, note_text: n.note_text, created_at: n.created_at });
      }
    });

    const causeByActionKey = {};
    try {
      const catalog = loadCauseCatalog();
      const causeById = {};
      (catalog.cause_classes || []).forEach((c) => { causeById[c.id] = c; });
      const { data: gapCauses } = await supabase
        .schema('public')
        .from('full_gap_causes')
        .select('gap_id, cause_primary, evidence_json')
        .eq('assessment_id', assessmentId);
      for (const row of gapCauses || []) {
        const gapDef = (catalog.gaps || []).find((g) => g.gap_id === row.gap_id);
        if (!gapDef || !row.cause_primary) continue;
        const causeLabel = causeById[row.cause_primary]?.label_cliente || row.cause_primary;
        const evidence = Array.isArray(row.evidence_json) ? row.evidence_json : [];
        const why = evidence.map((e) => ({ question_key: e.q_id, answer: e.answer, label: e.texto_cliente }));
        for (const act of gapDef.mechanism_actions || []) {
          if (act.action_key) causeByActionKey[act.action_key] = { cause_label: causeLabel, why };
        }
      }
    } catch (_) { /* ignore */ }

    const doneOrDropped = plan.filter((p) => p.status === 'DONE' || p.status === 'DROPPED');
    const progress = `${doneOrDropped.length}/3`;

    let nextActionKey = null;
    for (const p of plan) {
      if (p.status !== 'DONE' && p.status !== 'DROPPED') {
        nextActionKey = p.action_key;
        break;
      }
    }

    const actions = plan.map((p) => {
      const cat = catalogMap[p.action_key] || {};
      const ev = evMap[p.action_key];
      const dodChecklist = (cat.dod_checklist && Array.isArray(cat.dod_checklist))
        ? cat.dod_checklist
        : (p.action_key.startsWith('fallback-') ? ['Definir escopo', 'Executar conforme contexto', 'Documentar resultado'] : []);

      const causeData = causeByActionKey[p.action_key];
      return {
        position: p.position,
        process_key: p.process_key,
        action_key: p.action_key,
        title: cat.title || p.action_key,
        owner_name: p.owner_name,
        metric_text: p.metric_text,
        checkpoint_date: p.checkpoint_date,
        status: p.status,
        dod_checklist: dodChecklist,
        dod_confirmed: dodSet.has(p.action_key),
        evidence_exists: !!ev,
        before_baseline: ev?.before_baseline ?? null,
        after_result: ev?.after_result ?? null,
        declared_gain: ev?.declared_gain ?? null,
        dropped_reason: p.dropped_reason ?? null,
        consultant_notes: notesByAction[p.action_key] || [],
        cause_label: causeData?.cause_label ?? null,
        why: causeData?.why ?? null
      };
    });

    return res.json({
      progress,
      next_action_key: nextActionKey,
      actions,
      assessment_status: assessment.status
    });
  } catch (err) {
    console.error('Erro GET /full/assessments/:id/dashboard:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// GET /full/assessments/:id/close-summary — somente quando ciclo pronto
router.get('/full/assessments/:id/close-summary', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const companyId = req.query.company_id;

    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

    const { data: plan, error: planErr } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .select('*')
      .eq('assessment_id', assessmentId)
      .order('position');

    if (planErr || !plan || plan.length === 0) {
      return res.status(400).json({ error: 'plano não existe' });
    }

    const notClosed = plan.filter((p) => p.status !== 'DONE' && p.status !== 'DROPPED');
    if (notClosed.length > 0) {
      return res.status(400).json({
        error: 'ciclo não finalizado',
        pending: notClosed.map((p) => ({ action_key: p.action_key, status: p.status }))
      });
    }

    const droppedWithoutReason = plan.filter((p) => p.status === 'DROPPED' && (!p.dropped_reason || p.dropped_reason.trim().length === 0));
    if (droppedWithoutReason.length > 0) {
      return res.status(400).json({
        error: 'ações DROPPED exigem dropped_reason'
      });
    }

    const { data: evRows } = await supabase
      .schema('public')
      .from('full_action_evidence')
      .select('action_key, declared_gain')
      .eq('assessment_id', assessmentId);

    const { data: catalog } = await supabase
      .schema('public')
      .from('full_action_catalog')
      .select('action_key, title')
      .in('action_key', plan.map((p) => p.action_key));

    const catalogMap = {};
    (catalog || []).forEach((c) => { catalogMap[c.action_key] = c; });
    const evMap = {};
    (evRows || []).forEach((e) => { evMap[e.action_key] = e; });

    const gains = plan.map((p) => {
      const ev = evMap[p.action_key];
      const cat = catalogMap[p.action_key] || {};
      return {
        position: p.position,
        action_key: p.action_key,
        title: cat.title || p.action_key,
        status: p.status,
        dropped_reason: p.dropped_reason ?? null,
        declared_gain: ev?.declared_gain ?? null
      };
    });

    return res.json({
      assessment_id: assessmentId,
      company_id: companyId,
      gains
    });
  } catch (err) {
    console.error('Erro GET /full/assessments/:id/close-summary:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// POST /full/assessments/:id/close — fechar ciclo (status => CLOSED)
router.post('/full/assessments/:id/close', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const companyId = req.query.company_id || req.body.company_id;

    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

    if (assessment.status === 'CLOSED') {
      const { data: plan } = await supabase
        .schema('public')
        .from('full_selected_actions')
        .select('*')
        .eq('assessment_id', assessmentId)
        .order('position');
      const { data: evRows } = await supabase
        .schema('public')
        .from('full_action_evidence')
        .select('action_key, declared_gain')
        .eq('assessment_id', assessmentId);
      const { data: catalog } = await supabase
        .schema('public')
        .from('full_action_catalog')
        .select('action_key, title')
        .in('action_key', (plan || []).map((p) => p.action_key));
      const catalogMap = {};
      (catalog || []).forEach((c) => { catalogMap[c.action_key] = c; });
      const evMap = {};
      (evRows || []).forEach((e) => { evMap[e.action_key] = e; });
      const gains = (plan || []).map((p) => ({
        position: p.position,
        action_key: p.action_key,
        title: catalogMap[p.action_key]?.title || p.action_key,
        status: p.status,
        dropped_reason: p.dropped_reason ?? null,
        declared_gain: evMap[p.action_key]?.declared_gain ?? null
      }));
      return res.json({ already_closed: true, assessment_id: assessmentId, company_id: companyId, gains });
    }

    const { data: plan, error: planErr } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .select('*')
      .eq('assessment_id', assessmentId)
      .order('position');

    if (planErr || !plan || plan.length === 0) {
      return res.status(400).json({ error: 'plano não existe' });
    }

    const notClosed = plan.filter((p) => p.status !== 'DONE' && p.status !== 'DROPPED');
    if (notClosed.length > 0) {
      return res.status(400).json({
        error: 'ciclo não finalizado',
        pending: notClosed.map((p) => ({ action_key: p.action_key, status: p.status }))
      });
    }

    const droppedWithoutReason = plan.filter((p) => p.status === 'DROPPED' && (!p.dropped_reason || p.dropped_reason.trim().length === 0));
    if (droppedWithoutReason.length > 0) {
      return apiError(res, 400, 'DROP_REASON_REQUIRED', 'Ações descartadas exigem motivo.');
    }

    const { error: updErr } = await supabase
      .schema('public')
      .from('full_assessments')
      .update({ status: 'CLOSED', updated_at: new Date().toISOString() })
      .eq('id', assessmentId);

    if (updErr) {
      console.error('Erro ao fechar ciclo:', updErr.message);
      return apiError(res, 500, 'CYCLE_CLOSE_ERROR', 'Erro ao fechar ciclo. Tente novamente.');
    }

    const { data: evRows } = await supabase
      .schema('public')
      .from('full_action_evidence')
      .select('action_key, declared_gain')
      .eq('assessment_id', assessmentId);
    const { data: catalog } = await supabase
      .schema('public')
      .from('full_action_catalog')
      .select('action_key, title')
      .in('action_key', plan.map((p) => p.action_key));
    const catalogMap = {};
    (catalog || []).forEach((c) => { catalogMap[c.action_key] = c; });
    const evMap = {};
    (evRows || []).forEach((e) => { evMap[e.action_key] = e; });
    const gains = plan.map((p) => ({
      position: p.position,
      action_key: p.action_key,
      title: catalogMap[p.action_key]?.title || p.action_key,
      status: p.status,
      dropped_reason: p.dropped_reason ?? null,
      declared_gain: evMap[p.action_key]?.declared_gain ?? null
    }));

    return res.status(200).json({ assessment_id: assessmentId, company_id: companyId, gains });
  } catch (err) {
    console.error('Erro POST /full/assessments/:id/close:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// POST /full/assessments/:id/new-cycle — novo ciclo de execução (NÃO cria assessment)
router.post('/full/assessments/:id/new-cycle', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const companyId = req.query.company_id || req.body.company_id;

    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');

    const company = await ensureConsultantOrOwnerAccess(userId, companyId, req.user?.email);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

    if (assessment.status !== 'CLOSED') {
      return res.status(400).json({
        error: 'só é possível iniciar novo ciclo a partir de um assessment CLOSED',
        hint: 'Feche o ciclo atual primeiro (POST /full/assessments/:id/close)'
      });
    }

    const { data: plan } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .select('*')
      .eq('assessment_id', assessmentId)
      .order('position');

    const { data: evRows } = await supabase
      .schema('public')
      .from('full_action_evidence')
      .select('action_key, declared_gain')
      .eq('assessment_id', assessmentId);

    const evMap = {};
    (evRows || []).forEach((e) => { evMap[e.action_key] = e; });

    const { data: maxCycle } = await supabase
      .schema('public')
      .from('full_cycle_history')
      .select('cycle_no')
      .eq('assessment_id', assessmentId)
      .order('cycle_no', { ascending: false })
      .limit(1)
      .maybeSingle();

    const cycleNo = (maxCycle?.cycle_no ?? 0) + 1;

    if (plan?.length) {
      const toArchive = plan.map((p) => ({
        assessment_id: assessmentId,
        cycle_no: cycleNo,
        action_key: p.action_key,
        process_key: p.process_key,
        position: p.position,
        status: p.status,
        owner_name: p.owner_name,
        metric_text: p.metric_text,
        checkpoint_date: p.checkpoint_date,
        dropped_reason: p.dropped_reason ?? null,
        declared_gain: evMap[p.action_key]?.declared_gain ?? null,
      }));
      const { error: archErr } = await supabase.schema('public').from('full_cycle_history').insert(toArchive);
      if (archErr) console.error('[new-cycle] Erro ao arquivar plano:', archErr.message);

      const { error: delErr } = await supabase
        .schema('public')
        .from('full_selected_actions')
        .delete()
        .eq('assessment_id', assessmentId);
      if (delErr) {
        console.error('[new-cycle] Erro ao limpar plano:', delErr.message);
        return apiError(res, 500, 'CYCLE_NEW_ERROR', 'Erro ao iniciar novo ciclo. Tente novamente.');
      }
    }

    const { error: updErr } = await supabase
      .schema('public')
      .from('full_assessments')
      .update({ status: 'SUBMITTED', updated_at: new Date().toISOString() })
      .eq('id', assessmentId);
    if (updErr) {
      console.error('[new-cycle] Erro ao reabrir assessment:', updErr.message);
      return apiError(res, 500, 'CYCLE_NEW_ERROR', 'Erro ao iniciar novo ciclo. Tente novamente.');
    }

    console.log('[AUDIT] full_new_cycle assessment_id=' + assessmentId + ' cycle_no=' + cycleNo);

    return res.status(200).json({ ok: true, assessment_id: assessmentId, cycle_no: cycleNo });
  } catch (err) {
    console.error('Erro POST /full/assessments/:id/new-cycle:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// ---------------------------------------------------------------------------
// 10) GET /full/assessments/:id/plan
// ---------------------------------------------------------------------------
router.get('/full/assessments/:id/plan', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const companyId = req.query.company_id;

    if (!companyId) {
      return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
    }

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) {
      return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');
    }

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) {
      return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    }

    const { data: plan, error } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .select('*')
      .eq('assessment_id', assessmentId)
      .order('position');

    if (error) {
      console.error('Erro ao buscar plano:', error.message);
      return res.status(500).json({ error: 'erro ao buscar plano' });
    }

    return res.json({ plan: plan || [] });
  } catch (err) {
    console.error('Erro GET /full/assessments/:id/plan:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// ---------------------------------------------------------------------------
// 11) PATCH /full/assessments/:id/plan/:action_key/status
// ---------------------------------------------------------------------------
router.patch('/full/assessments/:id/plan/:action_key/status', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const actionKey = decodeURIComponent(req.params.action_key || '');
    const companyId = req.query.company_id || req.body.company_id;
    const { status, dropped_reason } = req.body;

    if (!companyId) {
      return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
    }
    if (!status || !['DONE', 'DROPPED', 'IN_PROGRESS', 'NOT_STARTED'].includes(status)) {
      return apiError(res, 400, 'INVALID_STATUS', 'Status inválido.');
    }

    if (status === 'DONE') {
      const company = await ensureCompanyAccess(userId, companyId);
      if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');
      const assessment = await getAssessment(assessmentId, companyId);
      if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

      const { data: dodRow } = await supabase
        .schema('public')
        .from('full_action_dod_confirmations')
        .select('assessment_id')
        .eq('assessment_id', assessmentId)
        .eq('action_key', actionKey)
        .maybeSingle();
      if (!dodRow) {
        return apiError(res, 400, 'CHECKLIST_INCOMPLETE', 'Falta confirmar o que conta como feito.');
      }

      const { data: evRow } = await supabase
        .schema('public')
        .from('full_action_evidence')
        .select('assessment_id')
        .eq('assessment_id', assessmentId)
        .eq('action_key', actionKey)
        .maybeSingle();
      if (!evRow) {
        return apiError(res, 400, 'EVIDENCE_REQUIRED', 'Para concluir, registre a evidência (antes e depois).');
      }
    }
    if (status === 'DROPPED' && (!dropped_reason || typeof dropped_reason !== 'string' || dropped_reason.trim().length === 0)) {
      return apiError(res, 400, 'DROP_REASON_REQUIRED', 'Ao descartar uma ação, informe o motivo.');
    }

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) {
      return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');
    }

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) {
      return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    }
    if (assessment.status === 'CLOSED') return cycleClosed(res);

    const update = { status, updated_at: new Date().toISOString() };
    if (status === 'DROPPED') update.dropped_reason = dropped_reason;

    const { data, error } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .update(update)
      .eq('assessment_id', assessmentId)
      .eq('action_key', actionKey)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Erro ao atualizar status:', error.message);
      return apiError(res, 500, 'STATUS_UPDATE_ERROR', 'Erro ao atualizar status. Tente novamente.');
    }
    if (!data) {
      return apiError(res, 404, 'ACTION_NOT_FOUND', 'Ação não encontrada no plano.');
    }

    return res.json(data);
  } catch (err) {
    console.error('Erro PATCH plan status:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// ---------------------------------------------------------------------------
// Prompt 4 aliases (ciclo FULL) - mantém fonte de verdade nas tabelas atuais
// ---------------------------------------------------------------------------

// GET /full/actions?assessment_id=...&company_id=...
// Motor FIT: só retorna sugestões com encaixe real nas respostas. ZERO placeholder.
router.get('/full/actions', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    let assessmentId = req.query.assessment_id;
    const companyId = req.query.company_id;
    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');

    const company = await ensureConsultantOrOwnerAccess(userId, companyId, req.user?.email);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');

    let assessment = null;
    if (assessmentId) {
      assessment = await getAssessment(assessmentId, companyId);
    }
    if (!assessment) {
      const latest = await getLatestSubmittedOrClosedAssessment(companyId);
      if (!latest) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[AUDIT] full_actions DIAG_NOT_READY company_id=' + companyId + ' assessment_id=' + assessmentId + ' reason=no_submitted_assessment');
        }
        return apiError(res, 400, 'DIAG_NOT_READY', 'Conclua o diagnóstico para sugerir ações.');
      }
      assessment = latest;
      assessmentId = assessment.id;
    }

    if (assessment.status !== 'SUBMITTED' && assessment.status !== 'CLOSED') {
      if (process.env.NODE_ENV === 'development') {
        console.log('[AUDIT] full_actions DIAG_NOT_READY assessment_id=' + assessment.id + ' status=' + assessment.status);
      }
      return apiError(res, 400, 'DIAG_NOT_READY', 'Conclua o diagnóstico para sugerir ações.');
    }

    const { data: answers } = await supabase
      .schema('public')
      .from('full_answers')
      .select('process_key, question_key, answer_value')
      .eq('assessment_id', assessmentId);

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

    const { data: scores } = await supabase
      .schema('public')
      .from('full_process_scores')
      .select('process_key, band, score_numeric')
      .eq('assessment_id', assessment.id);

    const suggestions = await buildSuggestionsForAssessment(assessmentId, excludeActionKeys, true);

    const { deriveSuggestionsFromAnswers } = require('../lib/fullActionFit');
    const scoresByProcess = {};
    (scores || []).forEach((s) => { scoresByProcess[s.process_key] = s; });
    const { content_gaps } = deriveSuggestionsFromAnswers(
      answers || [],
      scoresByProcess,
      excludeActionKeys,
      { includeMatchDebug: process.env.NODE_ENV === 'development' }
    );

    for (const g of content_gaps) {
      console.log('[AUDIT] content_gap process_key=' + g.process_key + ' band=' + g.band + ' reason=' + (g.reason || 'no_matching_rule') + ' assessment_id=' + assessmentId + ' action_key=' + (g.action_key || ''));
    }

    const remaining_count = suggestions.length;
    const required_count = Math.min(3, Math.max(0, remaining_count));
    const is_last_block = remaining_count < 3;

    const { data: gapCausesForCoverage } = await supabase
      .schema('public')
      .from('full_gap_causes')
      .select('gap_id, cause_primary')
      .eq('assessment_id', assessmentId)
      .in('gap_id', CAUSE_ENGINE_GAP_IDS);
    const has_cause_coverage = Array.isArray(gapCausesForCoverage) && gapCausesForCoverage.some((r) => r.cause_primary);

    const mechanism_required_action_keys = has_cause_coverage ? await getMechanismRequiredActionKeys(assessmentId) : [];

    return res.json({
      ok: true,
      suggestions,
      content_gaps,
      scores_by_process: scores || [],
      assessment_id: assessment.id,
      required_count,
      remaining_count,
      is_last_block,
      has_cause_coverage,
      mechanism_required_action_keys,
    });
  } catch (err) {
    console.error('Erro GET /full/actions:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// POST /full/cycle/select-actions
router.post('/full/cycle/select-actions', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.query.company_id || req.body.company_id;
    const assessmentId = req.body.assessment_id;
    const items = req.body.actions || req.body.items || [];

    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
    if (!assessmentId) return res.status(400).json({ error: 'assessment_id é obrigatório' });

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    if (assessment.status === 'CLOSED') return cycleClosed(res);

    const { remaining_count, required_count } = await computeRemainingAndRequired(assessmentId);
    if (remaining_count === 0) {
      return apiError(res, 400, 'NO_ACTIONS_LEFT', 'Não há mais ações sugeridas. Acesse os resultados ou o dashboard.');
    }

    const arr = Array.isArray(items) ? items : [];
    if (arr.length !== required_count) {
      return res.status(400).json({
        error: required_count === 1 ? 'Selecione exatamente 1 ação.' : `Selecione exatamente ${required_count} ações.`,
        required_count,
        remaining_count,
      });
    }

    const seenAction = new Set();
    const seenPos = new Set();
    const validated = [];
    for (const it of arr) {
      const actionKey = it.action_key;
      const ownerName = it.owner_name;
      const metricText = it.metric_text;
      const checkpointDate = it.checkpoint_date;
      const pos = Number(it.position);
      if (!actionKey || !ownerName || !metricText || !checkpointDate || !pos) {
        return res.status(400).json({ error: `cada ação exige action_key, owner_name, metric_text, checkpoint_date e position(1..${required_count})` });
      }
      if (pos < 1 || pos > required_count) return res.status(400).json({ error: 'position deve ser 1..' + required_count });
      if (seenAction.has(actionKey)) return res.status(400).json({ error: 'action_key duplicado' });
      if (seenPos.has(pos)) return res.status(400).json({ error: 'position duplicado' });
      seenAction.add(actionKey);
      seenPos.add(pos);
      validated.push({ action_key: actionKey, owner_name: ownerName, metric_text: metricText, checkpoint_date: checkpointDate, position: pos });
    }

    const mechValidationCycle = await validateMechanismActionRequired(assessmentId, validated.map((v) => v.action_key));
    if (!mechValidationCycle.valid) {
      return apiError(res, 400, 'MECHANISM_ACTION_REQUIRED', 'Sem atacar a causa, você volta ao mesmo problema. Inclua pelo menos uma ação do mecanismo indicado.', {
        mechanism_action_keys: mechValidationCycle.mechanism_action_keys || [],
      });
    }

    const { data: actionCatalog } = await supabase
      .schema('public')
      .from('full_action_catalog')
      .select('action_key, process_key, band')
      .in('action_key', validated.map((v) => v.action_key));

    const actMap = {};
    (actionCatalog || []).forEach((a) => { actMap[a.action_key] = a; });

    const { getActionMetaFromCatalog } = require('../lib/fullCatalog');

    const toInsert = validated.map((v) => {
      const fromDb = actMap[v.action_key];
      const fromCatalog = !fromDb ? getActionMetaFromCatalog(v.action_key) : null;
      const meta = fromDb || fromCatalog || { process_key: 'GESTAO', band: 'MEDIUM' };
      return {
        assessment_id: assessmentId,
        action_key: v.action_key,
        process_key: meta.process_key,
        band: meta.band,
        position: v.position,
        owner_name: v.owner_name,
        metric_text: v.metric_text,
        checkpoint_date: v.checkpoint_date,
        status: 'NOT_STARTED',
      };
    });

    const { error: delErr } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .delete()
      .eq('assessment_id', assessmentId);
    if (delErr) return res.status(500).json({ error: 'erro ao preparar ciclo' });

    const { error: insErr } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .insert(toInsert);
    if (insErr) return res.status(500).json({ error: 'erro ao salvar ciclo' });

    emitValueEvent('PLAN_CREATED', { assessment_id: assessmentId, company_id: companyId, meta: { action_count: toInsert.length } });

    return res.status(200).json({ ok: true, actions: toInsert });
  } catch (err) {
    console.error('Erro POST /full/cycle/select-actions:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// POST /full/cycle/actions/:id/evidence (write-once)
router.post('/full/cycle/actions/:id/evidence', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const actionKey = decodeURIComponent(req.params.id || '');
    const companyId = req.query.company_id || req.body.company_id;
    const assessmentId = req.body.assessment_id;
    const evidenceText = req.body.evidence_text;
    const beforeText = req.body.before_text;
    const afterText = req.body.after_text;
    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
    if (!assessmentId) return res.status(400).json({ error: 'assessment_id é obrigatório' });
    if (!actionKey) return res.status(400).json({ error: 'action id é obrigatório' });
    if (!evidenceText || !beforeText || !afterText) {
      return res.status(400).json({ error: 'evidence_text, before_text e after_text são obrigatórios' });
    }

    const existingAssessment = await getAssessment(assessmentId, companyId);
    if (!existingAssessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

    const { data: existing } = await supabase
      .schema('public')
      .from('full_action_evidence')
      .select('*')
      .eq('assessment_id', assessmentId)
      .eq('action_key', actionKey)
      .maybeSingle();
    if (existing) return res.status(409).json({ error: 'evidência já registrada (write-once)' });

    const beforeStr = String(beforeText || '').trim();
    const afterStr = String(afterText || '').trim();
    const declaredGain = buildDeclaredGain(beforeStr, afterStr);
    const { data: created, error: insErr } = await supabase
      .schema('public')
      .from('full_action_evidence')
      .insert({
        assessment_id: assessmentId,
        action_key: actionKey,
        evidence_text: String(evidenceText),
        before_baseline: beforeStr,
        after_result: afterStr,
        declared_gain: declaredGain,
      })
      .select()
      .single();
    if (insErr) return res.status(500).json({ error: 'erro ao registrar evidência' });

    emitValueEvent('GAIN_DECLARED', { assessment_id: assessmentId, company_id: existingAssessment.company_id, meta: { action_key: actionKey } });

    return res.status(201).json({ evidence: created });
  } catch (err) {
    console.error('Erro POST /full/cycle/actions/:id/evidence:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// POST /full/cycle/actions/:id/mark-done
router.post('/full/cycle/actions/:id/mark-done', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const actionKey = decodeURIComponent(req.params.id || '');
    const companyId = req.query.company_id || req.body.company_id;
    const assessmentId = req.body.assessment_id;
    const confirmedItems = req.body.confirmed_items || [];
    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
    if (!assessmentId) return res.status(400).json({ error: 'assessment_id é obrigatório' });
    if (!actionKey) return res.status(400).json({ error: 'action id é obrigatório' });

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    if (assessment.status === 'CLOSED') return cycleClosed(res);

    const { data: cat } = await supabase
      .schema('public')
      .from('full_action_catalog')
      .select('dod_checklist')
      .eq('action_key', actionKey)
      .eq('is_active', true)
      .maybeSingle();
    let expected = Array.isArray(cat?.dod_checklist) ? cat.dod_checklist : [];
    if (expected.length === 0) {
      const { getActionEntryFromCatalog } = require('../lib/fullCatalog');
      const fromCatalog = getActionEntryFromCatalog(actionKey);
      if (fromCatalog?.dod_checklist?.length) expected = fromCatalog.dod_checklist;
    }
    const confSet = new Set((confirmedItems || []).map((x) => String(x)));
    const missingDod = expected.filter((x) => !confSet.has(String(x)));
    if (missingDod.length > 0) {
      return apiError(res, 400, 'CHECKLIST_INCOMPLETE', 'Falta confirmar o que conta como feito.');
    }

    const { data: ev } = await supabase
      .schema('public')
      .from('full_action_evidence')
      .select('assessment_id')
      .eq('assessment_id', assessmentId)
      .eq('action_key', actionKey)
      .maybeSingle();
    if (!ev) return apiError(res, 400, 'EVIDENCE_REQUIRED', 'Para concluir, registre a evidência (antes e depois).');

    const { error: updErr } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .update({ status: 'DONE', updated_at: new Date().toISOString() })
      .eq('assessment_id', assessmentId)
      .eq('action_key', actionKey);
    if (updErr) return apiError(res, 500, 'MARK_DONE_ERROR', 'Erro ao marcar como concluído. Tente novamente.');

    return res.json({ ok: true, status: 'DONE' });
  } catch (err) {
    console.error('Erro POST /full/cycle/actions/:id/mark-done:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// GET /full/dashboard?assessment_id=...&company_id=...
router.get('/full/dashboard', requireAuth, requireFullEntitlement, async (req, res) => {
  const assessmentId = req.query.assessment_id;
  const companyId = req.query.company_id;
  if (!assessmentId) return res.status(400).json({ error: 'assessment_id é obrigatório' });
  if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
  return res.redirect(307, `/full/assessments/${assessmentId}/dashboard?company_id=${companyId}`);
});

// ---------------------------------------------------------------------------
// Prompt 4: POST /full/plan, GET /full/plan (aliases idempotentes)
// ---------------------------------------------------------------------------
router.post('/full/plan', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.query.company_id || req.body.company_id;
    const assessmentId = req.body.assessment_id;
    const items = req.body.actions || req.body.items || req.body;

    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
    if (!assessmentId) return res.status(400).json({ error: 'assessment_id é obrigatório' });

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    if (assessment.status === 'CLOSED') return cycleClosed(res);

    const { remaining_count, required_count } = await computeRemainingAndRequired(assessmentId);
    if (remaining_count === 0) {
      return apiError(res, 400, 'NO_ACTIONS_LEFT', 'Não há mais ações sugeridas. Acesse os resultados ou o dashboard.');
    }

    const arr = Array.isArray(items) ? items : [items];
    if (arr.length !== required_count) {
      return res.status(400).json({
        error: required_count === 1
          ? 'Selecione exatamente 1 ação para este bloco.'
          : `Selecione exatamente ${required_count} ações para este bloco.`,
        required_count,
        remaining_count,
      });
    }

    const validated = [];
    const seenKeys = new Set();
    const seenPos = new Set();

    for (const it of arr) {
      const pos = it.position ?? it.pos;
      const actionKey = it.action_key;
      const ownerName = (it.owner_name ?? it.owner ?? '').toString().trim();
      const metricText = (it.metric_text ?? it.metric ?? '').toString().trim();
      const checkpointDate = it.checkpoint_date ?? it.checkpoint;

      if (!pos || !actionKey || !ownerName || !metricText || !checkpointDate) {
        return res.status(400).json({
          error: `cada ação exige position (1-${required_count}), action_key, owner_name, metric_text, checkpoint_date`
        });
      }
      if (pos < 1 || pos > required_count) return res.status(400).json({ error: 'position deve ser 1 a ' + required_count });
      if (seenKeys.has(actionKey)) return res.status(400).json({ error: 'action_key duplicado' });
      if (seenPos.has(pos)) return res.status(400).json({ error: 'position duplicado' });
      seenKeys.add(actionKey);
      seenPos.add(pos);
      validated.push({ position: pos, action_key: actionKey, owner_name: ownerName, metric_text: metricText, checkpoint_date: checkpointDate });
    }

    const mechValidation = await validateMechanismActionRequired(assessmentId, validated.map((v) => v.action_key));
    if (!mechValidation.valid) {
      return apiError(res, 400, 'MECHANISM_ACTION_REQUIRED', 'Sem atacar a causa, você volta ao mesmo problema. Inclua pelo menos uma ação do mecanismo indicado.', {
        mechanism_action_keys: mechValidation.mechanism_action_keys || [],
      });
    }

    const { data: actCatalog } = await supabase
      .schema('public')
      .from('full_action_catalog')
      .select('process_key, band, action_key')
      .in('action_key', validated.map((v) => v.action_key));

    const catalogMap = {};
    (actCatalog || []).forEach((a) => { catalogMap[a.action_key] = a; });
    const { getActionMetaFromCatalog } = require('../lib/fullCatalog');

    const toInsert = validated.map((v) => {
      const fromDb = catalogMap[v.action_key];
      const fromCatalog = !fromDb ? getActionMetaFromCatalog(v.action_key) : null;
      const meta = fromDb || fromCatalog || { process_key: 'GESTAO', band: 'MEDIUM' };
      return {
        assessment_id: assessmentId,
        action_key: v.action_key,
        process_key: meta.process_key,
        band: meta.band,
        position: v.position,
        owner_name: v.owner_name,
        metric_text: v.metric_text,
        checkpoint_date: v.checkpoint_date,
        status: 'NOT_STARTED',
      };
    });

    const { error: delErr } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .delete()
      .eq('assessment_id', assessmentId);
    if (delErr) return res.status(500).json({ error: 'erro ao preparar plano' });

    const { error: insErr } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .insert(toInsert);
    if (insErr) return res.status(500).json({ error: 'erro ao salvar plano' });

    emitValueEvent('PLAN_CREATED', { assessment_id: assessmentId, company_id: companyId, meta: { action_count: toInsert.length } });

    return res.status(200).json({ ok: true, plan: toInsert, required_count, remaining_count });
  } catch (err) {
    console.error('Erro POST /full/plan:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

router.get('/full/plan', requireAuth, requireFullEntitlement, async (req, res) => {
  const assessmentId = req.query.assessment_id;
  const companyId = req.query.company_id;
  if (!assessmentId) return res.status(400).json({ error: 'assessment_id é obrigatório' });
  if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
  return res.redirect(307, `/full/assessments/${assessmentId}/dashboard?company_id=${companyId}`);
});

// POST /full/actions/:action_key/status — atualiza status (NOT_STARTED/IN_PROGRESS/DONE/DROPPED)
router.post('/full/actions/:action_key/status', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const actionKey = decodeURIComponent(req.params.action_key || '');
    const companyId = req.query.company_id || req.body.company_id;
    const assessmentId = req.query.assessment_id || req.body.assessment_id;
    const { status, dropped_reason } = req.body;

    if (!companyId || !assessmentId) return res.status(400).json({ error: 'company_id e assessment_id são obrigatórios' });
    if (!status || !['DONE', 'DROPPED', 'IN_PROGRESS', 'NOT_STARTED'].includes(status)) {
      return apiError(res, 400, 'INVALID_STATUS', 'Status inválido.');
    }

    if (status === 'DONE') {
      const company = await ensureCompanyAccess(userId, companyId);
      if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada.');
      const assessment = await getAssessment(assessmentId, companyId);
      if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

      const { data: dodRow } = await supabase
        .schema('public')
        .from('full_action_dod_confirmations')
        .select('assessment_id')
        .eq('assessment_id', assessmentId)
        .eq('action_key', actionKey)
        .maybeSingle();
      if (!dodRow) return apiError(res, 400, 'CHECKLIST_INCOMPLETE', 'Falta confirmar o que conta como feito.');

      const { data: evRow } = await supabase
        .schema('public')
        .from('full_action_evidence')
        .select('assessment_id')
        .eq('assessment_id', assessmentId)
        .eq('action_key', actionKey)
        .maybeSingle();
      if (!evRow) return apiError(res, 400, 'EVIDENCE_REQUIRED', 'Para concluir, registre a evidência (antes e depois).');
    }
    if (status === 'DROPPED' && (!dropped_reason || String(dropped_reason).trim().length === 0)) {
      return apiError(res, 400, 'DROP_REASON_REQUIRED', 'Ao descartar uma ação, informe o motivo.');
    }

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada.');
    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    if (assessment.status === 'CLOSED') return cycleClosed(res);

    const update = { status, updated_at: new Date().toISOString() };
    if (status === 'DROPPED') update.dropped_reason = dropped_reason;

    const { data, error } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .update(update)
      .eq('assessment_id', assessmentId)
      .eq('action_key', actionKey)
      .select()
      .maybeSingle();

    if (error) return apiError(res, 500, 'STATUS_UPDATE_ERROR', 'Erro ao atualizar status. Tente novamente.');
    if (!data) return apiError(res, 404, 'ACTION_NOT_FOUND', 'Ação não encontrada no plano.');

    return res.json(data);
  } catch (err) {
    console.error('Erro POST /full/actions/:action_key/status:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// POST /full/actions/:action_key/evidence (write-once) — aceita evidência, antes, depois
router.post('/full/actions/:action_key/evidence', requireAuth, requireFullEntitlement, async (req, res) => {
  const actionKey = decodeURIComponent(req.params.action_key || '');
  const companyId = req.query.company_id || req.body.company_id;
  const assessmentId = req.body.assessment_id || req.query.assessment_id;
  const evidencia = req.body.evidência ?? req.body.evidencia ?? req.body.evidence_text;
  const antes = req.body.antes ?? req.body.before_baseline ?? req.body.before_text;
  const depois = req.body.depois ?? req.body.after_result ?? req.body.after_text;

  if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
  if (!assessmentId) return res.status(400).json({ error: 'assessment_id é obrigatório' });
  if (!actionKey) return res.status(400).json({ error: 'action_key é obrigatório' });
  if (!evidencia || !antes || !depois) {
    return res.status(400).json({ error: 'evidência, antes e depois são obrigatórios' });
  }

  const company = await ensureCompanyAccess(req.user.id, companyId);
  if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada.');

  const assessment = await getAssessment(assessmentId, companyId);
  if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
  if (assessment.status === 'CLOSED') return cycleClosed(res);

  const { data: existing } = await supabase
    .schema('public')
    .from('full_action_evidence')
    .select('*')
    .eq('assessment_id', assessmentId)
    .eq('action_key', actionKey)
    .maybeSingle();

  if (existing) return res.status(409).json({ error: 'evidência já registrada (write-once)' });

  const ganhoDeclarado = `Ganho: ${String(depois).trim()} (antes: ${String(antes).trim()})`;

  const { data: created, error: insErr } = await supabase
    .schema('public')
    .from('full_action_evidence')
    .insert({
      assessment_id: assessmentId,
      action_key: actionKey,
      evidence_text: String(evidencia).trim(),
      before_baseline: String(antes).trim(),
      after_result: String(depois).trim(),
      declared_gain: ganhoDeclarado,
    })
    .select()
    .single();

  if (insErr) return res.status(500).json({ error: 'erro ao registrar evidência' });
  return res.status(201).json({ evidence: created, ganho_declarado: ganhoDeclarado });
});

// ---------------------------------------------------------------------------
// CONSULTOR (accountability) — visão read + notas write
// ---------------------------------------------------------------------------

// GET /full/consultor/assessments/:id?company_id= — pacote completo para consultor
router.get('/full/consultor/assessments/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const companyId = req.query.company_id;

    const assessment = companyId
      ? await getAssessment(assessmentId, companyId)
      : await getAssessmentById(assessmentId);

    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

    const cid = assessment.company_id;
    const access = await ensureConsultantOrOwnerAccess(userId, cid);
    if (!access) return res.status(403).json({ error: 'sem acesso como consultor' });

    const [answersRes, scoresRes, planRes, evRes] = await Promise.all([
      supabase.schema('public').from('full_answers').select('*').eq('assessment_id', assessmentId),
      supabase.schema('public').from('full_process_scores').select('*').eq('assessment_id', assessmentId),
      supabase.schema('public').from('full_selected_actions').select('*').eq('assessment_id', assessmentId).order('position'),
      supabase.schema('public').from('full_action_evidence').select('*').eq('assessment_id', assessmentId)
    ]);

    const answers = answersRes.data || [];
    const scores = scoresRes.data || [];
    const plan = planRes.data || [];
    const evidence = evRes.data || [];

    const actionKeys = plan.map((p) => p.action_key);
    const { data: catalog } = await supabase
      .schema('public')
      .from('full_action_catalog')
      .select('action_key, title, dod_checklist')
      .in('action_key', actionKeys);
    const catalogMap = {};
    (catalog || []).forEach((c) => { catalogMap[c.action_key] = c; });
    const { getActionEntryFromCatalog } = require('../lib/fullCatalog');
    for (const ak of actionKeys) {
      if (!catalogMap[ak]) {
        const fromCatalog = getActionEntryFromCatalog(ak);
        if (fromCatalog) catalogMap[ak] = { action_key: ak, title: fromCatalog.title, dod_checklist: fromCatalog.dod_checklist };
      }
    }
    const evMap = {};
    evidence.forEach((e) => { evMap[e.action_key] = e; });

    const { data: dodRows } = await supabase
      .schema('public')
      .from('full_action_dod_confirmations')
      .select('action_key')
      .eq('assessment_id', assessmentId)
      .in('action_key', actionKeys);
    const dodSet = new Set((dodRows || []).map((r) => r.action_key));

    const causeByActionKey = {};
    try {
      const causeCatalog = loadCauseCatalog();
      const causeById = {};
      (causeCatalog.cause_classes || []).forEach((c) => { causeById[c.id] = c; });
      const { data: gapCauses } = await supabase
        .schema('public')
        .from('full_gap_causes')
        .select('gap_id, cause_primary, evidence_json')
        .eq('assessment_id', assessmentId);
      for (const row of gapCauses || []) {
        const gapDef = (causeCatalog.gaps || []).find((g) => g.gap_id === row.gap_id);
        if (!gapDef || !row.cause_primary) continue;
        const causeLabel = causeById[row.cause_primary]?.label_cliente || row.cause_primary;
        const evidence = Array.isArray(row.evidence_json) ? row.evidence_json : [];
        const why = evidence.map((e) => ({ question_key: e.q_id, answer: e.answer, label: e.texto_cliente }));
        for (const act of gapDef.mechanism_actions || []) {
          if (act.action_key) causeByActionKey[act.action_key] = { cause_label: causeLabel, why };
        }
      }
    } catch (_) { /* ignore */ }

    const dashboard_actions = plan.map((p) => {
      const cat = catalogMap[p.action_key] || {};
      const ev = evMap[p.action_key];
      const causeData = causeByActionKey[p.action_key];
      const dodChecklist = (cat.dod_checklist && Array.isArray(cat.dod_checklist))
        ? cat.dod_checklist
        : (p.action_key.startsWith('fallback-') ? ['Definir escopo', 'Executar conforme contexto', 'Documentar resultado'] : []);
      return {
        position: p.position,
        process_key: p.process_key,
        action_key: p.action_key,
        title: cat.title || p.action_key,
        owner_name: p.owner_name,
        metric_text: p.metric_text,
        checkpoint_date: p.checkpoint_date,
        status: p.status,
        dod_checklist: dodChecklist,
        dod_confirmed: dodSet.has(p.action_key),
        evidence_exists: !!ev,
        before_baseline: ev?.before_baseline ?? null,
        after_result: ev?.after_result ?? null,
        declared_gain: ev?.declared_gain ?? null,
        dropped_reason: p.dropped_reason ?? null,
        cause_label: causeData?.cause_label ?? null,
        why: causeData?.why ?? null
      };
    });

    const loadedResults = assessment.status !== 'DRAFT'
      ? await loadFullResultsPayload(assessmentId)
      : { error: null, payload: { findings: [], scores_by_process: [], trace: [], items: [] } };
    const results = loadedResults.error
      ? { items: [] }
      : { items: loadedResults.payload.items, findings: loadedResults.payload.findings, trace: loadedResults.payload.trace };

    const { data: companyRow } = await supabase
      .schema('public')
      .from('companies')
      .select('name, trade_name')
      .eq('id', cid)
      .maybeSingle();
    const companyName = companyRow?.trade_name || companyRow?.name || null;

    return res.json({
      assessment: { id: assessment.id, company_id: cid, company_name: companyName, segment: assessment.segment, status: assessment.status },
      catalog_segment: assessment.segment,
      answers,
      scores,
      results,
      plan,
      evidence,
      dashboard: {
        progress: `${plan.filter((p) => p.status === 'DONE' || p.status === 'DROPPED').length}/3`,
        actions: dashboard_actions
      }
    });
  } catch (err) {
    console.error('Erro GET /full/consultor/assessments/:id:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// POST /full/consultor/assessments/:id/actions/:action_key/notes
router.post('/full/consultor/assessments/:id/actions/:action_key/notes', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const actionKey = decodeURIComponent(req.params.action_key || '');
    const companyId = req.query.company_id || req.body.company_id;
    const { note_type, note_text } = req.body;

    const assessment = companyId ? await getAssessment(assessmentId, companyId) : await getAssessmentById(assessmentId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

    const access = await ensureConsultantOrOwnerAccess(userId, assessment.company_id);
    if (!access) return res.status(403).json({ error: 'sem acesso como consultor' });

    if (!note_type || !['ORIENTACAO', 'IMPEDIMENTO', 'PROXIMO_PASSO'].includes(note_type)) {
      return res.status(400).json({ error: 'note_type deve ser ORIENTACAO, IMPEDIMENTO ou PROXIMO_PASSO' });
    }
    if (!note_text || typeof note_text !== 'string' || note_text.trim().length === 0) {
      return res.status(400).json({ error: 'note_text é obrigatório' });
    }

    const { data: planRow } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .select('action_key')
      .eq('assessment_id', assessmentId)
      .eq('action_key', actionKey)
      .maybeSingle();
    if (!planRow) return apiError(res, 404, 'ACTION_NOT_FOUND', 'Ação não encontrada no plano.');

    const { data: created, error: insErr } = await supabase
      .schema('public')
      .from('full_consultant_notes')
      .insert({
        assessment_id: assessmentId,
        action_key: actionKey,
        consultant_user_id: userId,
        note_type,
        note_text: note_text.trim()
      })
      .select()
      .single();

    if (insErr) {
      console.error('Erro ao inserir nota:', insErr.message);
      return res.status(500).json({ error: 'erro ao salvar nota' });
    }

    return res.status(201).json(created);
  } catch (err) {
    console.error('Erro POST consultor notes:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// GET /full/assessments/:id/actions/:action_key/notes — lista notas (cliente ou consultor)
router.get('/full/assessments/:id/actions/:action_key/notes', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const actionKey = decodeURIComponent(req.params.action_key || '');
    const companyId = req.query.company_id;

    const assessment = companyId ? await getAssessment(assessmentId, companyId) : await getAssessmentById(assessmentId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

    const cid = assessment.company_id;
    const access = await ensureConsultantOrOwnerAccess(userId, cid);
    if (!access) return apiError(res, 403, 'ACCESS_DENIED', 'Sem acesso a este recurso.');

    const { data: notes, error } = await supabase
      .schema('public')
      .from('full_consultant_notes')
      .select('id, note_type, note_text, created_at')
      .eq('assessment_id', assessmentId)
      .eq('action_key', actionKey)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar notas:', error.message);
      return res.status(500).json({ error: 'erro ao buscar notas' });
    }

    return res.json({ notes: notes || [] });
  } catch (err) {
    console.error('Erro GET notes:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

module.exports = router;
