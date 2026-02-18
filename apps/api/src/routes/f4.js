const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');
const { requireAuth } = require('../middleware/requireAuth');
const { requireFullEntitlement } = require('../middleware/requireFullEntitlement');
const { canAccessFull, isFullBypassUser } = require('../lib/canAccessFull');
const { ensureConsultantOrOwnerAccess } = require('../lib/companyAccess');
const { getOrCreateCurrentFullAssessment, FullCurrentError, logFullCurrentError } = require('../lib/fullAssessment');

/**
 * GET /entitlements
 * Retorna entitlements do usuário autenticado
 * Query opcional: ?company_id=<uuid>
 * Quando company_id presente, inclui can_access_full (FULL_TEST_MODE, whitelist ou entitlement)
 */
const ADMIN_EMAIL = 'admin@fca.com';

/** Resolve email do usuário: JWT ou fetch via Supabase Auth Admin (fallback quando JWT não tem email) */
async function resolveUserEmail(userId, userEmailFromJwt, supabaseClient) {
  const fromJwt = userEmailFromJwt && String(userEmailFromJwt).trim();
  if (fromJwt) return fromJwt.toLowerCase();
  const { data: { user }, error } = await supabaseClient.auth.admin.getUserById(userId);
  if (error || !user?.email) return null;
  return String(user.email).trim().toLowerCase();
}

router.get('/entitlements', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.query.company_id;

    if (companyId) {
      // ADMIN OVERRIDE: admin@fca.com tem FULL total, independente de LIGHT/pagamento
      const userEmail = await resolveUserEmail(userId, req.user.email, supabase);
      if (userEmail === ADMIN_EMAIL.toLowerCase()) {
        const payload = { plan: 'FULL', status: 'ACTIVE', source: 'ADMIN_OVERRIDE', can_access_full: true };
        console.log('[ENTITLEMENT] AUDIT user=' + (userEmail || 'anonymous') + ' company_id=' + companyId + ' plan=' + payload.plan + ' status=' + payload.status + ' can_access_full=' + payload.can_access_full + ' source=' + payload.source);
        return res.json({
          ...payload,
          company_id: companyId,
          is_admin: true,
        });
      }

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

      const canAccess = await canAccessFull({
        userEmail: userEmail || req.user.email || null,
        userId,
        companyId,
        supabase,
      });

      const base = entitlement
        ? entitlement
        : { plan: 'LIGHT', status: 'ACTIVE', source: 'MANUAL', company_id: companyId };

      const out = { ...base, can_access_full: canAccess };
      console.log('[ENTITLEMENT] AUDIT user=' + (userEmail || req.user.email || 'anonymous') + ' company_id=' + companyId + ' plan=' + out.plan + ' status=' + out.status + ' can_access_full=' + out.can_access_full + ' source=' + (out.source || 'n/a'));
      return res.json(out);
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
 * POST /entitlements/full/activate_test
 * Ativa entitlement FULL em modo teste. Permitido APENAS para fca@fca.com.
 * Requer que o usuário seja dono da company.
 */
router.post('/entitlements/full/activate_test', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = (req.query.company_id || req.body.company_id || '').trim();

    if (!companyId || companyId.length === 0) {
      return res.status(400).json({ error: 'company_id é obrigatório' });
    }

    const userEmail = await resolveUserEmail(userId, req.user.email, supabase) || req.user.email || null;
    if (!isFullBypassUser(userEmail)) {
      return res.status(403).json({ error: 'ativar FULL em modo teste não autorizado' });
    }

    const { data: company, error: companyErr } = await supabase
      .schema('public')
      .from('companies')
      .select('id, owner_user_id')
      .eq('id', companyId)
      .eq('owner_user_id', userId)
      .maybeSingle();

    if (companyErr || !company) {
      return res.status(404).json({ error: 'company não encontrada ou não pertence ao usuário' });
    }

    const { error: upsertErr } = await supabase
      .schema('public')
      .from('entitlements')
      .upsert(
        {
          user_id: userId,
          company_id: companyId,
          plan: 'FULL',
          status: 'ACTIVE',
          source: 'MANUAL',
        },
        { onConflict: 'user_id,company_id' }
      );

    if (upsertErr) {
      console.error('Erro ao ativar entitlement:', upsertErr.message);
      return res.status(500).json({ error: 'erro ao ativar entitlement' });
    }

    console.log('[AUDIT] entitlement_activate_test', { company_id: companyId, email: userEmail, result: 'FULL/ACTIVE' });

    return res.status(200).json({
      company_id: companyId,
      plan: 'FULL',
      status: 'ACTIVE',
      ok: true,
    });
  } catch (error) {
    console.error('Erro ao ativar FULL em modo teste:', error.message);
    return res.status(500).json({ error: 'erro inesperado' });
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
 * Retorna o diagnóstico FULL (requer entitlement FULL/ACTIVE).
 * Usa full_assessments (não assessments LIGHT). Cria DRAFT se não existir.
 * Query: ?company_id=<uuid>
 */
router.get('/full/diagnostic', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.query.company_id;

    if (!companyId || typeof companyId !== 'string' || companyId.trim().length === 0) {
      return res.status(400).json({ error: 'company_id é obrigatório' });
    }

    const company = await ensureConsultantOrOwnerAccess(userId, companyId, req.user?.email);
    if (!company) {
      return res.status(404).json({ error: 'company não encontrada ou sem acesso' });
    }

    let result;
    try {
      result = await getOrCreateCurrentFullAssessment(companyId, userId);
    } catch (err) {
      if (err instanceof FullCurrentError) {
        logFullCurrentError(err.phase, companyId, userId, req.user?.email, err.originalError);
        const isDev = process.env.NODE_ENV !== 'production';
        return res.status(500).json({
          code: 'FULL_CURRENT_FAILED',
          error: err.message,
          message_user: 'Não foi possível carregar o diagnóstico. Tente novamente.',
          ...(isDev && { phase: err.phase }),
        });
      }
      throw err;
    }

    const { assessment, company: companyData } = result;

    // Itens: respostas existentes; se não houver, devolve catálogo base (determinístico)
    let items = [];
    const { data: answersData, error: answersErr } = await supabase
      .schema('public')
      .from('full_answers')
      .select('*')
      .eq('assessment_id', assessment.id)
      .order('process_key', { ascending: true })
      .order('question_key', { ascending: true });

    if (!answersErr) {
      items = answersData || [];
    }

    if (items.length === 0) {
      const segment = assessment.segment || 'C';
      const { data: processes } = await supabase
        .schema('public')
        .from('full_process_catalog')
        .select('process_key')
        .eq('is_active', true)
        .contains('segment_applicability', [segment]);
      const processKeys = (processes || []).map((p) => p.process_key);
      if (processKeys.length > 0) {
        const { data: qData } = await supabase
          .schema('public')
          .from('full_question_catalog')
          .select('process_key, question_key, question_text, dimension, answer_type, sort_order')
          .in('process_key', processKeys)
          .eq('is_active', true)
          .contains('segment_applicability', [segment])
          .order('process_key', { ascending: true })
          .order('sort_order', { ascending: true });
        items = (qData || []).map((q) => ({ ...q, answer_value: null, source: 'CATALOG' }));
      }
    }

    const assessmentPayload = { ...assessment, type: 'FULL' };

    console.log(`[FULL_CURRENT] company_id=${companyId} assessment_id=${assessment.id} status=${assessment.status} type=FULL (diagnostic)`);

    return res.json({
      ok: true,
      company: {
        id: companyData.id,
        name: companyData.name || null
      },
      assessment: assessmentPayload,
      items
    });
  } catch (error) {
    console.error('Erro no endpoint full/diagnostic:', error.message);
    return res.status(500).json({ error: 'erro inesperado' });
  }
});

module.exports = router;
