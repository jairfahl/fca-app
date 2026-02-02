const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');
const { requireAuth } = require('../middleware/requireAuth');

/**
 * POST /leads/triage
 * Salva triagem comercial FCA (LIGHT → FULL)
 */
router.post('/leads/triage', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      company_id,
      assessment_id,
      pain,
      horizon,
      budget_monthly,
      consent
    } = req.body;

    if (
      !company_id ||
      !assessment_id ||
      !pain ||
      !horizon ||
      !budget_monthly ||
      consent !== true
    ) {
      return res.status(400).json({ error: 'payload inválido ou consentimento ausente' });
    }

    const { data, error } = await supabase
      .from('leads_triage')
      .insert({
        owner_user_id: userId,
        company_id,
        assessment_id,
        pain,
        horizon,
        budget_monthly,
        consent: true
      })
      .select()
      .single();

    if (error) {
      console.error('Erro ao inserir triagem:', error.message);
      return res.status(500).json({ error: 'erro ao salvar triagem' });
    }

    return res.status(201).json(data);
  } catch (err) {
    console.error('Erro inesperado triage:', err.message);
    return res.status(500).json({ error: 'erro inesperado' });
  }
});

module.exports = router;