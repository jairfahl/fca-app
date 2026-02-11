const { Pool } = require('pg');
const { parse } = require('pg-connection-string');

let pool = null;

/**
 * Verifica se DB_SSL_RELAXED está habilitado
 * Considera true se valor ∈ {"1","true","TRUE","yes","YES"}
 * Default = false
 */
function isDbSslRelaxed() {
  const value = process.env.DB_SSL_RELAXED || '';
  const normalized = value.trim().toLowerCase();
  return ['1', 'true', 'yes'].includes(normalized);
}

/**
 * Verifica se ambiente é development
 */
function isDevelopment() {
  return process.env.NODE_ENV === 'development';
}

/**
 * Retorna o modo SSL atual: "RELAXED" ou "STRICT"
 */
function getDbSslMode() {
  return isDevelopment() || isDbSslRelaxed() ? 'RELAXED' : 'STRICT';
}

/**
 * Valida guardrail: aborta se production + DB_SSL_RELAXED
 */
function validateSslGuardrail() {
  const isProduction = process.env.NODE_ENV === 'production';
  const isRelaxed = isDbSslRelaxed();

  if (isProduction && isRelaxed) {
    throw new Error(
      '[DB] FATAL: DB_SSL_RELAXED=true não é permitido em produção (NODE_ENV=production). ' +
      'Use SSL strict em produção para segurança.'
    );
  }
}

/**
 * Cria configuração do Pool PostgreSQL a partir de DATABASE_URL
 * Aplica SSL baseado em DB_SSL_RELAXED
 * @returns {Object} Configuração do Pool
 */
function createPgPool() {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    throw new Error('DATABASE_URL não configurada');
  }

  // Validar guardrail antes de criar pool
  validateSslGuardrail();

  // Parse DATABASE_URL usando pg-connection-string
  const parsed = parse(rawUrl);

  // Determinar configuração SSL
  const isRelaxed = isDevelopment() || isDbSslRelaxed();
  const sslConfig = isRelaxed
    ? { rejectUnauthorized: false }  // RELAXED: permite MITM local
    : { rejectUnauthorized: true };  // STRICT: valida certificado

  // Montar objeto config do Pool
  const config = {
    host: parsed.host || 'localhost',
    port: parsed.port ? Number(parsed.port) : 5432,
    user: parsed.user || 'postgres',
    database: parsed.database || 'postgres',
    password: parsed.password || '',
    ssl: sslConfig
  };

  // Log SSL mode e conexão (sem senha)
  const sslMode = getDbSslMode();
  console.log(`[DB] SSL_MODE=${sslMode}`);
  console.log(`[DB] DATABASE_URL_HOST=${config.host} USER=${config.user} DB=${config.database}`);

  return new Pool(config);
}

/**
 * Inicializa o pool de conexões PostgreSQL
 */
function initPool() {
  pool = createPgPool();
  return pool;
}

/**
 * Testa a conexão com o banco de dados
 * @returns {Promise<{ok: boolean, now: string|null, error: string|null}>}
 */
async function checkConnection() {
  if (!pool) {
    initPool();
  }

  try {
    const result = await pool.query('SELECT NOW() as now');
    const now = result.rows[0].now.toISOString();
    return { ok: true, now, error: null };
  } catch (error) {
    return { ok: false, now: null, error: error.message };
  }
}

/**
 * Obtém o pool de conexões (inicializa se necessário)
 */
function getPool() {
  if (!pool) {
    initPool();
  }
  return pool;
}

module.exports = {
  initPool,
  checkConnection,
  getPool,
  createPgPool,
  getDbSslMode
};
