/**
 * Índice do módulo F3 (LIGHT) — monta todos os sub-roteadores.
 * Substitui routes/f3.js em app.js.
 */
const express = require('express');
const router = express.Router();

router.use(require('./recommendations')); // GET /assessments/:id/recommendations, POST /assessments/:id/free-actions/select
router.use(require('./lightPlans'));       // GET /light/plans/*, PATCH /light/plans/:key/status, etc.
router.use(require('./evidence'));         // POST /free-actions/:id/evidence, GET /free-actions/:id

module.exports = router;
