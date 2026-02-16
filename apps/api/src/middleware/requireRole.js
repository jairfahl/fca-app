/**
 * Guards de role: CONSULTOR e ADMIN acessam área do consultor.
 * Ordem de poder: ADMIN > CONSULTOR > USER
 * Deve ser usado APÓS requireAuth.
 */
function requireAnyRole(allowedRoles) {
  return (req, res, next) => {
    const role = req.user?.role || 'USER';
    if (allowedRoles.includes(role)) return next();
    return res.status(403).json({ error: 'Acesso negado. Role insuficiente.', code: 'FORBIDDEN' });
  };
}

function requireRole(exactRole) {
  return (req, res, next) => {
    const role = req.user?.role || 'USER';
    if (role === exactRole) return next();
    return res.status(403).json({ error: 'Acesso negado. Requer role ' + exactRole, code: 'FORBIDDEN' });
  };
}

const requireConsultorOrAdmin = requireAnyRole(['CONSULTOR', 'ADMIN']);

module.exports = { requireAnyRole, requireRole, requireConsultorOrAdmin };
