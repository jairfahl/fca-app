/**
 * Construtores de URLs para chamadas à API backend (não navegação).
 * Elimina interpolações de string espalhadas e garante consistência de query params.
 *
 * Uso:
 *   import { api } from '@/lib/apiRoutes';
 *   const data = await apiFetch(api.full.current(companyId), {}, token);
 */

export const api = {
  // ─── FULL ────────────────────────────────────────────────────────────────────

  full: {
    /** Assessment corrente (ou cria DRAFT). Usado pelo wizard. */
    current: (companyId: string, opts?: { forWizard?: boolean }) =>
      `/full/assessments/current?company_id=${encodeURIComponent(companyId)}${opts?.forWizard ? '&for_wizard=1' : ''}`,

    /** Detalhes de um assessment específico. */
    assessment: (assessmentId: string, companyId: string) =>
      `/full/assessments/${encodeURIComponent(assessmentId)}?company_id=${encodeURIComponent(companyId)}`,

    /** Status do assessment. */
    status: (assessmentId: string, companyId: string) =>
      `/full/assessments/${encodeURIComponent(assessmentId)}/status?company_id=${encodeURIComponent(companyId)}`,

    /** Respostas (GET). */
    answers: (assessmentId: string, companyId: string) =>
      `/full/assessments/${encodeURIComponent(assessmentId)}/answers?company_id=${encodeURIComponent(companyId)}`,

    /** Submit (POST). */
    submit: (assessmentId: string) =>
      `/full/assessments/${encodeURIComponent(assessmentId)}/submit`,

    /** Resultados (six-pack). */
    results: (assessmentId: string, companyId: string) =>
      `/full/assessments/${encodeURIComponent(assessmentId)}/results?company_id=${encodeURIComponent(companyId)}`,

    /** Catálogo de processos. */
    catalog: (companyId: string) =>
      `/full/catalog?company_id=${encodeURIComponent(companyId)}`,

    /** Recomendações (ações disponíveis). */
    recommendations: (assessmentId: string, companyId: string) =>
      `/full/assessments/${encodeURIComponent(assessmentId)}/recommendations?company_id=${encodeURIComponent(companyId)}`,

    /** Selecionar ações do plano. */
    planSelect: (assessmentId: string) =>
      `/full/assessments/${encodeURIComponent(assessmentId)}/plan/select`,

    /** Detalhe do plano (GET). */
    plan: (assessmentId: string, companyId: string) =>
      `/full/assessments/${encodeURIComponent(assessmentId)}/plan?company_id=${encodeURIComponent(companyId)}`,

    /** Evidência de uma ação. */
    evidence: (assessmentId: string, actionKey: string) =>
      `/full/assessments/${encodeURIComponent(assessmentId)}/plan/${encodeURIComponent(actionKey)}/evidence`,

    /** DoD de uma ação (GET). */
    dod: (actionKey: string) =>
      `/full/actions/${encodeURIComponent(actionKey)}/dod`,

    /** Confirmar DoD de uma ação (POST). */
    dodConfirm: (assessmentId: string, actionKey: string) =>
      `/full/assessments/${encodeURIComponent(assessmentId)}/plan/${encodeURIComponent(actionKey)}/dod/confirm`,

    /** Dashboard de execução. */
    dashboard: (assessmentId: string, companyId: string) =>
      `/full/assessments/${encodeURIComponent(assessmentId)}/dashboard?company_id=${encodeURIComponent(companyId)}`,

    /** Close summary. */
    closeSummary: (assessmentId: string, companyId: string) =>
      `/full/assessments/${encodeURIComponent(assessmentId)}/close-summary?company_id=${encodeURIComponent(companyId)}`,

    /** Fechar ciclo (POST). */
    close: (assessmentId: string) =>
      `/full/assessments/${encodeURIComponent(assessmentId)}/close`,

    /** Relatório PDF (sync, para download direto). */
    reportPdf: (assessmentId: string) =>
      `/full/reports/${encodeURIComponent(assessmentId)}.pdf`,

    /** Gerar relatório async (POST). */
    reportGenerate: () => '/full/reports/generate',

    /** Status do job de relatório. */
    reportStatus: (assessmentId: string) =>
      `/full/reports/status?assessment_id=${encodeURIComponent(assessmentId)}`,

    /** Versões. */
    versions: (companyId: string) =>
      `/full/versions?company_id=${encodeURIComponent(companyId)}`,

    /** Comparar versões. */
    compare: (companyId: string, v1?: string, v2?: string) => {
      let url = `/full/compare?company_id=${encodeURIComponent(companyId)}`;
      if (v1) url += `&v1=${encodeURIComponent(v1)}`;
      if (v2) url += `&v2=${encodeURIComponent(v2)}`;
      return url;
    },

    /** Status global de cause engine. */
    fullStatus: (companyId: string) =>
      `/full/status?company_id=${encodeURIComponent(companyId)}`,

    /** Causas pendentes. */
    causesPending: (companyId: string) =>
      `/full/causes/pending?company_id=${encodeURIComponent(companyId)}`,

    /** Status do plano (ações restantes). */
    planStatus: (companyId: string) =>
      `/full/plan/status?company_id=${encodeURIComponent(companyId)}`,
  },

  // ─── LIGHT (F3) ──────────────────────────────────────────────────────────────

  light: {
    /** Recomendações LIGHT. */
    recommendations: (assessmentId: string) =>
      `/assessments/${encodeURIComponent(assessmentId)}/recommendations`,

    /** Status do plano LIGHT por processo. */
    planStatus: (companyId: string) =>
      `/light/plans/status?company_id=${encodeURIComponent(companyId)}`,

    /** Detalhes de ação gratuita. */
    freeAction: (id: string) =>
      `/free-actions/${encodeURIComponent(id)}`,

    /** Evidência de ação gratuita (POST). */
    freeActionEvidence: (id: string) =>
      `/free-actions/${encodeURIComponent(id)}/evidence`,
  },

  // ─── CONSULTOR ───────────────────────────────────────────────────────────────

  consultor: {
    companies: () => '/consultor/companies',

    companyDiagnostics: (companyId: string) =>
      `/consultor/companies/${encodeURIComponent(companyId)}/diagnostics`,

    assessmentSummary: (assessmentId: string) =>
      `/consultor/assessment/${encodeURIComponent(assessmentId)}/summary`,

    companyOverview: (companyId: string) =>
      `/consultor/company/${encodeURIComponent(companyId)}/overview`,

    users: (page = 1, limit = 50) =>
      `/consultor/users?page=${page}&limit=${limit}`,
  },

  // ─── AUTH / ME ───────────────────────────────────────────────────────────────

  me: () => '/me',
};
