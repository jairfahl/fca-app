import { apiFetch } from './api';

export type EntitlementPlan = 'LIGHT' | 'FULL' | 'UNKNOWN';
export type EntitlementStatus = 'ACTIVE' | 'INACTIVE' | 'UNKNOWN';

export type Entitlement = {
  plan: EntitlementPlan;
  status: EntitlementStatus;
  can_access_full?: boolean;
  is_admin?: boolean;
  raw?: any;
};

function normalizeEntitlement(input: any): Entitlement {
  const rawPlan = input?.plan;
  const rawStatus = input?.status;

  const plan: EntitlementPlan =
    rawPlan === 'FULL' || rawPlan === 'LIGHT' ? rawPlan : 'UNKNOWN';
  const status: EntitlementStatus =
    rawStatus === 'ACTIVE' || rawStatus === 'INACTIVE' ? rawStatus : 'UNKNOWN';

  return {
    plan,
    status,
    can_access_full: Boolean(input?.can_access_full),
    is_admin: Boolean(input?.is_admin),
    raw: input,
  };
}

export async function getEntitlement(companyId: string, token: string): Promise<Entitlement> {
  try {
    const data = await apiFetch(
      `/entitlements?company_id=${companyId}`,
      {},
      token
    );
    return normalizeEntitlement(data);
  } catch {
    return { plan: 'UNKNOWN', status: 'UNKNOWN', can_access_full: false, is_admin: false };
  }
}

/**
 * Ativa FULL em modo teste (whitelist ou FULL_TEST_MODE).
 * Persiste entitlement e retorna ok.
 */
export async function activateFullTest(companyId: string, token: string): Promise<{ ok: boolean }> {
  const data = await apiFetch(
    `/entitlements/full/activate_test?company_id=${companyId}`,
    { method: 'POST' },
    token
  );
  return { ok: data?.ok === true };
}
