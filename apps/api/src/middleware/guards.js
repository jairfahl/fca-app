/**
 * Guards de role e escopo: proteção de rotas por role e company_id.
 * Hierarquia: USER < CONSULTOR < ADMIN.
 * Deve ser usado APÓS requireAuth.
 */
const { ROLES, ROLE_ORDER } = require('./auth');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(str) {
  return typeof str === 'string' && UUID_REGEX.test(str.trim());
}

function json401(res, detail) {
  return res.status(401).json({ error: 'UNAUTHENTICATED', detail: detail || undefined });
}

function json403(res, error, detail) {
  return res.status(403).json({ error: error || 'FORBIDDEN', detail });
}

function json400(res, detail) {
  return res.status(400).json({ error: 'BAD_REQUEST', detail: detail || undefined });
}

function requireAnyRole(allowedRoles) {
  return (req, res, next) => {
    const role = req.user?.role || 'USER';
    if (allowedRoles.includes(role)) return next();
    return json403(res, 'FORBIDDEN', 'Role insuficiente.');
  };
}

function requireMinRole(minRole) {
  const minLevel = ROLE_ORDER[minRole] ?? -1;
  return (req, res, next) => {
    const role = req.user?.role || 'USER';
    const level = ROLE_ORDER[role] ?? -1;
    if (level >= minLevel) return next();
    return json403(res, 'FORBIDDEN', `Requer role ${minRole} ou superior.`);
  };
}

/**
 * Bloqueia CONSULTOR em rotas de preenchimento/mutation de diagnóstico.
 * ADMIN passa. USER passa. CONSULTOR retorna 403 com payload explícito.
 */
function blockConsultorOnMutation(req, res, next) {
  const role = req.user?.role || 'USER';
  if (role === 'ADMIN') return next();
  if (role === 'CONSULTOR') {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`BLOCK consultor route=${req.method} ${req.path}`);
    }
    return res.status(403).json({
      error: 'CONSULTOR_NOT_ALLOWED',
      message_user: 'Acesso de consultor é pelo painel do consultor.',
    });
  }
  return next();
}

/**
 * Valida acesso à company.
 * extractor: (req) => company_id (string|undefined) — de req.params, req.query ou req.body
 * ADMIN: allow. CONSULTOR: allow (transversal). USER: allow se membership ativo ou owner legado.
 */
function requireCompanyAccess(extractor) {
  return async (req, res, next) => {
    const companyId = extractor(req);
    if (!companyId || typeof companyId !== 'string') {
      return json400(res, 'company_id ausente ou inválido');
    }
    const trimmed = companyId.trim();
    if (!isValidUuid(trimmed)) {
      return json400(res, 'company_id não é um UUID válido');
    }

    const role = req.user?.role || 'USER';
    if (role === 'ADMIN') return next();
    if (role === 'CONSULTOR') return next(); // transversal por enquanto

    const userId = req.user?.id;
    if (!userId) {
      return json401(res);
    }

    try {
      const { supabase } = require('../lib/supabase');

      // company_members (migration 032)
      const { data: member } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('company_id', trimmed)
        .eq('user_id', userId)
        .eq('status', 'ACTIVE')
        .maybeSingle();

      if (member) return next();

      // Backward: owner legado em companies
      const { data: company } = await supabase
        .from('companies')
        .select('id')
        .eq('id', trimmed)
        .eq('owner_user_id', userId)
        .maybeSingle();

      if (company) return next();

      return json403(res, 'FORBIDDEN', 'Sem acesso a esta empresa.');
    } catch (err) {
      console.warn('[guards] requireCompanyAccess:', err?.message);
      return json403(res, 'FORBIDDEN', 'Erro ao verificar acesso.');
    }
  };
}

const requireConsultorOrAdmin = requireAnyRole(['CONSULTOR', 'ADMIN']);

/** Somente ADMIN. USER e CONSULTOR retornam 403. */
const requireAdmin = requireAnyRole(['ADMIN']);

module.exports = {
  requireAnyRole,
  requireRole: (exactRole) => requireAnyRole([exactRole]),
  requireMinRole,
  requireCompanyAccess,
  requireConsultorOrAdmin,
  requireAdmin,
  blockConsultorOnMutation,
  isValidUuid,
  json401,
  json403,
  json400,
};
