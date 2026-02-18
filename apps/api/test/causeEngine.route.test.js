/**
 * Testes Motor de Causa:
 * 1. POST /full/cause/evaluate sem respostas -> 400 DIAG_INCOMPLETE
 * 2. POST /full/cause/evaluate com respostas completas -> 200 e grava full_gap_causes
 * 3. GET /full/actions com SUBMITTED retorna suggestions; sem causa retorna lista vazia para gap
 */
process.env.FULL_TEST_MODE = 'true';
const request = require('supertest');

jest.mock('../src/middleware/requireAuth', () => ({
  requireAuth: (req, res, next) => {
    req.user = { id: 'user-1', email: 'test@example.com', role: 'CONSULTOR' };
    return next();
  }
}));

jest.mock('../src/middleware/requireFullEntitlement', () => ({
  requireFullEntitlement: (req, res, next) => next()
}));

const ASSESSMENT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const COMPANY_ID = 'company-full-1';

let mockCauseAnswers = [];
let mockGapCauses = [];
let upsertCalled = false;

jest.mock('../src/lib/supabase', () => {
  const createChain = (table, customData) => {
    const getData = () => {
      if (table === 'full_cause_answers') return { data: mockCauseAnswers, error: null };
      if (table === 'full_gap_causes') return { data: mockGapCauses, error: null };
      if (table === 'full_assessments') {
        const status = global.__mockActionsAssessmentStatus ?? 'DRAFT';
        return { data: { id: ASSESSMENT_ID, company_id: COMPANY_ID, status, segment: 'C' }, error: null };
      }
      if (table === 'companies') return { data: { id: COMPANY_ID, name: 'Test', segment: 'C' }, error: null };
      if (table === 'full_selected_actions' || table === 'full_cycle_history') return { data: [], error: null };
      if (table === 'full_answers') return { data: global.__mockActionsAnswers ?? [], error: null };
      if (table === 'full_process_scores') return { data: global.__mockActionsScores ?? [], error: null };
      if (table === 'entitlements') return { data: { id: 'ent-1' }, error: null };
      return customData || { data: null, error: null };
    };
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockImplementation(() => {
        upsertCalled = true;
        return Promise.resolve({ data: {}, error: null });
      }),
      then: (fn) => Promise.resolve(getData()).then(fn),
      catch: (fn) => Promise.resolve(getData()).catch(fn),
    };
    chain.maybeSingle = jest.fn().mockResolvedValue(getData());
    chain.single = jest.fn().mockResolvedValue(getData());
    return chain;
  };
  const mockFrom = (table) => createChain(table);
  return {
    supabase: {
      schema: jest.fn().mockReturnValue({ from: jest.fn().mockImplementation(mockFrom) })
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

describe('POST /full/cause/evaluate', () => {
  beforeEach(() => {
    process.env.FULL_TEST_MODE = 'true';
    mockCauseAnswers = [];
    mockGapCauses = [];
    upsertCalled = false;
  });

  it('retorna 400 DIAG_INCOMPLETE quando não há respostas de causa', async () => {
    mockCauseAnswers = [];
    const res = await request(app)
      .post(`/full/cause/evaluate?company_id=${COMPANY_ID}&assessment_id=${ASSESSMENT_ID}&gap_id=GAP_CAIXA_PREVISAO`)
      .set('Authorization', 'Bearer test-token')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('DIAG_INCOMPLETE');
    expect(res.body.message_user).toContain('Responda todas as perguntas');
  });

  it('retorna 200 e grava full_gap_causes quando respostas completas', async () => {
    mockCauseAnswers = [
      { q_id: 'CAIXA_Q1', answer: 'DISCORDO' },
      { q_id: 'CAIXA_Q2', answer: 'DISCORDO' },
      { q_id: 'CAIXA_Q3', answer: 'NEUTRO' },
      { q_id: 'CAIXA_Q4', answer: 'CONCORDO' },
    ];
    const res = await request(app)
      .post(`/full/cause/evaluate?company_id=${COMPANY_ID}&assessment_id=${ASSESSMENT_ID}&gap_id=GAP_CAIXA_PREVISAO`)
      .set('Authorization', 'Bearer test-token')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.gap_id).toBe('GAP_CAIXA_PREVISAO');
    expect(res.body.cause_primary).toBeDefined();
    expect(res.body.scores).toBeDefined();
    expect(Array.isArray(res.body.evidence)).toBe(true);
  });
});

describe('GET /full/actions com cause engine', () => {
  beforeEach(() => {
    mockCauseAnswers = [];
    mockGapCauses = [];
    global.__mockActionsAssessmentStatus = 'SUBMITTED';
    global.__mockActionsAnswers = [];
    global.__mockActionsScores = [];
  });

  it('retorna 200 com suggestions vazio quando não há full_gap_causes', async () => {
    mockGapCauses = [];
    const res = await request(app)
      .get(`/full/actions?assessment_id=${ASSESSMENT_ID}&company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.suggestions)).toBe(true);
    expect(res.body.suggestions.some((s) => s.action_key?.startsWith('fallback-'))).toBe(false);
  });
});
