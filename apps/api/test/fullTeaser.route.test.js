const request = require('supertest');

jest.mock('../src/middleware/requireAuth', () => ({
  requireAuth: (req, res, next) => {
    req.user = { id: 'user-1', email: 'test@example.com' };
    return next();
  }
}));

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    from: jest.fn()
  }
}));

const { supabase } = require('../src/lib/supabase');
const app = require('../src/app');

function mockFrom(table) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn(),
    order: jest.fn(),
    in: jest.fn()
  };

  if (table === 'assessments') {
    chain.maybeSingle.mockResolvedValue({
      data: { id: 'assessment-1', company_id: 'company-1', status: 'COMPLETED' },
      error: null
    });
  }

  if (table === 'companies') {
    chain.maybeSingle.mockResolvedValue({
      data: { id: 'company-1', owner_user_id: 'user-1' },
      error: null
    });
  }

  if (table === 'scores') {
    chain.maybeSingle.mockResolvedValue({
      data: { admin_fin: 2, management: 5, commercial: 5, operations: 5, overall: 4.25 },
      error: null
    });
  }

  if (table === 'full_assessment_initiatives') {
    chain.order.mockResolvedValue({
      data: [
        { rank: 1, initiative_id: 'init-1', process: 'COMERCIAL' },
        { rank: 2, initiative_id: 'init-2', process: 'OPERACOES' },
        { rank: 3, initiative_id: 'init-3', process: 'ADM_FIN' },
        { rank: 4, initiative_id: 'init-4', process: 'GESTAO' }
      ],
      error: null
    });
  }

  if (table === 'full_initiatives_catalog') {
    chain.in.mockResolvedValue({
      data: [
        { id: 'init-1', title: 'Iniciativa 1', process: 'COMERCIAL', impact: 'HIGH', dependencies_json: [] },
        { id: 'init-2', title: 'Iniciativa 2', process: 'OPERACOES', impact: 'MED', dependencies_json: [] },
        { id: 'init-3', title: 'Iniciativa 3', process: 'ADM_FIN', impact: 'LOW', dependencies_json: [] },
        { id: 'init-4', title: 'Iniciativa 4', process: 'GESTAO', impact: 'HIGH', dependencies_json: [] }
      ],
      error: null
    });
  }

  return chain;
}

describe('GET /assessments/:id/full-teaser', () => {
  beforeEach(() => {
    supabase.from.mockImplementation(mockFrom);
  });

  afterEach(() => {
    supabase.from.mockReset();
  });

  it('retorna teaser e não cai na rota genérica', async () => {
    const res = await request(app)
      .get('/assessments/11111111-1111-1111-1111-111111111111/full-teaser')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeLessThanOrEqual(3);
    expect(res.body.locked_count).toBe(1);
    expect(res.body).not.toHaveProperty('assessment');
  });
});
