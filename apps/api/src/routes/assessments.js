const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');
const { requireAuth } = require('../middleware/requireAuth');

/**
 * POST /assessments/light
 * Inicia um diagnóstico LIGHT (status = DRAFT) para uma company do usuário
 */
router.post('/light', requireAuth, async (req, res) => {
  try {
    const { company_id } = req.body;

    // Validação: company_id obrigatório
    if (!company_id || typeof company_id !== 'string' || company_id.trim().length === 0) {
      return res.status(400).json({ error: 'company_id é obrigatório' });
    }

    // Validar que company existe e pertence ao usuário (defesa em profundidade)
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, owner_user_id')
      .eq('id', company_id)
      .eq('owner_user_id', req.user.id)
      .single();

    if (companyError || !company) {
      return res.status(403).json({ error: 'company não pertence ao usuário' });
    }

    // Criar assessment LIGHT com status DRAFT
    const { data: assessment, error: assessmentError } = await supabase
      .from('assessments')
      .insert({
        company_id: company_id,
        type: 'LIGHT',
        status: 'DRAFT',
        completed_at: null
      })
      .select()
      .single();

    if (assessmentError) {
      console.error('Erro ao criar assessment:', assessmentError.message);
      return res.status(500).json({ error: 'erro ao criar assessment' });
    }

    res.status(200).json(assessment);
  } catch (error) {
    console.error('Erro inesperado ao criar assessment:', error.message);
    res.status(500).json({ error: 'erro inesperado' });
  }
});

/**
 * POST /assessments/:id/light/submit
 * Submete diagnóstico LIGHT: persiste itens, calcula scores e marca como COMPLETED
 */
router.post('/:id/light/submit', requireAuth, async (req, res) => {
  try {
    const assessmentId = req.params.id;
    const { items } = req.body;

    // Validação: items é array com exatamente 12 itens
    if (!Array.isArray(items) || items.length !== 12) {
      return res.status(400).json({ error: 'items deve ser um array com exatamente 12 itens' });
    }

    // Validar cada item
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.process || typeof item.process !== 'string' || item.process.trim().length === 0) {
        return res.status(400).json({ error: `item[${i}].process é obrigatório` });
      }
      if (!item.activity || typeof item.activity !== 'string' || item.activity.trim().length === 0) {
        return res.status(400).json({ error: `item[${i}].activity é obrigatório` });
      }
      if (typeof item.score_int !== 'number' || item.score_int < 0 || item.score_int > 10) {
        return res.status(400).json({ error: `item[${i}].score_int deve ser um número entre 0 e 10` });
      }
    }

    // Validar assessment existe e está em DRAFT
    const { data: assessment, error: assessmentError } = await supabase
      .from('assessments')
      .select('id, status, company_id')
      .eq('id', assessmentId)
      .single();

    if (assessmentError || !assessment) {
      return res.status(403).json({ error: 'assessment não encontrado' });
    }

    if (assessment.status !== 'DRAFT') {
      return res.status(409).json({ error: 'assessment já COMPLETED' });
    }

    // Validar que company pertence ao usuário (defesa em profundidade)
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, owner_user_id')
      .eq('id', assessment.company_id)
      .eq('owner_user_id', req.user.id)
      .single();

    if (companyError || !company) {
      return res.status(403).json({ error: 'assessment não pertence ao usuário' });
    }

    // Persistir itens com UPSERT usando campos corretos do schema
    for (const item of items) {
      const { error: itemError } = await supabase
        .from('assessment_items')
        .upsert(
          {
            assessment_id: assessmentId,
            process: item.process.trim().toUpperCase(),
            activity: item.activity.trim().toUpperCase(),
            score_int: item.score_int
          },
          {
            onConflict: 'assessment_id,process,activity'
          }
        );

      if (itemError) {
        console.error('Erro ao persistir item:', itemError.message);
        return res.status(500).json({ error: 'erro ao persistir itens' });
      }
    }

    // Calcular scores por processo (média de 3 atividades cada)
    const processMap = {
      'COMERCIAL': 'commercial',
      'OPERACOES': 'operations',
      'ADM_FIN': 'admin_fin',
      'GESTAO': 'management'
    };

    // Agrupar itens por processo
    const processScores = {};
    items.forEach(item => {
      const process = item.process.trim().toUpperCase();
      if (!processScores[process]) {
        processScores[process] = [];
      }
      processScores[process].push(item.score_int);
    });

    // Validar que existem exatamente 4 processos únicos
    const uniqueProcesses = Object.keys(processScores);
    if (uniqueProcesses.length !== 4) {
      return res.status(400).json({ error: 'deve haver exatamente 4 processos únicos: COMERCIAL, OPERACOES, ADM_FIN, GESTAO' });
    }

    // Validar que cada processo tem exatamente 3 atividades
    for (const process of uniqueProcesses) {
      if (!processMap[process]) {
        return res.status(400).json({ error: `processo ${process} inválido. Use: COMERCIAL, OPERACOES, ADM_FIN, GESTAO` });
      }
      if (processScores[process].length !== 3) {
        return res.status(400).json({ error: `processo ${process} deve ter exatamente 3 atividades` });
      }
    }

    // Calcular médias por processo (score_int 0-10, manter em 0-10 com 2 casas decimais)
    const commercial = parseFloat((processScores['COMERCIAL'].reduce((sum, s) => sum + s, 0) / 3).toFixed(2));
    const operations = parseFloat((processScores['OPERACOES'].reduce((sum, s) => sum + s, 0) / 3).toFixed(2));
    const admin_fin = parseFloat((processScores['ADM_FIN'].reduce((sum, s) => sum + s, 0) / 3).toFixed(2));
    const management = parseFloat((processScores['GESTAO'].reduce((sum, s) => sum + s, 0) / 3).toFixed(2));
    
    // Calcular overall (média dos 4 processos)
    const overall = parseFloat(((commercial + operations + admin_fin + management) / 4).toFixed(2));

    // Persistir scores com UPSERT único (uma linha por assessment_id)
    const { error: scoreError } = await supabase
      .from('scores')
      .upsert(
        {
          assessment_id: assessmentId,
          commercial: commercial,
          operations: operations,
          admin_fin: admin_fin,
          management: management,
          overall: overall
        },
        {
          onConflict: 'assessment_id'
        }
      );

    if (scoreError) {
      console.error('Erro ao persistir scores:', scoreError.message);
      return res.status(500).json({ error: 'erro ao persistir scores' });
    }

    // Atualizar assessment para COMPLETED
    const { error: updateError } = await supabase
      .from('assessments')
      .update({
        status: 'COMPLETED',
        completed_at: new Date().toISOString()
      })
      .eq('id', assessmentId);

    if (updateError) {
      console.error('Erro ao atualizar assessment:', updateError.message);
      return res.status(500).json({ error: 'erro ao finalizar assessment' });
    }

    res.status(200).json({ status: 'COMPLETED' });
  } catch (error) {
    console.error('Erro inesperado ao submeter assessment:', error.message);
    res.status(500).json({ error: 'erro inesperado' });
  }
});

/**
 * GET /assessments/:id
 * Recupera assessment completo (refresh-safe, tudo do banco)
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    // 1. Ler assessmentId
    const assessmentId = req.params.id;

    // 2. Buscar assessment
    const { data: assessment, error: aErr } = await supabase
      .from('assessments')
      .select('*')
      .eq('id', assessmentId)
      .maybeSingle();

    if (aErr) {
      return res.status(500).json({ error: 'erro ao buscar assessment', detail: aErr.message });
    }
    if (!assessment) {
      return res.status(404).json({ error: 'assessment não encontrado' });
    }

    // 3. Validar ownership
    const { data: company, error: cErr } = await supabase
      .from('companies')
      .select('owner_user_id')
      .eq('id', assessment.company_id)
      .maybeSingle();

    if (cErr) {
      return res.status(500).json({ error: 'erro ao buscar company', detail: cErr.message });
    }
    if (!company) {
      return res.status(404).json({ error: 'company não encontrada' });
    }
    if (company.owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'sem acesso' });
    }

    // 4. Buscar items
    const { data: items, error: iErr } = await supabase
      .from('assessment_items')
      .select('*')
      .eq('assessment_id', assessmentId);

    if (iErr) {
      return res.status(500).json({ error: 'erro ao buscar itens', detail: iErr.message });
    }

    // 5. Buscar scores (uma linha)
    const { data: scores, error: sErr } = await supabase
      .from('scores')
      .select('*')
      .eq('assessment_id', assessmentId)
      .maybeSingle();

    if (sErr) {
      return res.status(500).json({ error: 'erro ao buscar scores', detail: sErr.message });
    }

    // 6. Retornar
    res.status(200).json({
      assessment,
      items: items || [],
      scores: scores || null
    });
  } catch (error) {
    console.error('Erro inesperado ao buscar assessment:', error.message);
    res.status(500).json({ error: 'erro inesperado', detail: error.message });
  }
});

module.exports = router;
