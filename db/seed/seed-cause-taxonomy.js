/**
 * Seed Root Cause Engine: taxonomia, mecanismos, opções LIKERT_5
 * Idempotente: ON CONFLICT DO UPDATE
 */
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const { createPgPool } = require('../lib/dbSsl');

if (!process.env.DATABASE_URL) {
  console.error('ERRO: DATABASE_URL não configurada no .env');
  process.exit(1);
}

async function run() {
  const pool = createPgPool();
  const sqlPath = path.join(__dirname, '009_seed_full_cause_taxonomy.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await pool.query(sql);
  await pool.end();
  console.log('SEED OK: full_cause_taxonomy, full_cause_mechanisms, full_cause_answer_options');
}

run().catch((err) => {
  console.error('ERRO ao executar seed cause taxonomy:', err.message);
  process.exit(1);
});
