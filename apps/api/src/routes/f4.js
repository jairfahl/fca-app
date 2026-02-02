const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');
const { requireAuth } = require('../middleware/requireAuth');
const { requireFullEntitlement } = require('../middleware/requireFullEntitlement');

/**
 * GET /entitlements
 * Retorna entitlements do usuário autenticado
 * Query opcional: ?company_id=<uuid>
 */
router.get('/entitlements', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.query.company_id;

    if (companyId) {
      // Buscar entitlement específico para user_id + company_id
      const { data: entitlement, error: entErr } = await supabase
        .schema('public')
        .from('entitlements')
        .select('*')
        .eq('user_id', userId)
        .eq('company_id', companyId)
        .maybeSingle();

      if (entErr) {
        console.error('Erro ao buscar entitlement:', entErr.message);
        return res.status(500).json({ error: 'erro ao buscar entitlement' });
      }

      if (!entitlement) {
        // Default: LIGHT/ACTIVE se não existir
        return res.json({
          plan: 'LIGHT',
          status: 'ACTIVE',
          source: 'MANUAL',
          company_id: companyId
        });
      }

      return res.json(entitlement);
    } else {
      // Listar todos os entitlements do usuário
      const { data: entitlements, error: entErr } = await supabase
        .schema('public')
        .from('entitlements')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (entErr) {
        console.error('Erro ao listar entitlements:', entErr.message);
        return res.status(500).json({ error: 'erro ao listar entitlements' });
      }

      return res.json(entitlements || []);
    }
  } catch (error) {
    console.error('Erro ao buscar entitlements:', error.message);
    res.status(500).json({ error: 'erro inesperado' });
  }
});

/**
 * POST /paywall/events
 * Registra evento do paywall (audit trail)
 */
router.post('/paywall/events', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { event, company_id, meta } = req.body;

    // Validar event obrigatório e permitido
    const allowedEvents = ['VIEW_PAYWALL', 'CLICK_UPGRADE', 'UNLOCK_FULL'];
    if (!event || !allowedEvents.includes(event)) {
      return res.status(400).json({ 
        error: 'event é obrigatório e deve ser um de: VIEW_PAYWALL, CLICK_UPGRADE, UNLOCK_FULL' 
      });
    }

    // Inserir evento
    const { data: paywallEvent, error: insertErr } = await supabase
      .schema('public')
      .from('paywall_events')
      .insert({
        user_id: userId,
        company_id: company_id || null,
        event: event,
        meta: meta || {}
      })
      .select()
      .single();

    if (insertErr) {
      console.error('Erro ao inserir evento do paywall:', insertErr.message);
      return res.status(500).json({ error: 'erro ao registrar evento' });
    }

    console.log(`PAYWALL_EVENT user_id=${userId} event=${event}`);

    res.status(201).json(paywallEvent);
  } catch (error) {
    console.error('Erro ao registrar evento do paywall:', error.message);
    res.status(500).json({ error: 'erro inesperado' });
  }
});

/**
 * POST /entitlements/manual-unlock
 * Desbloqueia FULL manualmente (apenas QA/dev, não production)
 */
router.post('/entitlements/manual-unlock', requireAuth, async (req, res) => {
  try {
    // Proteção: só permitir em desenvolvimento
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'manual-unlock não permitido em production' });
    }

    const userId = req.user.id;
    const { company_id } = req.body;

    // Validar company_id obrigatório
    if (!company_id || typeof company_id !== 'string' || company_id.trim().length === 0) {
      return res.status(400).json({ error: 'company_id é obrigatório' });
    }

    // Validar que company existe e pertence ao usuário
    const { data: company, error: companyErr } = await supabase
      .schema('public')
      .from('companies')
      .select('id, owner_user_id')
      .eq('id', company_id)
      .eq('owner_user_id', userId)
      .maybeSingle();

    if (companyErr) {
      console.error('Erro ao validar company:', companyErr.message);
      return res.status(500).json({ error: 'erro ao validar company' });
    }

    if (!company) {
      return res.status(404).json({ error: 'company não encontrada ou não pertence ao usuário' });
    }

    // Upsert entitlement
    const { data: entitlement, error: upsertErr } = await supabase
      .schema('public')
      .from('entitlements')
      .upsert({
        user_id: userId,
        company_id: company_id,
        plan: 'FULL',
        status: 'ACTIVE',
        source: 'MANUAL'
      }, {
        onConflict: 'user_id,company_id'
      })
      .select()
      .single();

    if (upsertErr) {
      console.error('Erro ao criar entitlement:', upsertErr.message);
      return res.status(500).json({ error: 'erro ao criar entitlement' });
    }

    console.log(`ENTITLEMENT_UNBLOCK user_id=${userId} company_id=${company_id}`);

    res.status(201).json(entitlement);
  } catch (error) {
    console.error('Erro ao desbloquear entitlement:', error.message);
    res.status(500).json({ error: 'erro inesperado' });
  }
});

/**
 * GET /full/diagnostic
 * Retorna o diagnóstico completo (requer entitlement FULL/ACTIVE)
 * Query: ?company_id=<uuid>
 *
 * Observação importante:
 * - Este endpoint foi promovido de "prova do gate" para "fonte do diagnóstico FULL".
 * - Ele é refresh-safe: sempre retorna dados do DB.
 */
router.get('/full/diagnostic', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.query.company_id;

    // company_id é obrigatório
    if (!companyId || typeof companyId !== 'string' || companyId.trim().length === 0) {
      return res.status(400).json({ error: 'company_id é obrigatório' });
    }

    // Validar que company existe e pertence ao usuário
    const { data: company, error: companyErr } = await supabase
      .schema('public')
      .from('companies')
      .select('id, owner_user_id, name')
      .eq('id', companyId)
      .eq('owner_user_id', userId)
      .maybeSingle();

    if (companyErr) {
      console.error('Erro ao validar company (full/diagnostic):', companyErr.message);
      return res.status(500).json({ error: 'erro ao validar company' });
    }

    if (!company) {
      return res.status(404).json({ error: 'company não encontrada ou não pertence ao usuário' });
    }

    // Buscar o assessment mais recente da empresa (fonte do diagnóstico)
    const { data: assessment, error: assessErr } = await supabase
      .schema('public')
      .from('assessments')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (assessErr) {
      console.error('Erro ao buscar assessment (full/diagnostic):', assessErr.message);
      return res.status(500).json({ error: 'erro ao buscar diagnóstico' });
    }

    if (!assessment) {
      // Não inventar estrutura: se não existe no DB, retorna 404 objetivo.
      return res.status(404).json({ error: 'diagnóstico não encontrado para esta empresa' });
    }

    // Buscar itens do assessment (quando existir tabela/relacionamento)
    // IMPORTANTE: usamos query separada para não depender de FK configurada.
    let items = [];
    const { data: itemsData, error: itemsErr } = await supabase
      .schema('public')
      .from('assessment_items')
      .select('*')
      .eq('assessment_id', assessment.id)
      .order('created_at', { ascending: true });

    if (itemsErr) {
      // Não falhar o endpoint se a tabela/consulta não existir; devolve diagnóstico sem itens.
      // Isso evita quebrar o front em ambientes onde ainda não há itens persistidos.
      console.warn('Aviso: não foi possível buscar assessment_items (full/diagnostic):', itemsErr.message);
      items = [];
    } else {
      items = itemsData || [];
    }

    // Payload FULL para o front
    return res.json({
      ok: true,
      company: {
        id: company.id,
        name: company.name || null
      },
      assessment,
      items
    });
  } catch (error) {
    console.error('Erro no endpoint full/diagnostic:', error.message);
    return res.status(500).json({ error: 'erro inesperado' });
  }
});

module.exports = router;
