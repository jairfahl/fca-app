/**
 * POST /messages — USER envia mensagem (Solicitar ajuda / suporte)
 */
const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');
const { requireAuth } = require('../middleware/requireAuth');
const { blockConsultorOnMutation } = require('../middleware/requireRole');

router.post('/', requireAuth, blockConsultorOnMutation, async (req, res) => {
  try {
    const { company_id, subject, body } = req.body;

    if (!company_id || typeof company_id !== 'string') {
      return res.status(400).json({ error: 'company_id é obrigatório' });
    }
    if (!body || typeof body !== 'string' || body.trim().length === 0) {
      return res.status(400).json({ error: 'body é obrigatório' });
    }

    const { data: company, error: cErr } = await supabase
      .schema('public')
      .from('companies')
      .select('id, owner_user_id')
      .eq('id', company_id)
      .eq('owner_user_id', req.user.id)
      .maybeSingle();

    if (cErr || !company) {
      return res.status(403).json({ error: 'Empresa não pertence ao usuário' });
    }

    const { data: msg, error: insErr } = await supabase
      .schema('public')
      .from('support_messages')
      .insert({
        company_id,
        from_user_id: req.user.id,
        to_user_id: null,
        subject: (subject || '').trim() || null,
        body: body.trim(),
        created_by_role: 'USER',
      })
      .select()
      .single();

    if (insErr) {
      console.error('Erro POST /messages:', insErr.message);
      return res.status(500).json({ error: 'Erro ao enviar mensagem' });
    }

    return res.status(201).json(msg);
  } catch (err) {
    console.error('Erro POST /messages:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

module.exports = router;
