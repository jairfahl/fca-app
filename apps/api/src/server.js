// apps/api/src/server.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const path = require('path');
const dotenv = require('dotenv');
// CURSOR_EDIT_TEST
// Carrega SEMPRE o .env da raiz do monorepo: ~/Downloads/fca-mtr/.env
// __dirname aqui é: ~/Downloads/fca-mtr/apps/api/src
const ENV_PATH = path.resolve(__dirname, '../../../.env');
dotenv.config({ path: ENV_PATH });

const { parse } = require('pg-connection-string');
const { initPool, createPgPool } = require('./db');
const app = require('./app');

console.log('API START');

const PORT = Number(process.env.PORT) || 3001;

// Funções de instrumentação para DB CHECK
function redactDbUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    // fallback simples
    return url.replace(/:\/\/([^:]+):([^@]+)@/g, '://$1:***@');
  }
}

function dumpDbEnv() {
  const rawUrl = process.env.DATABASE_URL || '';
  const parsed = parse(rawUrl);

  const pgEnv = {
    PGHOST: process.env.PGHOST || null,
    PGPORT: process.env.PGPORT || null,
    PGUSER: process.env.PGUSER || null,
    PGDATABASE: process.env.PGDATABASE || null,
    PGPASSWORD_SET: !!process.env.PGPASSWORD
  };

  console.log('[DBCHECK] ENV snapshot:', {
    DATABASE_URL_SET: !!process.env.DATABASE_URL,
    DATABASE_URL_REDACTED: redactDbUrl(process.env.DATABASE_URL),
    PG_ENV: pgEnv
  });

  console.log('[DBCHECK] DATABASE_URL parsed:', {
    host: parsed.host || null,
    port: parsed.port || null,
    user: parsed.user || null,
    database: parsed.database || null,
    passwordSet: !!parsed.password,
    passwordLen: parsed.password ? String(parsed.password).length : 0
  });

  // Fingerprint para evidência operacional (evitar dois bancos / dois .env)
  const dbFingerprint = [parsed.host || '', parsed.database || ''].filter(Boolean).join('@') || 'unknown';
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseProjectRef = supabaseUrl ? (supabaseUrl.match(/https:\/\/([a-z0-9-]+)\.supabase\.co/i) || [])[1] || supabaseUrl.slice(0, 50) : 'not_set';
  console.log('[DBCHECK] FINGERPRINT db=' + dbFingerprint + ' supabase_ref=' + (supabaseProjectRef || 'n/a'));

  // Heurística: se PGUSER/PGHOST existirem, avisar possível override humano/config
  if (pgEnv.PGHOST || pgEnv.PGUSER || pgEnv.PGDATABASE || pgEnv.PGPORT) {
    console.log('[DBCHECK] WARNING: PG* vars are present; they may override DATABASE_URL depending on connection code.');
  }
}


// Fail-fast: variáveis críticas em DEV
function checkEnvConfig() {
  const isDev = process.env.NODE_ENV !== 'production';
  if (!isDev) return;

  const missing = [];
  if (!process.env.SUPABASE_URL?.trim()) missing.push('SUPABASE_URL');
  if (!process.env.SUPABASE_ANON_KEY?.trim()) missing.push('SUPABASE_ANON_KEY');
  if (missing.length > 0) {
    console.error('[ENV] FAIL: Variáveis ausentes em DEV:', missing.join(', '));
    console.error('[ENV] Configure o .env no root do monorepo.');
    process.exit(1);
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    console.warn('[ENV] WARNING: SUPABASE_SERVICE_ROLE_KEY ausente. Scripts auth:bootstrap e auth:diagnose dependem dela.');
  }
}

// Inicializar conexão com banco e iniciar servidor
async function startServer() {
  checkEnvConfig();

  // Log determinístico de carregamento de env (sem expor segredo)
  const hasDbUrl = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());
  if (!hasDbUrl) {
    console.log('DB CHECK FAIL');
    console.warn(`DATABASE_URL ausente (arquivo lido: ${ENV_PATH})`);
  } else {
    try {
      // Instrumentação: dump config efetiva antes de conectar
      dumpDbEnv();

      // Usar helper createPgPool() que já valida guardrail e aplica SSL correto
      // Os logs de SSL_MODE e conexão já são feitos dentro de createPgPool()
      const dbCheckPool = createPgPool();

      // Provar o que o pg está usando internamente (sem senha)
      console.log('[DBCHECK] pool.options (redacted):', {
        host: dbCheckPool.options.host,
        port: dbCheckPool.options.port,
        database: dbCheckPool.options.database,
        user: dbCheckPool.options.user,
        ssl: !!dbCheckPool.options.ssl
      });

      const result = await dbCheckPool.query('SELECT 1');
      await dbCheckPool.end();
      console.log('DB CHECK OK');

      // Inicializar pool para uso nas rotas
      initPool();
    } catch (err) {
      console.log('DB CHECK FAIL');
      console.error('[DBCHECK] FAIL:', {
        message: err.message,
        code: err.code || null,
        detail: err.detail || null
      });
      // Se for erro de guardrail (production + relaxed), abortar boot
      if (err.message && err.message.includes('DB_SSL_RELAXED')) {
        process.exit(1);
      }
    }
  }

  // Start server (tratar erro de porta ocupada de forma explícita)
  const server = app.listen(PORT, () => {
    console.log('READY');
    console.log(`Server listening on http://localhost:${PORT}`);
  });

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`FATAL: Porta ${PORT} já está em uso (EADDRINUSE). Encerre o processo que está usando a porta e tente novamente.`);
    } else {
      console.error('FATAL: Erro ao iniciar servidor:', err);
    }
    process.exit(1);
  });
}

startServer();
