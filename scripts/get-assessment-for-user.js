#!/usr/bin/env node
/**
 * Encontra um assessment COMPLETED (com scores) pertencente ao usuário de teste.
 * Uso: node scripts/get-assessment-for-user.js
 * Output: assessment_id (UUID) ou exit 1
 */
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

const { createPgPool } = require('../db/lib/dbSsl');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL não configurada');
  process.exit(1);
}

// Decodificar JWT para obter user id (sem verificar assinatura, só para testes)
function getUserIdFromToken(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return payload.sub;
  } catch {
    return null;
  }
}

async function main() {
  const { execSync } = require('child_process');
  let token;
  try {
    token = execSync('node tmp_get_token.js', { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' }).trim();
  } catch {
    console.error('Erro ao obter token (TEST_EMAIL/TEST_PASSWORD?)');
    process.exit(1);
  }

  const userId = getUserIdFromToken(token);
  if (!userId) {
    console.error('Token inválido');
    process.exit(1);
  }

  const pool = createPgPool();
  try {
    const r = await pool.query(`
      SELECT a.id
      FROM assessments a
      JOIN companies c ON c.id = a.company_id AND c.owner_user_id = $1
      JOIN scores s ON s.assessment_id = a.id
      WHERE a.type = 'LIGHT'
      ORDER BY a.created_at DESC
      LIMIT 1
    `, [userId]);

    if (r.rows.length === 0) {
      console.error('Nenhum assessment COMPLETED encontrado para o usuário. Faça o fluxo: onboarding -> diagnostico -> submit.');
      process.exit(1);
    }
    console.log(r.rows[0].id);
  } finally {
    await pool.end();
  }
}

main();
