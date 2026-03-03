/**
 * Rotas de planos LIGHT (F3):
 *   GET  /light/plans/status
 *   GET  /light/plans/:processKey/status
 *   GET  /light/plans/:processKey
 *   GET  /light/plans
 *   POST /light/plans
 *   POST /light/progress
 */
const express = require('express');
const router = express.Router();
const { supabase } = require('../../lib/supabase');
const { requireAuth } = require('../../middleware/requireAuth');
const { blockConsultorOnMutation } = require('../../middleware/requireRole');
const {
  validateAssessmentOwnership,
  validateFreeActionOwnership,
  normalizeProcessKey,
} = require('./helpers');

/**
 * GET /light/plans/status?assessment_id=&company_id=
 * Status agregado dos 4 planos (mapa por processo)
 */
router.get('/light/plans/status', requireAuth, blockConsultorOnMutation, async (req, res) => {
  try {
    const assessmentId = req.query.assessment_id;
    const companyId = req.query.company_id;

    if (!assessmentId || !companyId) {
      return res.status(400).json({ error: 'assessment_id e company_id são obrigatórios' });
    }

    const ownership = await validateAssessmentOwnership(assessmentId, req.user.id);
    if (!ownership.valid) {
      return res.status(ownership.error === 'sem acesso' ? 403 : 404).json({ error: ownership.error });
    }

    if (ownership.assessment.company_id !== companyId) {
      return res.status(403).json({ error: 'sem acesso' });
    }

    const processes = ['COMERCIAL', 'OPERACOES', 'ADM_FIN', 'GESTAO'];
    const keyMap = { COMERCIAL: 'comercial', OPERACOES: 'operacoes', ADM_FIN: 'adm_fin', GESTAO: 'gestao' };
    const result = { comercial: {}, operacoes: {}, adm_fin: {}, gestao: {} };

    for (const process of processes) {
      const { data: freeAction, error: faErr } = await supabase
        .from('assessment_free_actions')
        .select('id, assessment_id, process, created_at')
        .eq('assessment_id', assessmentId)
        .eq('process', process)
        .maybeSingle();

      if (faErr || !freeAction) {
        result[keyMap[process]] = { exists: false };
        continue;
      }

      const { data: planRow } = await supabase
        .schema('public')
        .from('light_action_plans')
        .select('id, updated_at, locked')
        .eq('owner_user_id', req.user.id)
        .eq('assessment_id', assessmentId)
        .eq('process', process)
        .maybeSingle();

      const { data: evidenceRows } = await supabase
        .schema('public')
        .from('assessment_free_action_evidences')
        .select('id')
        .eq('free_action_id', freeAction.id)
        .limit(1);

      const completed = evidenceRows && evidenceRows.length > 0;
      const hasPlan = !!planRow;

      result[keyMap[process]] = {
        exists: true,
        plan_id: freeAction.id,
        completed,
        has_plan_30d: hasPlan,
        updated_at: planRow?.updated_at || freeAction.created_at,
      };
    }

    const allDone = processes.every((p) => result[keyMap[p]].exists && result[keyMap[p]].has_plan_30d);

    return res.json({
      by_process: result,
      all_done: allDone,
    });
  } catch (error) {
    console.error('Erro ao buscar status agregado:', error.message);
    return res.status(500).json({ error: 'erro inesperado' });
  }
});

/**
 * GET /light/plans/:processKey/status?assessment_id=&company_id=
 * Status do plano por processo (existe?, plan_id, completed, updated_at)
 */
router.get('/light/plans/:processKey/status', requireAuth, blockConsultorOnMutation, async (req, res) => {
  try {
    const processKey = req.params.processKey;
    const assessmentId = req.query.assessment_id;
    const companyId = req.query.company_id;

    const process = normalizeProcessKey(processKey);
    if (!process) {
      return res.status(400).json({ error: 'processKey inválido. Use: comercial, operacoes, adm_fin, gestao' });
    }

    if (!assessmentId || !companyId) {
      return res.status(400).json({ error: 'assessment_id e company_id são obrigatórios' });
    }

    const ownership = await validateAssessmentOwnership(assessmentId, req.user.id);
    if (!ownership.valid) {
      return res.status(ownership.error === 'sem acesso' ? 403 : 404).json({ error: ownership.error });
    }

    if (ownership.assessment.company_id !== companyId) {
      return res.status(403).json({ error: 'sem acesso' });
    }

    const { data: freeAction, error: faErr } = await supabase
      .from('assessment_free_actions')
      .select('id, assessment_id, process, created_at')
      .eq('assessment_id', assessmentId)
      .eq('process', process)
      .maybeSingle();

    if (faErr) {
      return res.status(500).json({ error: 'erro ao verificar plano' });
    }

    if (!freeAction) {
      return res.json({ exists: false });
    }

    const { data: evidenceRows } = await supabase
      .schema('public')
      .from('assessment_free_action_evidences')
      .select('id, created_at')
      .eq('free_action_id', freeAction.id)
      .limit(1);

    const hasEvidence = evidenceRows && evidenceRows.length > 0;
    const evidence = hasEvidence ? evidenceRows[0] : null;

    const { data: planRow } = await supabase
      .schema('public')
      .from('light_action_plans')
      .select('updated_at')
      .eq('owner_user_id', req.user.id)
      .eq('assessment_id', assessmentId)
      .eq('process', process)
      .maybeSingle();

    const updatedAt = planRow?.updated_at || evidence?.created_at || freeAction.created_at;

    return res.json({
      exists: true,
      plan_id: freeAction.id,
      completed: hasEvidence,
      updated_at: updatedAt || null,
    });
  } catch (error) {
    console.error('Erro ao buscar status do plano:', error.message);
    return res.status(500).json({ error: 'erro inesperado' });
  }
});

/**
 * GET /light/plans/:processKey?assessment_id=&company_id=
 * Retorna o plano salvo para o processo (free_action + light_action_plan)
 */
router.get('/light/plans/:processKey', requireAuth, blockConsultorOnMutation, async (req, res) => {
  try {
    const processKey = req.params.processKey;
    const assessmentId = req.query.assessment_id;
    const companyId = req.query.company_id;

    const process = normalizeProcessKey(processKey);
    if (!process) {
      return res.status(400).json({ error: 'processKey inválido. Use: comercial, operacoes, adm_fin, gestao' });
    }

    if (!assessmentId || !companyId) {
      return res.status(400).json({ error: 'assessment_id e company_id são obrigatórios' });
    }

    const ownership = await validateAssessmentOwnership(assessmentId, req.user.id);
    if (!ownership.valid) {
      return res.status(ownership.error === 'sem acesso' ? 403 : 404).json({ error: ownership.error });
    }

    if (ownership.assessment.company_id !== companyId) {
      return res.status(403).json({ error: 'sem acesso' });
    }

    const { data: freeAction, error: faErr } = await supabase
      .from('assessment_free_actions')
      .select('id, assessment_id, process, recommendation_id, status, created_at')
      .eq('assessment_id', assessmentId)
      .eq('process', process)
      .maybeSingle();

    if (faErr) {
      return res.status(500).json({ error: 'erro ao buscar plano' });
    }

    if (!freeAction) {
      return res.status(404).json({ error: 'plano não encontrado para este processo' });
    }

    const { data: planRow } = await supabase
      .schema('public')
      .from('light_action_plans')
      .select('*')
      .eq('owner_user_id', req.user.id)
      .eq('assessment_id', assessmentId)
      .eq('process', process)
      .maybeSingle();

    const { data: evidenceRows } = await supabase
      .schema('public')
      .from('assessment_free_action_evidences')
      .select('id, evidence_text, created_at, declared_gain_type, declared_gain_note, done_criteria_json')
      .eq('free_action_id', freeAction.id)
      .limit(1);

    const evidence = evidenceRows && evidenceRows.length > 0 ? evidenceRows[0] : null;

    const response = {
      plan_id: freeAction.id,
      free_action: {
        id: freeAction.id,
        assessment_id: freeAction.assessment_id,
        process: freeAction.process,
        recommendation_id: freeAction.recommendation_id,
        status: freeAction.status,
        created_at: freeAction.created_at,
      },
      light_plan: planRow || null,
      evidence: evidence ? {
        evidence_text: evidence.evidence_text,
        created_at: evidence.created_at,
        declared_gain_type: evidence.declared_gain_type,
        declared_gain_note: evidence.declared_gain_note,
        done_criteria_json: evidence.done_criteria_json,
      } : null,
      completed: !!evidence,
    };

    return res.json(response);
  } catch (error) {
    console.error('Erro ao buscar plano:', error.message);
    return res.status(500).json({ error: 'erro inesperado' });
  }
});

/**
 * GET /light/plans?assessment_id=&company_id=
 * Retorna planos LITE do usuário (com status de progresso/evidência)
 */
router.get('/light/plans', requireAuth, blockConsultorOnMutation, async (req, res) => {
  try {
    const assessmentId = req.query.assessment_id;
    const companyId = req.query.company_id;

    if (!assessmentId || !companyId) {
      return res.status(400).json({ error: 'assessment_id e company_id são obrigatórios' });
    }

    const ownership = await validateAssessmentOwnership(assessmentId, req.user.id);
    if (!ownership.valid) {
      return res.status(ownership.error === 'sem acesso' ? 403 : 404).json({ error: ownership.error });
    }

    if (ownership.assessment.company_id !== companyId) {
      return res.status(403).json({ error: 'sem acesso' });
    }

    const { data: plans, error: plansErr } = await supabase
      .schema('public')
      .from('light_action_plans')
      .select('id, assessment_id, company_id, process, assessment_free_action_id, free_action_id, step_1, step_2, step_3, owner_name, metric, checkpoint_date, locked, created_at, updated_at')
      .eq('assessment_id', assessmentId)
      .eq('company_id', companyId)
      .eq('owner_user_id', req.user.id);

    if (plansErr) {
      return res.status(500).json({ error: 'erro ao buscar planos' });
    }

    const processOrder = ['COMERCIAL', 'OPERACOES', 'ADM_FIN', 'GESTAO'];
    const orderedPlans = (plans || []).slice().sort((a, b) => {
      return processOrder.indexOf(a.process) - processOrder.indexOf(b.process);
    });

    return res.json(orderedPlans);
  } catch (error) {
    console.error('Erro ao buscar planos LITE:', error.message);
    return res.status(500).json({ error: 'erro inesperado' });
  }
});

/**
 * POST /light/plans
 * Cria/atualiza plano 30d (permitido apenas antes da evidência)
 */
router.post('/light/plans', requireAuth, blockConsultorOnMutation, async (req, res) => {
  try {
    const {
      assessment_id,
      company_id,
      process,
      free_action_id,
      assessment_free_action_id,
      step_1,
      step_2,
      step_3,
      owner_name,
      metric,
      checkpoint_date,
    } = req.body || {};

    const resolvedFreeActionId = free_action_id || assessment_free_action_id;
    const required = [assessment_id, company_id, process, resolvedFreeActionId, step_1, step_2, step_3, owner_name, metric, checkpoint_date];
    if (required.some((value) => !value || (typeof value === 'string' && value.trim().length === 0))) {
      return res.status(400).json({ error: 'campos obrigatórios ausentes' });
    }

    if (!['COMERCIAL', 'OPERACOES', 'ADM_FIN', 'GESTAO'].includes(process)) {
      return res.status(400).json({ error: 'process inválido' });
    }

    const ownership = await validateAssessmentOwnership(assessment_id, req.user.id);
    if (!ownership.valid) {
      return res.status(ownership.error === 'sem acesso' ? 403 : 404).json({ error: ownership.error });
    }

    if (ownership.assessment.company_id !== company_id) {
      return res.status(403).json({ error: 'sem acesso' });
    }

    const { data: freeAction, error: freeErr } = await supabase
      .from('assessment_free_actions')
      .select('id, assessment_id, process')
      .eq('id', resolvedFreeActionId)
      .maybeSingle();

    if (freeErr || !freeAction) {
      return res.status(404).json({ error: 'ação gratuita não encontrada' });
    }

    if (freeAction.assessment_id !== assessment_id) {
      return res.status(400).json({ error: 'ação não pertence ao assessment' });
    }

    if (freeAction.process !== process) {
      return res.status(400).json({ error: 'process não corresponde à ação' });
    }

    const { data: evidenceRows, error: evErr } = await supabase
      .schema('public')
      .from('assessment_free_action_evidences')
      .select('id')
      .eq('free_action_id', resolvedFreeActionId)
      .limit(2);

    if (evErr) {
      console.error('[LIGHT_PLANS] Erro ao verificar evidência:', {
        free_action_id: resolvedFreeActionId,
        message: evErr.message,
        code: evErr.code,
        details: evErr.details,
        hint: evErr.hint,
      });
      return res.status(500).json({ error: 'erro ao verificar evidência' });
    }

    const existingEvidence = evidenceRows && evidenceRows.length > 0 ? evidenceRows[0] : null;

    const { data: planRows, error: planErr } = await supabase
      .schema('public')
      .from('light_action_plans')
      .select('id, owner_user_id, locked, free_action_id')
      .eq('owner_user_id', req.user.id)
      .eq('assessment_id', assessment_id)
      .eq('process', process)
      .limit(2);

    if (planErr) {
      console.error('[LIGHT_PLANS] Erro ao verificar plano:', {
        assessment_id,
        process,
        message: planErr.message,
        code: planErr.code,
      });
      return res.status(500).json({ error: 'erro ao verificar plano' });
    }

    const existingPlan = planRows && planRows.length > 0 ? planRows[0] : null;

    if (existingPlan && existingPlan.owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'sem acesso' });
    }

    if (existingPlan && existingPlan.locked) {
      const planId = existingPlan.free_action_id || resolvedFreeActionId;
      return res.status(200).json({
        created: false,
        already_exists: true,
        plan_id: planId,
        message: 'Plano já concluído para este processo.',
        locked: true,
      });
    }

    if (existingEvidence) {
      await supabase
        .from('light_action_plans')
        .update({ locked: true, updated_at: new Date().toISOString() })
        .eq('owner_user_id', req.user.id)
        .eq('assessment_id', assessment_id)
        .eq('process', process);
      return res.status(200).json({
        created: false,
        already_exists: true,
        plan_id: resolvedFreeActionId,
        message: 'Plano já concluído para este processo.',
        completed: true,
      });
    }

    const payload = {
      assessment_id,
      company_id,
      process,
      free_action_id: resolvedFreeActionId,
      assessment_free_action_id: resolvedFreeActionId,
      step_1: String(step_1).trim(),
      step_2: String(step_2).trim(),
      step_3: String(step_3).trim(),
      owner_name: String(owner_name).trim(),
      metric: String(metric).trim(),
      checkpoint_date,
      owner_user_id: req.user.id,
      created_by_user_id: req.user.id,
      updated_at: new Date().toISOString(),
    };

    const { data: savedPlan, error: upsertErr } = await supabase
      .schema('public')
      .from('light_action_plans')
      .upsert(payload, { onConflict: 'owner_user_id,assessment_id,process' })
      .select()
      .single();

    if (upsertErr) {
      console.error('[LIGHT_PLANS] Erro ao salvar plano:', {
        message: upsertErr.message,
        code: upsertErr.code,
        details: upsertErr.details,
        hint: upsertErr.hint,
      });
      return res.status(500).json({ error: 'erro ao salvar plano' });
    }

    const isUpdate = !!existingPlan;
    const body = isUpdate
      ? { ...savedPlan, created: false, already_exists: true, plan_id: savedPlan.id, message: 'Plano já existente. Atualizado.' }
      : { ...savedPlan, created: true, already_exists: false, plan_id: savedPlan.id };
    return res.status(isUpdate ? 200 : 201).json(body);
  } catch (error) {
    console.error('Erro ao salvar plano LITE:', error.message);
    return res.status(500).json({ error: 'erro inesperado' });
  }
});

/**
 * POST /light/progress
 * Registra progresso declarado (write-once)
 */
router.post('/light/progress', requireAuth, blockConsultorOnMutation, async (req, res) => {
  try {
    const { free_action_id, done_criteria_json, declared_gain_type, declared_gain_note } = req.body || {};

    if (!free_action_id || !declared_gain_type || !declared_gain_note) {
      return res.status(400).json({ error: 'campos obrigatórios ausentes' });
    }

    if (!Array.isArray(done_criteria_json) || done_criteria_json.length === 0) {
      return res.status(400).json({ error: 'done_criteria_json deve ser uma lista' });
    }

    const ownership = await validateFreeActionOwnership(free_action_id, req.user.id);
    if (!ownership.valid) {
      return res.status(ownership.error === 'sem acesso' ? 403 : 404).json({ error: ownership.error });
    }

    const { data: existingEvidence, error: evErr } = await supabase
      .from('assessment_free_action_evidences')
      .select('id')
      .eq('free_action_id', free_action_id)
      .maybeSingle();

    if (evErr) {
      return res.status(500).json({ error: 'erro ao verificar evidência' });
    }

    if (existingEvidence) {
      return res.status(409).json({ error: 'evidência já registrada' });
    }

    const { data: existingPlan, error: planErr } = await supabase
      .from('light_action_plans')
      .select('id, owner_user_id')
      .eq('free_action_id', free_action_id)
      .maybeSingle();

    if (planErr) {
      return res.status(500).json({ error: 'erro ao verificar plano' });
    }

    if (!existingPlan || existingPlan.owner_user_id !== req.user.id) {
      return res.status(400).json({ error: 'plano 30d não encontrado' });
    }

    const { data: existingProgress, error: progressErr } = await supabase
      .from('light_action_progress')
      .select('id')
      .eq('free_action_id', free_action_id)
      .maybeSingle();

    if (progressErr) {
      return res.status(500).json({ error: 'erro ao verificar progresso' });
    }

    if (existingProgress) {
      return res.status(409).json({ error: 'progresso já registrado' });
    }

    const { data: savedProgress, error: insertErr } = await supabase
      .from('light_action_progress')
      .insert({
        free_action_id,
        done_criteria_json,
        declared_gain_type: String(declared_gain_type).trim(),
        declared_gain_note: String(declared_gain_note).trim(),
        created_by_user_id: req.user.id,
      })
      .select()
      .single();

    if (insertErr) {
      return res.status(500).json({ error: 'erro ao salvar progresso' });
    }

    return res.status(201).json(savedProgress);
  } catch (error) {
    console.error('Erro ao salvar progresso LITE:', error.message);
    return res.status(500).json({ error: 'erro inesperado' });
  }
});

module.exports = router;
