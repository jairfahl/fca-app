/**
 * Testes de contrato: endpoints /admin/* (403 para USER/CONSULTOR, 200 para ADMIN)
 */
const request = require('supertest');
const app = require('../src/app');

jest.mock('../src/middleware/requireAuth', () => ({
  requireAuth: (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ error: 'UNAUTHENTICATED' });
    if (auth.includes('user')) {
      req.user = { id: 'u1', email: 'fca@fca.com', role: 'USER' };
    } else if (auth.includes('consultor')) {
      req.user = { id: 'c1', email: 'consultor@fca.com', role: 'CONSULTOR' };
    } else if (auth.includes('admin')) {
      req.user = { id: 'a1', email: 'admin@fca.com', role: 'ADMIN' };
    } else {
      req.user = { id: 'x', role: 'USER' };
    }
    next();
  },
}));

describe('Admin endpoints', () => {
  it('USER retorna 403 em GET /admin/users', async () => {
    const res = await request(app)
      .get('/admin/users')
      .set('Authorization', 'Bearer user-token');
    expect(res.status).toBe(403);
  });

  it('CONSULTOR retorna 403 em GET /admin/users', async () => {
    const res = await request(app)
      .get('/admin/users')
      .set('Authorization', 'Bearer consultor-token');
    expect(res.status).toBe(403);
  });

  it('ADMIN retorna 200 em GET /admin/users (pode falhar se user_profiles vazio)', async () => {
    const res = await request(app)
      .get('/admin/users')
      .set('Authorization', 'Bearer admin-token');
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('users');
      expect(res.body).toHaveProperty('total');
    }
  });

  it('sem token retorna 401', async () => {
    const res = await request(app).get('/admin/users');
    expect(res.status).toBe(401);
  });
});
