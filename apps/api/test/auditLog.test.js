/**
 * Testes unitários de apps/api/src/lib/auditLog.js
 *
 * Garantias:
 *   1. Falha no insert (supabase throws) NÃO propaga exceção para o chamador.
 *   2. O console.error é chamado com o prefixo [AUDIT_LOG_FAIL].
 *   3. Apenas os campos previstos chegam ao insert — sem dados sensíveis.
 *   4. Meta vazia por padrão quando omitida.
 */

const { logEvent } = require('../src/lib/auditLog');

function makeSupabase(insertImpl) {
  return {
    from: () => ({ insert: insertImpl }),
  };
}

describe('logEvent', () => {
  afterEach(() => jest.restoreAllMocks());

  it('silencia erro do supabase sem propagar exceção', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const broken = makeSupabase(() => { throw new Error('DB down'); });

    await expect(
      logEvent(broken, { event: 'plan_created', userId: 'u1', companyId: 'c1', assessmentId: 'a1' })
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith('[AUDIT_LOG_FAIL]', 'plan_created', 'DB down');
  });

  it('silencia rejeição de promise sem propagar exceção', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const broken = makeSupabase(() => Promise.reject(new Error('timeout')));

    await expect(
      logEvent(broken, { event: 'evidence_recorded', userId: 'u1', companyId: 'c1', assessmentId: 'a1' })
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith('[AUDIT_LOG_FAIL]', 'evidence_recorded', 'timeout');
  });

  it('envia apenas os campos previstos ao insert', async () => {
    const rows = [];
    const ok = makeSupabase((row) => { rows.push(row); return Promise.resolve({}); });

    await logEvent(ok, {
      event: 'gain_declared',
      userId: 'u1',
      companyId: 'c1',
      assessmentId: 'a1',
      meta: { action_key: 'COMERCIAL_ACAO_01', declared_gain: 'R$500' },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      event: 'gain_declared',
      user_id: 'u1',
      company_id: 'c1',
      assessment_id: 'a1',
      meta: { action_key: 'COMERCIAL_ACAO_01', declared_gain: 'R$500' },
    });
    // Garantia de ausência de campos sensíveis
    const keys = Object.keys(rows[0]);
    expect(keys).not.toContain('password');
    expect(keys).not.toContain('token');
    expect(keys).not.toContain('access_token');
  });

  it('usa meta vazia ({}) como default quando omitida', async () => {
    const rows = [];
    const ok = makeSupabase((row) => { rows.push(row); return Promise.resolve({}); });

    await logEvent(ok, { event: 'cause_classified', userId: 'u2', companyId: 'c2', assessmentId: 'a2' });

    expect(rows[0].meta).toEqual({});
  });
});
