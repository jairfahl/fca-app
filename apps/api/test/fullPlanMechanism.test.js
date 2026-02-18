/**
 * Testes: validação de 1 ação de mecanismo em POST /full/plan
 * - Com gap_causes: exige pelo menos 1 ação do mecanismo
 * - Sem gap_causes: não bloqueia
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

let mockGapCauses = [];
let mockMechActions = [];

const mockAnswers = [
  { process_key: 'COMERCIAL', question_key: 'Q01', answer_value: 1 }, { process_key: 'COMERCIAL', question_key: 'Q02', answer_value: 2 },
  { process_key: 'OPERACOES', question_key: 'Q01', answer_value: 1 }, { process_key: 'OPERACOES', question_key: 'Q02', answer_value: 2 },
  { process_key: 'ADM_FIN', question_key: 'Q01', answer_value: 1 }, { process_key: 'ADM_FIN', question_key: 'Q02', answer_value: 2 },
  { process_key: 'GESTAO', question_key: 'Q01', answer_value: 1 }, { process_key: 'GESTAO', question_key: 'Q02', answer_value: 2 },
];
const mockScores = [
  { process_key: 'COMERCIAL', band: 'LOW', score_numeric: 3 },
  { process_key: 'OPERACOES', band: 'LOW', score_numeric: 3 },
  { process_key: 'ADM_FIN', band: 'LOW', score_numeric: 3 },
  { process_key: 'GESTAO', band: 'LOW', score_numeric: 3 },
];
const mockActionCatalog = [
  { action_key: 'ADM_FIN-ROTINA_CAIXA_SEMANAL', process_key: 'ADM_FIN', band: 'LOW' },
  { action_key: 'COMERCIAL-FUNIL_MINIMO', process_key: 'COMERCIAL', band: 'LOW' },
  { action_key: 'GESTAO-REUNIAO_SEMANAL', process_key: 'GESTAO', band: 'LOW' },
  { action_key: 'OPERACOES_ACAO_MAPEAR_ENTREGA', process_key: 'OPERACOES', band: 'LOW' },
];

jest.mock('../src/lib/supabase', () => {
  const createChain = (table) => {
    const getData = () => {
      if (table === 'full_gap_causes') return { data: mockGapCauses, error: null };
      if (table === 'full_cause_mechanism_actions') return { data: mockMechActions, error: null };
      if (table === 'full_assessments') {
        return { data: { id: ASSESSMENT_ID, company_id: COMPANY_ID, status: 'SUBMITTED', segment: 'C' }, error: null };
      }
      if (table === 'companies') return { data: { id: COMPANY_ID, name: 'Test', segment: 'C' }, error: null };
      if (table === 'full_selected_actions') return { data: [], error: null };
      if (table === 'full_cycle_history') return { data: [], error: null };
      if (table === 'full_answers') return { data: mockAnswers, error: null };
      if (table === 'full_process_scores') return { data: mockScores, error: null };
      if (table === 'full_action_catalog') return { data: mockActionCatalog, error: null };
      if (table === 'full_generated_recommendations') return { data: [], error: null };
      return { data: null, error: null };
    };
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      contains: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      insert: jest.fn().mockResolvedValue({ data: {}, error: null }),
      maybeSingle: jest.fn().mockImplementation(() => Promise.resolve(getData())),
      single: jest.fn().mockImplementation(() => Promise.resolve(getData())),
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

const validActions = [
  { action_key: 'ADM_FIN-ROTINA_CAIXA_SEMANAL', owner_name: 'João', metric_text: 'Projeção D+30', checkpoint_date: '2025-03-15', position: 1 },
  { action_key: 'COMERCIAL-FUNIL_MINIMO', owner_name: 'Maria', metric_text: 'Oportunidades', checkpoint_date: '2025-03-20', position: 2 },
  { action_key: 'GESTAO-REUNIAO_SEMANAL', owner_name: 'Pedro', metric_text: 'Pauta', checkpoint_date: '2025-03-25', position: 3 },
];

describe('POST /full/plan — validação mecanismo', () => {
  beforeEach(() => {
    mockGapCauses = [];
    mockMechActions = [];
  });

  it('retorna 200 quando não há gap_causes (sem bloquear)', async () => {
    mockGapCauses = [];
    const res = await request(app)
      .post(`/full/plan?company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer test-token')
      .send({
        assessment_id: ASSESSMENT_ID,
        company_id: COMPANY_ID,
        actions: validActions,
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('retorna 400 MECHANISM_ACTION_REQUIRED quando há gap_causes mas nenhuma ação é do mecanismo', async () => {
    mockGapCauses = [{ gap_id: 'GAP_CAIXA_PREVISAO', cause_primary: 'CAUSE_RITUAL' }];
    mockMechActions = [
      { gap_id: 'GAP_CAIXA_PREVISAO', cause_id: 'CAUSE_RITUAL', action_key: 'ADM_FIN-ROTINA_CAIXA_SEMANAL' },
      { gap_id: 'GAP_CAIXA_PREVISAO', cause_id: 'CAUSE_RITUAL', action_key: 'ADM_FIN-DONO_CAIXA' },
    ];
    const res = await request(app)
      .post(`/full/plan?company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer test-token')
      .send({
        assessment_id: ASSESSMENT_ID,
        company_id: COMPANY_ID,
        actions: [
          { action_key: 'COMERCIAL-FUNIL_MINIMO', owner_name: 'Maria', metric_text: 'Oportunidades', checkpoint_date: '2025-03-20', position: 1 },
          { action_key: 'GESTAO-REUNIAO_SEMANAL', owner_name: 'Pedro', metric_text: 'Pauta', checkpoint_date: '2025-03-25', position: 2 },
          { action_key: 'OPERACOES_ACAO_MAPEAR_ENTREGA', owner_name: 'Ana', metric_text: 'Checklist', checkpoint_date: '2025-03-30', position: 3 },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MECHANISM_ACTION_REQUIRED');
    expect(res.body.message_user).toContain('Sem atacar a causa');
    expect(res.body.mechanism_action_keys).toBeDefined();
    expect(Array.isArray(res.body.mechanism_action_keys)).toBe(true);
    expect(res.body.mechanism_action_keys).toContain('ADM_FIN-ROTINA_CAIXA_SEMANAL');
    expect(res.body.mechanism_action_keys).toContain('ADM_FIN-DONO_CAIXA');
  });

  it('retorna 200 quando há gap_causes e pelo menos 1 ação é do mecanismo', async () => {
    mockGapCauses = [{ gap_id: 'GAP_CAIXA_PREVISAO', cause_primary: 'CAUSE_RITUAL' }];
    mockMechActions = [
      { gap_id: 'GAP_CAIXA_PREVISAO', cause_id: 'CAUSE_RITUAL', action_key: 'ADM_FIN-ROTINA_CAIXA_SEMANAL' },
      { gap_id: 'GAP_CAIXA_PREVISAO', cause_id: 'CAUSE_RITUAL', action_key: 'ADM_FIN-DONO_CAIXA' },
    ];
    const res = await request(app)
      .post(`/full/plan?company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer test-token')
      .send({
        assessment_id: ASSESSMENT_ID,
        company_id: COMPANY_ID,
        actions: validActions,
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
