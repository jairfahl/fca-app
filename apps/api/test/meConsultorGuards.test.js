/**
 * Testes mínimos: blockConsultorOnMutation e GET /me.
 * - CONSULTOR em POST /assessments/light => 403 CONSULTOR_NOT_ALLOWED
 * - USER em POST /assessments/light => passa blockConsultorOnMutation (pode 403 por company)
 */
const request = require('supertest');

jest.mock('../src/middleware/requireAuth', () => ({
  requireAuth: (req, res, next) => {
    req.user = req._testUser || { id: 'user-1', email: 'test@fca.com', role: 'USER' };
    next();
  },
}));

const app = require('../src/app');

describe('GET /me', () => {
  it('retorna user_id, email, role quando autenticado', async () => {
    const res = await request(app)
      .get('/me')
      .set('Authorization', 'Bearer x');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user_id');
    expect(res.body).toHaveProperty('role');
    expect(['USER', 'CONSULTOR', 'ADMIN']).toContain(res.body.role);
  });
});

describe('blockConsultorOnMutation em POST /assessments/light', () => {
  it('CONSULTOR recebe 403 CONSULTOR_NOT_ALLOWED', async () => {
    // O mock de requireAuth usa req._testUser; não temos como setar via request
    // Precisamos mockar requireAuth para injetar role CONSULTOR neste teste
    const { blockConsultorOnMutation } = require('../src/middleware/guards');
    const mockReq = {
      user: { id: 'c1', email: 'consultor@fca.com', role: 'CONSULTOR' },
      method: 'POST',
      path: '/assessments/light',
    };
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    const mockNext = jest.fn();
    blockConsultorOnMutation(mockReq, mockRes, mockNext);
    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'CONSULTOR_NOT_ALLOWED',
        message_user: 'Acesso de consultor é pelo painel do consultor.',
      })
    );
  });

  it('USER passa (chama next)', () => {
    const { blockConsultorOnMutation } = require('../src/middleware/guards');
    const mockReq = { user: { id: 'u1', role: 'USER' } };
    const mockRes = {};
    const mockNext = jest.fn();
    blockConsultorOnMutation(mockReq, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('ADMIN passa (chama next)', () => {
    const { blockConsultorOnMutation } = require('../src/middleware/guards');
    const mockReq = { user: { id: 'a1', role: 'ADMIN' } };
    const mockRes = {};
    const mockNext = jest.fn();
    blockConsultorOnMutation(mockReq, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });
});
