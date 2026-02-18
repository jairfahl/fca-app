/**
 * Eventos de valor FULL — métricas "valor inevitável"
 * Eventos: CAUSE_CLASSIFIED, PLAN_CREATED, GAIN_DECLARED
 */
const { supabase } = require('./supabase');

const ALLOWED_EVENTS = ['CAUSE_CLASSIFIED', 'PLAN_CREATED', 'GAIN_DECLARED'];

/**
 * Registra evento de valor (fire-and-forget, não bloqueia fluxo).
 * @param {string} event - CAUSE_CLASSIFIED | PLAN_CREATED | GAIN_DECLARED
 * @param {Object} opts - { assessment_id, company_id, meta }
 */
async function emitValueEvent(event, opts = {}) {
  if (!ALLOWED_EVENTS.includes(event)) return;
  try {
    await supabase
      .schema('public')
      .from('full_value_events')
      .insert({
        event,
        assessment_id: opts.assessment_id || null,
        company_id: opts.company_id || null,
        meta: opts.meta || {},
      });
  } catch (err) {
    console.warn('[fullValueEvents] emit failed:', event, err.message);
  }
}

module.exports = { emitValueEvent };
