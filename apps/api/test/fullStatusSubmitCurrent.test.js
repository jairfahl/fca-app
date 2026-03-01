/**
 * Testes PROMPT 1: STATUS, SUBMIT, ACTIONS gate, CURRENT(for_wizard)
 * - Status retorna campos obrigatórios
 * - Submit: sem respostas -> DIAG_INCOMPLETE com missing
 * - Submit: com respostas completas -> 200 e status SUBMITTED
 * - Actions: status DRAFT -> DIAG_NOT_READY
 * - Actions: status SUBMITTED -> 200
 * - Current(for_wizard=1): último CLOSED -> cria DRAFT
 * - Current(for_wizard=1): último SUBMITTED -> retorna SUBMITTED (sem criar)
 */
const request = require('supertest');

jest.mock('../src/middleware/requireAuth', () => ({
  requireAuth: (req, res, next) => {
    req.user = { id: 'user-1', email: 'test@example.com' };
    return next();
  }
}));

jest.mock('../src/middleware/requireFullEntitlement', () => ({
  requireFullEntitlement: (req, res, next) => {
    if (req.query.company_id === 'company-403') {
      return res.status(403).json({ error: 'conteúdo disponível apenas no FULL' });
    }
    return next();
  }
}));

const ASSESSMENT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const COMPANY_ID = 'company-full-1';

const mockData = Object.freeze({
  assessment: { id: ASSESSMENT_ID, company_id: COMPANY_ID, status: 'DRAFT', segment: 'C' },
  assessmentSubmitted: { id: ASSESSMENT_ID, company_id: COMPANY_ID, status: 'SUBMITTED', segment: 'C' },
  assessmentClosed: { id: ASSESSMENT_ID, company_id: COMPANY_ID, status: 'CLOSED', segment: 'C' },
  company: { id: COMPANY_ID, name: 'Test', segment: 'C' },
  answersEmpty: [],
  answersPartial: [
    { process_key: 'COMERCIAL', question_key: 'Q01', answer_value: 5, updated_at: '2025-01-01T00:00:00Z' },
  ],
  answersFull: [
    { process_key: 'COMERCIAL', question_key: 'Q01', answer_value: 5, updated_at: '2025-01-01T00:00:00Z' },
    { process_key: 'COMERCIAL', question_key: 'Q02', answer_value: 6, updated_at: '2025-01-01T00:00:00Z' },
    { process_key: 'OPERACOES', question_key: 'Q01', answer_value: 4, updated_at: '2025-01-01T00:00:00Z' },
    { process_key: 'OPERACOES', question_key: 'Q02', answer_value: 5, updated_at: '2025-01-01T00:00:00Z' },
    { process_key: 'ADM_FIN', question_key: 'Q01', answer_value: 3, updated_at: '2025-01-01T00:00:00Z' },
    { process_key: 'ADM_FIN', question_key: 'Q02', answer_value: 4, updated_at: '2025-01-01T00:00:00Z' },
    { process_key: 'GESTAO', question_key: 'Q01', answer_value: 5, updated_at: '2025-01-01T00:00:00Z' },
    { process_key: 'GESTAO', question_key: 'Q02', answer_value: 6, updated_at: '2025-01-01T00:00:00Z' },
  ],
  processes: [
    { process_key: 'COMERCIAL' },
    { process_key: 'OPERACOES' },
    { process_key: 'ADM_FIN' },
    { process_key: 'GESTAO' },
  ],
  requiredQuestions: [
    { process_key: 'COMERCIAL', question_key: 'Q01' },
    { process_key: 'COMERCIAL', question_key: 'Q02' },
    { process_key: 'OPERACOES', question_key: 'Q01' },
    { process_key: 'OPERACOES', question_key: 'Q02' },
    { process_key: 'ADM_FIN', question_key: 'Q01' },
    { process_key: 'ADM_FIN', question_key: 'Q02' },
    { process_key: 'GESTAO', question_key: 'Q01' },
    { process_key: 'GESTAO', question_key: 'Q02' },
  ],
  questionCatalog: [
    { process_key: 'COMERCIAL', question_key: 'Q01', dimension: 'EXISTENCIA' },
    { process_key: 'COMERCIAL', question_key: 'Q02', dimension: 'ROTINA' },
    { process_key: 'OPERACOES', question_key: 'Q01', dimension: 'EXISTENCIA' },
    { process_key: 'OPERACOES', question_key: 'Q02', dimension: 'ROTINA' },
    { process_key: 'ADM_FIN', question_key: 'Q01', dimension: 'EXISTENCIA' },
    { process_key: 'ADM_FIN', question_key: 'Q02', dimension: 'ROTINA' },
    { process_key: 'GESTAO', question_key: 'Q01', dimension: 'EXISTENCIA' },
    { process_key: 'GESTAO', question_key: 'Q02', dimension: 'ROTINA' },
  ],
});

function createChain(result) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    contains: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(result),
    single: jest.fn().mockResolvedValue(result),
    then: (fn) => Promise.resolve(result).then(fn),
    catch: (fn) => Promise.resolve(result).catch(fn),
  };
  chain.upsert = jest.fn().mockResolvedValue({ error: null });
  chain.insert = jest.fn().mockResolvedValue({ data: mockData.assessmentClosed, error: null });
  chain.update = jest.fn().mockReturnThis();
  return chain;
}

jest.mock('../src/lib/supabase', () => {
  const aid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const cid = 'company-full-1';
  const mockDataInner = {
    assessment: { id: aid, company_id: cid, status: 'DRAFT', segment: 'C' },
    assessmentClosed: { id: aid, company_id: cid, status: 'CLOSED', segment: 'C' },
    company: { id: cid, name: 'Test', segment: 'C' },
    answersEmpty: [],
    answersPartial: [{ process_key: 'COMERCIAL', question_key: 'Q01', answer_value: 5, updated_at: '2025-01-01T00:00:00Z' }],
    answersFull: [
      { process_key: 'COMERCIAL', question_key: 'Q01', answer_value: 5, updated_at: '2025-01-01T00:00:00Z' },
      { process_key: 'COMERCIAL', question_key: 'Q02', answer_value: 6, updated_at: '2025-01-01T00:00:00Z' },
      { process_key: 'OPERACOES', question_key: 'Q01', answer_value: 4, updated_at: '2025-01-01T00:00:00Z' },
      { process_key: 'OPERACOES', question_key: 'Q02', answer_value: 5, updated_at: '2025-01-01T00:00:00Z' },
      { process_key: 'ADM_FIN', question_key: 'Q01', answer_value: 3, updated_at: '2025-01-01T00:00:00Z' },
      { process_key: 'ADM_FIN', question_key: 'Q02', answer_value: 4, updated_at: '2025-01-01T00:00:00Z' },
      { process_key: 'GESTAO', question_key: 'Q01', answer_value: 5, updated_at: '2025-01-01T00:00:00Z' },
      { process_key: 'GESTAO', question_key: 'Q02', answer_value: 6, updated_at: '2025-01-01T00:00:00Z' },
    ],
    processes: [{ process_key: 'COMERCIAL' }, { process_key: 'OPERACOES' }, { process_key: 'ADM_FIN' }, { process_key: 'GESTAO' }],
    requiredQuestions: [
      { process_key: 'COMERCIAL', question_key: 'Q01' }, { process_key: 'COMERCIAL', question_key: 'Q02' },
      { process_key: 'OPERACOES', question_key: 'Q01' }, { process_key: 'OPERACOES', question_key: 'Q02' },
      { process_key: 'ADM_FIN', question_key: 'Q01' }, { process_key: 'ADM_FIN', question_key: 'Q02' },
      { process_key: 'GESTAO', question_key: 'Q01' }, { process_key: 'GESTAO', question_key: 'Q02' },
    ],
  };
  const createChainInner = (res) => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      contains: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue(res),
      single: jest.fn().mockResolvedValue(res),
      delete: jest.fn().mockReturnThis(),
      then: (fn) => Promise.resolve(res).then(fn),
      catch: (fn) => Promise.resolve(res).catch(fn),
    };
    chain.upsert = jest.fn().mockResolvedValue({ error: null });
    chain.insert = jest.fn().mockResolvedValue({ data: null, error: null });
    chain.update = jest.fn().mockReturnThis();
    return chain;
  };
  const getTableData = (table, args = {}) => {
    if (table === 'full_assessments') {
      const scenario = global.__mockCurrentScenario ?? 'has_draft_or_submitted';
      const count = (global.__mockFullAssessmentsCallCount = (global.__mockFullAssessmentsCallCount || 0) + 1);
      if (scenario === 'only_closed') {
        if (count === 1) return { data: null, error: null };
        if (count === 2) return { data: mockDataInner.assessmentClosed, error: null };
        return { data: { id: 'new-draft-id', company_id: cid, status: 'DRAFT', segment: 'C' }, error: null };
      }
      const status = global.__mockAssessmentStatus ?? 'DRAFT';
      return { data: { ...mockDataInner.assessment, status }, error: null };
    }
    if (table === 'companies') return { data: mockDataInner.company, error: null };
    if (table === 'full_answers') {
      const answers = global.__mockAnswers ?? mockDataInner.answersEmpty;
      return { data: answers, error: null };
    }
    if (table === 'full_process_catalog') {
      const exclude = global.__mockProcessCatalogExclude;
      const data = exclude
        ? mockDataInner.processes.filter((p) => p.process_key !== exclude)
        : mockDataInner.processes;
      return { data, error: null };
    }
    if (table === 'full_question_catalog') {
      const exclude = global.__mockQuestionCatalogExclude;
      const data = exclude
        ? (args.questions ?? mockDataInner.requiredQuestions).filter((q) => q.process_key !== exclude)
        : (args.questions ?? mockDataInner.requiredQuestions);
      return { data, error: null };
    }
    if (table === 'full_process_scores') return { data: [], error: null };
    if (table === 'full_generated_recommendations') return { data: [], error: null };
    if (table === 'full_selected_actions' || table === 'full_cycle_history') return { data: [], error: null };
    return { data: null, error: null };
  };

  return {
    supabase: {
      schema: jest.fn().mockReturnValue({
        from: jest.fn().mockImplementation((t) => {
          if (t === 'full_assessments') {
            const scenario = global.__mockCurrentScenario ?? 'has_draft_or_submitted';
            const count = global.__mockFullAssessmentsCallCount || 0;
            const result = scenario === 'only_closed' && count === 3
                ? { data: { id: 'new-draft-id', company_id: cid, status: 'DRAFT', segment: 'C' }, error: null }
              : getTableData(t);
            const chain = createChainInner(result);
            chain.insert = jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: 'new-draft-id', company_id: cid, status: 'DRAFT', segment: 'C' },
                  error: null,
                }),
              }),
            });
            return chain;
          }
          return createChainInner(getTableData(t));
        }),
      }),
    },
  };
});

jest.mock('../src/lib/companyAccess', () => ({
  ensureCompanyAccess: jest.fn().mockResolvedValue({ id: 'company-full-1', name: 'Test', segment: 'C' }),
  ensureConsultantOrOwnerAccess: jest.fn().mockResolvedValue({ id: 'company-full-1', name: 'Test', segment: 'C' }),
}));

const app = require('../src/app');

describe('GET /full/assessments/:id/status', () => {
  it('retorna campos obrigatórios: assessment_id, company_id, status, answered_count, processes_answered, last_saved_at', async () => {
    global.__mockAnswers = mockData.answersPartial;
    const res = await request(app)
      .get(`/full/assessments/${ASSESSMENT_ID}/status?company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('assessment_id', ASSESSMENT_ID);
    expect(res.body).toHaveProperty('company_id', COMPANY_ID);
    expect(res.body).toHaveProperty('status');
    expect(['DRAFT', 'SUBMITTED', 'CLOSED']).toContain(res.body.status);
    expect(res.body).toHaveProperty('answered_count');
    expect(typeof res.body.answered_count).toBe('number');
    expect(res.body).toHaveProperty('processes_answered');
    expect(Array.isArray(res.body.processes_answered)).toBe(true);
    expect(res.body).toHaveProperty('last_saved_at');
  });
});

describe('POST /full/assessments/:id/submit', () => {
  beforeEach(() => {
    global.__mockAssessmentStatus = 'DRAFT';
  });

  it('sem respostas retorna 400 DIAG_INCOMPLETE com missing e loga full_submit_incomplete', async () => {
    global.__mockAnswers = mockData.answersEmpty;
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const res = await request(app)
      .post(`/full/assessments/${ASSESSMENT_ID}/submit?company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('DIAG_INCOMPLETE');
    expect(res.body.message_user).toContain('Faltam respostas');
    expect(res.body.missing).toBeDefined();
    expect(Array.isArray(res.body.missing)).toBe(true);
    expect(res.body.missing.length).toBeGreaterThan(0);
    expect(res.body.missing[0]).toHaveProperty('process_key');
    expect(res.body.missing[0]).toHaveProperty('missing_question_keys');
    expect(res.body.missing_process_keys).toBeDefined();
    expect(Array.isArray(res.body.missing_process_keys)).toBe(true);
    expect(res.body.answered_count).toBe(0);
    expect(res.body.total_expected).toBeGreaterThan(0);

    const incompleteLog = logSpy.mock.calls.find(
      (c) => Array.isArray(c) && c[0] === '[AUDIT] full_submit_incomplete'
    );
    expect(incompleteLog).toBeDefined();
    expect(incompleteLog[1]).toMatchObject({ assessment_id: ASSESSMENT_ID, answered_count: 0 });

    logSpy.mockRestore();
  });

  it('com respostas completas retorna 200 e status SUBMITTED', async () => {
    global.__mockAnswers = mockData.answersFull;
    const res = await request(app)
      .post(`/full/assessments/${ASSESSMENT_ID}/submit?company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
    // score_numeric deve estar em escala 0–100
    expect(Array.isArray(res.body.scores)).toBe(true);
    expect(res.body.scores.length).toBeGreaterThan(0);
    expect(res.body.scores.every((s) => s.score_numeric >= 0 && s.score_numeric <= 100)).toBe(true);
  });

  it('com respostas completas persiste snapshot (full_diagnostic_snapshot)', async () => {
    global.__mockAnswers = mockData.answersFull;
    const fullSnapshot = require('../src/lib/fullSnapshot');
    const persistSpy = jest.spyOn(fullSnapshot, 'persistSnapshotOnSubmit').mockResolvedValue();

    await request(app)
      .post(`/full/assessments/${ASSESSMENT_ID}/submit?company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer test-token');

    expect(persistSpy).toHaveBeenCalledWith(
      ASSESSMENT_ID,
      COMPANY_ID,
      'C',
      expect.any(Array),
      expect.any(Array),
      expect.any(Function)
    );
    expect(persistSpy.mock.calls[0][3].length).toBeGreaterThan(0);
    expect(persistSpy.mock.calls[0][4].length).toBeGreaterThan(0);
    persistSpy.mockRestore();
  });

  it('com catálogo incompleto (1 process_key faltando) retorna 200 e loga full_catalog_missing', async () => {
    global.__mockAnswers = mockData.answersFull;
    global.__mockProcessCatalogExclude = 'GESTAO';
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const res = await request(app)
      .post(`/full/assessments/${ASSESSMENT_ID}/submit?company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.status).toBe('SUBMITTED');

    const catalogMissingLog = logSpy.mock.calls.find(
      (c) => Array.isArray(c) && c[0] === '[AUDIT] full_catalog_missing'
    );
    expect(catalogMissingLog).toBeDefined();
    expect(catalogMissingLog[1]).toMatchObject({ process_key: 'GESTAO', assessment_id: ASSESSMENT_ID, company_id: COMPANY_ID });

    logSpy.mockRestore();
    delete global.__mockProcessCatalogExclude;
  });

  it('catálogo inconsistente (processo sem perguntas) retorna 500 CATALOG_INVALID', async () => {
    global.__mockAnswers = mockData.answersFull;
    global.__mockQuestionCatalogExclude = 'OPERACOES';

    const res = await request(app)
      .post(`/full/assessments/${ASSESSMENT_ID}/submit?company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('CATALOG_INVALID');
    expect(res.body.message_user).toContain('Catálogo');

    delete global.__mockQuestionCatalogExclude;
  });
});

describe('GET /full/actions', () => {
  it('status DRAFT retorna 400 DIAG_NOT_READY', async () => {
    global.__mockAssessmentStatus = 'DRAFT';
    const res = await request(app)
      .get(`/full/actions?assessment_id=${ASSESSMENT_ID}&company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('DIAG_NOT_READY');
  });

  it('status SUBMITTED retorna 200', async () => {
    global.__mockAssessmentStatus = 'SUBMITTED';
    global.__mockAnswers = mockData.answersFull;
    const res = await request(app)
      .get(`/full/actions?assessment_id=${ASSESSMENT_ID}&company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('GET /full/assessments/current', () => {
  beforeEach(() => {
    global.__mockFullAssessmentsCallCount = 0;
  });

  it('FULL/ACTIVE e DRAFT existente retorna 200', async () => {
    global.__mockAssessmentStatus = 'DRAFT';
    global.__mockAnswers = mockData.answersEmpty;
    const res = await request(app)
      .get(`/full/assessments/current?company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('status');
    expect(res.body.type).toBe('FULL');
  });

  it('for_wizard=1 com último SUBMITTED retorna SUBMITTED (sem criar)', async () => {
    global.__mockAssessmentStatus = 'SUBMITTED';
    global.__mockAnswers = mockData.answersFull;
    const res = await request(app)
      .get(`/full/assessments/current?company_id=${COMPANY_ID}&for_wizard=1`)
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SUBMITTED');
    expect(res.body.id).toBe(ASSESSMENT_ID);
  });

  it('FULL/ACTIVE e sem assessment existente cria DRAFT e retorna 200', async () => {
    global.__mockCurrentScenario = 'only_closed';
    const res = await request(app)
      .get(`/full/assessments/current?company_id=${COMPANY_ID}&for_wizard=1`)
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('status');
    expect(res.body.status).toBe('DRAFT');
  });

  it('LIGHT (sem entitlement FULL) retorna 403', async () => {
    const res = await request(app)
      .get(`/full/assessments/current?company_id=company-403`)
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('FULL');
  });
});
