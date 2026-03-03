/**
 * Fábrica de erros HTTP padronizados.
 * Cada função aceita (res) e retorna res.status(...).json({ code, message_user, error }).
 *
 * Uso:
 *   const { httpErrors } = require('./httpErrors');
 *   return httpErrors.DIAG_NOT_READY(res);
 *   return httpErrors.CYCLE_CLOSED(res);
 *   return httpErrors.FORBIDDEN(res, 'Mensagem opcional');
 */
const { apiError } = require('./fullHelpers');

const httpErrors = {
  // 400 — Bad Request
  DIAG_NOT_READY: (res, msg) =>
    apiError(res, 400, 'DIAG_NOT_READY', msg || 'Diagnóstico não está pronto. Conclua o questionário primeiro.'),

  MISSING_COMPANY: (res) =>
    apiError(res, 400, 'MISSING_COMPANY', 'company_id é obrigatório.'),

  MISSING_ASSESSMENT: (res) =>
    apiError(res, 400, 'MISSING_ASSESSMENT', 'assessment_id é obrigatório.'),

  EVIDENCE_REQUIRED: (res, extra = {}) =>
    apiError(res, 400, 'EVIDENCE_REQUIRED', 'Evidência obrigatória antes de marcar como concluído.', extra),

  PLAN_INCOMPLETE: (res, extra = {}) =>
    apiError(res, 400, 'PLAN_INCOMPLETE', 'Plano incompleto — selecione as ações obrigatórias antes de fechar.', extra),

  INVALID_INPUT: (res, msg) =>
    apiError(res, 400, 'INVALID_INPUT', msg || 'Dados inválidos na requisição.'),

  // 403 — Forbidden
  FORBIDDEN: (res, msg) =>
    apiError(res, 403, 'FORBIDDEN', msg || 'Acesso negado.'),

  FULL_REQUIRED: (res) =>
    apiError(res, 403, 'FULL_REQUIRED', 'Conteúdo disponível apenas no plano FULL.'),

  // 404 — Not Found
  NOT_FOUND: (res, entity = 'Recurso') =>
    apiError(res, 404, 'NOT_FOUND', `${entity} não encontrado.`),

  ASSESSMENT_NOT_FOUND: (res) =>
    apiError(res, 404, 'ASSESSMENT_NOT_FOUND', 'Assessment não encontrado.'),

  // 409 — Conflict
  CYCLE_CLOSED: (res) =>
    apiError(res, 409, 'CYCLE_CLOSED', 'Ciclo fechado. Somente leitura.'),

  EVIDENCE_WRITE_ONCE: (res) =>
    apiError(res, 409, 'EVIDENCE_WRITE_ONCE', 'Evidência já registrada para esta ação.'),

  ALREADY_SUBMITTED: (res) =>
    apiError(res, 409, 'ALREADY_SUBMITTED', 'Assessment já foi submetido.'),

  // 500 — Internal Server Error
  INTERNAL: (res, msg) =>
    apiError(res, 500, 'INTERNAL_ERROR', msg || 'Erro interno inesperado.'),
};

module.exports = { httpErrors };
