/**
 * Rotas /consultor/* — área do consultor (CONSULTOR/ADMIN)
 * Acesso transversal: vê qualquer empresa, status, ações, evidências.
 */
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/requireAuth');
const { requireConsultorOrAdmin } = require('../middleware/requireRole');
const { supabase } = require('../lib/supabase');

router.use(requireAuth);
router.use(requireConsultorOrAdmin);

// GET /consultor/companies — lista empresas (id, name)
router.get('/consultor/companies', async (req, res) => {
  try {
    const { data, error } = await supabase
      .schema('public')
      .from('companies')
      .select('id, name')
      .order('name');

    if (error) {
      console.error('Erro GET /consultor/companies:', error.message);
      return res.status(500).json({ error: 'Erro ao listar empresas' });
    }
    return res.json({ companies: data || [] });
  } catch (err) {
    console.error('Erro GET /consultor/companies:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

// GET /consultor/company/:company_id/overview — visão consolidada (somente leitura)
router.get('/consultor/company/:company_id/overview', async (req, res) => {
  try {
    const companyId = req.params.company_id;

    const { data: company, error: companyErr } = await supabase
      .schema('public')
      .from('companies')
      .select('id, name, segment')
      .eq('id', companyId)
      .maybeSingle();

    if (companyErr || !company) {
      return res.status(404).json({ error: 'Empresa não encontrada' });
    }

    // LIGHT: assessments tipo LIGHT
    const { data: lightAssessments } = await supabase
      .schema('public')
      .from('assessments')
      .select('id, status, type')
      .eq('company_id', companyId)
      .eq('type', 'LIGHT')
      .order('created_at', { ascending: false })
      .limit(1);

    const lightStatus = lightAssessments?.[0]?.status || null;

    // FULL: full_assessments
    const { data: fullAssessments } = await supabase
      .schema('public')
      .from('full_assessments')
      .select('id, status, segment, submitted_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(1);

    const fullStatus = fullAssessments?.[0] || null;

    // Plano atual FULL (se existir)
    let planProgress = null;
    if (fullStatus?.id) {
      const { data: plan } = await supabase
        .schema('public')
        .from('full_selected_actions')
        .select('action_key, status')
        .eq('assessment_id', fullStatus.id);
      const done = (plan || []).filter((p) => p.status === 'DONE' || p.status === 'DROPPED').length;
      planProgress = plan?.length ? `${done}/${plan.length}` : null;
    }

    return res.json({
      company,
      light_status: lightStatus,
      full_status: fullStatus?.status || null,
      full_assessment_id: fullStatus?.id || null,
      plan_progress: planProgress,
    });
  } catch (err) {
    console.error('Erro GET /consultor/company/:id/overview:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

// GET /consultor/company/:company_id/actions — ações do ciclo + evidências
router.get('/consultor/company/:company_id/actions', async (req, res) => {
  try {
    const companyId = req.params.company_id;

    const { data: fullAssessment } = await supabase
      .schema('public')
      .from('full_assessments')
      .select('id')
      .eq('company_id', companyId)
      .in('status', ['SUBMITTED', 'CLOSED'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!fullAssessment) {
      return res.json({ actions: [], evidence: [] });
    }

    const { data: plan } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .select('*')
      .eq('assessment_id', fullAssessment.id)
      .order('position');

    const { data: evidence } = await supabase
      .schema('public')
      .from('full_action_evidence')
      .select('*')
      .eq('assessment_id', fullAssessment.id);

    const { data: histRows } = await supabase
      .schema('public')
      .from('full_cycle_history')
      .select('*')
      .eq('assessment_id', fullAssessment.id)
      .order('archived_at', { ascending: false });

    return res.json({
      assessment_id: fullAssessment.id,
      actions: plan || [],
      evidence: evidence || [],
      cycle_history: histRows || [],
    });
  } catch (err) {
    console.error('Erro GET /consultor/company/:id/actions:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

// GET /consultor/help-requests?status=OPEN — lista pedidos de ajuda (CONSULTOR/ADMIN)
router.get('/consultor/help-requests', async (req, res) => {
  try {
    const status = req.query.status || 'OPEN';
    const { data, error } = await supabase
      .schema('public')
      .from('help_requests')
      .select('id, company_id, user_id, context, status, assigned_to, closed_at, created_at, updated_at')
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro GET /consultor/help-requests:', error.message);
      return res.status(500).json({ error: 'Erro ao listar pedidos de ajuda' });
    }
    return res.json({ help_requests: data || [] });
  } catch (err) {
    console.error('Erro GET /consultor/help-requests:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

// POST /consultor/help-requests/:id/close — fecha pedido (CONSULTOR/ADMIN)
router.post('/consultor/help-requests/:id/close', async (req, res) => {
  try {
    const id = req.params.id;
    const { data: existing, error: fetchErr } = await supabase
      .schema('public')
      .from('help_requests')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr || !existing) {
      return res.status(404).json({ error: 'Pedido de ajuda não encontrado' });
    }
    if (existing.status === 'CLOSED') {
      return res.json({ id, status: 'CLOSED', message: 'Já estava fechado' });
    }

    const { data: updated, error: updateErr } = await supabase
      .schema('public')
      .from('help_requests')
      .update({ status: 'CLOSED', closed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) {
      console.error('Erro POST /consultor/help-requests/:id/close:', updateErr.message);
      return res.status(500).json({ error: 'Erro ao fechar pedido' });
    }
    return res.json(updated);
  } catch (err) {
    console.error('Erro POST /consultor/help-requests/:id/close:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

module.exports = router;
