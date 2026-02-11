import { Entitlement } from './entitlement';

/**
 * Gate centralizado: FULL/ACTIVE, is_admin ou can_access_full.
 * Admin nunca cai em paywall e não exige conclusão do LIGHT.
 */
export function assertFullAccess(entitlement?: Entitlement | null): boolean {
  if (!entitlement) return false;
  if (entitlement.is_admin) return true;
  if (entitlement.plan === 'FULL' && entitlement.status === 'ACTIVE') return true;
  if (entitlement.can_access_full) return true;
  return false;
}
