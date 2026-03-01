/**
 * Auditoria: insere em audit_events (write-only).
 * Backend usa service_role, RLS não aplica.
 */
const { supabase } = require('./supabase');

async function auditEvent({
  actor_user_id = null,
  actor_role = null,
  action,
  target_type = 'unknown',
  target_id = null,
  company_id = null,
  payload = {},
}) {
  try {
    const { error } = await supabase.from('audit_events').insert({
      actor_user_id,
      actor_role,
      action,
      target_type,
      target_id: target_id ? String(target_id) : null,
      company_id,
      payload: typeof payload === 'object' ? payload : {},
    });
    if (error) {
      console.warn('[audit] insert failed:', error.message);
    }
  } catch (err) {
    console.warn('[audit] unexpected:', err?.message);
  }
}

module.exports = { auditEvent };
