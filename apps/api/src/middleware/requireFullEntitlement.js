const { supabase } = require('../lib/supabase');

const { canAccessFull } = require('../lib/canAccessFull');

/**
 * Middleware: Requer autorização FULL para a company
 * Deve ser usado APÓS requireAuth
 *
 * Gate centralizado: FULL_TEST_MODE, whitelist ou entitlement FULL/ACTIVE.
 *
 * Lê company_id de:
 * - req.query.company_id (para GET)
 * - req.body.company_id (para POST), se query não existir
 *
 * Retorna:
 * - 400 se company_id ausente
 * - 403 se não autorizado
 * - next() se autorizado
 */
async function requireFullEntitlement(req, res, next) {
  try {
    const companyId = req.query.company_id || req.body.company_id;

    if (!companyId || typeof companyId !== 'string' || companyId.trim().length === 0) {
      return res.status(400).json({ error: 'company_id é obrigatório' });
    }

    const userId = req.user.id;
    const userEmail = req.user.email || null;

    const allowed = await canAccessFull({
      userEmail,
      userId,
      companyId,
      supabase,
    });

    if (!allowed) {
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
