/**
 * Seed Root Cause Engine MVP: 3 gaps com question sets, regras e ações
 * Depende de: seed-cause-taxonomy (009), seed-full-catalog (processos)
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
  const sqlPath = path.join(__dirname, '010_seed_full_cause_mvp.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await pool.query(sql);
  await pool.end();
  console.log('SEED OK: full_cause_mvp (3 gaps, question_sets, rules, mechanism_actions)');
}

run().catch((err) => {
  console.error('ERRO ao executar seed cause MVP:', err.message);
  process.exit(1);
});
