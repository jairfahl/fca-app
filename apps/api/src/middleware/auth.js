/**
 * Middleware de autenticação: popula req.user a partir do JWT.
 * Não falha em token ausente/inválido — deixa req.user vazio.
 * O guard requireAuth devolve 401 quando req.user inexistente.
 */
const { createRemoteJWKSet, jwtVerify } = require('jose');

const ROLES = ['USER', 'CONSULTOR', 'ADMIN'];
const ROLE_ORDER = { USER: 0, CONSULTOR: 1, ADMIN: 2 };

async function populateAuth(req, res, next) {
  try {
    req.user = undefined;

    const supabaseUrl = process.env.SUPABASE_URL;
    if (!supabaseUrl) {
      return next();
    }

    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return next();
    }

    const token = auth.slice('Bearer '.length).trim();
    if (!token) {
      return next();
    }

    const jwksUrl = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1/.well-known/jwks.json`;
    const issuer = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1`;
    const JWKS = createRemoteJWKSet(new URL(jwksUrl));

    let verified;
    try {
      verified = await jwtVerify(token, JWKS, { issuer, audience: 'authenticated' });
    } catch {
      return next();
    }

    const payload = verified.payload || {};
    const appMeta = payload.app_metadata || {};
    const userMeta = payload.user_metadata || {};
    const email = payload.email ? String(payload.email) : null;

    if (!payload.sub) {
      return next();
    }

    let role = appMeta.role || userMeta.role;
    if (!ROLES.includes(role)) {
      role = 'USER';
    }

    // Fallback: JWT com USER pode estar desatualizado; consultar Admin API
    if (role === 'USER') {
      try {
        const { supabase } = require('../lib/supabase');
        const { data: { user: adminUser } } = await supabase.auth.admin.getUserById(payload.sub);
        const metaRole = adminUser?.app_metadata?.role || adminUser?.user_metadata?.role;
        if (ROLES.includes(metaRole) && metaRole !== 'USER') {
          role = metaRole;
        }
      } catch {
        /* manter USER */
      }
    }

    req.user = {
      id: String(payload.sub),
      email,
      role,
    };

    return next();
  } catch (err) {
    console.error('[auth] populateAuth unexpected:', err?.message || err);
    return next();
  }
}

module.exports = { populateAuth, ROLES, ROLE_ORDER };
