#!/usr/bin/env node
/**
 * Métricas de valor FULL — consulta eventos e % ciclos com ganho declarado.
 * Uso: node scripts/full-value-metrics.js
 * Requer: DATABASE_URL no .env
 */
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

const { createPgPool } = require('../db/lib/dbSsl');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL não configurada');
    process.exit(1);
  }

  const pool = createPgPool();

  try {
    // 1. Contagem por evento (full_value_events — se tabela existir)
    let eventCounts = { CAUSE_CLASSIFIED: 0, PLAN_CREATED: 0, GAIN_DECLARED: 0 };
    try {
      const eventsRes = await pool.query(`
        SELECT event, COUNT(*)::int AS cnt
        FROM public.full_value_events
        GROUP BY event
      `);
      eventsRes.rows.forEach((r) => { eventCounts[r.event] = r.cnt; });
    } catch (e) {
      if (e.code === '42P01') {
        console.warn('Tabela full_value_events não existe. Execute migration 026.');
      } else {
        throw e;
      }
    }

    // 2. % ciclos com ganho declarado (derivado de full_assessments + full_action_evidence)
    const pctRes = await pool.query(`
      WITH closed AS (
        SELECT id FROM public.full_assessments WHERE status = 'CLOSED'
      ),
      with_gain AS (
        SELECT DISTINCT e.assessment_id
        FROM public.full_action_evidence e
        JOIN closed c ON c.id = e.assessment_id
        WHERE e.declared_gain IS NOT NULL AND e.declared_gain != ''
      )
      SELECT
        (SELECT COUNT(*)::int FROM closed) AS total_closed,
        (SELECT COUNT(*)::int FROM with_gain) AS cycles_with_gain
    `);

    const row = pctRes.rows[0] || {};
    const totalClosed = row.total_closed || 0;
    const cyclesWithGain = row.cycles_with_gain || 0;
    const pctGain = totalClosed > 0 ? ((cyclesWithGain / totalClosed) * 100).toFixed(1) : '0';

    console.log('=== Métricas FULL — valor inevitável ===\n');
    console.log('Eventos (full_value_events):');
    console.log('  Causa classificada:    ', eventCounts.CAUSE_CLASSIFIED);
    console.log('  Plano 30 dias criado:', eventCounts.PLAN_CREATED);
    console.log('  Ganho declarado:     ', eventCounts.GAIN_DECLARED);
    console.log('');
    console.log('% ciclos com ganho declarado:');
    console.log('  Ciclos fechados:     ', totalClosed);
    console.log('  Com ganho declarado: ', cyclesWithGain);
    console.log('  Percentual:          ', pctGain + '%');
    console.log('');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
