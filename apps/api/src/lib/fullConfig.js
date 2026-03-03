/**
 * Configuração centralizada do módulo FULL.
 * Remove hardcodes espalhados em canAccessFull.js, requireFullEntitlement.js e similares.
 *
 * Variáveis de ambiente:
 *   FULL_TEST_MODE=true        → qualquer usuário acessa FULL (QA)
 *   FULL_ADMIN_WHITELIST       → emails separados por vírgula que sempre têm FULL
 *   FULL_BYPASS_TEST_EMAIL     → email de bypass para testes (padrão: fca@fca.com)
 *   FULL_ADMIN_EMAIL           → email do admin com acesso total (padrão: admin@fca.com)
 */

const TEST_MODE = process.env.FULL_TEST_MODE === 'true' || process.env.FULL_TEST_MODE === '1';

const BYPASS_TEST_EMAIL = (
  process.env.FULL_BYPASS_TEST_EMAIL || 'fca@fca.com'
).trim().toLowerCase();

const ADMIN_EMAIL = (
  process.env.FULL_ADMIN_EMAIL || 'admin@fca.com'
).trim().toLowerCase();

const ADMIN_WHITELIST = (process.env.FULL_ADMIN_WHITELIST || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter((e) => e.length > 0);

module.exports = {
  TEST_MODE,
  BYPASS_TEST_EMAIL,
  ADMIN_EMAIL,
  ADMIN_WHITELIST,
};
