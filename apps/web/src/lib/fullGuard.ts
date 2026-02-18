import { Entitlement } from './entitlement';

/** Bypass temporário para testes — remover quando regras de pagamento estiverem prontas */
const FULL_BYPASS_TEST_EMAIL = 'fca@fca.com';

function isFullBypassUser(email: string | null | undefined): boolean {
  return !!email && String(email).trim().toLowerCase() === FULL_BYPASS_TEST_EMAIL.toLowerCase();
}

/**
 * Gate centralizado: FULL/ACTIVE, is_admin ou can_access_full.
 * Admin nunca cai em paywall e não exige conclusão do LIGHT.
 * @param userEmail - Opcional: se fca@fca.com, bypass (não redireciona para paywall)
 */
export function assertFullAccess(entitlement?: Entitlement | null, userEmail?: string | null): boolean {
  if (isFullBypassUser(userEmail)) return true;
  if (!entitlement) return false;
  if (entitlement.is_admin) return true;
  if (entitlement.plan === 'FULL' && entitlement.status === 'ACTIVE') return true;
  if (entitlement.can_access_full) return true;
  return false;
}
