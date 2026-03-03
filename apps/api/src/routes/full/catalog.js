/**
 * Rotas de catálogo FULL:
 *   GET /full/catalog
 *   GET /full/catalog/process/:process_key
 */
const express = require('express');
const router = express.Router();
const { supabase } = require('../../lib/supabase');
const { requireAuth } = require('../../middleware/requireAuth');
const { blockConsultorOnMutation } = require('../../middleware/requireRole');
const { ensureConsultantOrOwnerAccess } = require('../../lib/companyAccess');
const { companySegmentToFull } = require('../../lib/fullAssessment');
const { apiError } = require('../../lib/fullHelpers');

/** Segmento padrão quando raw é inválido ou retorna 0 processos. */
const FALLBACK_SEGMENT = 'C';

async function resolveCatalogSegmentForRequest(req) {
  const companyId = req.query.company_id;
  if (companyId) {
    const { data: company } = await supabase
      .schema('public')
      .from('companies')
      .select('segment')
      .eq('id', companyId)
      .maybeSingle();
    if (company?.segment) {
      return companySegmentToFull(company.segment);
    }
  }
  const seg = req.query.segment || 'C';
  return ['C', 'I', 'S'].includes(seg) ? seg : null;
}

function isRawSegmentValid(raw) {
  if (raw == null || String(raw).trim() === '') return false;
  const u = String(raw).toUpperCase();
  return ['COMERCIO', 'INDUSTRIA', 'SERVICOS', 'C', 'I', 'S'].includes(u);
}

/** Retorna { rawSegment, appliedSegment, usedFallback } para auditoria do catálogo. */
async function resolveCatalogSegmentWithRaw(req) {
  const companyId = req.query.company_id;
  let rawSegment = req.query.segment ?? null;
  if (companyId) {
    const { data: company } = await supabase
      .schema('public')
      .from('companies')
      .select('segment')
      .eq('id', companyId)
      .maybeSingle();
    rawSegment = company?.segment ?? null;
    if (company?.segment && isRawSegmentValid(company.segment)) {
      return { rawSegment: company.segment, appliedSegment: companySegmentToFull(company.segment), usedFallback: false };
    }
    return { rawSegment, appliedSegment: FALLBACK_SEGMENT, usedFallback: true };
  }
  const seg = req.query.segment || FALLBACK_SEGMENT;
  const appliedSegment = ['C', 'I', 'S'].includes(seg) ? seg : FALLBACK_SEGMENT;
  return { rawSegment: rawSegment ?? seg, appliedSegment, usedFallback: !['C', 'I', 'S'].includes(String(rawSegment || seg)) };
}

async function loadCatalogBySegment(segment) {
  const normalizeCostAxis = (axis) => {
    const normalized = String(axis || '').toUpperCase().trim();
    return ['DINHEIRO', 'CLIENTE', 'RISCO', 'GARGALO', 'TRAVAMENTO'].includes(normalized)
      ? normalized
      : 'TRAVAMENTO';
  };

  const { data: procs, error: procErr } = await supabase
    .schema('public')
    .from('full_process_catalog')
    .select('*')
    .eq('is_active', true)
    .contains('segment_applicability', [segment])
    .order('area_key')
    .order('process_key');
  if (procErr) throw procErr;

  if (!procs || procs.length === 0) return { areas: [], processes: [], questionsCount: 0 };

  const processKeys = procs.map((p) => p.process_key);
  const { data: questions, error: qErr } = await supabase
    .schema('public')
    .from('full_question_catalog')
    .select('*')
    .in('process_key', processKeys)
    .eq('is_active', true)
    .contains('segment_applicability', [segment])
    .order('process_key')
    .order('sort_order');
  if (qErr) throw qErr;

  const questionsByProcess = {};
  (questions || []).forEach((q) => {
    if (!questionsByProcess[q.process_key]) questionsByProcess[q.process_key] = [];
    questionsByProcess[q.process_key].push(q);
  });

  const areasMap = {};
  const processes = procs.map((p) => {
    const processCostAxis = normalizeCostAxis(p.protects_dimension);
    const processQuestions = (questionsByProcess[p.process_key] || []).map((q) => ({
      ...q,
      cost_axis: normalizeCostAxis(q.cost_axis || q.dimension || processCostAxis)
    }));
    const processOut = {
      ...p,
      o_que_protege: p.protects_dimension || 'EM DEFINIÇÃO',
      sinal_alerta: p.owner_alert_text || 'EM DEFINIÇÃO',
      impacto_tipico: p.typical_impact_text || p.typical_impact_band || 'EM DEFINIÇÃO',
      questions: processQuestions,
    };
    if (!areasMap[p.area_key]) {
      areasMap[p.area_key] = { area: p.area_key, processes: [] };
    }
    areasMap[p.area_key].processes.push(processOut);
    return processOut;
  });

  const areas = Object.values(areasMap);
  return { areas, processes, questionsCount: (questions || []).length };
}

/** Retorna segmentos disponíveis no catalog. */
async function getCatalogAvailableSegments() {
  const { data: procs } = await supabase
    .schema('public')
    .from('full_process_catalog')
    .select('segment_applicability')
    .eq('is_active', true);
  const segments = new Set();
  (procs || []).forEach((p) => {
    const arr = p.segment_applicability;
    if (Array.isArray(arr)) arr.forEach((s) => segments.add(String(s)));
  });
  return Array.from(segments).sort();
}

// GET /full/catalog?company_id=... (ou ?segment=C|I|S)
router.get('/full/catalog', requireAuth, blockConsultorOnMutation, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.query.company_id;
    const assessmentId = req.query.assessment_id;

    if (companyId) {
      const access = await ensureConsultantOrOwnerAccess(userId, companyId, req.user?.email, req.user?.role);
      if (!access) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');
    }

    const { rawSegment, appliedSegment, usedFallback } = await resolveCatalogSegmentWithRaw(req);
    if (!appliedSegment) {
      return res.status(400).json({ error: 'segment inválido. Use C, I ou S, ou informe company_id válido' });
    }

    if (usedFallback) {
      console.log('[AUDIT] full_segment_fallback', { company_id: companyId, raw_segment: rawSegment, applied_segment: appliedSegment });
    }

    let out = await loadCatalogBySegment(appliedSegment);
    let finalSegment = appliedSegment;
    let availableSegments = null;

    if (out.processes.length === 0) {
      availableSegments = await getCatalogAvailableSegments();
      const fallbackSegment = availableSegments.includes(FALLBACK_SEGMENT)
        ? FALLBACK_SEGMENT
        : (availableSegments[0] || FALLBACK_SEGMENT);
      const fallbackOut = await loadCatalogBySegment(fallbackSegment);
      if (fallbackOut.processes.length > 0) {
        out = fallbackOut;
        finalSegment = fallbackSegment;
        console.log('[AUDIT] full_segment_fallback', {
          company_id: companyId,
          raw_segment: rawSegment,
          applied_segment: appliedSegment,
          fallback_reason: 'process_count_zero',
          final_segment: fallbackSegment,
          process_count: fallbackOut.processes.length,
        });
      }
    }

    const processCount = out.processes.length;
    const auditPayload = {
      company_id: companyId,
      assessment_id: assessmentId || null,
      raw_segment: rawSegment,
      applied_segment: finalSegment,
      process_count: processCount,
    };
    if (processCount === 0 && !availableSegments) {
      auditPayload.catalog_available_segments = await getCatalogAvailableSegments();
    } else if (availableSegments) {
      auditPayload.catalog_available_segments = availableSegments;
    }
    console.log('[AUDIT] full_wizard_catalog', auditPayload);

    const hasGap = out.processes.some((p) => !p.o_que_protege || !p.sinal_alerta || !p.impacto_tipico || p.questions.length === 0);
    if (hasGap) {
      console.warn(`[AUDIT] full_catalog_gap segment=${finalSegment} gaps_detected=true`);
    }
    return res.json({ segment: finalSegment, areas: out.areas, processes: out.processes });
  } catch (err) {
    console.error('Erro GET /full/catalog:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// GET /full/catalog/process/:process_key?company_id=... (opcional)
router.get('/full/catalog/process/:process_key', requireAuth, blockConsultorOnMutation, async (req, res) => {
  try {
    const segment = await resolveCatalogSegmentForRequest(req);
    if (!segment) return res.status(400).json({ error: 'segment inválido' });
    const processKey = req.params.process_key;
    const out = await loadCatalogBySegment(segment);
    const process = out.processes.find((p) => p.process_key === processKey);
    if (!process) return res.status(404).json({ error: 'processo não encontrado para o segmento informado' });
    return res.json({ segment, process });
  } catch (err) {
    console.error('Erro GET /full/catalog/process/:process_key:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

module.exports = router;
