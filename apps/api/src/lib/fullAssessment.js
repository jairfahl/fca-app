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
  return SEGMENT_MAP[u] || 'C';
}

/**
 * Retorna o assessment FULL atual da company (DRAFT ou SUBMITTED).
 * Se não existir, cria um DRAFT e retorna.
 *
 * @param {string} companyId
 * @param {string} userId - para created_by_user_id ao criar
 * @returns {{ assessment: object, company: object } | null} - null se company não existir
 */
async function getOrCreateCurrentFullAssessment(companyId, userId) {
  // 1) Buscar company (para segment e validação)
  const { data: company, error: companyErr } = await supabase
    .schema('public')
    .from('companies')
    .select('id, name, segment')
    .eq('id', companyId)
    .maybeSingle();

  if (companyErr || !company) return null;

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
    console.error('Erro ao buscar full_assessment:', findErr.message);
    return null;
  }

  if (existing) {
    return { assessment: existing, company };
  }

  // 3) Criar novo DRAFT
  const segment = companySegmentToFull(company.segment);
  const { data: created, error: insertErr } = await supabase
    .schema('public')
    .from('full_assessments')
    .insert({
      company_id: companyId,
      created_by_user_id: userId,
      segment,
      status: 'DRAFT',
    })
    .select()
    .single();

  if (insertErr) {
    console.error('Erro ao criar full_assessment:', insertErr.message);
    return null;
  }

  return { assessment: created, company };
}

module.exports = { getOrCreateCurrentFullAssessment, companySegmentToFull };
