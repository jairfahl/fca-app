/**
 * Testes fix-evidence-enforcement:
 * - DONE exige ≥ 1 evidência registrada (400 EVIDENCE_REQUIRED)
 * - DROPPED exige drop_reason ≥ 20 chars (400 DROP_REASON_REQUIRED)
 * - Evidence write-once: 2ª chamada → 409 EVIDENCE_WRITE_ONCE
 *
 * Rotas testadas:
 *   POST /full/actions/:action_key/status
 *   POST /full/actions/:action_key/evidence
 */
const request = require('supertest');

jest.mock('../src/middleware/requireAuth', () => ({
  requireAuth: (req, res, next) => {
    req.user = { id: 'user-1', email: 'test@example.com' };
    return next();
  },
}));

jest.mock('../src/middleware/requireFullEntitlement', () => ({
  requireFullEntitlement: (req, res, next) => next(),
}));

const ASSESSMENT_ID = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
const COMPANY_ID = 'company-ev-1';
const ACTION_KEY = 'OPERACOES_ACAO_MAPEAR_ENTREGA';

jest.mock('../src/lib/supabase', () => {
  const mockGetData = (table) => {
    if (table === 'full_assessments') {
      return {
        data: { id: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff', company_id: 'company-ev-1', status: 'SUBMITTED', segment: 'C' },
        error: null,
      };
    }
    if (table === 'full_action_dod_confirmations') {
      const exists = global.__mockDodExists !== false;
      return { data: exists ? { assessment_id: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff' } : null, error: null };
    }
    if (table === 'full_action_evidence') {
      const exists = global.__mockEvidenceExists === true;
      return {
        data: exists ? { assessment_id: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff', action_key: 'OPERACOES_ACAO_MAPEAR_ENTREGA' } : null,
        error: null,
      };
    }
    if (table === 'full_selected_actions') {
      return {
        data: { action_key: 'OPERACOES_ACAO_MAPEAR_ENTREGA', status: 'DONE', assessment_id: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff' },
        error: null,
      };
    }
    return { data: null, error: null };
  };

  const createChain = (table) => {
    const result = mockGetData(table);
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue(result),
      single: jest.fn().mockResolvedValue({ data: { id: 'new-ev', action_key: 'OPERACOES_ACAO_MAPEAR_ENTREGA' }, error: null }),
      then: (resolve) => Promise.resolve(result).then(resolve),
      catch: (fn) => Promise.resolve(result).catch(fn),
    };
    return chain;
  };

  return {
    supabase: {
      schema: jest.fn().mockReturnValue({ from: jest.fn().mockImplementation(createChain) }),
    },
  };
});

jest.mock('../src/lib/companyAccess', () => ({
  ensureCompanyAccess: jest.fn().mockResolvedValue({ id: 'company-ev-1', name: 'Test', segment: 'C' }),
  ensureConsultantOrOwnerAccess: jest.fn().mockResolvedValue({ id: 'company-ev-1' }),
}));

const app = require('../src/app');

describe('POST /full/actions/:action_key/status — DONE exige evidência', () => {
  beforeEach(() => {
    global.__mockDodExists = true;
    global.__mockEvidenceExists = false;
  });

  it('retorna 200 quando DONE com evidência registrada', async () => {
    global.__mockEvidenceExists = true;
    const res = await request(app)
      .post(`/full/actions/${encodeURIComponent(ACTION_KEY)}/status?company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer test-token')
      .send({ assessment_id: ASSESSMENT_ID, status: 'DONE' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('DONE');
  });

  it('retorna 400 EVIDENCE_REQUIRED quando DONE sem evidência', async () => {
    global.__mockEvidenceExists = false;
    const res = await request(app)
      .post(`/full/actions/${encodeURIComponent(ACTION_KEY)}/status?company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer test-token')
      .send({ assessment_id: ASSESSMENT_ID, status: 'DONE' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('EVIDENCE_REQUIRED');
    expect(res.body.message_user).toContain('evidência');
  });

  it('retorna 400 DROP_REASON_REQUIRED quando DROPPED com motivo < 20 chars', async () => {
    const res = await request(app)
      .post(`/full/actions/${encodeURIComponent(ACTION_KEY)}/status?company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer test-token')
      .send({ assessment_id: ASSESSMENT_ID, status: 'DROPPED', dropped_reason: 'curto' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('DROP_REASON_REQUIRED');
    expect(res.body.message_user).toContain('20');
  });
});

describe('POST /full/actions/:action_key/evidence — write-once', () => {
  beforeEach(() => {
    global.__mockEvidenceExists = false;
  });

  it('retorna 409 EVIDENCE_WRITE_ONCE quando evidência já existe', async () => {
    global.__mockEvidenceExists = true;
    const res = await request(app)
      .post(`/full/actions/${encodeURIComponent(ACTION_KEY)}/evidence?company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer test-token')
      .send({
        assessment_id: ASSESSMENT_ID,
        evidencia: 'Texto da evidência registrada',
        antes: 'Estado anterior ao início',
        depois: 'Estado posterior à conclusão',
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EVIDENCE_WRITE_ONCE');
    expect(res.body.message_user).toContain('Evidência já registrada');
  });
});
