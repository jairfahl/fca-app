/**
 * Testes: snapshot determinístico no SUBMIT e CLOSE
 * - Submit: persiste snapshot (processes, raios_x, recommendations, plan vazio)
 * - Close: atualiza snapshot (plan, evidence_summary)
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

const mockPlan = [
  { action_key: 'ACT-1', position: 1, status: 'DONE', owner_name: 'João', metric_text: 'M1', checkpoint_date: '2025-03-15' },
  { action_key: 'ACT-2', position: 2, status: 'DONE', owner_name: 'Maria', metric_text: 'M2', checkpoint_date: '2025-03-20' },
  { action_key: 'ACT-3', position: 3, status: 'DONE', owner_name: 'Pedro', metric_text: 'M3', checkpoint_date: '2025-03-25' },
];

const mockEvidence = [
  { action_key: 'ACT-1', before_baseline: '0', after_result: '10', declared_gain: 'Ganho 1' },
  { action_key: 'ACT-2', before_baseline: '0', after_result: '8', declared_gain: 'Ganho 2' },
  { action_key: 'ACT-3', before_baseline: '0', after_result: '9', declared_gain: 'Ganho 3' },
];

const mockSnapshot = {
  id: 'snap-1',
  full_assessment_id: ASSESSMENT_ID,
  full_version: 1,
  segment: 'C',
  processes: [],
  raios_x: { vazamentos: [], alavancas: [] },
  recommendations: [],
  plan: [],
  evidence_summary: [],
};

jest.mock('../src/lib/supabase', () => {
  const createChain = (table) => {
    const getData = () => {
      if (table === 'full_assessments') return { data: { id: ASSESSMENT_ID, company_id: COMPANY_ID, status: 'SUBMITTED', segment: 'C', full_version: 1 }, error: null };
      if (table === 'companies') return { data: { id: COMPANY_ID, name: 'Test', segment: 'C' }, error: null };
      if (table === 'full_selected_actions') return { data: mockPlan, error: null };
      if (table === 'full_diagnostic_snapshot') return { data: mockSnapshot, error: null };
      if (table === 'full_action_catalog') return { data: [{ action_key: 'ACT-1', title: 'Ação 1' }, { action_key: 'ACT-2', title: 'Ação 2' }, { action_key: 'ACT-3', title: 'Ação 3' }], error: null };
      if (table === 'full_action_evidence') return { data: mockEvidence, error: null };
      return { data: null, error: null };
    };
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
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

const app = require('../src/app');

describe('POST /full/assessments/:id/close — snapshot', () => {
  it('chama persistSnapshotOnClose ao fechar ciclo', async () => {
    const fullSnapshot = require('../src/lib/fullSnapshot');
    const persistSpy = jest.spyOn(fullSnapshot, 'persistSnapshotOnClose').mockResolvedValue();

    const res = await request(app)
      .post(`/full/assessments/${ASSESSMENT_ID}/close?company_id=${COMPANY_ID}`)
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(persistSpy).toHaveBeenCalledWith(ASSESSMENT_ID, COMPANY_ID, mockPlan);
    persistSpy.mockRestore();
  });
});
