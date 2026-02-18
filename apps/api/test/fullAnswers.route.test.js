/**
 * Testes FULL: persistência de respostas, mesmo assessment_id em submit e novo ciclo
 */
const request = require('supertest');

jest.mock('../src/middleware/requireAuth', () => ({
  requireAuth: (req, res, next) => {
    req.user = { id: 'user-1', email: 'test@example.com' };
    return next();
  }
}));

jest.mock('../src/middleware/requireFullEntitlement', () => ({
  requireFullEntitlement: (req, res, next) => next()
}));

const ASSESSMENT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const COMPANY_ID = 'company-full-1';

jest.mock('../src/lib/supabase', () => {
  const mockSchemaFrom = (table) => {
    if (table === 'full_assessments') {
      const status = global.__mockFullAssessmentStatus || 'DRAFT';
      return createMockChain({ data: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', company_id: 'company-full-1', status }, error: null });
    }
    if (table === 'companies') {
      return createMockChain({ data: { id: 'company-full-1', name: 'Test', segment: 'C' }, error: null });
    }
    if (table === 'full_answers') {
      return createMockChain({
        data: [
          { process_key: 'COMERCIAL', question_key: 'Q01', answer_value: 5 },
          { process_key: 'COMERCIAL', question_key: 'Q02', answer_value: 6 }
        ],
        error: null
      });
    }
    if (table === 'full_process_catalog') {
      return createMockChain({ data: [{ key: 'COMERCIAL' }], error: null });
    }
    if (table === 'full_question_catalog') {
      return createMockChain({ data: [{ key: 'Q01' }, { key: 'Q02' }], error: null });
    }
    if (table === 'full_process_scores') {
      return createMockChain({ data: [], error: null });
    }
    if (table === 'full_findings') {
      return createMockChain({ data: [], error: null });
    }
    if (table === 'full_selected_actions') {
      return createMockChain({ data: [], error: null });
    }
    if (table === 'full_cycle_history') {
      return createMockChain({ data: null, error: null });
    }
    if (table === 'full_action_evidence') {
      return createMockChain({ data: [], error: null });
    }
    return createMockChain({ data: null, error: null });
  };
  function createMockChain(resolved) {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue(resolved),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      insert: jest.fn().mockResolvedValue({ error: null }),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockResolvedValue({ error: null })
    };
    chain.then = (fn) => Promise.resolve(resolved).then(fn);
    chain.catch = (fn) => Promise.resolve(resolved).catch(fn);
    return chain;
  }
  return {
    supabase: {
      schema: jest.fn().mockReturnValue({ from: jest.fn().mockImplementation(mockSchemaFrom) })
    }
  };
});

jest.mock('../src/lib/companyAccess', () => ({
  ensureCompanyAccess: jest.fn().mockResolvedValue({ id: COMPANY_ID, name: 'Test', segment: 'C' }),
  ensureConsultantOrOwnerAccess: jest.fn().mockResolvedValue({ id: COMPANY_ID })
}));

const app = require('../src/app');

describe('FULL answers flow', () => {
  it('PUT answers salva e GET answers retorna count', async () => {
    const putRes = await request(app)
      .put(`/full/assessments/${ASSESSMENT_ID}/answers?company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer test-token')
      .send({
        process_key: 'COMERCIAL',
        answers: [
          { question_key: 'Q01', answer_value: 5 },
          { question_key: 'Q02', answer_value: 6 }
        ]
      });

    expect(putRes.status).toBe(200);
    expect(putRes.body.ok).toBe(true);
    expect(putRes.body.count).toBe(2);

    const getRes = await request(app)
      .get(`/full/assessments/${ASSESSMENT_ID}/answers?company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer test-token');

    expect(getRes.status).toBe(200);
    expect(getRes.body.answers).toBeDefined();
    expect(Array.isArray(getRes.body.answers)).toBe(true);
    expect(getRes.body.count).toBeDefined();
    expect(getRes.body.count).toBeGreaterThanOrEqual(0);
  });

  it('GET /full/answers?assessment_id=&company_id= retorna count', async () => {
    const res = await request(app)
      .get(`/full/answers?assessment_id=${ASSESSMENT_ID}&company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('answers');
    expect(res.body).toHaveProperty('count');
    expect(Array.isArray(res.body.answers)).toBe(true);
  });

  it('GET /full/answers sem assessment_id retorna 400', async () => {
    const res = await request(app)
      .get(`/full/answers?company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(400);
  });

  it('GET /full/answers sem company_id retorna 400', async () => {
    const res = await request(app)
      .get(`/full/answers?assessment_id=${ASSESSMENT_ID}`)
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(400);
  });

  it('new-cycle retorna mesmo assessment_id (não cria novo)', async () => {
    global.__mockFullAssessmentStatus = 'CLOSED';
    try {
      const res = await request(app)
        .post(`/full/assessments/${ASSESSMENT_ID}/new-cycle?company_id=${COMPANY_ID}`)
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.assessment_id).toBe(ASSESSMENT_ID);
      expect(res.body.cycle_no).toBeDefined();
    } finally {
      delete global.__mockFullAssessmentStatus;
    }
  });

  it('new-cycle rejeita assessment não CLOSED', async () => {
    global.__mockFullAssessmentStatus = 'DRAFT';
    try {
      const res = await request(app)
        .post(`/full/assessments/${ASSESSMENT_ID}/new-cycle?company_id=${COMPANY_ID}`)
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(400);
    } finally {
      delete global.__mockFullAssessmentStatus;
    }
  });
});
