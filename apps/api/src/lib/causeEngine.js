/**
 * Motor de Causa determinístico: Gap → Perguntas → Causa primária + evidências.
 * Fonte: catalogs/full/cause_engine.v1.json
 */
const path = require('path');
const fs = require('fs');
const { supabase } = require('./supabase');

const CAUSE_CATALOG_PATH = path.resolve(__dirname, '../../../../catalogs/full/cause_engine.v1.json');

/**
 * Carrega catálogo do Motor de Causa.
 * @returns {Object} { version, cause_classes, gaps }
 */
function loadCauseCatalog() {
  if (!fs.existsSync(CAUSE_CATALOG_PATH)) {
    throw new Error(`Catálogo não encontrado: ${CAUSE_CATALOG_PATH}`);
  }
  const raw = fs.readFileSync(CAUSE_CATALOG_PATH, 'utf8');
  return JSON.parse(raw);
}

/**
 * Calcula score e causa primária/secundária para um gap.
 * @param {Object} gapDef - definição do gap (cause_questions, rules)
 * @param {Object} answersByQid - { q_id: answer } (valores LIKERT_5)
 * @returns {{ scores, primary, secondary, evidence }}
 */
function scoreCause(gapDef, answersByQid) {
  const scores = {};
  const weights = (gapDef.rules?.weights || []);
  const tieBreaker = gapDef.rules?.tie_breaker || [];
  const questions = gapDef.cause_questions || [];

  for (const w of weights) {
    const answer = answersByQid[w.q_id];
    if (answer == null) continue;
    const pts = (w.map && w.map[answer]) ?? 0;
    scores[w.cause_id] = (scores[w.cause_id] || 0) + pts;
  }

  const sorted = [...Object.entries(scores)]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  let primary = null;
  let secondary = null;
  if (sorted.length > 0) {
    const topScore = sorted[0][1];
    const candidates = sorted.filter(([, v]) => v === topScore).map(([k]) => k);
    primary = tieBreaker.length > 0
      ? tieBreaker.find((id) => candidates.includes(id)) || candidates[0]
      : candidates[0];
    if (sorted.length > 1 && topScore - sorted[1][1] <= 1) {
      secondary = sorted[1][0];
    }
  }

  const qById = {};
  questions.forEach((q) => { qById[q.q_id] = q; });

  const evidence = questions.map((q) => ({
    q_id: q.q_id,
    answer: answersByQid[q.q_id] || null,
    texto_cliente: q.texto_cliente || '',
  }));

  return { scores, primary, secondary, evidence };
}

/**
 * Persiste resultado do Motor de Causa em full_gap_causes.
 */
async function persistGapCause({ companyId, assessmentId, gapId, result, version }) {
  const row = {
    company_id: companyId,
    assessment_id: assessmentId,
    gap_id: gapId,
    cause_primary: result.primary || 'UNKNOWN',
    cause_secondary: result.secondary,
    evidence_json: result.evidence || [],
    score_json: result.scores || {},
    version: version || '1.0.0',
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .schema('public')
    .from('full_gap_causes')
    .upsert(row, {
      onConflict: 'assessment_id,gap_id',
      ignoreDuplicates: false,
    });

  if (error) throw error;
  return row;
}

/**
 * Busca respostas de causa para um gap.
 * @returns {Object} { q_id: answer }
 */
async function getCauseAnswersByGap(assessmentId, gapId) {
  const { data, error } = await supabase
    .schema('public')
    .from('full_cause_answers')
    .select('q_id, answer')
    .eq('assessment_id', assessmentId)
    .eq('gap_id', gapId);

  if (error) throw error;
  const out = {};
  (data || []).forEach((r) => { out[r.q_id] = r.answer; });
  return out;
}

/**
 * Busca causa já avaliada para um gap (se existir).
 */
async function getGapCause(assessmentId, gapId) {
  const { data, error } = await supabase
    .schema('public')
    .from('full_gap_causes')
    .select('gap_id, cause_primary, cause_secondary, evidence_json, score_json')
    .eq('assessment_id', assessmentId)
    .eq('gap_id', gapId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

module.exports = {
  loadCauseCatalog,
  scoreCause,
  persistGapCause,
  getCauseAnswersByGap,
  getGapCause,
};
