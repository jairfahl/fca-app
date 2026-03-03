/**
 * Rotas de plano de ação FULL:
 *   GET  /full/plan/status
 *   GET  /full/assessments/:id/recommendations
 *   POST /full/assessments/:id/plan/select
 *   GET  /full/actions/:action_key/dod
 *   POST /full/assessments/:id/plan/:action_key/dod/confirm
 *   GET  /full/assessments/:id/plan
 *   PATCH /full/assessments/:id/plan/:action_key/status
 *   GET  /full/actions
 *   POST /full/cycle/select-actions
 *   POST /full/plan
 *   GET  /full/plan (redirect)
 *   POST /full/actions/:action_key/status
 */
const express = require('express');
const router = express.Router();
const { supabase } = require('../../lib/supabase');
const { requireAuth } = require('../../middleware/requireAuth');
const { requireFullEntitlement } = require('../../middleware/requireFullEntitlement');
const { blockConsultorOnMutation } = require('../../middleware/requireRole');
const { ensureCompanyAccess, ensureConsultantOrOwnerAccess } = require('../../lib/companyAccess');
const { logEvent } = require('../../lib/auditLog');
const { apiError, toExternalScore, cycleClosed } = require('../../lib/fullHelpers');
const { getAssessment, getLatestSubmittedOrClosedAssessment } = require('../../lib/repositories/fullAssessmentRepo');
const { buildSuggestionsForAssessment, computeRemainingAndRequired, validateMechanismActionRequired, getMechanismRequiredActionKeys, CAUSE_ENGINE_GAP_IDS } = require('../../lib/fullSuggestions');
const { PROCESS_BAND_TO_GAP } = require('../../lib/fullFindings');
const {
  getCustoDeNaoAgirFaixa,
  FALLBACK_CONTENT_NAO_DEFINIDO,
  FALLBACK_ACTION_TITLE,
} = require('../../lib/fullResultCopy');

// GET /full/plan/status?assessment_id=...&company_id=...
router.get('/full/plan/status', requireAuth, blockConsultorOnMutation, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.query.assessment_id;
    const companyId = req.query.company_id;
    if (!assessmentId) return res.status(400).json({ error: 'assessment_id é obrigatório' });
    if (!companyId) return res.status(400).json({ error: 'company_id é obrigatório' });

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

    const access = await ensureConsultantOrOwnerAccess(userId, assessment.company_id, req.user?.email, req.user?.role);
    if (!access) return apiError(res, 403, 'ACCESS_DENIED', 'Sem acesso a este recurso.');

    const { data: plan, error } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .select('action_key, status')
      .eq('assessment_id', assessmentId)
      .order('position');

    if (error) {
      console.error('Erro ao buscar plan status:', error.message);
      return apiError(res, 500, 'PLAN_STATUS_ERROR', 'Erro ao verificar plano.');
    }

    const rows = plan || [];
    const exists = rows.length > 0;
    const doneCount = rows.filter((p) => p.status === 'DONE' || p.status === 'DROPPED').length;
    const progress = exists ? `${doneCount}/3` : '0/3';

    let next_action_title = null;
    if (exists) {
      const next = rows.find((p) => p.status === 'NOT_STARTED' || p.status === 'IN_PROGRESS');
      if (next) {
        const { data: cat } = await supabase
          .schema('public')
          .from('full_action_catalog')
          .select('title')
          .eq('action_key', next.action_key)
          .maybeSingle();
        next_action_title = cat?.title || next.action_key;
      }
    }

    return res.json({ exists, progress, next_action_title });
  } catch (err) {
    console.error('Erro GET /full/plan/status:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// GET /full/assessments/:id/recommendations
router.get('/full/assessments/:id/recommendations', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const companyId = req.query.company_id;

    if (!companyId) {
      return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
    }

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) {
      return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');
    }

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) {
      return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    }
    if (assessment.status !== 'SUBMITTED' && assessment.status !== 'CLOSED') {
      return apiError(res, 400, 'DIAG_NOT_READY', 'Conclua o diagnóstico para ver recomendações.');
    }

    const { data: scores } = await supabase
      .schema('public')
      .from('full_process_scores')
      .select('*')
      .eq('assessment_id', assessmentId);

    if (!scores || scores.length === 0) {
      return res.status(404).json({ error: 'scores não encontrados' });
    }

    const segment = assessment.segment;
    const processKeys = [...new Set(scores.map((s) => s.process_key))];

    const { data: gapCauses } = await supabase
      .schema('public')
      .from('full_gap_causes')
      .select('gap_id, cause_primary, evidence_json')
      .eq('assessment_id', assessmentId)
      .in('gap_id', CAUSE_ENGINE_GAP_IDS);

    const { data: mechanismActions } = await supabase
      .schema('public')
      .from('full_cause_mechanism_actions')
      .select('gap_id, cause_id, action_key, titulo_cliente, porque, primeiro_passo_30d, sort_order')
      .eq('is_active', true)
      .order('sort_order');

    let causeCatalog;
    try {
      const { loadCauseCatalog } = require('../../lib/causeEngine');
      causeCatalog = loadCauseCatalog();
    } catch (e) {
      causeCatalog = null;
    }

    const gapCauseByGap = {};
    (gapCauses || []).forEach((r) => { gapCauseByGap[r.gap_id] = r; });

    const causeById = {};
    if (causeCatalog?.cause_classes) {
      causeCatalog.cause_classes.forEach((c) => { causeById[c.id] = c; });
    }

    const mechByGapCause = {};
    (mechanismActions || []).forEach((m) => {
      const key = `${m.gap_id}:${m.cause_id}`;
      if (!mechByGapCause[key]) mechByGapCause[key] = [];
      mechByGapCause[key].push(m);
    });

    const { data: recCatalog } = await supabase
      .schema('public')
      .from('full_recommendation_catalog')
      .select('*')
      .in('process_key', processKeys)
      .eq('is_active', true);

    const { data: actCatalog } = await supabase
      .schema('public')
      .from('full_action_catalog')
      .select('*')
      .in('process_key', processKeys)
      .eq('is_active', true)
      .contains('segment_applicability', [segment]);

    const recByProcessBand = {};
    (recCatalog || []).forEach((r) => {
      const k = `${r.process_key}:${r.band}`;
      if (!recByProcessBand[k]) recByProcessBand[k] = [];
      recByProcessBand[k].push(r);
    });

    const actByProcessBand = {};
    (actCatalog || []).forEach((a) => {
      const k = `${a.process_key}:${a.band}`;
      if (!actByProcessBand[k]) actByProcessBand[k] = [];
      actByProcessBand[k].push(a);
    });

    const recommendations = [];
    for (const s of scores) {
      const k = `${s.process_key}:${s.band}`;
      const gapId = s.band === 'LOW' ? PROCESS_BAND_TO_GAP[s.process_key] : null;
      const gapCause = gapId ? gapCauseByGap[gapId] : null;
      const gapDef = causeCatalog && gapId ? (causeCatalog.gaps || []).find((g) => g.gap_id === gapId) : null;
      const causeDef = gapCause?.cause_primary ? causeById[gapCause.cause_primary] : null;

      let recs = recByProcessBand[k] || [];
      let acts = actByProcessBand[k] || [];
      let isFallback = false;
      let gapReason = null;
      let gap_label = null;
      let cause_primary = null;
      let mechanism_label = null;
      let custo_de_nao_agir = null;
      let mudanca_em_30_dias = null;
      let primeiro_passo = null;

      if (gapId && gapDef) {
        if (gapCause && causeDef) {
          gap_label = gapDef.titulo_cliente;
          cause_primary = gapCause.cause_primary;
          mechanism_label = causeDef.mecanismo_primario || causeDef.label_cliente;
          custo_de_nao_agir = getCustoDeNaoAgirFaixa(s.band, {});
          mudanca_em_30_dias = causeDef.mecanismo_primario ? `Em 30 dias: ${causeDef.mecanismo_primario}` : null;

          const mechList = mechByGapCause[`${gapId}:${gapCause.cause_primary}`] || [];
          const catalogMech = (gapDef.mechanism_actions || []).slice(0, 3);
          if (mechList.length > 0) {
            acts = mechList.map((m) => ({
              action_key: m.action_key,
              title: m.titulo_cliente || m.action_key,
              benefit_text: m.porque,
              dod_checklist: m.primeiro_passo_30d ? [m.primeiro_passo_30d] : [],
            }));
            primeiro_passo = acts[0] ? { action_key: acts[0].action_key, action_title: acts[0].title } : null;
          } else if (catalogMech.length > 0) {
            acts = catalogMech.map((a) => ({
              action_key: a.action_key,
              title: a.titulo_cliente || a.action_key,
              benefit_text: a.porque,
              dod_checklist: a.primeiro_passo_30d ? [a.primeiro_passo_30d] : [],
            }));
            primeiro_passo = acts[0] ? { action_key: acts[0].action_key, action_title: acts[0].title } : null;
          }
          recs = [{
            recommendation_key: `gap-${gapId}-${gapCause.cause_primary}`,
            title: gapDef.titulo_cliente,
            owner_language_explanation: causeDef.descricao_cliente || mechanism_label,
          }];
        } else {
          isFallback = true;
          gapReason = 'gap_not_classified';
          recs = [{
            recommendation_key: `fallback-${s.process_key}-${s.band}`,
            title: FALLBACK_CONTENT_NAO_DEFINIDO,
            owner_language_explanation: FALLBACK_CONTENT_NAO_DEFINIDO,
          }];
          acts = [{
            action_key: `fallback-${s.process_key}-${s.band}`,
            title: FALLBACK_CONTENT_NAO_DEFINIDO,
            benefit_text: FALLBACK_CONTENT_NAO_DEFINIDO,
            dod_checklist: [],
          }];
          custo_de_nao_agir = getCustoDeNaoAgirFaixa(s.band, {});
          mudanca_em_30_dias = FALLBACK_CONTENT_NAO_DEFINIDO;
          console.log('[AUDIT] content_gap process_key=' + s.process_key + ' band=' + s.band + ' gap_id=' + gapId + ' reason=gap_not_classified assessment_id=' + assessmentId);
        }
      }

      if (recs.length === 0) {
        recs = [{
          recommendation_key: `fallback-${s.process_key}-${s.band}`,
          title: FALLBACK_CONTENT_NAO_DEFINIDO,
          owner_language_explanation: FALLBACK_CONTENT_NAO_DEFINIDO,
        }];
        isFallback = true;
        gapReason = gapReason || 'catálogo vazio para processo/banda';
        console.log('[AUDIT] content_gap process_key=' + s.process_key + ' band=' + s.band + ' missing_rule=true assessment_id=' + assessmentId + ' type=recommendation');
      }

      if (acts.length === 0 && !gapId) {
        acts = [{
          action_key: `fallback-${s.process_key}-${s.band}`,
          title: FALLBACK_ACTION_TITLE,
          benefit_text: FALLBACK_CONTENT_NAO_DEFINIDO,
          dod_checklist: ['Definir escopo', 'Executar conforme contexto', 'Documentar resultado'],
        }];
        isFallback = true;
        gapReason = gapReason || 'ações não encontradas no catálogo';
        console.log('[AUDIT] content_gap process_key=' + s.process_key + ' band=' + s.band + ' missing_rule=true assessment_id=' + assessmentId + ' type=action');
      }

      const rec = recs[0];
      const actionKeys = acts.map((a) => a.action_key);
      const gapCauseRow = gapId ? gapCauseByGap[gapId] : null;
      const evidenceArr = Array.isArray(gapCauseRow?.evidence_json) ? gapCauseRow.evidence_json : [];
      const evidenceKeys = evidenceArr.map((e) => `${e.process_key || (gapDef && gapDef.processo) || s.process_key}_${e.q_id || e.question_key || ''}`).filter(Boolean);

      const { error: genErr } = await supabase
        .schema('public')
        .from('full_generated_recommendations')
        .upsert({
          assessment_id: assessmentId,
          process_key: s.process_key,
          band: s.band,
          recommendation_key: rec.recommendation_key,
          action_keys: actionKeys,
          is_fallback: isFallback,
          gap_reason: gapReason,
        }, { onConflict: 'assessment_id,process_key,recommendation_key' });

      if (genErr) {
        console.warn('Aviso ao persistir generated_rec:', genErr.message);
      }

      recommendations.push({
        process_key: s.process_key,
        band: s.band,
        recommendation: rec,
        actions: acts,
        is_fallback: isFallback,
        is_gap_content: isFallback,
        evidence_keys: evidenceKeys,
        gap_label: gap_label ?? undefined,
        cause_primary: cause_primary ?? undefined,
        mechanism_label: mechanism_label ?? undefined,
        custo_de_nao_agir: custo_de_nao_agir ?? undefined,
        mudanca_em_30_dias: mudanca_em_30_dias ?? undefined,
        primeiro_passo: primeiro_passo ?? undefined,
      });
    }

    const role = req.user?.role || 'USER';
    const filtered = role === 'USER'
      ? recommendations.filter((r) => !r.is_gap_content)
      : recommendations;

    return res.json({ recommendations: filtered });
  } catch (err) {
    console.error('Erro GET /full/assessments/:id/recommendations:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// POST /full/assessments/:id/plan/select
router.post('/full/assessments/:id/plan/select', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const companyId = req.query.company_id || req.body.company_id;
    const items = req.body.items || req.body;

    if (!companyId) {
      return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
    }

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) {
      return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');
    }

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) {
      return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    }
    if (assessment.status === 'CLOSED') return cycleClosed(res);

    const { remaining_count, required_count } = await computeRemainingAndRequired(assessmentId);
    if (remaining_count === 0) {
      return apiError(res, 400, 'NO_ACTIONS_LEFT', 'Não há mais ações sugeridas. Acesse os resultados ou o dashboard.');
    }

    const arr = Array.isArray(items) ? items : [items];
    if (arr.length !== required_count) {
      return res.status(400).json({
        error: required_count === 1 ? 'Selecione exatamente 1 ação.' : `Selecione exatamente ${required_count} ações.`,
        required_count,
        remaining_count,
      });
    }

    const validated = [];
    const seenKeys = new Set();
    const seenPos = new Set();

    for (const it of arr) {
      const pos = it.position ?? it.pos;
      const actionKey = it.action_key;
      const ownerName = it.owner_name ?? it.owner;
      const metricText = it.metric_text ?? it.metric;
      const checkpointDate = it.checkpoint_date ?? it.checkpoint;

      if (!pos || !actionKey || !ownerName || !metricText || !checkpointDate) {
        return res.status(400).json({
          error: `cada item deve ter position (1-${required_count}), action_key, owner_name, metric_text, checkpoint_date`
        });
      }
      if (pos < 1 || pos > required_count) {
        return res.status(400).json({ error: 'position deve ser 1 a ' + required_count });
      }
      if (seenKeys.has(actionKey)) {
        return res.status(400).json({ error: 'action_key não pode ser duplicado' });
      }
      if (seenPos.has(pos)) {
        return res.status(400).json({ error: 'position não pode ser duplicado' });
      }

      seenKeys.add(actionKey);
      seenPos.add(pos);
      validated.push({ position: pos, action_key: actionKey, owner_name: ownerName, metric_text: metricText, checkpoint_date: checkpointDate });
    }

    const { data: scores } = await supabase
      .schema('public')
      .from('full_process_scores')
      .select('process_key, band')
      .eq('assessment_id', assessmentId);

    const { data: actCatalog } = await supabase
      .schema('public')
      .from('full_action_catalog')
      .select('process_key, band, action_key')
      .in('action_key', validated.map((v) => v.action_key));

    const catalogMap = {};
    (actCatalog || []).forEach((a) => {
      catalogMap[a.action_key] = a;
    });

    const toInsert = [];
    for (const v of validated) {
      const cat = catalogMap[v.action_key];
      const processKey = cat?.process_key || 'GESTAO';
      const band = cat?.band || 'MEDIUM';
      toInsert.push({
        assessment_id: assessmentId,
        action_key: v.action_key,
        process_key: processKey,
        band,
        position: v.position,
        owner_name: v.owner_name,
        metric_text: v.metric_text,
        checkpoint_date: v.checkpoint_date,
        status: 'NOT_STARTED'
      });
    }

    const { error: delErr } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .delete()
      .eq('assessment_id', assessmentId);

    if (delErr) {
      console.error('Erro ao limpar plano:', delErr.message);
      return res.status(500).json({ error: 'erro ao salvar plano' });
    }

    const { error: insertErr } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .insert(toInsert);

    if (insertErr) {
      console.error('Erro ao inserir plano:', insertErr.message);
      return res.status(500).json({ error: 'erro ao salvar plano' });
    }

    logEvent(supabase, { event: 'plan_created', userId, companyId, assessmentId, meta: { action_count: toInsert.length } });
    return res.status(200).json({ ok: true, plan: toInsert });
  } catch (err) {
    console.error('Erro POST /full/assessments/:id/plan/select:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// GET /full/actions/:action_key/dod
router.get('/full/actions/:action_key/dod', requireAuth, blockConsultorOnMutation, async (req, res) => {
  try {
    const actionKey = decodeURIComponent(req.params.action_key || '');
    if (!actionKey) {
      return res.status(400).json({ error: 'action_key é obrigatório' });
    }

    const { data: catalog, error } = await supabase
      .schema('public')
      .from('full_action_catalog')
      .select('action_key, dod_checklist')
      .eq('action_key', actionKey)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Erro ao buscar DoD:', error.message);
      return apiError(res, 500, 'CHECKLIST_FETCH_ERROR', 'Erro ao buscar checklist. Tente novamente.');
    }

    let dodChecklist = [];
    if (catalog && catalog.dod_checklist) {
      dodChecklist = Array.isArray(catalog.dod_checklist) ? catalog.dod_checklist : [];
    }
    if (dodChecklist.length === 0) {
      const { getActionEntryFromCatalog } = require('../../lib/fullCatalog');
      const fromCatalog = getActionEntryFromCatalog(actionKey);
      if (fromCatalog?.dod_checklist?.length) {
        dodChecklist = fromCatalog.dod_checklist;
      } else {
        const { data: mech } = await supabase
          .schema('public')
          .from('full_cause_mechanism_actions')
          .select('primeiro_passo_30d')
          .eq('action_key', actionKey)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        if (mech?.primeiro_passo_30d) {
          dodChecklist = [mech.primeiro_passo_30d];
        } else {
          dodChecklist = ['Definir escopo', 'Executar conforme contexto', 'Documentar resultado'];
        }
      }
    }

    return res.json({ action_key: actionKey, dod_checklist: dodChecklist });
  } catch (err) {
    console.error('Erro GET /full/actions/:action_key/dod:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// POST /full/assessments/:id/plan/:action_key/dod/confirm
router.post('/full/assessments/:id/plan/:action_key/dod/confirm', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const actionKey = decodeURIComponent(req.params.action_key || '');
    const companyId = req.query.company_id || req.body.company_id;
    const { confirmed_items } = req.body;

    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
    if (!actionKey) return res.status(400).json({ error: 'action_key é obrigatório' });
    if (!Array.isArray(confirmed_items)) {
      return apiError(res, 400, 'CHECKLIST_INVALID', 'Falta confirmar o que conta como feito.');
    }

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    if (assessment.status === 'CLOSED') return cycleClosed(res);

    const { data: planRow } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .select('action_key')
      .eq('assessment_id', assessmentId)
      .eq('action_key', actionKey)
      .maybeSingle();
    if (!planRow) return apiError(res, 404, 'ACTION_NOT_FOUND', 'Ação não encontrada no plano.');

    const { data: catalog } = await supabase
      .schema('public')
      .from('full_action_catalog')
      .select('dod_checklist')
      .eq('action_key', actionKey)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    let expectedItems = [];
    if (catalog && catalog.dod_checklist && Array.isArray(catalog.dod_checklist)) {
      expectedItems = catalog.dod_checklist;
    } else {
      const { getActionEntryFromCatalog } = require('../../lib/fullCatalog');
      const fromCatalog = getActionEntryFromCatalog(actionKey);
      if (fromCatalog?.dod_checklist?.length) {
        expectedItems = fromCatalog.dod_checklist;
      } else if (actionKey.startsWith('fallback-')) {
        expectedItems = ['Definir escopo', 'Executar conforme contexto', 'Documentar resultado'];
      }
    }

    const confirmedSet = new Set(confirmed_items.map((s) => String(s).trim()).filter(Boolean));
    const missing = expectedItems.filter((e) => !confirmedSet.has(e));
    if (missing.length > 0) {
      return apiError(res, 400, 'CHECKLIST_INCOMPLETE', 'Falta confirmar o que conta como feito.');
    }

    const { data: existing } = await supabase
      .schema('public')
      .from('full_action_dod_confirmations')
      .select('*')
      .eq('assessment_id', assessmentId)
      .eq('action_key', actionKey)
      .maybeSingle();

    if (existing) {
      const { error: updErr } = await supabase
        .schema('public')
        .from('full_action_dod_confirmations')
        .update({ confirmed_items, confirmed_at: new Date().toISOString() })
        .eq('assessment_id', assessmentId)
        .eq('action_key', actionKey);
      if (updErr) {
        console.error('Erro ao atualizar DoD:', updErr.message);
        return apiError(res, 500, 'CHECKLIST_CONFIRM_ERROR', 'Erro ao confirmar o que conta como feito. Tente novamente.');
      }
    } else {
      const { error: insErr } = await supabase
        .schema('public')
        .from('full_action_dod_confirmations')
        .insert({ assessment_id: assessmentId, action_key: actionKey, confirmed_items });
      if (insErr) {
        console.error('Erro ao inserir DoD:', insErr.message);
        return apiError(res, 500, 'CHECKLIST_CONFIRM_ERROR', 'Erro ao confirmar o que conta como feito. Tente novamente.');
      }
    }

    const { data: updated } = await supabase
      .schema('public')
      .from('full_action_dod_confirmations')
      .select('*')
      .eq('assessment_id', assessmentId)
      .eq('action_key', actionKey)
      .single();

    return res.status(200).json({ ok: true, confirmation: updated });
  } catch (err) {
    console.error('Erro POST dod/confirm:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// GET /full/assessments/:id/plan
router.get('/full/assessments/:id/plan', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const companyId = req.query.company_id;

    if (!companyId) {
      return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
    }

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) {
      return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');
    }

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) {
      return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    }

    const { data: plan, error } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .select('*')
      .eq('assessment_id', assessmentId)
      .order('position');

    if (error) {
      console.error('Erro ao buscar plano:', error.message);
      return res.status(500).json({ error: 'erro ao buscar plano' });
    }

    return res.json({ plan: plan || [] });
  } catch (err) {
    console.error('Erro GET /full/assessments/:id/plan:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// PATCH /full/assessments/:id/plan/:action_key/status
router.patch('/full/assessments/:id/plan/:action_key/status', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const actionKey = decodeURIComponent(req.params.action_key || '');
    const companyId = req.query.company_id || req.body.company_id;
    const { status, dropped_reason } = req.body;

    if (!companyId) {
      return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
    }
    if (!status || !['DONE', 'DROPPED', 'IN_PROGRESS', 'NOT_STARTED'].includes(status)) {
      return apiError(res, 400, 'INVALID_STATUS', 'Status inválido.');
    }

    if (status === 'DONE') {
      const company = await ensureCompanyAccess(userId, companyId);
      if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');
      const assessment = await getAssessment(assessmentId, companyId);
      if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

      const { data: dodRow } = await supabase
        .schema('public')
        .from('full_action_dod_confirmations')
        .select('assessment_id')
        .eq('assessment_id', assessmentId)
        .eq('action_key', actionKey)
        .maybeSingle();
      if (!dodRow) {
        return apiError(res, 400, 'CHECKLIST_INCOMPLETE', 'Falta confirmar o que conta como feito.');
      }

      const { data: evRow } = await supabase
        .schema('public')
        .from('full_action_evidence')
        .select('assessment_id')
        .eq('assessment_id', assessmentId)
        .eq('action_key', actionKey)
        .maybeSingle();
      if (!evRow) {
        return apiError(res, 400, 'EVIDENCE_REQUIRED', 'Para concluir, registre a evidência (antes e depois).');
      }
    }
    if (status === 'DROPPED') {
      const reason = typeof dropped_reason === 'string' ? dropped_reason.trim() : '';
      if (reason.length < 20) {
        return apiError(res, 400, 'DROP_REASON_REQUIRED', 'Ao descartar uma ação, informe o motivo (mínimo 20 caracteres).');
      }
    }

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) {
      return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');
    }

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) {
      return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    }
    if (assessment.status === 'CLOSED') return cycleClosed(res);

    const update = { status, updated_at: new Date().toISOString() };
    if (status === 'DROPPED') update.dropped_reason = dropped_reason;

    const { data, error } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .update(update)
      .eq('assessment_id', assessmentId)
      .eq('action_key', actionKey)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Erro ao atualizar status:', error.message);
      return apiError(res, 500, 'STATUS_UPDATE_ERROR', 'Erro ao atualizar status. Tente novamente.');
    }
    if (!data) {
      return apiError(res, 404, 'ACTION_NOT_FOUND', 'Ação não encontrada no plano.');
    }

    return res.json(data);
  } catch (err) {
    console.error('Erro PATCH plan status:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// GET /full/actions — Motor FIT: só retorna sugestões com encaixe real
router.get('/full/actions', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    let assessmentId = req.query.assessment_id;
    const companyId = req.query.company_id;
    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');

    const company = await ensureConsultantOrOwnerAccess(userId, companyId, req.user?.email, req.user?.role);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');

    let assessment = null;
    if (assessmentId) {
      assessment = await getAssessment(assessmentId, companyId);
    }
    if (!assessment) {
      const latest = await getLatestSubmittedOrClosedAssessment(companyId);
      if (!latest) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[AUDIT] full_actions DIAG_NOT_READY company_id=' + companyId + ' assessment_id=' + assessmentId + ' reason=no_submitted_assessment');
        }
        return apiError(res, 400, 'DIAG_NOT_READY', 'Conclua o diagnóstico para sugerir ações.');
      }
      assessment = latest;
      assessmentId = assessment.id;
    }

    if (assessment.status !== 'SUBMITTED' && assessment.status !== 'CLOSED') {
      if (process.env.NODE_ENV === 'development') {
        console.log('[AUDIT] full_actions DIAG_NOT_READY assessment_id=' + assessment.id + ' status=' + assessment.status);
      }
      return apiError(res, 400, 'DIAG_NOT_READY', 'Conclua o diagnóstico para sugerir ações.');
    }

    const { data: answers } = await supabase
      .schema('public')
      .from('full_answers')
      .select('process_key, question_key, answer_value')
      .eq('assessment_id', assessmentId);

    const { data: currentPlan } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .select('action_key')
      .eq('assessment_id', assessmentId);
    const { data: histRows } = await supabase
      .schema('public')
      .from('full_cycle_history')
      .select('action_key')
      .eq('assessment_id', assessmentId);
    const excludeActionKeys = new Set([
      ...(currentPlan || []).map((p) => p.action_key),
      ...(histRows || []).map((h) => h.action_key),
    ]);

    const { data: scores } = await supabase
      .schema('public')
      .from('full_process_scores')
      .select('process_key, band, score_numeric')
      .eq('assessment_id', assessment.id);

    const suggestions = await buildSuggestionsForAssessment(assessmentId, excludeActionKeys, true);

    const { deriveSuggestionsFromAnswers } = require('../../lib/fullActionFit');
    const scoresByProcess = {};
    (scores || []).forEach((s) => { scoresByProcess[s.process_key] = s; });
    const { content_gaps } = deriveSuggestionsFromAnswers(
      answers || [],
      scoresByProcess,
      excludeActionKeys,
      { includeMatchDebug: process.env.NODE_ENV === 'development' }
    );

    for (const g of content_gaps) {
      console.log('[AUDIT] content_gap process_key=' + g.process_key + ' band=' + g.band + ' reason=' + (g.reason || 'no_matching_rule') + ' assessment_id=' + assessmentId + ' action_key=' + (g.action_key || ''));
    }

    const remaining_count = suggestions.length;
    const required_count = Math.min(3, Math.max(0, remaining_count));
    const is_last_block = remaining_count < 3;

    const { data: gapCausesForCoverage } = await supabase
      .schema('public')
      .from('full_gap_causes')
      .select('gap_id, cause_primary')
      .eq('assessment_id', assessmentId)
      .in('gap_id', CAUSE_ENGINE_GAP_IDS);
    const has_cause_coverage = Array.isArray(gapCausesForCoverage) && gapCausesForCoverage.some((r) => r.cause_primary);

    const mechanism_required_action_keys = has_cause_coverage ? await getMechanismRequiredActionKeys(assessmentId) : [];

    return res.json({
      ok: true,
      suggestions,
      content_gaps,
      scores_by_process: (scores || []).map((s) => ({ ...s, score_numeric: toExternalScore(s.score_numeric) })),
      assessment_id: assessment.id,
      required_count,
      remaining_count,
      is_last_block,
      has_cause_coverage,
      mechanism_required_action_keys,
    });
  } catch (err) {
    console.error('Erro GET /full/actions:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// POST /full/cycle/select-actions
router.post('/full/cycle/select-actions', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.query.company_id || req.body.company_id;
    const assessmentId = req.body.assessment_id;
    const items = req.body.actions || req.body.items || [];

    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
    if (!assessmentId) return res.status(400).json({ error: 'assessment_id é obrigatório' });

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    if (assessment.status === 'CLOSED') return cycleClosed(res);

    const { remaining_count, required_count } = await computeRemainingAndRequired(assessmentId);
    if (remaining_count === 0) {
      return apiError(res, 400, 'NO_ACTIONS_LEFT', 'Não há mais ações sugeridas. Acesse os resultados ou o dashboard.');
    }

    const arr = Array.isArray(items) ? items : [];
    const isLastBlock = remaining_count <= 3;
    if (isLastBlock) {
      if (arr.length < 1) {
        return apiError(res, 400, 'ACTION_COUNT_INVALID', 'Selecione pelo menos 1 ação.', { required_count, remaining_count });
      }
    } else {
      if (arr.length !== 3) {
        return apiError(res, 400, 'ACTION_COUNT_INVALID', 'Selecione exatamente 3 ações.', { required_count, remaining_count });
      }
    }

    const seenAction = new Set();
    const seenPos = new Set();
    const validated = [];
    for (const it of arr) {
      const actionKey = it.action_key;
      const ownerName = it.owner_name;
      const metricText = it.metric_text;
      const checkpointDate = it.checkpoint_date;
      const pos = Number(it.position);
      if (!actionKey || !ownerName || !metricText || !checkpointDate || !pos) {
        return res.status(400).json({ error: `cada ação exige action_key, owner_name, metric_text, checkpoint_date e position(1..${required_count})` });
      }
      if (pos < 1 || pos > required_count) return res.status(400).json({ error: 'position deve ser 1..' + required_count });
      if (seenAction.has(actionKey)) return res.status(400).json({ error: 'action_key duplicado' });
      if (seenPos.has(pos)) return res.status(400).json({ error: 'position duplicado' });
      seenAction.add(actionKey);
      seenPos.add(pos);
      validated.push({ action_key: actionKey, owner_name: ownerName, metric_text: metricText, checkpoint_date: checkpointDate, position: pos });
    }

    const mechValidationCycle = await validateMechanismActionRequired(assessmentId, validated.map((v) => v.action_key));
    if (!mechValidationCycle.valid) {
      return apiError(res, 400, 'MECHANISM_ACTION_REQUIRED', 'Sem atacar a causa, você volta ao mesmo problema. Inclua pelo menos uma ação do mecanismo indicado.', {
        mechanism_action_keys: mechValidationCycle.mechanism_action_keys || [],
      });
    }

    const { data: actionCatalog } = await supabase
      .schema('public')
      .from('full_action_catalog')
      .select('action_key, process_key, band')
      .in('action_key', validated.map((v) => v.action_key));

    const actMap = {};
    (actionCatalog || []).forEach((a) => { actMap[a.action_key] = a; });

    const { getActionMetaFromCatalog } = require('../../lib/fullCatalog');

    const unknownKeys = validated.filter((v) => !actMap[v.action_key] && !getActionMetaFromCatalog(v.action_key));
    if (unknownKeys.length > 0) {
      return apiError(res, 400, 'ACTION_SEGMENT_MISMATCH', 'Ação não disponível para este diagnóstico.', {
        unknown_action_keys: unknownKeys.map((v) => v.action_key),
      });
    }

    const toInsert = validated.map((v) => {
      const fromDb = actMap[v.action_key];
      const fromCatalog = !fromDb ? getActionMetaFromCatalog(v.action_key) : null;
      const meta = fromDb || fromCatalog || { process_key: 'GESTAO', band: 'MEDIUM' };
      return {
        assessment_id: assessmentId,
        action_key: v.action_key,
        process_key: meta.process_key,
        band: meta.band,
        position: v.position,
        owner_name: v.owner_name,
        metric_text: v.metric_text,
        checkpoint_date: v.checkpoint_date,
        status: 'NOT_STARTED',
      };
    });

    const { error: delErr } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .delete()
      .eq('assessment_id', assessmentId);
    if (delErr) return res.status(500).json({ error: 'erro ao preparar ciclo' });

    const { error: insErr } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .insert(toInsert);
    if (insErr) return res.status(500).json({ error: 'erro ao salvar ciclo' });

    const { emitValueEvent } = require('../../lib/fullValueEvents');
    emitValueEvent('PLAN_CREATED', { assessment_id: assessmentId, company_id: companyId, meta: { action_count: toInsert.length } });
    logEvent(supabase, { event: 'plan_created', userId, companyId, assessmentId, meta: { action_count: toInsert.length } });

    return res.status(200).json({ ok: true, actions: toInsert });
  } catch (err) {
    console.error('Erro POST /full/cycle/select-actions:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// POST /full/plan (alias idempotente)
router.post('/full/plan', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.query.company_id || req.body.company_id;
    const assessmentId = req.body.assessment_id;
    const items = req.body.actions || req.body.items || req.body;

    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
    if (!assessmentId) return res.status(400).json({ error: 'assessment_id é obrigatório' });

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    if (assessment.status === 'CLOSED') return cycleClosed(res);

    const { remaining_count, required_count } = await computeRemainingAndRequired(assessmentId);
    if (remaining_count === 0) {
      return apiError(res, 400, 'NO_ACTIONS_LEFT', 'Não há mais ações sugeridas. Acesse os resultados ou o dashboard.');
    }

    const arr = Array.isArray(items) ? items : [items];
    if (arr.length !== required_count) {
      return res.status(400).json({
        error: required_count === 1
          ? 'Selecione exatamente 1 ação para este bloco.'
          : `Selecione exatamente ${required_count} ações para este bloco.`,
        required_count,
        remaining_count,
      });
    }

    const validated = [];
    const seenKeys = new Set();
    const seenPos = new Set();

    for (const it of arr) {
      const pos = it.position ?? it.pos;
      const actionKey = it.action_key;
      const ownerName = (it.owner_name ?? it.owner ?? '').toString().trim();
      const metricText = (it.metric_text ?? it.metric ?? '').toString().trim();
      const checkpointDate = it.checkpoint_date ?? it.checkpoint;

      if (!pos || !actionKey || !ownerName || !metricText || !checkpointDate) {
        return res.status(400).json({
          error: `cada ação exige position (1-${required_count}), action_key, owner_name, metric_text, checkpoint_date`
        });
      }
      if (pos < 1 || pos > required_count) return res.status(400).json({ error: 'position deve ser 1 a ' + required_count });
      if (seenKeys.has(actionKey)) return res.status(400).json({ error: 'action_key duplicado' });
      if (seenPos.has(pos)) return res.status(400).json({ error: 'position duplicado' });
      seenKeys.add(actionKey);
      seenPos.add(pos);
      validated.push({ position: pos, action_key: actionKey, owner_name: ownerName, metric_text: metricText, checkpoint_date: checkpointDate });
    }

    const mechValidation = await validateMechanismActionRequired(assessmentId, validated.map((v) => v.action_key));
    if (!mechValidation.valid) {
      return apiError(res, 400, 'MECHANISM_ACTION_REQUIRED', 'Sem atacar a causa, você volta ao mesmo problema. Inclua pelo menos uma ação do mecanismo indicado.', {
        mechanism_action_keys: mechValidation.mechanism_action_keys || [],
      });
    }

    const { data: actCatalog } = await supabase
      .schema('public')
      .from('full_action_catalog')
      .select('process_key, band, action_key')
      .in('action_key', validated.map((v) => v.action_key));

    const catalogMap = {};
    (actCatalog || []).forEach((a) => { catalogMap[a.action_key] = a; });
    const { getActionMetaFromCatalog } = require('../../lib/fullCatalog');

    const toInsert = validated.map((v) => {
      const fromDb = catalogMap[v.action_key];
      const fromCatalog = !fromDb ? getActionMetaFromCatalog(v.action_key) : null;
      const meta = fromDb || fromCatalog || { process_key: 'GESTAO', band: 'MEDIUM' };
      return {
        assessment_id: assessmentId,
        action_key: v.action_key,
        process_key: meta.process_key,
        band: meta.band,
        position: v.position,
        owner_name: v.owner_name,
        metric_text: v.metric_text,
        checkpoint_date: v.checkpoint_date,
        status: 'NOT_STARTED',
      };
    });

    const { error: delErr } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .delete()
      .eq('assessment_id', assessmentId);
    if (delErr) return res.status(500).json({ error: 'erro ao preparar plano' });

    const { error: insErr } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .insert(toInsert);
    if (insErr) return res.status(500).json({ error: 'erro ao salvar plano' });

    const { emitValueEvent } = require('../../lib/fullValueEvents');
    emitValueEvent('PLAN_CREATED', { assessment_id: assessmentId, company_id: companyId, meta: { action_count: toInsert.length } });

    return res.status(200).json({ ok: true, plan: toInsert, required_count, remaining_count });
  } catch (err) {
    console.error('Erro POST /full/plan:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// GET /full/plan (redirect alias)
router.get('/full/plan', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
  const assessmentId = req.query.assessment_id;
  const companyId = req.query.company_id;
  if (!assessmentId) return res.status(400).json({ error: 'assessment_id é obrigatório' });
  if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada. Acesse a partir do menu ou link correto.');
  return res.redirect(307, `/full/assessments/${assessmentId}/dashboard?company_id=${companyId}`);
});

// POST /full/actions/:action_key/status
router.post('/full/actions/:action_key/status', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const actionKey = decodeURIComponent(req.params.action_key || '');
    const companyId = req.query.company_id || req.body.company_id;
    const assessmentId = req.query.assessment_id || req.body.assessment_id;
    const { status, dropped_reason } = req.body;

    if (!companyId || !assessmentId) return res.status(400).json({ error: 'company_id e assessment_id são obrigatórios' });
    if (!status || !['DONE', 'DROPPED', 'IN_PROGRESS', 'NOT_STARTED'].includes(status)) {
      return apiError(res, 400, 'INVALID_STATUS', 'Status inválido.');
    }

    if (status === 'DONE') {
      const company = await ensureCompanyAccess(userId, companyId);
      if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada.');
      const assessment = await getAssessment(assessmentId, companyId);
      if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

      const { data: dodRow } = await supabase
        .schema('public')
        .from('full_action_dod_confirmations')
        .select('assessment_id')
        .eq('assessment_id', assessmentId)
        .eq('action_key', actionKey)
        .maybeSingle();
      if (!dodRow) return apiError(res, 400, 'CHECKLIST_INCOMPLETE', 'Falta confirmar o que conta como feito.');

      const { data: evRow } = await supabase
        .schema('public')
        .from('full_action_evidence')
        .select('assessment_id')
        .eq('assessment_id', assessmentId)
        .eq('action_key', actionKey)
        .maybeSingle();
      if (!evRow) return apiError(res, 400, 'EVIDENCE_REQUIRED', 'Para concluir, registre a evidência (antes e depois).');
    }
    if (status === 'DROPPED') {
      const reason = typeof dropped_reason === 'string' ? dropped_reason.trim() : '';
      if (reason.length < 20) {
        return apiError(res, 400, 'DROP_REASON_REQUIRED', 'Ao descartar uma ação, informe o motivo (mínimo 20 caracteres).');
      }
    }

    const company = await ensureCompanyAccess(userId, companyId);
    if (!company) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada.');
    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    if (assessment.status === 'CLOSED') return cycleClosed(res);

    const update = { status, updated_at: new Date().toISOString() };
    if (status === 'DROPPED') update.dropped_reason = dropped_reason;

    const { data, error } = await supabase
      .schema('public')
      .from('full_selected_actions')
      .update(update)
      .eq('assessment_id', assessmentId)
      .eq('action_key', actionKey)
      .select()
      .maybeSingle();

    if (error) return apiError(res, 500, 'STATUS_UPDATE_ERROR', 'Erro ao atualizar status. Tente novamente.');
    if (!data) return apiError(res, 404, 'ACTION_NOT_FOUND', 'Ação não encontrada no plano.');

    return res.json(data);
  } catch (err) {
    console.error('Erro POST /full/actions/:action_key/status:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

module.exports = router;
