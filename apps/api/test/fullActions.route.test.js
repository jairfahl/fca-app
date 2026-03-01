/**
 * Testes GET /full/actions:
 * - Caso 1: FULL sem submit (status DRAFT) -> 400 DIAG_NOT_READY
 * - Caso 2: FULL submetido com respostas que geram match -> 200 com suggestions
 * - Caso 3: FULL submetido sem match -> 200 com suggestions vazio (não fallback)
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
  const mockGetData = (table) => {
    const status = global.__mockActionsAssessmentStatus ?? 'SUBMITTED';
    if (table === 'full_assessments') {
      return { data: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', company_id: 'company-full-1', status, segment: 'C' }, error: null };
    }
    if (table === 'companies') return { data: { id: 'company-full-1', name: 'Test', segment: 'C' }, error: null };
    if (table === 'full_answers') {
      const answers = global.__mockActionsAnswers ?? [
        { process_key: 'OPERACOES', question_key: 'Q01', answer_value: 0 },
        { process_key: 'OPERACOES', question_key: 'Q02', answer_value: 1 },
        { process_key: 'OPERACOES', question_key: 'Q03', answer_value: 2 },
      ];
      return { data: answers, error: null };
    }
    if (table === 'full_process_scores') {
      const scores = global.__mockActionsScores ?? [{ process_key: 'OPERACOES', band: 'LOW', score_numeric: 2 }];
      return { data: scores, error: null };
    }
    if (table === 'full_selected_actions' || table === 'full_cycle_history') return { data: [], error: null };
    return { data: null, error: null };
  };
  const createChain = (table) => {
    const result = mockGetData(table);
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      contains: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      insert: jest.fn().mockResolvedValue({ data: {}, error: null }),
      maybeSingle: jest.fn().mockResolvedValue(result),
      then: (resolve) => Promise.resolve(result).then(resolve),
      catch: (fn) => Promise.resolve(result).catch(fn),
    };
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

const app = require('../src/app');

describe('GET /full/actions', () => {
  beforeEach(() => {
    global.__mockActionsAssessmentStatus = 'SUBMITTED';
    global.__mockActionsAnswers = [
      { process_key: 'OPERACOES', question_key: 'Q01', answer_value: 0 },
      { process_key: 'OPERACOES', question_key: 'Q02', answer_value: 1 },
      { process_key: 'OPERACOES', question_key: 'Q03', answer_value: 2 },
    ];
    global.__mockActionsScores = [{ process_key: 'OPERACOES', band: 'LOW', score_numeric: 2 }];
  });

  it('retorna 400 DIAG_NOT_READY quando assessment não está SUBMITTED', async () => {
    global.__mockActionsAssessmentStatus = 'DRAFT';
    const res = await request(app)
      .get(`/full/actions?assessment_id=${ASSESSMENT_ID}&company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('DIAG_NOT_READY');
    expect(res.body.message_user).toContain('Conclua o diagnóstico');
  });

  it('retorna 200 com suggestions quando há match >= 2', async () => {
    const res = await request(app)
      .get(`/full/actions?assessment_id=${ASSESSMENT_ID}&company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.suggestions)).toBe(true);
    expect(res.body.suggestions.length).toBeGreaterThanOrEqual(1);
    expect(res.body.suggestions.some((s) => s.action_key && s.recommendation)).toBe(true);
    // score_numeric deve estar em escala 0–100 (mock: 2 → 20)
    expect(Array.isArray(res.body.scores_by_process)).toBe(true);
    expect(res.body.scores_by_process[0].score_numeric).toBe(20);
  });

  it('retorna 200 com suggestions vazio quando não há match (sem fallback)', async () => {
    global.__mockActionsAnswers = [
      { process_key: 'OPERACOES', question_key: 'Q01', answer_value: 8 },
      { process_key: 'OPERACOES', question_key: 'Q02', answer_value: 7 },
      { process_key: 'OPERACOES', question_key: 'Q03', answer_value: 9 },
    ];
    const res = await request(app)
      .get(`/full/actions?assessment_id=${ASSESSMENT_ID}&company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.suggestions)).toBe(true);
    expect(res.body.suggestions.length).toBe(0);
    expect(res.body.suggestions.some((s) => s.action_key?.startsWith('fallback-'))).toBe(false);
  });
});

describe('POST /full/cycle/select-actions — validação de bloco', () => {
  beforeEach(() => {
    global.__mockActionsAssessmentStatus = 'SUBMITTED';
  });

  it('retorna 200 no último bloco com 2 ações (remaining=2)', async () => {
    // 2 processos → remaining_count=2 → isLastBlock=true → aceita 1..2 ações
    global.__mockActionsScores = [
      { process_key: 'OPERACOES', band: 'LOW', score_numeric: 2 },
      { process_key: 'COMERCIAL', band: 'LOW', score_numeric: 2 },
    ];
    global.__mockActionsAnswers = [
      { process_key: 'OPERACOES', question_key: 'Q01', answer_value: 0 },
      { process_key: 'OPERACOES', question_key: 'Q02', answer_value: 1 },
      { process_key: 'COMERCIAL', question_key: 'Q01', answer_value: 0 },
      { process_key: 'COMERCIAL', question_key: 'Q02', answer_value: 1 },
    ];

    const res = await request(app)
      .post(`/full/cycle/select-actions?company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer test-token')
      .send({
        assessment_id: ASSESSMENT_ID,
        company_id: COMPANY_ID,
        actions: [
          { action_key: 'COMERCIAL_ACAO_PADRONIZAR_FUNIL', owner_name: 'João', metric_text: 'Conversão', checkpoint_date: '2025-03-15', position: 1 },
          { action_key: 'OPERACOES_ACAO_MAPEAR_ENTREGA', owner_name: 'Maria', metric_text: 'Entregas', checkpoint_date: '2025-03-20', position: 2 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('retorna 400 ACTION_COUNT_INVALID em bloco intermediário com 2 ações (remaining=4)', async () => {
    // 4 processos → remaining_count=4 → isLastBlock=false → exige exatamente 3
    global.__mockActionsScores = [
      { process_key: 'OPERACOES', band: 'LOW', score_numeric: 2 },
      { process_key: 'COMERCIAL', band: 'LOW', score_numeric: 2 },
      { process_key: 'ADM_FIN', band: 'LOW', score_numeric: 2 },
      { process_key: 'GESTAO', band: 'LOW', score_numeric: 2 },
    ];
    global.__mockActionsAnswers = [
      { process_key: 'OPERACOES', question_key: 'Q01', answer_value: 0 },
      { process_key: 'OPERACOES', question_key: 'Q02', answer_value: 1 },
      { process_key: 'COMERCIAL', question_key: 'Q01', answer_value: 0 },
      { process_key: 'COMERCIAL', question_key: 'Q02', answer_value: 1 },
      { process_key: 'ADM_FIN', question_key: 'Q01', answer_value: 0 },
      { process_key: 'ADM_FIN', question_key: 'Q02', answer_value: 1 },
      { process_key: 'GESTAO', question_key: 'Q01', answer_value: 0 },
      { process_key: 'GESTAO', question_key: 'Q02', answer_value: 1 },
    ];

    const res = await request(app)
      .post(`/full/cycle/select-actions?company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer test-token')
      .send({
        assessment_id: ASSESSMENT_ID,
        company_id: COMPANY_ID,
        actions: [
          { action_key: 'COMERCIAL_ACAO_PADRONIZAR_FUNIL', owner_name: 'João', metric_text: 'Conversão', checkpoint_date: '2025-03-15', position: 1 },
          { action_key: 'OPERACOES_ACAO_MAPEAR_ENTREGA', owner_name: 'Maria', metric_text: 'Entregas', checkpoint_date: '2025-03-20', position: 2 },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ACTION_COUNT_INVALID');
    expect(res.body.message_user).toContain('3');
  });
});
