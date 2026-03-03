/**
 * Rotas de evidência e ação gratuita LIGHT (F3):
 *   POST /free-actions/:id/evidence
 *   GET  /free-actions/:id
 */
const express = require('express');
const router = express.Router();
const { supabase } = require('../../lib/supabase');
const { requireAuth } = require('../../middleware/requireAuth');
const { blockConsultorOnMutation } = require('../../middleware/requireRole');
const {
  validateAssessmentOwnership,
  FALLBACK_BY_PROCESS,
} = require('./helpers');

/**
 * POST /free-actions/:id/evidence
 * Adiciona evidência textual a uma ação gratuita (write-once)
 * Usa assessment_free_action_evidences como fonte de verdade
 */
router.post('/free-actions/:id/evidence', requireAuth, blockConsultorOnMutation, async (req, res) => {
  try {
    const freeActionId = req.params.id;
    const { evidence_text, declared_gain_type, declared_gain_note, done_criteria_json } = req.body;

    if (!evidence_text || typeof evidence_text !== 'string' || evidence_text.trim().length === 0) {
      return res.status(400).json({ error: 'evidence_text é obrigatório' });
    }

    if (done_criteria_json !== undefined && !Array.isArray(done_criteria_json)) {
      return res.status(400).json({ error: 'done_criteria_json deve ser uma lista' });
    }

    const { data: freeAction, error: faErr } = await supabase
      .schema('public')
      .from('assessment_free_actions')
      .select('id, assessment_id, recommendation_id')
      .eq('id', freeActionId)
      .single();

    if (faErr || !freeAction) {
      return res.status(404).json({ error: 'ação gratuita não encontrada' });
    }

    const ownership = await validateAssessmentOwnership(freeAction.assessment_id, req.user.id);
    if (!ownership.valid) {
      if (ownership.error === 'sem acesso') {
        return res.status(403).json({ error: 'sem acesso' });
      }
      return res.status(404).json({ error: ownership.error });
    }

    const { data: existingEvidence, error: evErr } = await supabase
      .schema('public')
      .from('assessment_free_action_evidences')
      .select('id')
      .eq('free_action_id', freeActionId)
      .maybeSingle();

    if (evErr) {
      console.error('Erro ao verificar evidência:', {
        message: evErr.message,
        code: evErr.code,
        details: evErr.details,
        hint: evErr.hint,
        fullError: JSON.stringify(evErr)
      });
      return res.status(500).json({ error: 'erro ao verificar evidência' });
    }

    if (existingEvidence) {
      console.log(`EVIDENCE WRITE-ONCE BLOCK action_id=${freeActionId}`);
      return res.status(409).json({ error: 'evidência já registrada' });
    }

    const { data: newEvidence, error: insertErr } = await supabase
      .schema('public')
      .from('assessment_free_action_evidences')
      .insert({
        free_action_id: freeActionId,
        evidence_text: evidence_text.trim(),
        created_by_user_id: req.user.id,
        declared_gain_type: declared_gain_type ? String(declared_gain_type).trim() : null,
        declared_gain_note: declared_gain_note ? String(declared_gain_note).trim() : null,
        done_criteria_json: Array.isArray(done_criteria_json) ? done_criteria_json : null
      })
      .select('id, free_action_id, created_at')
      .single();

    if (insertErr) {
      console.error('Erro ao inserir evidência:', {
        message: insertErr.message,
        code: insertErr.code,
        details: insertErr.details,
        hint: insertErr.hint,
        fullError: JSON.stringify(insertErr)
      });
      return res.status(500).json({ error: 'erro ao inserir evidência' });
    }

    const { error: updateErr } = await supabase
      .schema('public')
      .from('assessment_free_actions')
      .update({ status: 'COMPLETED' })
      .eq('id', freeActionId);

    if (updateErr) {
      console.error('Erro ao concluir ação gratuita:', updateErr.message);
      return res.status(500).json({ error: 'erro ao concluir ação gratuita' });
    }

    await supabase
      .from('light_action_plans')
      .update({ locked: true, updated_at: new Date().toISOString() })
      .eq('free_action_id', freeActionId);

    console.log(`EVIDENCE CREATE action_id=${freeActionId} user_id=${req.user.id}`);

    res.status(201).json(newEvidence);
  } catch (error) {
    console.error('Erro ao adicionar evidência:', error.message);
    res.status(500).json({ error: 'erro inesperado' });
  }
});

/**
 * GET /free-actions/:id
 * Retorna ação gratuita com recomendação e evidência
 */
router.get('/free-actions/:id', requireAuth, blockConsultorOnMutation, async (req, res) => {
  try {
    const freeActionId = req.params.id;

    const { data: freeAction, error: faErr } = await supabase
      .from('assessment_free_actions')
      .select('*')
      .eq('id', freeActionId)
      .single();

    if (faErr || !freeAction) {
      return res.status(404).json({ error: 'ação gratuita não encontrada' });
    }

    const ownership = await validateAssessmentOwnership(freeAction.assessment_id, req.user.id);
    if (!ownership.valid) {
      return res.status(ownership.error === 'sem acesso' ? 403 : 404).json({ error: ownership.error });
    }

    let recommendation;
    if (String(freeAction.recommendation_id).startsWith('fallback-')) {
      const fallback = FALLBACK_BY_PROCESS[freeAction.process];
      recommendation = fallback ? {
        title: fallback.title,
        description: fallback.why,
        checklist: fallback.checklist || []
      } : { title: 'Ação padrão', description: '', checklist: [] };
    } else {
      const { data: catalogRec, error: recErr } = await supabase
        .from('recommendations_catalog')
        .select('title, description')
        .eq('id', freeAction.recommendation_id)
        .single();

      if (recErr) {
        return res.status(500).json({ error: 'erro ao buscar recomendação' });
      }
      recommendation = {
        title: catalogRec.title,
        description: catalogRec.description,
        checklist: []
      };
    }

    const { data: evidence, error: evErr } = await supabase
      .schema('public')
      .from('assessment_free_action_evidences')
      .select('evidence_text, created_at, declared_gain_type, declared_gain_note, done_criteria_json')
      .eq('free_action_id', freeActionId)
      .maybeSingle();

    res.json({
      id: freeAction.id,
      assessment_id: freeAction.assessment_id,
      recommendation_id: freeAction.recommendation_id,
      process: freeAction.process,
      status: freeAction.status,
      created_at: freeAction.created_at,
      completed_at: freeAction.completed_at,
      recommendation: {
        title: recommendation.title,
        description: recommendation.description,
        checklist: recommendation.checklist || []
      },
      evidence: evidence ? {
        evidence_text: evidence.evidence_text,
        created_at: evidence.created_at,
        declared_gain_type: evidence.declared_gain_type,
        declared_gain_note: evidence.declared_gain_note,
        done_criteria_json: evidence.done_criteria_json
      } : null
    });
  } catch (error) {
    console.error('Erro ao buscar ação gratuita:', error.message);
    res.status(500).json({ error: 'erro inesperado' });
  }
});

module.exports = router;
