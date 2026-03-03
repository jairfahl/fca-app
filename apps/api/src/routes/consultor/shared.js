/**
 * Dependências e utilitários partilhados por todos os sub-módulos do consultor.
 */
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../../middleware/requireAuth');
const { requireConsultorOrAdmin, requireCompanyAccess } = require('../../middleware/guards');
const { supabase } = require('../../lib/supabase');
const { logConsultorAccess } = require('../../lib/consultorAudit');
const { auditEvent } = require('../../lib/audit');

/** Log de erro com stack trace e contexto (QA — causa raiz). Sem token. */
function logConsultorError(route, req, err, extra = {}) {
  const ctx = {
    route,
    user_id: req?.user?.id ?? null,
    role: req?.user?.role ?? null,
    error_message: err?.message ?? String(err),
    error_stack: err?.stack ?? null,
    ...extra,
  };
  if (err?.code) ctx.supabase_code = err.code;
  if (err?.details) ctx.supabase_details = err.details;
  if (err?.hint) ctx.supabase_hint = err.hint;
  const payload = JSON.stringify(ctx, null, 2);
  console.error('[CONSULTOR_ERROR]', payload);
  if (err?.stack) console.error(err.stack);
  try {
    const logPath = path.resolve(process.cwd(), 'logs', 'consultor-error.json');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${new Date().toISOString()}\n${payload}\n${err?.stack || ''}\n---\n`);
  } catch (_) { /* ignore file write */ }
}

module.exports = {
  logConsultorError,
  supabase,
  requireAuth,
  requireConsultorOrAdmin,
  requireCompanyAccess,
  logConsultorAccess,
  auditEvent,
};
