/**
 * auditLog — registro fire-and-forget de eventos de negócio críticos.
 *
 * Regras:
 *   - Falha NUNCA propaga para o handler principal (try/catch isolado).
 *   - Apenas campos previstos: event, user_id, company_id, assessment_id, meta.
 *   - Dados sensíveis (tokens, senhas, PII) nunca devem ir em meta — responsabilidade
 *     do chamador, não do schema.
 */

/**
 * @param {object} supabase  - cliente Supabase já instanciado
 * @param {object} params
 * @param {string} params.event          - identificador do evento (ex: 'plan_created')
 * @param {string} [params.userId]       - auth.users.id
 * @param {string} [params.companyId]    - companies.id
 * @param {string} [params.assessmentId] - full_assessments.id
 * @param {object} [params.meta]         - dados adicionais sem dados sensíveis
 */
async function logEvent(supabase, { event, userId, companyId, assessmentId, meta = {} }) {
  try {
    await supabase
      .from('audit_log')
      .insert({
        event,
        user_id: userId,
        company_id: companyId,
        assessment_id: assessmentId,
        meta,
      });
  } catch (e) {
    console.error('[AUDIT_LOG_FAIL]', event, e.message);
  }
}

module.exports = { logEvent };
