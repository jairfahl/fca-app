/**
 * Rotas /admin — módulo de gestão de usuários (SoD)
 * Somente ADMIN. USER e CONSULTOR retornam 403.
 */
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../../middleware/requireAuth');
const { requireAdmin } = require('../../middleware/guards');

const usersRoutes = require('./users');
const companiesRoutes = require('./companies');

// Todas as rotas /admin requerem auth + ADMIN
router.use(requireAuth);
router.use(requireAdmin);

router.use(usersRoutes);
router.use(companiesRoutes);

module.exports = router;
