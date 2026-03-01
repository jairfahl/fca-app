/**
 * Testes de contrato: GET /full/causes/pending, POST /full/causes/answer, GET /full/causes
 */
process.env.FULL_TEST_MODE = 'true';
const request = require('supertest');

jest.mock('../src/middleware/requireAuth', () => ({
  requireAuth: (req, res, next) => {
    req.user = { id: 'user-1', email: 'test@example.com', role: 'USER' };
    return next();
  }
}));

jest.mock('../src/middleware/requireFullEntitlement', () => ({
  requireFullEntitlement: (req, res, next) => next()
}));

const ASSESSMENT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const COMPANY_ID = 'company-full-1';

let mockGapInstances = [];
let mockGapCauses = [];

jest.mock('../src/lib/supabase', () => {
  const createChain = (table) => {
    const getData = () => {
      if (table === 'full_gap_instances') return { data: mockGapInstances, error: null };
      if (table === 'full_gap_causes') return { data: mockGapCauses, error: null };
      if (table === 'full_assessments') {
        return { data: { id: ASSESSMENT_ID, company_id: COMPANY_ID, status: 'SUBMITTED', segment: 'C' }, error: null };
      }
      if (table === 'companies') return { data: { id: COMPANY_ID, name: 'Test', segment: 'C' }, error: null };
      if (table === 'full_cause_answers') return { data: [], error: null };
      return { data: null, error: null };
    };
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockResolvedValue({ data: {}, error: null }),
      update: jest.fn().mockReturnThis(),
      insert: jest.fn().mockResolvedValue({ data: {}, error: null }),
      maybeSingle: jest.fn().mockImplementation(() => {
        if (table === 'full_gap_instances') {
          const first = mockGapInstances[0] ?? null;
          return Promise.resolve({ data: first, error: null });
        }
        return Promise.resolve(getData());
      }),
      single: jest.fn().mockResolvedValue(getData()),
    };
    chain.then = (fn) => Promise.resolve(getData()).then(fn);
    chain.catch = (fn) => Promise.resolve(getData()).catch(fn);
    return chain;
  };
  return {
    supabase: {
      schema: jest.fn().mockReturnValue({ from: jest.fn().mockImplementation(createChain) })
    }
  };
});

jest.mock('../src/lib/companyAccess', () => ({
  ensureCompanyAccess: jest.fn().mockResolvedValue({ id: COMPANY_ID, name: 'Test', segment: 'C' }),
  ensureConsultantOrOwnerAccess: jest.fn().mockResolvedValue({ id: COMPANY_ID })
}));

jest.mock('../src/lib/canAccessFull', () => ({
  canAccessFull: jest.fn().mockResolvedValue(true)
}));

const app = require('../src/app');

describe('GET /full/causes/pending', () => {
  beforeEach(() => {
    mockGapInstances = [];
    mockGapCauses = [];
  });

  it('retorna 400 quando faltam params', async () => {
    const res = await request(app)
      .get('/full/causes/pending')
      .set('Authorization', 'Bearer test-token');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PARAMS_REQUIRED');
  });

  it('retorna 200 com pending vazio quando não há gap_instances', async () => {
    mockGapInstances = [];
    const res = await request(app)
      .get(`/full/causes/pending?assessment_id=${ASSESSMENT_ID}&company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer test-token');
    expect(res.status).toBe(200);
    expect(res.body.pending).toEqual([]);
    expect(res.body.assessment_id).toBe(ASSESSMENT_ID);
  });

  it('retorna 200 com gaps pendentes e perguntas quando há instances CAUSE_PENDING', async () => {
    mockGapInstances = [
      { id: 'gi-1', gap_id: 'GAP_CAIXA_PREVISAO', process_key: 'ADM_FIN', status: 'CAUSE_PENDING', detected_at: new Date().toISOString() },
    ];
    const res = await request(app)
      .get(`/full/causes/pending?assessment_id=${ASSESSMENT_ID}&company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer test-token');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.pending)).toBe(true);
    expect(res.body.pending.length).toBeGreaterThanOrEqual(1);
    const first = res.body.pending[0];
    expect(first.gap_id).toBe('GAP_CAIXA_PREVISAO');
    expect(first.process_key).toBe('ADM_FIN');
    expect(Array.isArray(first.cause_questions)).toBe(true);
    expect(first.cause_questions.length).toBeGreaterThan(0);
  });
});

describe('POST /full/causes/answer', () => {
  beforeEach(() => {
    mockGapInstances = [{ id: 'gi-1', gap_id: 'GAP_CAIXA_PREVISAO', status: 'CAUSE_PENDING' }];
    mockGapCauses = [];
  });

  it('retorna 400 quando faltam params', async () => {
    const res = await request(app)
      .post('/full/causes/answer')
      .set('Authorization', 'Bearer test-token')
      .send({ gap_id: 'GAP_CAIXA_PREVISAO', answers: [] });
    expect(res.status).toBe(400);
  });

  it('retorna 400 GAP_NOT_PENDING quando gap não está pendente', async () => {
    mockGapInstances = [];
    const res = await request(app)
      .post(`/full/causes/answer?assessment_id=${ASSESSMENT_ID}&company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer test-token')
      .send({
        gap_id: 'GAP_CAIXA_PREVISAO',
        answers: [
          { q_id: 'CAIXA_Q1', answer: 'DISCORDO' },
          { q_id: 'CAIXA_Q2', answer: 'DISCORDO' },
          { q_id: 'CAIXA_Q3', answer: 'NEUTRO' },
          { q_id: 'CAIXA_Q4', answer: 'CONCORDO' },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('GAP_NOT_PENDING');
  });

  it('retorna 400 DIAG_INCOMPLETE quando faltam respostas', async () => {
    const res = await request(app)
      .post(`/full/causes/answer?assessment_id=${ASSESSMENT_ID}&company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer test-token')
      .send({
        gap_id: 'GAP_CAIXA_PREVISAO',
        answers: [{ q_id: 'CAIXA_Q1', answer: 'DISCORDO' }],
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('DIAG_INCOMPLETE');
  });

  it('retorna 200 e classificação quando respostas completas e gap pendente', async () => {
    const res = await request(app)
      .post(`/full/causes/answer?assessment_id=${ASSESSMENT_ID}&company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer test-token')
      .send({
        gap_id: 'GAP_CAIXA_PREVISAO',
        answers: [
          { q_id: 'CAIXA_Q1', answer: 'DISCORDO' },
          { q_id: 'CAIXA_Q2', answer: 'DISCORDO' },
          { q_id: 'CAIXA_Q3', answer: 'NEUTRO' },
          { q_id: 'CAIXA_Q4', answer: 'CONCORDO' },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.gap_id).toBe('GAP_CAIXA_PREVISAO');
    expect(res.body.cause_primary).toBeDefined();
    expect(res.body.cause_label).toBeDefined();
    expect(Array.isArray(res.body.evidence)).toBe(true);
  });
});

describe('GET /full/causes', () => {
  beforeEach(() => {
    mockGapCauses = [
      { gap_id: 'GAP_CAIXA_PREVISAO', cause_primary: 'CAUSE_RITUAL', cause_secondary: null, evidence_json: [], version: '1.0.0' },
    ];
  });

  it('retorna 400 quando faltam params', async () => {
    const res = await request(app)
      .get('/full/causes')
      .set('Authorization', 'Bearer test-token');
    expect(res.status).toBe(400);
  });

  it('retorna 200 com classificações e rastreabilidade', async () => {
    const res = await request(app)
      .get(`/full/causes?assessment_id=${ASSESSMENT_ID}&company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer test-token');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.classifications)).toBe(true);
    expect(res.body.assessment_id).toBe(ASSESSMENT_ID);
    const c = res.body.classifications[0];
    expect(c.gap_id).toBe('GAP_CAIXA_PREVISAO');
    expect(c.cause_primary).toBe('CAUSE_RITUAL');
    expect(c.cause_label).toBeDefined();
    expect(Array.isArray(c.evidence)).toBe(true);
  });
});
