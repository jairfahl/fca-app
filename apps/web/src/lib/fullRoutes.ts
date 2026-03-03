/**
 * Construção determinística de URLs do módulo FULL (frontend).
 * Garante que nenhum link gere company_id=undefined ou assessment_id=undefined.
 * Funções puras: retornam '#' se input inválido (bloqueia navegação).
 *
 * Padrão idêntico ao consultorRoutes.ts — manter em sincronia.
 */

function isValidId(id: string | undefined | null): id is string {
  if (typeof id !== 'string') return false;
  const t = id.trim();
  return t.length > 0 && t !== 'undefined';
}

// ─── Rotas estáticas ─────────────────────────────────────────────────────────

/** Página de diagnóstico FULL — início do ciclo. */
export function fullDiagnostic(companyId: string | undefined | null): string {
  if (!isValidId(companyId)) return '#';
  return `/full/diagnostic?company_id=${encodeURIComponent(companyId)}`;
}

// ─── Rotas com company_id ─────────────────────────────────────────────────────

/** Wizard de respostas (questionário FULL). */
export function fullWizard(
  companyId: string | undefined | null,
  assessmentId?: string | null
): string {
  if (!isValidId(companyId)) return '#';
  const base = `/full/wizard?company_id=${encodeURIComponent(companyId)}`;
  return isValidId(assessmentId) ? `${base}&assessment_id=${encodeURIComponent(assessmentId!)}` : base;
}

/** Histórico de versões do ciclo FULL. */
export function fullHistorico(
  companyId: string | undefined | null,
  assessmentId?: string | null
): string {
  if (!isValidId(companyId)) return '#';
  const base = `/full/historico?company_id=${encodeURIComponent(companyId)}`;
  return isValidId(assessmentId) ? `${base}&assessment_id=${encodeURIComponent(assessmentId!)}` : base;
}

// ─── Rotas com company_id + assessment_id ─────────────────────────────────────

/** Dashboard de execução do plano FULL. */
export function fullDashboard(
  companyId: string | undefined | null,
  assessmentId: string | undefined | null
): string {
  if (!isValidId(companyId) || !isValidId(assessmentId)) return '#';
  return `/full/dashboard?company_id=${encodeURIComponent(companyId)}&assessment_id=${encodeURIComponent(assessmentId!)}`;
}

/** Resultados (six-pack: vazamentos + alavancas). */
export function fullResultados(
  companyId: string | undefined | null,
  assessmentId: string | undefined | null
): string {
  if (!isValidId(companyId) || !isValidId(assessmentId)) return '#';
  return `/full/resultados?company_id=${encodeURIComponent(companyId)}&assessment_id=${encodeURIComponent(assessmentId!)}`;
}

/** Seleção de ações do plano. */
export function fullAcoes(
  companyId: string | undefined | null,
  assessmentId: string | undefined | null
): string {
  if (!isValidId(companyId) || !isValidId(assessmentId)) return '#';
  return `/full/acoes?company_id=${encodeURIComponent(companyId)}&assessment_id=${encodeURIComponent(assessmentId!)}`;
}

/** Encerramento de ciclo. */
export function fullEncerramento(
  companyId: string | undefined | null,
  assessmentId: string | undefined | null
): string {
  if (!isValidId(companyId) || !isValidId(assessmentId)) return '#';
  return `/full/encerramento?company_id=${encodeURIComponent(companyId)}&assessment_id=${encodeURIComponent(assessmentId!)}`;
}

/** Relatório PDF. */
export function fullRelatorio(
  companyId: string | undefined | null,
  assessmentId: string | undefined | null
): string {
  if (!isValidId(companyId) || !isValidId(assessmentId)) return '#';
  return `/full/relatorio?company_id=${encodeURIComponent(companyId)}&assessment_id=${encodeURIComponent(assessmentId!)}`;
}

/** Comparação de ciclos (versões). */
export function fullComparar(
  companyId: string | undefined | null,
  assessmentId?: string | null
): string {
  if (!isValidId(companyId)) return '#';
  const base = `/full/comparar?company_id=${encodeURIComponent(companyId)}`;
  return isValidId(assessmentId) ? `${base}&assessment_id=${encodeURIComponent(assessmentId!)}` : base;
}

// ─── Rotas de detalhe de ação ─────────────────────────────────────────────────

/** Página de detalhe/evidência de uma ação individual. */
export function fullAcao(
  actionId: string | undefined | null,
  companyId: string | undefined | null,
  assessmentId: string | undefined | null
): string {
  if (!isValidId(actionId) || !isValidId(companyId) || !isValidId(assessmentId)) return '#';
  return `/full/acao/${encodeURIComponent(actionId!)}?company_id=${encodeURIComponent(companyId!)}&assessment_id=${encodeURIComponent(assessmentId!)}`;
}

/** Página de DoD (Definition of Done) de uma ação. */
export function fullDod(
  actionKey: string | undefined | null,
  companyId: string | undefined | null,
  assessmentId: string | undefined | null
): string {
  if (!isValidId(actionKey) || !isValidId(companyId) || !isValidId(assessmentId)) return '#';
  return `/full/dod/${encodeURIComponent(actionKey!)}?company_id=${encodeURIComponent(companyId!)}&assessment_id=${encodeURIComponent(assessmentId!)}`;
}

// ─── Helpers de runtime guard ─────────────────────────────────────────────────

/** Verifica se company_id é válido (não undefined/null/vazio/"undefined"). */
export function isCompanyIdValid(value: string | null | undefined): boolean {
  return isValidId(value);
}

/** Verifica se assessment_id é válido. */
export function isAssessmentIdValid(value: string | null | undefined): boolean {
  return isValidId(value);
}
