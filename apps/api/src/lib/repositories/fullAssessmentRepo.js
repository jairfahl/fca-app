/**
 * Repositório para full_assessments.
 * Funções de acesso ao banco para o ciclo FULL.
 */
const { supabase } = require('../supabase');

async function getAssessment(assessmentId, companyId) {
  const { data, error } = await supabase
    .schema('public')
    .from('full_assessments')
    .select('*')
    .eq('id', assessmentId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

async function getAssessmentById(assessmentId) {
  const { data, error } = await supabase
    .schema('public')
    .from('full_assessments')
    .select('*')
    .eq('id', assessmentId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

async function getLatestClosedAssessment(companyId) {
  const { data, error } = await supabase
    .schema('public')
    .from('full_assessments')
    .select('*')
    .eq('company_id', companyId)
    .eq('status', 'CLOSED')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

async function getLatestSubmittedOrClosedAssessment(companyId) {
  const { data, error } = await supabase
    .schema('public')
    .from('full_assessments')
    .select('*')
    .eq('company_id', companyId)
    .in('status', ['SUBMITTED', 'CLOSED'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

module.exports = {
  getAssessment,
  getAssessmentById,
  getLatestClosedAssessment,
  getLatestSubmittedOrClosedAssessment,
};
