/**
 * Audit: registrar acesso consultor (company_id, endpoint, timestamp).
 * Read-only: CONSULTOR não escreve em dados de execução do USER.
 */
function logConsultorAccess(req, companyId = null) {
  const endpoint = req.path || req.originalUrl?.split('?')[0] || 'unknown';
  const role = req.user?.role || 'USER';
  if (role !== 'CONSULTOR' && role !== 'ADMIN') return;
  const ts = new Date().toISOString();
  const company = companyId || req.query?.company_id || req.params?.company_id || '-';
  console.log(`[CONSULTOR_ACCESS] role=${role} endpoint=${endpoint} company_id=${company} ts=${ts}`);
}

module.exports = { logConsultorAccess };
