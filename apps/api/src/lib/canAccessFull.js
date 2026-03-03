/**
 * Utilitário central de autorização FULL.
 * Regras (em ordem):
 * 0. FULL_BYPASS_TEST_EMAIL (env ou fca@fca.com) → true [bypass temporário]
 * 1. FULL_TEST_MODE=true → true
 * 2. userEmail ∈ FULL_ADMIN_WHITELIST → true
 * 3. userEmail === FULL_ADMIN_EMAIL → true
 * 4. entitlement FULL/ACTIVE para (userId, companyId) → true
 * 5. Caso contrário → false
 *
 * @param {Object} opts
 * @param {string} opts.userEmail - Email do usuário
 * @param {string} opts.userId - UUID do usuário
 * @param {string} opts.companyId - UUID da company
 * @param {Object} opts.supabase - Cliente Supabase
 * @returns {Promise<boolean>}
 */
const { TEST_MODE, BYPASS_TEST_EMAIL, ADMIN_EMAIL, ADMIN_WHITELIST } = require('./fullConfig');

function isFullBypassUser(email) {
  return !!email && String(email).trim().toLowerCase() === BYPASS_TEST_EMAIL;
}

async function resolveEmail(userEmail, userId, supabaseClient) {
  const fromArg = userEmail && String(userEmail).trim();
  if (fromArg) return fromArg.toLowerCase();
  const { data: { user }, error } = await supabaseClient.auth.admin.getUserById(userId);
  if (error || !user?.email) return null;
  return String(user.email).trim().toLowerCase();
}

async function canAccessFull({ userEmail, userId, companyId, supabase }) {
  const email = await resolveEmail(userEmail, userId, supabase);

  // 0. Bypass teste — controlado por FULL_BYPASS_TEST_EMAIL env var
  if (isFullBypassUser(email)) {
    return true;
  }

  // 1. FULL_TEST_MODE
  if (TEST_MODE) return true;

  // 2. Admin email — acesso total
  if (email === ADMIN_EMAIL) {
    return true;
  }

  // 3. Whitelist
  if (email && ADMIN_WHITELIST.includes(email)) {
    return true;
  }

  // 4. Entitlement FULL/ACTIVE
  if (!companyId) return false;
  const { data: entitlement } = await supabase
    .schema('public')
    .from('entitlements')
    .select('id')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .eq('plan', 'FULL')
    .eq('status', 'ACTIVE')
    .maybeSingle();

  return !!entitlement;
}

/**
 * Verifica se o usuário pode ativar FULL em modo teste (whitelist ou FULL_TEST_MODE).
 * Usado para POST /entitlements/full/activate_test.
 */
function canActivateFullTest(userEmail) {
  if (isFullBypassUser(userEmail)) return true;
  const email = userEmail ? String(userEmail).trim().toLowerCase() : null;
  if (email === ADMIN_EMAIL) return true;
  if (TEST_MODE) return true;
  return email ? ADMIN_WHITELIST.includes(email) : false;
}

module.exports = { canAccessFull, canActivateFullTest, isFullBypassUser };
