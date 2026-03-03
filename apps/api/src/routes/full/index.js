/**
 * Índice do módulo FULL — monta todos os sub-roteadores.
 * Substitui routes/full.js em app.js.
 *
 * Ordem de registro importante:
 *  1. Rotas com prefixos mais específicos primeiro (ex: /full/assessments/current antes de /full/assessments/:id)
 *  2. submit.js registra /full/assessments/current, /full/assessments/start, /full/assessments/:id
 *  3. causes.js registra /full/status, /full/cause/*, /full/causes/*
 */
const express = require('express');
const router = express.Router();

// Sub-roteadores: a ordem importa para evitar conflitos de parâmetros
router.use(require('./submit'));       // POST /full/assessments/start, GET /full/assessments/current, GET /full/assessments/:id, GET /full/assessments/:id/status, POST /full/assessments/:id/submit, GET /full/assessments/:id/results, GET /full/results
router.use(require('./versions'));     // GET /full/versions, POST /full/versions/new, GET /full/versions/:full_version/summary, GET /full/compare
router.use(require('./reports'));      // POST /full/reports/generate, GET /full/reports/status, GET /full/reports/download, GET /full/reports/:assessmentId.pdf
router.use(require('./catalog'));      // GET /full/catalog, GET /full/catalog/process/:process_key
router.use(require('./answers'));      // PUT /full/assessments/:id/answers, POST /full/assessments/:id/answers, GET /full/answers, GET /full/assessments/:id/answers
router.use(require('./causes'));       // GET /full/status, GET /full/cause/catalog, GET /full/cause/answers, GET /full/cause/result, POST /full/cause/answer, POST /full/cause/evaluate, GET /full/causes/pending, POST /full/causes/answer, GET /full/causes
router.use(require('./plan'));         // GET /full/plan/status, GET /full/assessments/:id/recommendations, POST /full/assessments/:id/plan/select, GET /full/actions/:action_key/dod, POST /full/assessments/:id/plan/:action_key/dod/confirm, GET /full/assessments/:id/plan, PATCH /full/assessments/:id/plan/:action_key/status, GET /full/actions, POST /full/cycle/select-actions, POST /full/plan, GET /full/plan, POST /full/actions/:action_key/status
router.use(require('./evidence'));     // POST /full/assessments/:id/plan/:action_key/evidence, POST /full/cycle/actions/:id/evidence, POST /full/cycle/actions/:id/mark-done, POST /full/actions/:action_key/evidence
router.use(require('./dashboard'));    // GET /full/assessments/:id/dashboard, GET /full/dashboard
router.use(require('./close'));        // GET /full/assessments/:id/close-summary, POST /full/assessments/:id/close, POST /full/assessments/:id/new-cycle
router.use(require('./consultor'));    // GET /full/consultor/assessments/:id, POST /full/consultor/assessments/:id/actions/:action_key/notes, GET /full/assessments/:id/actions/:action_key/notes

module.exports = router;
