const { supabase } = require('../lib/supabase');

/**
 * Middleware: Requer entitlement FULL/ACTIVE para a company
 * Deve ser usado APÓS requireAuth
 * 
 * Lê company_id de:
 * - req.query.company_id (para GET)
 * - req.body.company_id (para POST), se query não existir
 * 
 * Retorna:
 * - 400 se company_id ausente
 * - 403 se entitlement não for FULL/ACTIVE
 * - next() se entitlement válido
 */
async function requireFullEntitlement(req, res, next) {
  try {
    const modeRaw = process.env.FULL_ACCESS_MODE || 'ENFORCED';
    const mode = String(modeRaw).trim().toUpperCase();
    const userEmail = req.user && req.user.email ? String(req.user.email).toLowerCase() : null;

    if (mode === 'BYPASS_DEV') {
      if (nodeEnv === 'production') {
        return res.status(403).json({ error: 'BYPASS_DEV proibido em produção' });
      }
      return next();
    }

    if (mode === 'BYPASS_EMAILS') {
      const allowRaw = process.env.FULL_BYPASS_EMAILS || '';
      const allowList = allowRaw
        .split(',')
        .map(email => email.trim().toLowerCase())
        .filter(email => email.length > 0);

      if (userEmail && allowList.includes(userEmail)) {
        return next();
      }
      // Caso não esteja na allowlist, seguir validação normal (ENFORCED)
    }

    // Ler company_id de query ou body
    const companyId = req.query.company_id || req.body.company_id;

    if (!companyId || typeof companyId !== 'string' || companyId.trim().length === 0) {
      return res.status(400).json({ error: 'company_id é obrigatório' });
    }

    const userId = req.user.id;

    // Buscar entitlement FULL/ACTIVE
    const { data: entitlement, error: entErr } = await supabase
      .schema('public')
      .from('entitlements')
      .select('id, plan, status')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .eq('plan', 'FULL')
      .eq('status', 'ACTIVE')
      .maybeSingle();

    if (entErr) {
      console.error('Erro ao verificar entitlement:', entErr.message);
      return res.status(500).json({ error: 'erro ao verificar entitlement' });
    }

    if (!entitlement) {
      console.log(`FULL_GATE_DENY user_id=${userId} company_id=${companyId}`);
      return res.status(403).json({ error: 'conteúdo disponível apenas no FULL' });
    }

    console.log(`FULL_GATE_OK user_id=${userId} company_id=${companyId}`);
    next();
  } catch (error) {
    console.error('Erro no middleware requireFullEntitlement:', error.message);
    return res.status(500).json({ error: 'erro inesperado' });
  }
}

module.exports = { requireFullEntitlement };
