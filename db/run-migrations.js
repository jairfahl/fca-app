const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { createPgPool } = require('./lib/dbSsl');

// Load env from nearest .env we can find (prefer repo root)
const envCandidates = [
  // current working dir (when running from repo root)
  path.resolve(process.cwd(), '.env'),
  // when running from apps/api
  path.resolve(process.cwd(), '../.env'),
  path.resolve(process.cwd(), '../../.env'),
  // relative to this file
  path.resolve(__dirname, '../../../.env'),
  path.resolve(__dirname, '../../../../.env'),
  path.resolve(__dirname, '../../../../../.env')
];

for (const p of envCandidates) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
    break;
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL deve estar configurada no .env');
}

const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');

async function ensureSchemaMigrationsTable(pool) {
  await pool.query(`
    create table if not exists public.schema_migrations (
      filename text primary key,
      applied_at timestamptz default now()
    );
  `);
}

async function getAppliedMigrations(pool) {
  const result = await pool.query('select filename from public.schema_migrations');
  return new Set(result.rows.map((row) => row.filename));
}

async function applyMigration(pool, filename, sql) {
  await pool.query('begin');
  try {
    await pool.query(sql);
    await pool.query(
      'insert into public.schema_migrations (filename) values ($1)',
      [filename]
    );
    await pool.query('commit');
  } catch (error) {
    await pool.query('rollback');
    throw error;
  }
}

async function runMigrations() {
  console.log('Iniciando migrações...');
  const pool = createPgPool();
  try {
    await ensureSchemaMigrationsTable(pool);
    const applied = await getAppliedMigrations(pool);
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    const pending = files.filter((file) => !applied.has(file));
    if (pending.length === 0) {
      console.log('Nenhuma migração pendente.');
      console.log('MIGRATIONS OK');
      return;
    }

    console.log(`${pending.length} migração(ões) pendente(s)`);
    for (const filename of pending) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8');
      await applyMigration(pool, filename, sql);
      console.log(`MIGRATION APPLIED: ${filename}`);
    }
    console.log('MIGRATIONS OK');
  } finally {
    await pool.end();
  }
}

runMigrations().catch((error) => {
  console.error('Erro ao executar migrações:', error.message);
  process.exit(1);
});
