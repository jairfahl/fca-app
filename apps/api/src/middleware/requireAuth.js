/**
 * Guard: exige req.user (populado por populateAuth).
 * Retorna 401 com payload padronizado se ausente.
 * Deve ser usado APÓS app.use(populateAuth).
 */
function requireAuth(req, res, next) {
  if (req.user) {
    return next();
  }
  return res.status(401).json({ error: 'UNAUTHENTICATED' });
}

module.exports = { requireAuth };
