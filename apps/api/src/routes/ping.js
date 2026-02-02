const express = require('express');
const router = express.Router();
const { checkConnection } = require('../db');

/**
 * GET /ping
 * Retorna status da API e do banco de dados
 */
router.get('/ping', async (req, res) => {
  try {
    const dbStatus = await checkConnection();
    
    res.json({
      ok: true,
      service: 'api',
      db: {
        ok: dbStatus.ok,
        now: dbStatus.now
      }
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      service: 'api',
      db: {
        ok: false,
        now: null
      },
      error: error.message
    });
  }
});

module.exports = router;
