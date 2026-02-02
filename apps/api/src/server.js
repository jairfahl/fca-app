// apps/api/src/server.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const path = require('path');
const dotenv = require('dotenv');

// Carrega SEMPRE o .env da raiz do monorepo: ~/Downloads/fca-mtr/.env
// __dirname aqui é: ~/Downloads/fca-mtr/apps/api/src
const ENV_PATH = path.resolve(__dirname, '../../../.env');
dotenv.config({ path: ENV_PATH });

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { parse } = require('pg-connection-string');
const { initPool } = require('./db');
const pingRoutes = require('./routes/ping');
const companiesRoutes = require('./routes/companies');
const assessmentsRoutes = require('./routes/assessments');
const f3Routes = require('./routes/f3');
const f4Routes = require('./routes/f4');
const f4bRoutes = require('./routes/f4b');
const gateCRoutes = require('./routes/gateC');
const leadsRoutes = require('./routes/leads');

console.log('API START');

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// Configurar CORS
const allowedOrigins = (process.env.FRONTEND_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map(origin => origin.trim())
  .filter(origin => origin.length > 0);

const corsOptions = {
  origin: function (origin, callback) {
    // Permitir requests sem origin (curl, postman, etc)
    if (!origin) {
      return callback(null, true);
    }
    // Verificar se origin está na whitelist
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
};

// Habilitar preflight
app.options('*', cors(corsOptions));

// Aplicar CORS antes das rotas
app.use(cors(corsOptions));
app.use(express.json());

// Rotas
app.use('/', pingRoutes);
app.use('/companies', companiesRoutes);
app.use('/assessments', assessmentsRoutes);
app.use('/', f3Routes);
app.use('/', f4Routes);
app.use('/', f4bRoutes);
app.use('/', gateCRoutes);
app.use('/', leadsRoutes);
console.log('ROUTES OK: f4 mounted');
console.log('ROUTES OK: f4b mounted');
console.log('ROUTES OK: gateC mounted');

// Health check legacy (mantido para compatibilidade)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'API is running' });
});

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

  // Heurística: se PGUSER/PGHOST existirem, avisar possível override humano/config
  if (pgEnv.PGHOST || pgEnv.PGUSER || pgEnv.PGDATABASE || pgEnv.PGPORT) {
    console.log('[DBCHECK] WARNING: PG* vars are present; they may override DATABASE_URL depending on connection code.');
  }
}

function buildPgConfigFromDatabaseUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('[DBCHECK] DATABASE_URL missing');

  const u = new URL(raw);
  // pathname vem como "/postgres" ou "/database", remover barra inicial
  const database = (u.pathname || '/postgres').replace(/^\//, '') || 'postgres';
  
  const cfg = {
    host: u.hostname,
    port: u.port ? Number(u.port) : 5432,
    database: database,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    ssl: { rejectUnauthorized: false }
  };

  // Log SEM senha
  console.log('[DBCHECK] Pool explicit cfg (redacted):', {
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.user,
    passLen: cfg.password ? String(cfg.password).length : 0
  });

  return cfg;
}

// Inicializar conexão com banco e iniciar servidor
async function startServer() {
  // Log determinístico de carregamento de env (sem expor segredo)
  const hasDbUrl = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());
  if (!hasDbUrl) {
    console.log('DB CHECK FAIL');
    console.warn(`DATABASE_URL ausente (arquivo lido: ${ENV_PATH})`);
  } else {
    try {
      // Instrumentação: dump config efetiva antes de conectar
      dumpDbEnv();

      // Construir config explícita a partir de DATABASE_URL
      const poolCfg = buildPgConfigFromDatabaseUrl();
      const dbCheckPool = new Pool(poolCfg);

      // Provar o que o pg está usando internamente (sem senha)
      console.log('[DBCHECK] pool.options (redacted):', {
        host: dbCheckPool.options.host,
        port: dbCheckPool.options.port,
        database: dbCheckPool.options.database,
        user: dbCheckPool.options.user,
        ssl: !!dbCheckPool.options.ssl
      });

      const result = await dbCheckPool.query('SELECT NOW() as now');
      const now = result.rows[0].now.toISOString();
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
