const { Pool } = require('pg');

let pool = null;

/**
 * Inicializa o pool de conexões PostgreSQL
 */
function initPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL não configurada');
  }

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

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
  getPool
};
