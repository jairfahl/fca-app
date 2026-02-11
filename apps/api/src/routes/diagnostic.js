const express = require('express');
const router = express.Router();
const { getPool } = require('../db');

/**
 * GET /diagnostic/db-fingerprint
 * Retorna identificador não sensível do DB atual (evidência operacional).
 */
router.get('/diagnostic/db-fingerprint', async (req, res) => {
  try {
    const pool = getPool();
    const r = await pool.query(`
      SELECT
        current_database() AS database,
        inet_server_addr()::text AS server_addr,
        version() AS pg_version
    `);
    const row = r.rows[0] || {};
    const supabaseUrl = process.env.SUPABASE_URL || '';
    const supabaseRef = supabaseUrl ? (supabaseUrl.match(/https:\/\/([a-z0-9-]+)\.supabase\.co/i) || [])[1] : null;

    res.json({
      database: row.database || null,
      server_addr: row.server_addr || null,
      pg_version: row.pg_version ? row.pg_version.split(' ').slice(0, 2).join(' ') : null,
      supabase_project_ref: supabaseRef,
    });
  } catch (err) {
    console.error('[diagnostic/db-fingerprint]', err.message);
    res.status(500).json({ error: 'erro ao obter fingerprint', detail: err.message });
  }
});

module.exports = router;
