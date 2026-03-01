/**
 * GET /me — retorna dados do usuário autenticado (incluindo role)
 * Role vem do JWT (app_metadata.role) via populateAuth.
 */
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/requireAuth');

router.get('/me', requireAuth, (req, res) => {
  const { id, email, role } = req.user;
  if (process.env.NODE_ENV !== 'production') {
    console.log(`ME role=${role} email=${email || id}`);
  }
  return res.json({
    user_id: id,
    email: email || null,
    role: role || 'USER',
  });
});

module.exports = router;
