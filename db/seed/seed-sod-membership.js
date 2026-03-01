/**
 * Seed SoD RBAC: membership de teste (fca@fca.com nas empresas que possui)
 * Depende de: migrations (032), create-test-users.js
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
  const sqlPath = path.join(__dirname, '011_seed_sod_membership.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const result = await pool.query(sql);
  await pool.end();
  const count = result.rowCount ?? 0;
  console.log(`SEED OK: sod_membership (${count} linha(s) em company_members)`);
}

run().catch((err) => {
  console.error('ERRO ao executar seed sod membership:', err.message);
  process.exit(1);
});
