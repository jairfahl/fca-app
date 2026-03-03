/**
 * Testes para fullRoutes.ts — construtores de URL determinísticos do módulo FULL.
 * Padrão idêntico a consultorRoutes.test.ts.
 */
import { describe, test, expect } from 'vitest';
import {
  fullDiagnostic,
  fullWizard,
  fullDashboard,
  fullResultados,
  fullAcoes,
  fullEncerramento,
  fullRelatorio,
  fullHistorico,
  fullComparar,
  fullAcao,
  fullDod,
  isCompanyIdValid,
  isAssessmentIdValid,
} from './fullRoutes';

const COMPANY = 'c6f7e28a-0000-0000-0000-000000000001';
const ASSESSMENT = 'a1b2c3d4-0000-0000-0000-000000000002';
const ACTION_KEY = 'COMERCIAL_GESTAO_META';
const ACTION_ID = 'action-uuid-123';

describe('fullRoutes — inputs inválidos retornam #', () => {
  const invalidCases = [undefined, null, '', 'undefined'];

  test.each(invalidCases)('fullDashboard com companyId=%p', (bad) => {
    expect(fullDashboard(bad as any, ASSESSMENT)).toBe('#');
  });

  test.each(invalidCases)('fullDashboard com assessmentId=%p', (bad) => {
    expect(fullDashboard(COMPANY, bad as any)).toBe('#');
  });

  test.each(invalidCases)('fullResultados com companyId=%p', (bad) => {
    expect(fullResultados(bad as any, ASSESSMENT)).toBe('#');
  });

  test.each(invalidCases)('fullAcoes com assessmentId=%p', (bad) => {
    expect(fullAcoes(COMPANY, bad as any)).toBe('#');
  });

  test.each(invalidCases)('fullWizard com companyId=%p', (bad) => {
    expect(fullWizard(bad as any)).toBe('#');
  });
});

describe('fullRoutes — URLs válidas', () => {
  test('fullDiagnostic', () => {
    expect(fullDiagnostic(COMPANY)).toBe(`/full/diagnostic?company_id=${COMPANY}`);
  });

  test('fullWizard sem assessmentId', () => {
    expect(fullWizard(COMPANY)).toBe(`/full/wizard?company_id=${COMPANY}`);
  });

  test('fullWizard com assessmentId', () => {
    expect(fullWizard(COMPANY, ASSESSMENT)).toBe(
      `/full/wizard?company_id=${COMPANY}&assessment_id=${ASSESSMENT}`
    );
  });

  test('fullDashboard', () => {
    expect(fullDashboard(COMPANY, ASSESSMENT)).toBe(
      `/full/dashboard?company_id=${COMPANY}&assessment_id=${ASSESSMENT}`
    );
  });

  test('fullResultados', () => {
    expect(fullResultados(COMPANY, ASSESSMENT)).toBe(
      `/full/resultados?company_id=${COMPANY}&assessment_id=${ASSESSMENT}`
    );
  });

  test('fullAcoes', () => {
    expect(fullAcoes(COMPANY, ASSESSMENT)).toBe(
      `/full/acoes?company_id=${COMPANY}&assessment_id=${ASSESSMENT}`
    );
  });

  test('fullEncerramento', () => {
    expect(fullEncerramento(COMPANY, ASSESSMENT)).toBe(
      `/full/encerramento?company_id=${COMPANY}&assessment_id=${ASSESSMENT}`
    );
  });

  test('fullRelatorio', () => {
    expect(fullRelatorio(COMPANY, ASSESSMENT)).toBe(
      `/full/relatorio?company_id=${COMPANY}&assessment_id=${ASSESSMENT}`
    );
  });

  test('fullHistorico sem assessmentId', () => {
    expect(fullHistorico(COMPANY)).toBe(`/full/historico?company_id=${COMPANY}`);
  });

  test('fullHistorico com assessmentId', () => {
    expect(fullHistorico(COMPANY, ASSESSMENT)).toBe(
      `/full/historico?company_id=${COMPANY}&assessment_id=${ASSESSMENT}`
    );
  });

  test('fullComparar sem assessmentId', () => {
    expect(fullComparar(COMPANY)).toBe(`/full/comparar?company_id=${COMPANY}`);
  });

  test('fullAcao', () => {
    expect(fullAcao(ACTION_ID, COMPANY, ASSESSMENT)).toBe(
      `/full/acao/${ACTION_ID}?company_id=${COMPANY}&assessment_id=${ASSESSMENT}`
    );
  });

  test('fullDod', () => {
    expect(fullDod(ACTION_KEY, COMPANY, ASSESSMENT)).toBe(
      `/full/dod/${ACTION_KEY}?company_id=${COMPANY}&assessment_id=${ASSESSMENT}`
    );
  });
});

describe('isCompanyIdValid / isAssessmentIdValid', () => {
  test('válido com UUID', () => {
    expect(isCompanyIdValid(COMPANY)).toBe(true);
    expect(isAssessmentIdValid(ASSESSMENT)).toBe(true);
  });

  test('inválido com string "undefined"', () => {
    expect(isCompanyIdValid('undefined')).toBe(false);
    expect(isAssessmentIdValid('undefined')).toBe(false);
  });

  test('inválido com null/undefined', () => {
    expect(isCompanyIdValid(null)).toBe(false);
    expect(isAssessmentIdValid(undefined)).toBe(false);
  });

  test('inválido com string vazia', () => {
    expect(isCompanyIdValid('')).toBe(false);
  });
});
