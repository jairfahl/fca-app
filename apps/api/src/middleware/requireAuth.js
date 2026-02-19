const { createRemoteJWKSet, jwtVerify } = require('jose');

function json401(res, msg) {
  return res.status(401).json({ error: msg });
}

async function requireAuth(req, res, next) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;

    if (!supabaseUrl) {
      console.error('AUTH FAIL reason=SUPABASE_URL missing');
      return res.status(500).json({ error: 'server misconfigured' });
    }

    const auth = req.headers.authorization;

    if (!auth) {
      console.warn('AUTH FAIL reason=missing token');
      return json401(res, 'missing token');
    }

    if (!auth.startsWith('Bearer ')) {
      console.warn('AUTH FAIL reason=invalid token format');
      return json401(res, 'invalid token format');
    }

    const token = auth.slice('Bearer '.length).trim();

    if (!token) {
      console.warn('AUTH FAIL reason=empty token');
      return json401(res, 'invalid token');
    }

    const jwksUrl = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1/.well-known/jwks.json`;
    const issuer = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1`;

    const JWKS = createRemoteJWKSet(new URL(jwksUrl));

    let verified;
    try {
      verified = await jwtVerify(token, JWKS, {
        issuer,
        audience: 'authenticated',
      });
    } catch (e) {
      console.warn(`AUTH FAIL reason=${(e && e.message) ? e.message : 'jwtVerify failed'}`);
      return json401(res, 'invalid token');
    }

    const payload = verified.payload || {};
    const appMeta = payload.app_metadata || {};
    const userMeta = payload.user_metadata || {};
    const email = payload.email ? String(payload.email) : null;

    if (!payload.sub) {
      console.warn('AUTH FAIL reason=missing sub');
      return json401(res, 'invalid token');
    }

    let role = appMeta.role || userMeta.role;
    let source = role ? (appMeta.role ? 'app_metadata' : 'user_metadata') : null;

    if (!['USER', 'CONSULTOR', 'ADMIN'].includes(role)) {
      role = 'USER';
      source = source || 'fallback';
    }

    if (role === 'USER') {
      try {
        const { supabase } = require('../lib/supabase');
        const { data: { user: adminUser } } = await supabase.auth.admin.getUserById(payload.sub);
        const metaRole = adminUser?.app_metadata?.role || adminUser?.user_metadata?.role;
        if (['CONSULTOR', 'ADMIN'].includes(metaRole)) {
          role = metaRole;
          source = 'admin_api';
        }
      } catch (_) { /* manter USER */ }
    }

    req.user = {
      id: String(payload.sub),
      email,
      role,
    };

    if (process.env.NODE_ENV !== 'production') {
      console.log(`AUTH OK email=${email} role=${role} source=${source || 'jwt'}`);
    } else {
      console.log(`AUTH OK sub=${req.user.id} role=${req.user.role}`);
    }
    return next();
  } catch (err) {
    console.error(`AUTH FAIL reason=unexpected ${(err && err.message) ? err.message : err}`);
    return res.status(500).json({ error: 'server error' });
  }
}

module.exports = { requireAuth };
