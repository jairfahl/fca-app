/**
 * POST /help-requests — USER cria pedido de ajuda (auditável)
 */
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/requireAuth');
const { ensureConsultantOrOwnerAccess } = require('../lib/companyAccess');
const { supabase } = require('../lib/supabase');

router.post('/help-requests', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { company_id, context } = req.body;

    if (!company_id || !context || typeof context !== 'string') {
      return res.status(400).json({ error: 'company_id e context são obrigatórios' });
    }

    const company = await ensureConsultantOrOwnerAccess(userId, company_id, req.user.email, req.user?.role);
    if (!company) {
      return res.status(403).json({ error: 'Sem acesso a esta empresa' });
    }

    const { data, error } = await supabase
      .schema('public')
      .from('help_requests')
      .insert({
        company_id,
        user_id: userId,
        context: context.trim(),
        status: 'OPEN',
      })
      .select()
      .single();

    if (error) {
      console.error('Erro POST /help-requests:', error.message);
      return res.status(500).json({ error: 'Erro ao criar pedido de ajuda' });
    }
    return res.status(201).json(data);
  } catch (err) {
    console.error('Erro POST /help-requests:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

module.exports = router;
