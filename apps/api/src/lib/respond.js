/**
 * Wrappers de resposta HTTP padronizados.
 *
 * Uso:
 *   const { ok, err } = require('./respond');
 *   return ok(res, { assessment });
 *   return err(res, 400, 'INVALID_INPUT', 'Dados inválidos.');
 */

/**
 * Resposta de sucesso: { status: 'ok', ...data, ...meta }
 * @param {object} res - Express response
 * @param {object} data - Payload principal
 * @param {object} [meta] - Campos extras no nível raiz (ex: { page, total })
 */
function ok(res, data, meta = {}) {
  return res.json({ status: 'ok', ...data, ...meta });
}

/**
 * Resposta de erro: { status: 'error', code, message_user, error, ...extra }
 * @param {object} res - Express response
 * @param {number} status - HTTP status code
 * @param {string} code - Código de erro técnico (ex: 'DIAG_NOT_READY')
 * @param {string} msg - Mensagem para o usuário
 * @param {object} [extra] - Campos extras (ex: { missing: ['company_id'] })
 */
function err(res, status, code, msg, extra = {}) {
  return res.status(status).json({
    status: 'error',
    code,
    message_user: msg,
    error: msg, // backward-compat com clientes legados
    ...extra,
  });
}

module.exports = { ok, err };
