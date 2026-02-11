/**
 * Utilitário central de autorização FULL.
 * Regras (em ordem):
 * 1. FULL_TEST_MODE=true → true
 * 2. userEmail ∈ FULL_ADMIN_WHITELIST → true
 * 3. entitlement FULL/ACTIVE para (userId, companyId) → true
 * 4. Caso contrário → false
 *
 * @param {Object} opts
 * @param {string} opts.userEmail - Email do usuário (ex: admin@fca.com)
 * @param {string} opts.userId - UUID do usuário
 * @param {string} opts.companyId - UUID da company
 * @param {Object} opts.supabase - Cliente Supabase
 * @returns {Promise<boolean>}
 */
const ADMIN_EMAIL = 'admin@fca.com';

async function resolveEmail(userEmail, userId, supabaseClient) {
  const fromArg = userEmail && String(userEmail).trim();
  if (fromArg) return fromArg.toLowerCase();
  const { data: { user }, error } = await supabaseClient.auth.admin.getUserById(userId);
  if (error || !user?.email) return null;
  return String(user.email).trim().toLowerCase();
}

async function canAccessFull({ userEmail, userId, companyId, supabase }) {
  const email = await resolveEmail(userEmail, userId, supabase);

  // 0. ADMIN OVERRIDE (não negociável - sempre FULL total)
  if (email === ADMIN_EMAIL.toLowerCase()) {
    return true;
  }

  // 1. FULL_TEST_MODE
  const testMode = process.env.FULL_TEST_MODE === 'true' || process.env.FULL_TEST_MODE === '1';
  if (testMode) return true;

  // 2. Whitelist
  const whitelistRaw = process.env.FULL_ADMIN_WHITELIST || '';
  const whitelist = whitelistRaw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
  if (email && whitelist.includes(email)) {
    return true;
  }

  // 3. Entitlement FULL/ACTIVE
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
 *
 * @param {string} userEmail - Email do usuário
 * @returns {boolean}
 */
function canActivateFullTest(userEmail) {
  if (userEmail && userEmail.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
    return true;
  }
  const testMode = process.env.FULL_TEST_MODE === 'true' || process.env.FULL_TEST_MODE === '1';
  if (testMode) return true;

  const whitelistRaw = process.env.FULL_ADMIN_WHITELIST || '';
  const whitelist = whitelistRaw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
  return userEmail && whitelist.includes(String(userEmail).trim().toLowerCase());
}

module.exports = { canAccessFull, canActivateFullTest };
