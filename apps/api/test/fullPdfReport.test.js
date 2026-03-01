/**
 * Testes de contrato: GET /full/reports/:assessmentId.pdf
 *
 * Garantias:
 *   1. SUBMITTED → 200 com Content-Type: application/pdf
 *   2. DRAFT     → 400 DIAG_NOT_READY
 *   3. USER sem vínculo → 403 FORBIDDEN
 */
const request = require('supertest');

jest.mock('../src/middleware/requireAuth', () => ({
  requireAuth: (req, res, next) => {
    const auth = req.headers.authorization || '';
    if (auth.includes('no-access')) {
      req.user = { id: 'no-access-user', email: 'other@example.com', role: 'USER' };
    } else {
      req.user = { id: 'user-1', email: 'owner@example.com', role: 'USER' };
    }
    return next();
  },
}));

jest.mock('../src/middleware/requireFullEntitlement', () => ({
  requireFullEntitlement: (req, res, next) => next(),
}));

jest.mock('../src/lib/companyAccess', () => ({
  ensureCompanyAccess: jest.fn().mockResolvedValue({ id: 'company-1', name: 'Test Co' }),
  ensureConsultantOrOwnerAccess: jest.fn().mockImplementation((userId) => {
    if (userId === 'no-access-user') return Promise.resolve(null);
    return Promise.resolve({ id: 'company-1', name: 'Test Co' });
  }),
}));

// Mocka geração real de PDF — evita custo de PDFKit e torna o teste determinístico.
jest.mock('../src/lib/fullReportPdf', () => ({
  generateFullReportPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 test buffer')),
}));

jest.mock('../src/lib/supabase', () => {
  const createChain = (data, error = null) => {
    const chain = {
      schema: () => chain,
      from: () => chain,
      select: () => chain,
      eq: () => chain,
      not: () => chain,
      in: () => chain,
      or: () => chain,
      is: () => chain,
      order: () => chain,
      limit: () => chain,
      range: () => chain,
      insert: () => Promise.resolve({ data: null, error: null }),
      maybeSingle: () => Promise.resolve({
        data: Array.isArray(data) ? (data[0] || null) : data,
        error,
      }),
      single: () => Promise.resolve({ data: Array.isArray(data) ? (data[0] || null) : data, error }),
      then: (fn) => Promise.resolve({ data, error }).then(fn),
      catch: (fn) => Promise.resolve({ data, error }).catch(fn),
    };
    return chain;
  };

  const getTableResult = (table) => {
    if (table === 'full_assessments') return global.__mockAssessment ?? null;
    if (table === 'full_process_scores') return [{ process_key: 'COMERCIAL', band: 'MEDIUM', score_numeric: 5 }];
    if (table === 'full_findings') return [];
    if (table === 'full_selected_actions') return [];
    if (table === 'full_action_evidence') return [];
    if (table === 'companies') return [{ id: 'company-1', name: 'Test Co' }];
    if (table === 'audit_log') return null;
    return null;
  };

  return {
    supabase: {
      schema: jest.fn().mockReturnValue({
        from: jest.fn().mockImplementation((table) => createChain(getTableResult(table))),
      }),
      from: jest.fn().mockImplementation((table) => createChain(getTableResult(table))),
    },
  };
});

const ASSESSMENT_ID = 'asm-pdf-test-123';
const COMPANY_ID = 'company-1';

const app = require('../src/app');

beforeEach(() => {
  global.__mockAssessment = {
    id: ASSESSMENT_ID,
    company_id: COMPANY_ID,
    status: 'SUBMITTED',
    assessment_version: 1,
  };
});

afterEach(() => {
  delete global.__mockAssessment;
  jest.clearAllMocks();
});

describe('GET /full/reports/:assessmentId.pdf', () => {
  it('SUBMITTED → 200 com Content-Type: application/pdf', async () => {
    const res = await request(app)
      .get(`/full/reports/${ASSESSMENT_ID}.pdf`)
      .query({ company_id: COMPANY_ID });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
  });

  it('DRAFT → 400 DIAG_NOT_READY', async () => {
    global.__mockAssessment = {
      id: ASSESSMENT_ID,
      company_id: COMPANY_ID,
      status: 'DRAFT',
      assessment_version: 1,
    };

    const res = await request(app)
      .get(`/full/reports/${ASSESSMENT_ID}.pdf`)
      .query({ company_id: COMPANY_ID });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('DIAG_NOT_READY');
  });

  it('USER sem vínculo → 403 FORBIDDEN', async () => {
    const res = await request(app)
      .get(`/full/reports/${ASSESSMENT_ID}.pdf`)
      .set('Authorization', 'Bearer no-access-token')
      .query({ company_id: COMPANY_ID });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });
});
