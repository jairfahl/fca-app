const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');
const { requireAuth } = require('../middleware/requireAuth');

const VALID_SEGMENTS = ['SERVICOS', 'COMERCIO', 'INDUSTRIA'];

/**
 * POST /companies
 * Cria uma nova company para o usuário autenticado
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, segment, lgpd_accepted } = req.body;

    // Validações
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'name é obrigatório' });
    }

    if (!segment || !VALID_SEGMENTS.includes(segment)) {
      return res.status(400).json({ error: 'segment é obrigatório e deve ser: SERVICOS, COMERCIO ou INDUSTRIA' });
    }

    if (lgpd_accepted !== true) {
      return res.status(400).json({ error: 'É necessário aceitar a Política de Privacidade para continuar.' });
    }

    // Inserir company com owner_user_id do usuário autenticado
    const { data, error } = await supabase
      .from('companies')
      .insert({
        name: name.trim(),
        segment: segment,
        owner_user_id: req.user.id,
        lgpd_accepted_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Erro ao criar company:', error.message);
      return res.status(500).json({ error: 'erro ao criar company' });
    }

    res.status(201).json(data);
  } catch (error) {
    console.error('Erro inesperado ao criar company:', error.message);
    res.status(500).json({ error: 'erro inesperado' });
  }
});

/**
 * GET /companies
 * Lista companies do usuário autenticado
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    // Filtrar explicitamente por owner_user_id (defesa em profundidade)
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('owner_user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao listar companies:', error.message);
      return res.status(500).json({ error: 'erro ao listar companies' });
    }

    res.json(data || []);
  } catch (error) {
    console.error('Erro inesperado ao listar companies:', error.message);
    res.status(500).json({ error: 'erro inesperado' });
  }
});

module.exports = router;
