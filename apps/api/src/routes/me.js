/**
 * GET /me — retorna dados do usuário autenticado (incluindo role)
 */
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/requireAuth');

router.get('/me', requireAuth, (req, res) => {
  return res.json({
    user_id: req.user.id,
    email: req.user.email || null,
    role: req.user.role || 'USER',
  });
});

module.exports = router;
