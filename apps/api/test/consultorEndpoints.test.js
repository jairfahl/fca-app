/**
 * Testes de contrato: endpoints /consultor/* (200 para CONSULTOR/ADMIN, 403 para USER)
 */
const request = require('supertest');

jest.mock('../src/middleware/requireAuth', () => ({
  requireAuth: (req, res, next) => {
    const auth = req.headers.authorization || '';
    if (auth.includes('consultor')) {
      req.user = { id: 'c1', email: 'consultor@fca.com', role: 'CONSULTOR' };
    } else if (auth.includes('admin')) {
      req.user = { id: 'a1', email: 'admin@fca.com', role: 'ADMIN' };
    } else {
      req.user = { id: 'u1', email: 'fca@fca.com', role: 'USER' };
    }
    return next();
  },
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
      maybeSingle: () => Promise.resolve({
        data: Array.isArray(data) ? (data[0] || null) : data,
        error,
      }),
      single: () => Promise.resolve({ data: Array.isArray(data) ? data[0] : data, error }),
      then: (fn) => Promise.resolve({ data, error }).then(fn),
      catch: (fn) => Promise.resolve({ data, error }).catch(fn),
    };
    return chain;
  };
  const getTableResult = (table) => {
    if (table === 'companies') return [{ id: 'company-1', name: 'X', owner_user_id: 'u1', created_at: '2020-01-01' }];
    if (table === 'consultor_companies') return global.__mockConsultorCompanies ?? [];
    if (table === 'entitlements') return null;
    if (table === 'full_assessments') return null;
    if (table === 'assessments') return [];
    if (table === 'assessment_items') return [];
    if (table === 'full_answers') return [];
    if (table === 'support_messages') return [];
    return [];
  };
  return {
    supabase: {
      schema: jest.fn().mockReturnValue({
        from: jest.fn().mockImplementation((table) => createChain(getTableResult(table))),
      }),
      from: jest.fn().mockImplementation((table) => createChain(getTableResult(table))),
      auth: {
        admin: {
          listUsers: jest.fn().mockResolvedValue({ data: { users: [] }, error: null }),
        },
      },
    },
  };
});

jest.mock('../src/lib/consultorAudit', () => ({ logConsultorAccess: jest.fn() }));

const app = require('../src/app');

describe('GET /consultor/users', () => {
  it('CONSULTOR retorna 200', async () => {
    const res = await request(app)
      .get('/consultor/users')
      .set('Authorization', 'Bearer consultor-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('users');
    expect(res.body).toHaveProperty('pagination');
  });

  it('ADMIN retorna 200', async () => {
    const res = await request(app)
      .get('/consultor/users')
      .set('Authorization', 'Bearer admin-token');

    expect(res.status).toBe(200);
  });

  it('USER retorna 403', async () => {
    const res = await request(app)
      .get('/consultor/users')
      .set('Authorization', 'Bearer user-token');

    expect(res.status).toBe(403);
    expect(res.body.error || res.body.message_user).toBeDefined();
  });
});

describe('GET /consultor/companies', () => {
  it('CONSULTOR retorna 200', async () => {
    const res = await request(app)
      .get('/consultor/companies')
      .set('Authorization', 'Bearer consultor-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('companies');
  });

  it('USER retorna 403', async () => {
    const res = await request(app)
      .get('/consultor/companies')
      .set('Authorization', 'Bearer user-token');

    expect(res.status).toBe(403);
  });
});

describe('GET /consultor/companies — filtro por vínculo consultor↔empresa', () => {
  beforeEach(() => {
    global.__mockConsultorCompanies = [];
  });

  it('CONSULTOR sem empresas vinculadas retorna array vazio', async () => {
    global.__mockConsultorCompanies = [];

    const res = await request(app)
      .get('/consultor/companies')
      .set('Authorization', 'Bearer consultor-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('companies');
    expect(res.body.companies).toHaveLength(0);
  });

  it('CONSULTOR com 1 empresa vinculada retorna só ela', async () => {
    global.__mockConsultorCompanies = [{ company_id: 'company-1' }];

    const res = await request(app)
      .get('/consultor/companies')
      .set('Authorization', 'Bearer consultor-token');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.companies)).toBe(true);
    expect(res.body.companies).toHaveLength(1);
    expect(res.body.companies[0].company_id).toBe('company-1');
  });

  it('ADMIN retorna todas as empresas independente de vínculos', async () => {
    global.__mockConsultorCompanies = []; // ADMIN não usa esta tabela

    const res = await request(app)
      .get('/consultor/companies')
      .set('Authorization', 'Bearer admin-token');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.companies)).toBe(true);
    expect(res.body.companies.length).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /consultor/assessments', () => {
  it('CONSULTOR retorna 200 com company_id', async () => {
    const res = await request(app)
      .get('/consultor/assessments')
      .query({ company_id: 'company-1' })
      .set('Authorization', 'Bearer consultor-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('company_id');
    expect(res.body).toHaveProperty('light');
    expect(res.body).toHaveProperty('full');
  });

  it('retorna 400 sem company_id', async () => {
    const res = await request(app)
      .get('/consultor/assessments')
      .set('Authorization', 'Bearer consultor-token');

    expect(res.status).toBe(400);
  });

  it('USER retorna 403', async () => {
    const res = await request(app)
      .get('/consultor/assessments')
      .query({ company_id: 'company-1' })
      .set('Authorization', 'Bearer user-token');

    expect(res.status).toBe(403);
  });
});

describe('GET /consultor/assessment/:assessment_id/summary', () => {
  it('CONSULTOR retorna 404 quando assessment não existe', async () => {
    const res = await request(app)
      .get('/consultor/assessment/00000000-0000-0000-0000-000000000001/summary')
      .set('Authorization', 'Bearer consultor-token');

    expect(res.status).toBe(404);
  });

  it('USER retorna 403', async () => {
    const res = await request(app)
      .get('/consultor/assessment/00000000-0000-0000-0000-000000000001/summary')
      .set('Authorization', 'Bearer user-token');

    expect(res.status).toBe(403);
  });
});

describe('GET /consultor/messages', () => {
  it('CONSULTOR retorna 200', async () => {
    const res = await request(app)
      .get('/consultor/messages')
      .set('Authorization', 'Bearer consultor-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('messages');
  });

  it('USER retorna 403', async () => {
    const res = await request(app)
      .get('/consultor/messages')
      .set('Authorization', 'Bearer user-token');

    expect(res.status).toBe(403);
  });
});
