/**
 * Construção determinística de URLs do módulo CONSULTOR.
 * Garante que nenhum link gere company_id=undefined ou user_id=undefined.
 * Funções puras: retornam '#' se input inválido (bloqueia navegação).
 */

function isValidId(id: string | undefined | null): id is string {
  if (typeof id !== 'string') return false;
  const t = id.trim();
  return t.length > 0 && t !== 'undefined';
}

/** Resolve company_id de item que pode ter company_id ou id (API inconsistente). */
export function resolveCompanyId(c: { company_id?: string; id?: string } | null | undefined): string | null {
  if (!c) return null;
  const v = c.company_id ?? c.id;
  return isValidId(v) ? v : null;
}

// --- Rotas estáticas (sem params) ---

export function consultantHome(): string {
  return '/consultor';
}

export function consultantCompanies(): string {
  return '/consultor/companies';
}

export function consultantMessages(): string {
  return '/consultor/messages';
}

/** @deprecated Use consultantHome(). Mantido para compatibilidade. */
export function fullConsultor(): string {
  return '/consultor';
}

// --- Rotas com company_id ---

export function consultantCompanyOverview(companyId: string | undefined | null): string {
  if (!isValidId(companyId)) return '#';
  return `/consultor/company/${companyId}/overview`;
}

export function consultantCompaniesDetail(companyId: string | undefined | null): string {
  if (!isValidId(companyId)) return '#';
  return `/consultor/companies/${companyId}`;
}

export function consultantCompanyAssessment(
  companyId: string | undefined | null,
  assessmentId: string | undefined | null,
  type?: 'LIGHT' | 'FULL'
): string {
  if (!isValidId(companyId) || !isValidId(assessmentId)) return '#';
  const q = type ? `?type=${type}` : '';
  return `/consultor/company/${companyId}/assessment/${assessmentId}${q}`;
}

export function consultantCompaniesDiagnostic(
  companyId: string | undefined | null,
  assessmentId: string | undefined | null
): string {
  if (!isValidId(companyId) || !isValidId(assessmentId)) return '#';
  return `/consultor/companies/${companyId}/diagnostics/${assessmentId}`;
}

// --- Rotas com company_id + user_id ---

export function consultantUser(companyId: string | undefined | null, userId: string | undefined | null): string {
  if (!isValidId(companyId) || !isValidId(userId)) return '#';
  return `/consultor/user/${userId}?company_id=${encodeURIComponent(companyId)}`;
}

// --- Rotas com company_id + assessment_id (LIGHT/FULL read-only) ---

export function consultantLight(companyId: string | undefined | null, assessmentId: string | undefined | null): string {
  if (!isValidId(companyId) || !isValidId(assessmentId)) return '#';
  return `/consultor/light/${assessmentId}?company_id=${encodeURIComponent(companyId)}`;
}

export function consultantFull(companyId: string | undefined | null, assessmentId: string | undefined | null): string {
  if (!isValidId(companyId) || !isValidId(assessmentId)) return '#';
  return `/consultor/full/${assessmentId}?company_id=${encodeURIComponent(companyId)}`;
}

// --- Rotas FULL consultor (legado: apontam para /consultor/*) ---

/** @deprecated Use consultantCompanyOverview. */
export function fullConsultorCompany(companyId: string | undefined | null): string {
  return consultantCompanyOverview(companyId);
}

/** @deprecated Use consultantCompanyAssessment. */
export function fullConsultorAssessment(
  companyId: string | undefined | null,
  assessmentId: string | undefined | null
): string {
  return consultantCompanyAssessment(companyId, assessmentId, 'FULL');
}

/** Histórico de versões FULL (consultor) — company_id na URL. */
export function consultantHistorico(companyId: string | undefined | null): string {
  if (!isValidId(companyId)) return '#';
  return `/consultor/company/${companyId}/historico`;
}

/** Relatório PDF (consultor) — company_id na URL. */
export function consultantRelatorio(companyId: string | undefined | null): string {
  if (!isValidId(companyId)) return '#';
  return `/consultor/company/${companyId}/relatorio`;
}

/** @deprecated Use consultantHistorico. */
export function fullConsultorHistorico(companyId: string | undefined | null): string {
  return consultantHistorico(companyId);
}

/** @deprecated Use consultantRelatorio. */
export function fullConsultorRelatorio(companyId: string | undefined | null): string {
  return consultantRelatorio(companyId);
}

/** Dashboard/acompanhar execução (consultor) → assessment page. */
export function fullDashboard(companyId: string | undefined | null, assessmentId: string | undefined | null): string {
  return consultantCompanyAssessment(companyId, assessmentId, 'FULL');
}

// --- Rotas com thread_id ---

export function consultantMessageThread(threadId: string | undefined | null): string {
  if (!isValidId(threadId)) return '#';
  return `/consultor/messages/${threadId}`;
}

// --- Helpers para guardrail de runtime ---

/** Verifica se company_id na URL é válido (não undefined/vazio). */
export function isCompanyIdValid(value: string | null | undefined): boolean {
  return isValidId(value);
}

/** Verifica se user_id na URL é válido. */
export function isUserIdValid(value: string | null | undefined): boolean {
  return isValidId(value);
}
