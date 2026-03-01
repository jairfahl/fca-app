/**
 * Motor de FIT determinístico: deriva sugestões a partir do catálogo v1 e respostas.
 * Regras:
 * - signals_true: perguntas com valor baixo (0,1,2) = "falharam"
 * - match = count(signals_item ∩ signals_true)
 * - Só aceita se match >= 2
 * - Se não houver match: retorna vazio para aquele processo (sem fallback)
 *
 * PROIBIDO retornar placeholder ou "Ação Padrão".
 */
const { loadFullCatalogV1 } = require('./fullCatalog');

/** Valor máximo (inclusive) para considerar pergunta como "falhou" (sinal negativo) */
const SIGNAL_FAIL_THRESHOLD = 2;

/**
 * Constrói signals_true por processo: ids de perguntas onde answer_value <= SIGNAL_FAIL_THRESHOLD.
 * Formato: Set de "PROCESS_Q01", "COMERCIAL_Q03", etc.
 */
function buildSignalsTrueByProcess(answers) {
  const byProcess = {};
  (answers || []).forEach((a) => {
    const val = Number(a.answer_value);
    if (val <= SIGNAL_FAIL_THRESHOLD) {
      const sigId = `${a.process_key}_${a.question_key}`;
      if (!byProcess[a.process_key]) byProcess[a.process_key] = new Set();
      byProcess[a.process_key].add(sigId);
    }
  });
  return byProcess;
}

/**
 * Calcula band_backend a partir de scores (usa regra existente).
 * @param {Object} scoresByProcess - { process_key: { band } }
 * @returns band para o processo
 */
function getBandForProcess(processKey, scoresByProcess) {
  const s = scoresByProcess[processKey];
  return s?.band || null;
}

/**
 * @param {Array<{process_key, question_key, answer_value}>} answers
 * @param {Object} scoresByProcess - { process_key: { band, score_numeric } }
 * @param {Set<string>} excludeActionKeys - actions já usadas (selected ou history)
 * @param {Object} [opts] - { includeMatchDebug: boolean }
 * @returns {{ suggestions: Array, content_gaps: Array }}
 */
function deriveSuggestionsFromAnswers(answers, scoresByProcess, excludeActionKeys, opts = {}) {
  const includeMatchDebug = opts.includeMatchDebug === true;

  let catalog;
  try {
    catalog = loadFullCatalogV1();
  } catch (e) {
    console.error('[fullActionFit] Erro ao carregar catálogo v1:', e.message);
    return { suggestions: [], content_gaps: [{ reason: 'catalog_load_error', error: e.message }] };
  }

  const signalsTrueByProcess = buildSignalsTrueByProcess(answers);
  const suggestions = [];
  const contentGaps = [];

  for (const proc of catalog.processes) {
    const processKey = proc.process_key;
    const band = getBandForProcess(processKey, scoresByProcess);
    if (!band) {
      contentGaps.push({ process_key: processKey, band: null, reason: 'no_score' });
      continue;
    }

    const signalsTrue = signalsTrueByProcess[processKey] || new Set();
    const itemsForBand = (proc.items || []).filter((it) => it.band_backend === band);
    if (itemsForBand.length === 0) {
      contentGaps.push({ process_key: processKey, band, reason: 'no_catalog_item_for_band' });
      continue;
    }

    let bestItem = null;
    let bestMatch = 0;

    for (const item of itemsForBand) {
      const itemSignals = new Set(item.signals || []);
      const matchCount = [...itemSignals].filter((sig) => signalsTrue.has(sig)).length;
      if (matchCount >= 2 && matchCount > bestMatch) {
        bestMatch = matchCount;
        bestItem = item;
      }
    }

    if (!bestItem) {
      contentGaps.push({
        process_key: processKey,
        band,
        reason: 'no_match_ge_2',
        signals_true_count: signalsTrue.size,
      });
      continue;
    }

    const actionKey = bestItem.action?.action_key;
    if (!actionKey || excludeActionKeys.has(actionKey)) continue;

    const rec = bestItem.recommendation || {};
    const act = bestItem.action || {};

    const suggestion = {
      process_key: processKey,
      band: band,
      band_backend: band,
      nivel_ui: bestItem.nivel_ui,
      action_key: actionKey,
      title: act.title || rec.title,
      benefit_text: act.metric_suggested ? `Métrica sugerida: ${act.metric_suggested}` : undefined,
      metric_hint: act.metric_suggested,
      metric_suggestions: act.metric_suggested ? [act.metric_suggested] : [],
      owner_suggestions: act.owner_suggested ? [act.owner_suggested] : [],
      dod_checklist: Array.isArray(act.done_when) ? act.done_when : [],
      steps_3: Array.isArray(act.steps_3) ? act.steps_3 : [],
      recommendation: {
        title: rec.title,
        what_is_happening: rec.what_is_happening,
        cost_of_not_acting: rec.cost_of_not_acting,
        change_in_30_days: rec.change_in_30_days,
      },
      action: {
        action_key: act.action_key,
        title: act.title,
        steps_3: act.steps_3,
        owner_suggested: act.owner_suggested,
        metric_suggested: act.metric_suggested,
        done_when: act.done_when,
      },
      why: [...(bestItem.signals || [])]
        .filter((s) => signalsTrue.has(s))
        .map((sig) => {
          const [pk, qk] = sig.split('_');
          const ans = (answers || []).find((a) => a.process_key === pk && a.question_key === qk);
          return { question_key: qk, answer: ans?.answer_value, label: sig };
        }),
      evidence_keys: [...(bestItem.signals || [])].filter((s) => signalsTrue.has(s)),
      is_gap_content: false,
    };

    if (includeMatchDebug) {
      suggestion.match_debug = {
        matched_item_id: bestItem.id,
        match_score: bestMatch,
        signals_true: [...signalsTrue],
      };
    }

    suggestions.push(suggestion);
  }

  return { suggestions, content_gaps: contentGaps };
}

// Compatibilidade: FIT_RULES removido (catálogo v1 é fonte)
const FIT_RULES = [];

module.exports = { deriveSuggestionsFromAnswers, buildSignalsTrueByProcess, FIT_RULES };
