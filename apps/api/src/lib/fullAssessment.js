/**
 * Helpers para assessment FULL: get-or-create current.
 */
const { supabase } = require('./supabase');

const SEGMENT_MAP = {
  COMERCIO: 'C',
  INDUSTRIA: 'I',
  SERVICOS: 'S',
};

function companySegmentToFull(companySegment) {
  if (!companySegment) return 'C';
  const u = String(companySegment).toUpperCase();
  const mapped = SEGMENT_MAP[u];
  if (mapped) return mapped;
  if (['C', 'I', 'S'].includes(u)) return u;
  return 'C';
}

function logFullCurrentError(phase, companyId, userId, userEmail, err) {
  const msg = err?.message || String(err);
  console.error('[FULL_CURRENT_FAILED]', {
    phase,
    company_id: companyId,
    user_id: userId,
    email: userEmail || '(n/a)',
    error: msg,
  });
}

/**
 * Erro estruturado para falhas em getOrCreateCurrentFullAssessment.
 */
class FullCurrentError extends Error {
  constructor(phase, message, originalError) {
    super(message);
    this.name = 'FullCurrentError';
    this.phase = phase;
    this.originalError = originalError;
  }
}

/**
 * Retorna o assessment FULL atual da company (DRAFT ou SUBMITTED).
 * Se não existir, cria um DRAFT e retorna.
 *
 * @param {string} companyId
 * @param {string} userId - para created_by_user_id ao criar
 * @param {{ forWizard?: boolean }} opts - forWizard: quando true e só CLOSED existe, cria DRAFT
 * @returns {{ assessment: object, company: object }}
 * @throws {FullCurrentError} quando company não existe, fetch falha ou insert falha
 */
async function getOrCreateCurrentFullAssessment(companyId, userId, opts = {}) {
  // 1) Buscar company (para segment e validação)
  const { data: company, error: companyErr } = await supabase
    .schema('public')
    .from('companies')
    .select('id, name, segment')
    .eq('id', companyId)
    .maybeSingle();

  if (companyErr) {
    throw new FullCurrentError('fetch_company', companyErr.message, companyErr);
  }
  if (!company) {
    throw new FullCurrentError('fetch_company', 'company não encontrada', null);
  }

  // 2) Buscar assessment ativo (DRAFT ou SUBMITTED), ordenado por created_at desc
  const { data: existing, error: findErr } = await supabase
    .schema('public')
    .from('full_assessments')
    .select('*')
    .eq('company_id', companyId)
    .in('status', ['DRAFT', 'SUBMITTED'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findErr) {
    throw new FullCurrentError('fetch_assessment', findErr.message, findErr);
  }

  if (existing) {
    return { assessment: existing, company };
  }

  // 3) Se não há DRAFT/SUBMITTED, verificar CLOSED
  const { data: closed, error: closedErr } = await supabase
    .schema('public')
    .from('full_assessments')
    .select('*')
    .eq('company_id', companyId)
    .eq('status', 'CLOSED')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!closedErr && closed && !opts.forWizard) {
    return { assessment: closed, company };
  }
  // forWizard: quando só CLOSED existe, criar DRAFT para permitir novo diagnóstico

  // 4) Criar novo DRAFT
  const segment = companySegmentToFull(company.segment);
  const expectedRaw = ['COMERCIO', 'INDUSTRIA', 'SERVICOS', 'C', 'I', 'S'];
  const rawOk = company.segment && expectedRaw.includes(String(company.segment).toUpperCase());
  if (!rawOk) {
    console.warn('[FULL_CURRENT] segment fallback aplicado', { company_id: companyId, segment_raw: company.segment, segment_final: segment });
  }

  const { data: created, error: insertErr } = await supabase
    .schema('public')
    .from('full_assessments')
    .insert({
      company_id: companyId,
      created_by_user_id: userId,
      segment: segment,
      status: 'DRAFT',
    })
    .select()
    .single();

  if (insertErr) {
    throw new FullCurrentError('create_draft', insertErr.message, insertErr);
  }

  return { assessment: created, company };
}

module.exports = { getOrCreateCurrentFullAssessment, companySegmentToFull, FullCurrentError, logFullCurrentError };
