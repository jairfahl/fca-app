/**
 * Seed consultor: empresa de teste para fca@fca.com
 * Depende de: migrations, auth:bootstrap (ou create-test-users.js)
 * Garante que GET /consultor/users retorne ao menos fca@fca.com
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
  const sqlPath = path.join(__dirname, '012_seed_consultor_test_company.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const result = await pool.query(sql);
  await pool.end();
  const count = result.rowCount ?? 0;
  console.log(`SEED OK: consultor_test_company (${count} empresa(s) criada(s) para fca@fca.com)`);
}

run().catch((err) => {
  console.error('ERRO ao executar seed consultor test company:', err.message);
  process.exit(1);
});
