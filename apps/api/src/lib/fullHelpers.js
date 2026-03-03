/**
 * Helpers compartilhados para o módulo FULL.
 * Exporta constantes de banda, funções de score e utilitários de resposta.
 */

const BANDS_ORDER = ['LOW', 'MEDIUM', 'HIGH'];
const BAND_WORST_FIRST = { LOW: 0, MEDIUM: 1, HIGH: 2 };
const BAND_BEST_FIRST = { HIGH: 0, MEDIUM: 1, LOW: 2 };

function scoreToBand(score) {
  if (score < 4) return 'LOW';
  if (score < 7) return 'MEDIUM';
  return 'HIGH';
}

/** Converte score interno (0–10) para escala externa (0–100). */
function toExternalScore(s) {
  return Math.round((s ?? 0) * 10);
}

/**
 * Resposta de erro padronizada para UI: code (técnico) + message_user (texto para usuário).
 * O campo error é mantido como fallback para clientes legados.
 * @param {object} [extra] - campos extras (ex: missing) para incluir no JSON
 */
function apiError(res, status, code, messageUser, extra = {}) {
  return res.status(status).json({
    code,
    message_user: messageUser,
    error: messageUser,
    ...extra,
  });
}

function cycleClosed(res) {
  return apiError(res, 409, 'CYCLE_CLOSED', 'Ciclo fechado. Somente leitura.');
}

/** Gera ganho declarado determinístico (frase curta). */
function buildDeclaredGain(beforeStr, afterStr) {
  const b = String(beforeStr || '').trim() || '—';
  const a = String(afterStr || '').trim() || '—';
  return `De ${b} para ${a}`;
}

function avg(values) {
  if (!values || values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function firstNByOrder(arr, n, sorter) {
  return [...arr].sort(sorter).slice(0, n);
}

module.exports = {
  BANDS_ORDER,
  BAND_WORST_FIRST,
  BAND_BEST_FIRST,
  scoreToBand,
  toExternalScore,
  apiError,
  cycleClosed,
  buildDeclaredGain,
  avg,
  firstNByOrder,
};
