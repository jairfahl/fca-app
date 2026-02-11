type AuditPayload = Record<string, any>;

export function auditLog(event: string, payload: AuditPayload = {}) {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  try {
    console.log(`[AUDIT] ${event}`, payload);
  } catch {
    // noop
  }
}
