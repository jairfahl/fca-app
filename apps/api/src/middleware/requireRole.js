/**
 * Re-exporta guards de role para compatibilidade.
 * Fonte: guards.js
 */
const {
  requireAnyRole,
  requireRole,
  requireConsultorOrAdmin,
  blockConsultorOnMutation,
} = require('./guards');

module.exports = {
  requireAnyRole,
  requireRole,
  requireConsultorOrAdmin,
  blockConsultorOnMutation,
};
