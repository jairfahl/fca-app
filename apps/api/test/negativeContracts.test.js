/**
 * Testes negativos de contrato — Fase 3
 *
 * Cenários cobertos:
 *  1. ACTION_COUNT_INVALID  — bloco intermediário com contagem errada
 *  2. ACTION_SEGMENT_MISMATCH — action_key desconhecida no catálogo
 *  3. DIAG_INCOMPLETE       — submit com respostas pendentes
 *  4. CYCLE_ALREADY_OPEN    — nova versão com ciclo ativo (DIAG_IN_PROGRESS)
 *  5. EVIDENCE_REQUIRED     — DONE sem evidência registrada
 *  6. EVIDENCE_WRITE_ONCE   — segunda evidência para mesma ação
 *  7. ACCESS_DENIED         — USER acessa dados de outra empresa (403)
 *  8. CONSULTOR_NOT_ALLOWED — USER acessa rota de CONSULTOR (403)
 *
 * Padrão: jest + supertest, mocks de requireAuth por header + supabase chain.
 */
const request = require('supertest');

// ---------------------------------------------------------------------------
// Mocks de middleware
// ---------------------------------------------------------------------------
jest.mock('../src/middleware/requireAuth', () => ({
  requireAuth: (req, res, next) => {
    const auth = req.headers.authorization || '';
    if (auth.includes('consultor')) {
      req.user = { id: 'c1', email: 'consultor@fca.com', role: 'CONSULTOR' };
    } else if (auth.includes('admin')) {
      req.user = { id: 'a1', email: 'admin@fca.com', role: 'ADMIN' };
    } else {
      req.user = { id: 'u1', email: 'u1@test.com', role: 'USER' };
    }
    return next();
  },
}));

jest.mock('../src/middleware/requireFullEntitlement', () => ({
  requireFullEntitlement: (req, res, next) => next(),
}));

// ---------------------------------------------------------------------------
// Constantes compartilhadas
// ---------------------------------------------------------------------------
const ASSESSMENT_ID = 'cccccccc-dddd-eeee-ffff-000000000001';
const COMPANY_ID = 'neg-company-1';
const ACTION_KEY_VALID = 'COMERCIAL_ACAO_PADRONIZAR_FUNIL';
const ACTION_KEY_INVALID = 'INDUSTRIA_ACAO_INVALIDA_SEGMENTO';

// ---------------------------------------------------------------------------
// Mock do Supabase
// ---------------------------------------------------------------------------
jest.mock('../src/lib/supabase', () => {
  const mockGetData = (table) => {
    // full_assessments: retorna assessment com status controlável
    if (table === 'full_assessments') {
      const status = global.__mockAssessmentStatus ?? 'SUBMITTED';
      return {
        data: { id: 'cccccccc-dddd-eeee-ffff-000000000001', company_id: 'neg-company-1', status, segment: 'C' },
        error: null,
      };
    }

    // Respostas do diagnóstico
    if (table === 'full_answers') {
      return { data: global.__mockAnswers ?? [], error: null };
    }

    // Scores por processo
    if (table === 'full_process_scores') {
      return { data: global.__mockScores ?? [], error: null };
    }

    // Plano de ações selecionadas
    if (table === 'full_selected_actions') {
      return { data: global.__mockSelectedActions ?? [], error: null };
    }

    // Histórico de ciclos
    if (table === 'full_cycle_history') {
      return { data: [], error: null };
    }

    // Catálogo de ações (DB) — vazio para simular ação desconhecida
    if (table === 'full_action_catalog') {
      return { data: [], error: null };
    }

    // Confirmação de checklist (DoD)
    if (table === 'full_action_dod_confirmations') {
      const exists = global.__mockDodExists !== false;
      return { data: exists ? { assessment_id: 'cccccccc-dddd-eeee-ffff-000000000001' } : null, error: null };
    }

    // Evidência de ação
    if (table === 'full_action_evidence') {
      const exists = global.__mockEvidenceExists === true;
      return {
        data: exists ? { assessment_id: 'cccccccc-dddd-eeee-ffff-000000000001', action_key: ACTION_KEY_VALID } : null,
        error: null,
      };
    }

    // Causas diagnosticadas — vazias para não interferir no mecanismo
    if (table === 'full_gap_causes' || table === 'full_cause_mechanism_actions') {
      return { data: [], error: null };
    }

    // Catálogo de processos — vazio usa fallback de 4 processos em full.js
    if (table === 'full_process_catalog') {
      return { data: [], error: null };
    }

    // Catálogo de perguntas — 2 perguntas por processo para totalExpected > 0
    if (table === 'full_question_catalog') {
      return {
        data: [
          { process_key: 'COMERCIAL', question_key: 'Q01' },
          { process_key: 'COMERCIAL', question_key: 'Q02' },
          { process_key: 'OPERACOES', question_key: 'Q01' },
          { process_key: 'OPERACOES', question_key: 'Q02' },
          { process_key: 'ADM_FIN', question_key: 'Q01' },
          { process_key: 'ADM_FIN', question_key: 'Q02' },
          { process_key: 'GESTAO', question_key: 'Q01' },
          { process_key: 'GESTAO', question_key: 'Q02' },
        ],
        error: null,
      };
    }

    // Empresas — retorna empresa ou null conforme __mockCompanyOwned
    if (table === 'companies') {
      if (global.__mockCompanyOwned === false) return { data: null, error: null };
      return { data: { id: 'neg-company-1', name: 'Test Co', segment: 'C', owner_user_id: 'u1' }, error: null };
    }

    // Entitlements — sem acesso (para testar cross-company)
    if (table === 'entitlements') {
      return { data: null, error: null };
    }

    return { data: null, error: null };
  };

  const createChain = (table) => {
    const result = mockGetData(table);
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      contains: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue(result),
      single: jest.fn().mockResolvedValue({ data: { id: 'inserted-id' }, error: null }),
      then: (resolve) => Promise.resolve(result).then(resolve),
      catch: (fn) => Promise.resolve(result).catch(fn),
    };
    return chain;
  };

  return {
    supabase: {
      schema: jest.fn().mockReturnValue({ from: jest.fn().mockImplementation(createChain) }),
      from: jest.fn().mockImplementation(createChain),
      auth: {
        admin: {
          getUserById: jest.fn().mockResolvedValue({ data: { user: { email: 'u1@test.com' } }, error: null }),
          listUsers: jest.fn().mockResolvedValue({ data: { users: [] }, error: null }),
        },
      },
    },
  };
});

jest.mock('../src/lib/consultorAudit', () => ({ logConsultorAccess: jest.fn() }));

const app = require('../src/app');

// Respostas baixas (≤2) para acionar sinais no catálogo de ações
const LOW_ANSWERS_4_PROCESSES = [
  { process_key: 'COMERCIAL', question_key: 'Q01', answer_value: 0 },
  { process_key: 'COMERCIAL', question_key: 'Q02', answer_value: 0 },
  { process_key: 'COMERCIAL', question_key: 'Q03', answer_value: 0 },
  { process_key: 'OPERACOES', question_key: 'Q01', answer_value: 0 },
  { process_key: 'OPERACOES', question_key: 'Q02', answer_value: 0 },
  { process_key: 'OPERACOES', question_key: 'Q03', answer_value: 0 },
  { process_key: 'ADM_FIN', question_key: 'Q01', answer_value: 0 },
  { process_key: 'ADM_FIN', question_key: 'Q02', answer_value: 0 },
  { process_key: 'ADM_FIN', question_key: 'Q03', answer_value: 0 },
  { process_key: 'GESTAO', question_key: 'Q01', answer_value: 0 },
  { process_key: 'GESTAO', question_key: 'Q02', answer_value: 0 },
  { process_key: 'GESTAO', question_key: 'Q03', answer_value: 0 },
];

const LOW_SCORES_4_PROCESSES = [
  { process_key: 'COMERCIAL', band: 'LOW', score_numeric: 2 },
  { process_key: 'OPERACOES', band: 'LOW', score_numeric: 2 },
  { process_key: 'ADM_FIN', band: 'LOW', score_numeric: 2 },
  { process_key: 'GESTAO', band: 'LOW', score_numeric: 2 },
];

// ---------------------------------------------------------------------------
// Reset global antes de cada teste
// ---------------------------------------------------------------------------
beforeEach(() => {
  global.__mockAssessmentStatus = 'SUBMITTED';
  global.__mockAnswers = [];
  global.__mockScores = [];
  global.__mockSelectedActions = [];
  global.__mockEvidenceExists = false;
  global.__mockDodExists = true;
  global.__mockCompanyOwned = true;
});

// ===========================================================================
// 1. ACTION_COUNT_INVALID
// ===========================================================================
describe('POST /full/cycle/select-actions — ACTION_COUNT_INVALID', () => {
  it('should return 400 ACTION_COUNT_INVALID when non-last block receives wrong action count', async () => {
    // 4 processos LOW → 4 sugestões → remaining_count=4 (bloco intermediário, exige 3)
    global.__mockScores = LOW_SCORES_4_PROCESSES;
    global.__mockAnswers = LOW_ANSWERS_4_PROCESSES;

    const res = await request(app)
      .post(`/full/cycle/select-actions?company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer user-token')
      .send({
        assessment_id: ASSESSMENT_ID,
        actions: [
          { action_key: ACTION_KEY_VALID, owner_name: 'João', metric_text: 'Métrica', checkpoint_date: '2025-06-01', position: 1 },
          { action_key: 'OPERACOES_ACAO_MAPEAR_ENTREGA', owner_name: 'Maria', metric_text: 'Métrica', checkpoint_date: '2025-06-01', position: 2 },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ACTION_COUNT_INVALID');
  });
});

// ===========================================================================
// 2. ACTION_SEGMENT_MISMATCH
// ===========================================================================
describe('POST /full/cycle/select-actions — ACTION_SEGMENT_MISMATCH', () => {
  it('should return 400 ACTION_SEGMENT_MISMATCH when action key is not in the catalog', async () => {
    // 2 processos LOW → remaining_count=2 (último bloco, aceita 1..2)
    global.__mockScores = [
      { process_key: 'COMERCIAL', band: 'LOW', score_numeric: 2 },
      { process_key: 'OPERACOES', band: 'LOW', score_numeric: 2 },
    ];
    global.__mockAnswers = [
      { process_key: 'COMERCIAL', question_key: 'Q01', answer_value: 0 },
      { process_key: 'COMERCIAL', question_key: 'Q02', answer_value: 0 },
      { process_key: 'OPERACOES', question_key: 'Q01', answer_value: 0 },
      { process_key: 'OPERACOES', question_key: 'Q02', answer_value: 0 },
    ];

    const res = await request(app)
      .post(`/full/cycle/select-actions?company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer user-token')
      .send({
        assessment_id: ASSESSMENT_ID,
        actions: [
          // Chave desconhecida: não existe em catalog.v1.json nem no DB mock
          { action_key: ACTION_KEY_INVALID, owner_name: 'João', metric_text: 'Métrica', checkpoint_date: '2025-06-01', position: 1 },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ACTION_SEGMENT_MISMATCH');
    expect(res.body.unknown_action_keys).toContain(ACTION_KEY_INVALID);
  });
});

// ===========================================================================
// 3. DIAG_INCOMPLETE
// ===========================================================================
describe('POST /full/assessments/:id/submit — DIAG_INCOMPLETE', () => {
  it('should return 400 DIAG_INCOMPLETE when submitting with missing answers', async () => {
    global.__mockAssessmentStatus = 'DRAFT'; // submit exige status DRAFT
    global.__mockAnswers = []; // sem respostas → incompleto

    const res = await request(app)
      .post(`/full/assessments/${ASSESSMENT_ID}/submit?company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer user-token');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('DIAG_INCOMPLETE');
    expect(Array.isArray(res.body.missing) || Array.isArray(res.body.missing_process_keys)).toBe(true);
  });
});

// ===========================================================================
// 4. CYCLE_ALREADY_OPEN (DIAG_IN_PROGRESS)
// ===========================================================================
describe('POST /full/versions/new — DIAG_IN_PROGRESS com ciclo aberto', () => {
  it('should return 400 DIAG_IN_PROGRESS when creating new version with an open cycle', async () => {
    // Assessment SUBMITTED + plano existente → novo ciclo bloqueado
    global.__mockAssessmentStatus = 'SUBMITTED';
    global.__mockSelectedActions = [{ action_key: ACTION_KEY_VALID }];

    const res = await request(app)
      .post(`/full/versions/new?company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer user-token');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('DIAG_IN_PROGRESS');
  });
});

// ===========================================================================
// 5. EVIDENCE_REQUIRED
// ===========================================================================
describe('POST /full/actions/:action_key/status — EVIDENCE_REQUIRED', () => {
  it('should return 400 EVIDENCE_REQUIRED when marking DONE without evidence', async () => {
    global.__mockDodExists = true;
    global.__mockEvidenceExists = false; // sem evidência

    const res = await request(app)
      .post(`/full/actions/${encodeURIComponent(ACTION_KEY_VALID)}/status?company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer user-token')
      .send({ assessment_id: ASSESSMENT_ID, status: 'DONE' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('EVIDENCE_REQUIRED');
    expect(res.body.message_user).toContain('evidência');
  });
});

// ===========================================================================
// 6. EVIDENCE_WRITE_ONCE
// ===========================================================================
describe('POST /full/actions/:action_key/evidence — EVIDENCE_WRITE_ONCE', () => {
  it('should return 409 EVIDENCE_WRITE_ONCE when posting evidence for the same action twice', async () => {
    global.__mockEvidenceExists = true; // evidência já existe

    const res = await request(app)
      .post(`/full/actions/${encodeURIComponent(ACTION_KEY_VALID)}/evidence?company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer user-token')
      .send({
        assessment_id: ASSESSMENT_ID,
        evidencia: 'Descrição detalhada da evidência coletada',
        antes: 'Situação anterior ao início da ação implementada',
        depois: 'Situação posterior após conclusão da ação',
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EVIDENCE_WRITE_ONCE');
    expect(res.body.message_user).toContain('Evidência já registrada');
  });
});

// ===========================================================================
// 7. ACCESS_DENIED — USER acessa dados de outra empresa
// ===========================================================================
describe('GET /full/results — ACCESS_DENIED para empresa alheia', () => {
  it('should return 403 ACCESS_DENIED when USER accesses another company results', async () => {
    // Empresa não pertence ao usuário u1
    global.__mockCompanyOwned = false;
    global.__mockAssessmentStatus = 'SUBMITTED';

    const res = await request(app)
      .get(`/full/results?assessment_id=${ASSESSMENT_ID}&company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer user-token');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCESS_DENIED');
  });
});

// ===========================================================================
// 8. CONSULTOR_NOT_ALLOWED — USER acessa rota de CONSULTOR
// ===========================================================================
describe('GET /consultor/users — CONSULTOR_NOT_ALLOWED para USER', () => {
  it('should return 403 CONSULTOR_NOT_ALLOWED when USER accesses a consultor route', async () => {
    const res = await request(app)
      .get('/consultor/users')
      .set('Authorization', 'Bearer user-token');

    expect(res.status).toBe(403);
    // requireConsultorOrAdmin usa requireAnyRole → retorna FORBIDDEN para USER
    expect(res.body.error).toBe('FORBIDDEN');
  });
});
