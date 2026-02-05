const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');
const { requireAuth } = require('../middleware/requireAuth');

/**
 * POST /leads/triage
 * Captura lead qualificado sem poluir diagnóstico
 * Payload:
 * {
 *   "company_id": "...",
 *   "assessment_id": "...",
 *   "pain": "CAIXA|VENDA|OPERACAO|PESSOAS",
 *   "horizon": "30|60|90",
 *   "budget_monthly": "ZERO|ATE_300|DE_301_800|DE_801_2000|ACIMA_2000",
 *   "consent": true
 * }
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
    } = req.body || {};

    // Validações básicas
    if (!company_id || !assessment_id) {
      return res.status(400).json({ error: 'company_id e assessment_id são obrigatórios' });
    }

    if (consent !== true) {
      return res.status(400).json({ error: 'consent deve ser true' });
    }

    // Validação de valores permitidos
    const validPains = new Set(['CAIXA', 'VENDA', 'OPERACAO', 'PESSOAS']);
    const validHorizons = new Set(['30', '60', '90']);
    const validBudgets = new Set(['ZERO', 'ATE_300', 'DE_301_800', 'DE_801_2000', 'ACIMA_2000']);

    if (!validPains.has(pain)) {
      return res.status(400).json({ error: 'pain inválido. Use: CAIXA, VENDA, OPERACAO, PESSOAS' });
    }

    if (!validHorizons.has(horizon)) {
      return res.status(400).json({ error: 'horizon inválido. Use: 30, 60, 90' });
    }

    if (!validBudgets.has(budget_monthly)) {
      return res.status(400).json({ error: 'budget_monthly inválido. Use: ZERO, ATE_300, DE_301_800, DE_801_2000, ACIMA_2000' });
    }

    // Buscar assessment (id, company_id, status)
    const { data: assessment, error: assessmentErr } = await supabase
      .from('assessments')
      .select('id, company_id, status')
      .eq('id', assessment_id)
      .maybeSingle();

    if (assessmentErr) {
      console.error('Erro ao buscar assessment:', assessmentErr.message);
      return res.status(500).json({ error: 'erro ao buscar assessment' });
    }

    if (!assessment) {
      return res.status(404).json({ error: 'assessment não encontrado' });
    }

    if (assessment.status !== 'COMPLETED') {
      return res.status(400).json({ error: 'assessment precisa estar COMPLETED' });
    }

    if (assessment.company_id !== company_id) {
      return res.status(400).json({ error: 'assessment não pertence à company informada' });
    }

    // Validar ownership (company pertence ao usuário)
    const { data: company, error: companyErr } = await supabase
      .from('companies')
      .select('id, owner_user_id')
      .eq('id', assessment.company_id)
      .eq('owner_user_id', userId)
      .maybeSingle();

    if (companyErr) {
      console.error('Erro ao validar ownership:', companyErr.message);
      return res.status(500).json({ error: 'erro ao validar ownership' });
    }

    if (!company) {
      return res.status(403).json({ error: 'company não pertence ao usuário' });
    }

    // Inserir triagem (sem consent - não existe no schema)
    // RLS garante que owner_user_id = auth.uid()
    const { data, error } = await supabase
      .from('leads_triage')
      .insert({
        owner_user_id: userId,
        company_id,
        assessment_id,
        pain,
        horizon,
        budget_monthly
      })
      .select()
      .single();

    if (error) {
      console.error('Erro ao inserir triagem:', error.message);
      // Se erro de constraint unique, retornar 409
      if (error.code === '23505') {
        return res.status(409).json({ error: 'triagem já registrada para este assessment' });
      }
      return res.status(500).json({ error: 'erro ao salvar triagem' });
    }

    return res.status(201).json(data);
  } catch (err) {
    console.error('Erro inesperado triage:', err.message);
    return res.status(500).json({ error: 'erro inesperado' });
  }
});

module.exports = router;