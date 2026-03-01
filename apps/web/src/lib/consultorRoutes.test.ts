/**
 * Testes unitários do util consultantRoutes.
 * Rodar: npm run test (no workspace apps/web)
 */
import { describe, it, expect } from 'vitest';
import {
  consultantHome,
  consultantCompanies,
  consultantMessages,
  consultantCompanyOverview,
  consultantCompaniesDetail,
  consultantCompanyAssessment,
  consultantCompaniesDiagnostic,
  consultantUser,
  consultantLight,
  consultantFull,
  consultantMessageThread,
  fullConsultor,
  fullConsultorCompany,
  fullConsultorAssessment,
  fullConsultorHistorico,
  fullConsultorRelatorio,
  fullDashboard,
  resolveCompanyId,
  isCompanyIdValid,
  isUserIdValid,
} from './consultorRoutes';

describe('consultorRoutes', () => {
  describe('rotas estáticas', () => {
    it('consultantHome retorna /consultor', () => {
      expect(consultantHome()).toBe('/consultor');
    });
    it('consultantCompanies retorna /consultor/companies', () => {
      expect(consultantCompanies()).toBe('/consultor/companies');
    });
    it('consultantMessages retorna /consultor/messages', () => {
      expect(consultantMessages()).toBe('/consultor/messages');
    });
    it('fullConsultor retorna /consultor (legado)', () => {
      expect(fullConsultor()).toBe('/consultor');
    });
  });

  describe('rotas com company_id', () => {
    it('consultantCompanyOverview com id válido', () => {
      expect(consultantCompanyOverview('abc-123')).toBe('/consultor/company/abc-123/overview');
    });
    it('consultantCompanyOverview retorna # para undefined', () => {
      expect(consultantCompanyOverview(undefined)).toBe('#');
    });
    it('consultantCompanyOverview retorna # para string vazia', () => {
      expect(consultantCompanyOverview('')).toBe('#');
    });
    it('consultantCompanyOverview retorna # para "undefined"', () => {
      expect(consultantCompanyOverview('undefined')).toBe('#');
    });
    it('consultantCompaniesDetail com id válido', () => {
      expect(consultantCompaniesDetail('xyz')).toBe('/consultor/companies/xyz');
    });
    it('fullConsultorCompany aponta para consultantCompanyOverview', () => {
      expect(fullConsultorCompany('cid-1')).toBe('/consultor/company/cid-1/overview');
      expect(fullConsultorCompany(undefined)).toBe('#');
      expect(fullConsultorCompany('undefined')).toBe('#');
    });
  });

  describe('rotas com company_id + user_id', () => {
    it('consultantUser com id válidos', () => {
      const url = consultantUser('c1', 'u1');
      expect(url).toContain('/consultor/user/u1');
      expect(url).toContain('company_id=c1');
    });
    it('consultantUser retorna # se company_id faltando', () => {
      expect(consultantUser(undefined, 'u1')).toBe('#');
    });
    it('consultantUser retorna # se user_id faltando', () => {
      expect(consultantUser('c1', undefined)).toBe('#');
    });
  });

  describe('rotas com company_id + assessment_id', () => {
    it('consultantLight nunca gera company_id=undefined', () => {
      expect(consultantLight('c1', 'a1')).toBe('/consultor/light/a1?company_id=c1');
      expect(consultantLight(undefined, 'a1')).toBe('#');
    });
    it('consultantFull nunca gera company_id=undefined', () => {
      expect(consultantFull('c1', 'a1')).toBe('/consultor/full/a1?company_id=c1');
    });
    it('fullConsultorAssessment aponta para consultantCompanyAssessment', () => {
      const url = fullConsultorAssessment('c1', 'a1');
      expect(url).toBe('/consultor/company/c1/assessment/a1?type=FULL');
    });
  });

  describe('resolveCompanyId', () => {
    it('retorna company_id quando presente', () => {
      expect(resolveCompanyId({ company_id: 'cid', id: 'ignored' })).toBe('cid');
    });
    it('retorna id quando company_id ausente', () => {
      expect(resolveCompanyId({ id: 'fallback-id' })).toBe('fallback-id');
    });
    it('retorna null para objeto vazio', () => {
      expect(resolveCompanyId({})).toBe(null);
    });
    it('retorna null para null/undefined', () => {
      expect(resolveCompanyId(null)).toBe(null);
      expect(resolveCompanyId(undefined)).toBe(null);
    });
  });

  describe('validadores', () => {
    it('isCompanyIdValid rejeita undefined, vazio, "undefined"', () => {
      expect(isCompanyIdValid(undefined)).toBe(false);
      expect(isCompanyIdValid('')).toBe(false);
      expect(isCompanyIdValid('undefined')).toBe(false);
    });
    it('isCompanyIdValid aceita UUID válido', () => {
      expect(isCompanyIdValid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });
    it('isUserIdValid mesmo comportamento', () => {
      expect(isUserIdValid('u1')).toBe(true);
      expect(isUserIdValid('undefined')).toBe(false);
    });
  });

  describe('consultantMessageThread', () => {
    it('retorna URL válida para thread_id', () => {
      expect(consultantMessageThread('t1')).toBe('/consultor/messages/t1');
    });
    it('retorna # para undefined', () => {
      expect(consultantMessageThread(undefined)).toBe('#');
    });
  });

  describe('fullConsultorHistorico e fullConsultorRelatorio (consultant paths)', () => {
    it('apontam para /consultor/company/:id/historico e relatorio', () => {
      expect(fullConsultorHistorico('c1')).toBe('/consultor/company/c1/historico');
      expect(fullConsultorHistorico(undefined)).toBe('#');
      expect(fullConsultorRelatorio('c1')).toBe('/consultor/company/c1/relatorio');
    });
  });

  describe('fullDashboard', () => {
    it('aponta para consultantCompanyAssessment', () => {
      const url = fullDashboard('c1', 'a1');
      expect(url).toBe('/consultor/company/c1/assessment/a1?type=FULL');
    });
    it('retorna # se algum faltando', () => {
      expect(fullDashboard(undefined, 'a1')).toBe('#');
      expect(fullDashboard('c1', undefined)).toBe('#');
    });
  });
});
