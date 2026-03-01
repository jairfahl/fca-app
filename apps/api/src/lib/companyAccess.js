/**
 * Helpers de acesso a company: owner, consultant (role CONSULTOR/ADMIN ou entitlement FULL/ACTIVE) ou admin.
 * Role vem do JWT (app_metadata.role). CONSULTOR e ADMIN podem acessar qualquer company_id.
 */
const { supabase } = require('./supabase');
const ADMIN_EMAIL = 'admin@fca.com';

async function resolveUserEmail(userId, userEmailFromJwt, supabaseClient) {
  const fromJwt = userEmailFromJwt && String(userEmailFromJwt).trim();
  if (fromJwt) return fromJwt.toLowerCase();
  const { data: { user }, error } = await supabaseClient.auth.admin.getUserById(userId);
  if (error || !user?.email) return null;
  return String(user.email).trim().toLowerCase();
}

async function ensureCompanyAccess(userId, companyId) {
  const { data, error } = await supabase
    .schema('public')
    .from('companies')
    .select('id, name, segment')
    .eq('id', companyId)
    .eq('owner_user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

/**
 * @param {string} userId
 * @param {string} companyId
 * @param {string|null} userEmailFromJwt
 * @param {string} [userRole] - USER | CONSULTOR | ADMIN (do JWT). CONSULTOR/ADMIN acessam qualquer company.
 */
async function ensureConsultantOrOwnerAccess(userId, companyId, userEmailFromJwt = null, userRole = 'USER') {
  // Role CONSULTOR ou ADMIN: acesso transversal a qualquer empresa
  if (userRole === 'CONSULTOR' || userRole === 'ADMIN') {
    const { data: company } = await supabase
      .schema('public')
      .from('companies')
      .select('id, name, segment')
      .eq('id', companyId)
      .maybeSingle();
    return company;
  }

  const owner = await ensureCompanyAccess(userId, companyId);
  if (owner) return owner;

  const email = await resolveUserEmail(userId, userEmailFromJwt, supabase);
  if (email === ADMIN_EMAIL.toLowerCase()) {
    const { data: company } = await supabase
      .schema('public')
      .from('companies')
      .select('id, name, segment')
      .eq('id', companyId)
      .maybeSingle();
    return company;
  }

  const { data: ent } = await supabase
    .schema('public')
    .from('entitlements')
    .select('id')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .eq('plan', 'FULL')
    .eq('status', 'ACTIVE')
    .maybeSingle();
  if (ent) {
    const { data: company } = await supabase
      .schema('public')
      .from('companies')
      .select('id, name, segment')
      .eq('id', companyId)
      .maybeSingle();
    return company;
  }
  return null;
}

module.exports = { ensureCompanyAccess, ensureConsultantOrOwnerAccess };
