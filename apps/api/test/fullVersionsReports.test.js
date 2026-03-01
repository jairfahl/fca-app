/**
 * Testes: FULL versionamento e relatórios
 * - GET /full/versions, POST /full/versions/new
 * - GET /full/versions/:full_version/summary
 * - GET /full/compare
 * - POST /full/reports/generate, GET status, GET download
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

jest.mock('../src/lib/companyAccess', () => ({
  ensureCompanyAccess: jest.fn().mockResolvedValue({ id: 'company-full-1', name: 'Test', segment: 'C' }),
  ensureConsultantOrOwnerAccess: jest.fn().mockResolvedValue({ id: 'company-full-1', name: 'Test', segment: 'C' }),
}));

const COMPANY_ID = 'company-full-1';

const app = require('../src/app');

describe('GET /full/versions', () => {
  it('retorna 400 sem company_id', async () => {
    const res = await request(app)
      .get('/full/versions')
      .expect(400);
    expect(res.body.code || res.body.error).toBeDefined();
  });
});

describe('POST /full/versions/new', () => {
  it('retorna 400 sem company_id', async () => {
    const res = await request(app)
      .post('/full/versions/new')
      .expect(400);
    expect(res.body.code || res.body.error).toBeDefined();
  });
});

describe('GET /full/versions/:full_version/summary', () => {
  it('retorna 400 com versão inválida', async () => {
    const res = await request(app)
      .get('/full/versions/0/summary')
      .query({ company_id: COMPANY_ID })
      .expect(400);
    expect(res.body.code || res.body.error).toBeDefined();
  });
});

describe('GET /full/compare', () => {
  it('retorna 400 sem from/to', async () => {
    const res = await request(app)
      .get('/full/compare')
      .query({ company_id: COMPANY_ID })
      .expect(400);
    expect(res.body.code || res.body.error).toBeDefined();
  });
});

describe('POST /full/reports/generate', () => {
  it('retorna 400 sem company_id', async () => {
    const res = await request(app)
      .post('/full/reports/generate')
      .expect(400);
    expect(res.body.code || res.body.error).toBeDefined();
  });
});
