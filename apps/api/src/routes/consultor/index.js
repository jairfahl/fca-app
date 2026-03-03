/**
 * Índice do módulo Consultor — monta todos os sub-roteadores.
 * Middleware global (requireAuth, requireConsultorOrAdmin, logConsultorAccess) aplicado aqui.
 */
const express = require('express');
const router = express.Router();
const { requireAuth, requireConsultorOrAdmin, logConsultorAccess } = require('./shared');

// Middleware global — aplica a todas as sub-rotas do consultor
router.use(requireAuth);
router.use(requireConsultorOrAdmin);
router.use((req, _res, next) => {
  logConsultorAccess(req);
  next();
});

// Sub-roteadores
router.use(require('./users'));
router.use(require('./assessments'));
router.use(require('./companies'));
router.use(require('./support'));

module.exports = router;
