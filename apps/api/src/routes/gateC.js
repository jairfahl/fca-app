const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');
const { requireAuth } = require('../middleware/requireAuth');
const { requireFullEntitlement } = require('../middleware/requireFullEntitlement');

/**
 * GET /full/assessments/:id/summary
 * Retorna resumo executivo do diagnóstico FULL (Gate C - Linha 1)
 * 
 * Contrato esperado (quando implementado):
 * - Retorna visão gerencial estruturada do assessment
 * - Dados agregados por processo (COMERCIAL, OPERACOES, ADM_FIN, GESTAO)
 * - Score médio por processo
 * - Indicadores de maturidade
 * - NÃO recalcula scores (usa dados persistidos)
 * - Refresh-safe (tudo do DB)
 * 
 * Query params obrigatórios:
 * - company_id: UUID da company
 * 
 * Params:
 * - id: UUID do assessment
 * 
 * Middleware:
 * - requireAuth: Valida JWT
 * - requireFullEntitlement: Valida entitlement FULL/ACTIVE para company_id
 * 
 * Validações:
 * - company_id obrigatório em query
 * - Company deve existir e pertencer ao usuário
 * - Assessment deve existir e pertencer à company
 * 
 * Status codes:
 * - 200: Resumo retornado (quando implementado)
 * - 400: company_id ausente ou inválido
 * - 401: Token ausente ou inválido (via requireAuth)
 * - 403: Entitlement FULL não encontrado (via requireFullEntitlement)
 * - 404: Assessment ou company não encontrados
 * - 501: Endpoint não implementado ainda (placeholder)
 */
router.get('/full/assessments/:id/summary', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const companyId = req.query.company_id;

    // company_id é obrigatório (já validado pelo requireFullEntitlement, mas garantir aqui também)
    if (!companyId || typeof companyId !== 'string' || companyId.trim().length === 0) {
      return res.status(400).json({ error: 'company_id é obrigatório' });
    }

    // Validar que company existe e pertence ao usuário
    const { data: company, error: companyErr } = await supabase
      .schema('public')
      .from('companies')
      .select('id, owner_user_id')
      .eq('id', companyId)
      .eq('owner_user_id', userId)
      .maybeSingle();

    if (companyErr) {
      console.error('Erro ao validar company (gateC/summary):', companyErr.message);
      return res.status(500).json({ error: 'erro inesperado' });
    }

    if (!company) {
      return res.status(404).json({ error: 'company não encontrada ou não pertence ao usuário' });
    }

    // Validar que assessment existe e pertence à company
    const { data: assessment, error: assessErr } = await supabase
      .schema('public')
      .from('assessments')
      .select('id, company_id')
      .eq('id', assessmentId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (assessErr) {
      console.error('Erro ao buscar assessment (gateC/summary):', assessErr.message);
      return res.status(500).json({ error: 'erro inesperado' });
    }

    if (!assessment) {
      return res.status(404).json({ error: 'assessment não encontrado ou não pertence à company' });
    }

    // Buscar company com name
    const { data: companyFull, error: companyFullErr } = await supabase
      .schema('public')
      .from('companies')
      .select('id, name')
      .eq('id', companyId)
      .maybeSingle();

    if (companyFullErr) {
      console.error('Erro ao buscar company (gateC/summary):', companyFullErr.message);
      return res.status(500).json({ error: 'erro inesperado' });
    }

    // Buscar scores (obrigatório - não recalcular)
    const { data: scores, error: scoresErr } = await supabase
      .schema('public')
      .from('scores')
      .select('commercial, operations, admin_fin, management, overall')
      .eq('assessment_id', assessmentId)
      .maybeSingle();

    if (scoresErr) {
      console.error('Erro ao buscar scores (gateC/summary):', scoresErr.message);
      return res.status(500).json({ error: 'erro inesperado' });
    }

    if (!scores) {
      return res.status(404).json({ error: 'scores não encontrados' });
    }

    // Calcular overall se não existir (média simples dos 4 processos)
    const overall = scores.overall !== null && scores.overall !== undefined
      ? Number(scores.overall)
      : ((Number(scores.commercial) || 0) + 
         (Number(scores.operations) || 0) + 
         (Number(scores.admin_fin) || 0) + 
         (Number(scores.management) || 0)) / 4;

    // Buscar critical_gaps: top 3 piores processos (score asc, depois process asc)
    const processScores = [
      { process: 'COMERCIAL', score: Number(scores.commercial) || 0 },
      { process: 'OPERACOES', score: Number(scores.operations) || 0 },
      { process: 'ADM_FIN', score: Number(scores.admin_fin) || 0 },
      { process: 'GESTAO', score: Number(scores.management) || 0 }
    ];

    // Ordenação determinística: score asc, depois process asc
    const criticalGaps = processScores
      .sort((a, b) => {
        const scoreDiff = a.score - b.score;
        if (scoreDiff !== 0) return scoreDiff;
        return a.process.localeCompare(b.process);
      })
      .slice(0, 3)
      .map(p => ({
        type: 'PROCESS',
        process: p.process,
        score_int: p.score
      }));

    // Buscar top_initiatives de full_assessment_initiatives (rank 1..12)
    const { data: ranking, error: rankingErr } = await supabase
      .schema('public')
      .from('full_assessment_initiatives')
      .select('rank, initiative_id, process')
      .eq('assessment_id', assessmentId)
      .order('rank', { ascending: true });

    if (rankingErr) {
      console.error('Erro ao buscar ranking (gateC/summary):', rankingErr.message);
      return res.status(500).json({ error: 'erro inesperado' });
    }

    let topInitiatives = [];
    let dependenciesMap = [];

    if (ranking && ranking.length > 0) {
      // Buscar dados do catálogo para as iniciativas
      const initiativeIds = ranking.map(r => r.initiative_id);
      
      const { data: catalogItems, error: catalogErr } = await supabase
        .schema('public')
        .from('full_initiatives_catalog')
        .select('id, title, rationale, impact, horizon, dependencies_json')
        .in('id', initiativeIds);

      if (catalogErr) {
        console.error('Erro ao buscar catálogo (gateC/summary):', catalogErr.message);
        return res.status(500).json({ error: 'erro inesperado' });
      }

      // Montar mapa de catálogo por ID
      const catalogMap = {};
      (catalogItems || []).forEach(item => {
        catalogMap[item.id] = item;
      });

      // Montar top_initiatives ordenado por rank
      topInitiatives = ranking
        .sort((a, b) => a.rank - b.rank)
        .map(rank => {
          const catalog = catalogMap[rank.initiative_id] || {};
          const dependencies = catalog.dependencies_json 
            ? (Array.isArray(catalog.dependencies_json) 
                ? catalog.dependencies_json 
                : JSON.parse(JSON.stringify(catalog.dependencies_json)))
            : [];

          return {
            rank: rank.rank,
            initiative_id: rank.initiative_id,
            code: null, // Não existe no catálogo atual
            title: catalog.title || null,
            category: rank.process, // Usar process como category
            priority: catalog.impact || null, // Usar impact como priority
            dependencies_json: dependencies
          };
        });

      // Montar dependencies_map
      dependenciesMap = ranking
        .map(rank => {
          const catalog = catalogMap[rank.initiative_id] || {};
          const dependencies = catalog.dependencies_json 
            ? (Array.isArray(catalog.dependencies_json) 
                ? catalog.dependencies_json 
                : JSON.parse(JSON.stringify(catalog.dependencies_json)))
            : [];

          return {
            initiative_id: rank.initiative_id,
            depends_on_ids: Array.isArray(dependencies) ? dependencies : []
          };
        })
        .filter(dep => dep.depends_on_ids.length > 0);
    }

    // Gerar highlights determinísticos (templates fixos)
    const highlights = [];
    
    // Template 1: Se algum score < 6
    const lowScores = processScores.filter(p => p.score < 6);
    if (lowScores.length > 0) {
      const worstProcess = lowScores[0];
      highlights.push(`Prioridade imediata: elevar maturidade em ${worstProcess.process} (score ${worstProcess.score.toFixed(1)}).`);
    }

    // Template 2: Se nenhum score < 6
    if (lowScores.length === 0) {
      highlights.push('Base consistente; foco em ganhos incrementais nas iniciativas rankeadas.');
    }

    // Template 3: Se existem dependências
    if (dependenciesMap.length > 0) {
      highlights.push(`Existem ${dependenciesMap.length} iniciativa(s) com dependências. Consulte o endpoint next-best-actions para identificar ações prontas para execução imediata.`);
    }

    // Template 4: Score overall
    if (overall < 6) {
      highlights.push(`Score geral de ${overall.toFixed(1)} indica necessidade de fortalecimento estrutural.`);
    } else if (overall >= 7) {
      highlights.push(`Score geral de ${overall.toFixed(1)} demonstra maturidade sólida.`);
    }

    // Template 5: Número de iniciativas
    if (topInitiatives.length > 0) {
      highlights.push(`${topInitiatives.length} iniciativa(s) priorizada(s) para implementação.`);
    }

    // Limitar a 5 highlights
    const finalHighlights = highlights.slice(0, 5);

    // Montar resposta conforme contrato
    return res.status(200).json({
      ok: true,
      summary_version: 'C1',
      data_sources: {
        company_id: companyId,
        assessment_id: assessmentId,
        initiatives_table: 'public.full_assessment_initiatives',
        items_table: 'public.assessment_items',
        scores_table: 'public.scores'
      },
      company: {
        id: companyId,
        name: companyFull?.name || null
      },
      scores: {
        comercial: Number(scores.commercial) || 0,
        operacoes: Number(scores.operations) || 0,
        adm_fin: Number(scores.admin_fin) || 0,
        gestao: Number(scores.management) || 0,
        overall: overall
      },
      critical_gaps: criticalGaps,
      top_initiatives: topInitiatives,
      dependencies_map: dependenciesMap,
      highlights: finalHighlights,
      generated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Erro no endpoint gateC/summary:', error.message);
    return res.status(500).json({ error: 'erro inesperado' });
  }
});

/**
 * GET /full/assessments/:id/next-best-actions
 * Retorna próximas melhores ações recomendadas (Gate C - Linha 1)
 * 
 * Contrato esperado (quando implementado):
 * - Retorna ações prioritárias baseadas no ranking de iniciativas FULL
 * - Ordenação determinística (mesma ordem sempre para mesmo assessment)
 * - NÃO recalcula ranking (usa full_assessment_initiatives persistido)
 * - NÃO altera ranks existentes
 * - Refresh-safe (tudo do DB)
 * 
 * Query params obrigatórios:
 * - company_id: UUID da company
 * 
 * Params:
 * - id: UUID do assessment
 * 
 * Middleware:
 * - requireAuth: Valida JWT
 * - requireFullEntitlement: Valida entitlement FULL/ACTIVE para company_id
 * 
 * Validações:
 * - company_id obrigatório em query
 * - Company deve existir e pertencer ao usuário
 * - Assessment deve existir e pertencer à company
 * 
 * Status codes:
 * - 200: Ações retornadas (quando implementado)
 * - 400: company_id ausente ou inválido
 * - 401: Token ausente ou inválido (via requireAuth)
 * - 403: Entitlement FULL não encontrado (via requireFullEntitlement)
 * - 404: Assessment ou company não encontrados
 * - 501: Endpoint não implementado ainda (placeholder)
 */
router.get('/full/assessments/:id/next-best-actions', requireAuth, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessmentId = req.params.id;
    const companyId = req.query.company_id;

    // company_id é obrigatório (já validado pelo requireFullEntitlement, mas garantir aqui também)
    if (!companyId || typeof companyId !== 'string' || companyId.trim().length === 0) {
      return res.status(400).json({ error: 'company_id é obrigatório' });
    }

    // Validar que company existe e pertence ao usuário
    const { data: company, error: companyErr } = await supabase
      .schema('public')
      .from('companies')
      .select('id, owner_user_id')
      .eq('id', companyId)
      .eq('owner_user_id', userId)
      .maybeSingle();

    if (companyErr) {
      console.error('Erro ao validar company (gateC/next-best-actions):', companyErr.message);
      return res.status(500).json({ error: 'erro inesperado' });
    }

    if (!company) {
      return res.status(404).json({ error: 'company não encontrada ou não pertence ao usuário' });
    }

    // Validar que assessment existe e pertence à company
    const { data: assessment, error: assessErr } = await supabase
      .schema('public')
      .from('assessments')
      .select('id, company_id')
      .eq('id', assessmentId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (assessErr) {
      console.error('Erro ao buscar assessment (gateC/next-best-actions):', assessErr.message);
      return res.status(500).json({ error: 'erro inesperado' });
    }

    if (!assessment) {
      return res.status(404).json({ error: 'assessment não encontrado ou não pertence à company' });
    }

    // Buscar ranking persistido de iniciativas (rank 1..12)
    const { data: ranking, error: rankingErr } = await supabase
      .schema('public')
      .from('full_assessment_initiatives')
      .select('rank, initiative_id, process')
      .eq('assessment_id', assessmentId)
      .order('rank', { ascending: true });

    if (rankingErr) {
      console.error('Erro ao buscar ranking (gateC/next-best-actions):', rankingErr.message);
      return res.status(500).json({ error: 'erro inesperado' });
    }

    if (!ranking || ranking.length === 0) {
      return res.status(404).json({ error: 'ranking de iniciativas não encontrado' });
    }

    // Buscar dados do catálogo para todas as iniciativas
    const initiativeIds = ranking.map(r => r.initiative_id);
    
    const { data: catalogItems, error: catalogErr } = await supabase
      .schema('public')
      .from('full_initiatives_catalog')
      .select('id, title, dependencies_json')
      .in('id', initiativeIds);

    if (catalogErr) {
      console.error('Erro ao buscar catálogo (gateC/next-best-actions):', catalogErr.message);
      return res.status(500).json({ error: 'erro inesperado' });
    }

    // Montar mapa de catálogo por ID
    const catalogMap = {};
    (catalogItems || []).forEach(item => {
      catalogMap[item.id] = item;
    });

    // Separar iniciativas em ready_now e blocked_by
    const readyNow = [];
    const blockedBy = [];

    // Processar cada iniciativa do ranking
    for (const rankItem of ranking) {
      const catalog = catalogMap[rankItem.initiative_id] || {};
      
      // Parse dependencies_json
      let dependencies = [];
      if (catalog.dependencies_json) {
        if (Array.isArray(catalog.dependencies_json)) {
          dependencies = catalog.dependencies_json;
        } else {
          try {
            dependencies = JSON.parse(JSON.stringify(catalog.dependencies_json));
            if (!Array.isArray(dependencies)) {
              dependencies = [];
            }
          } catch (e) {
            dependencies = [];
          }
        }
      }

      const initiativeData = {
        rank: rankItem.rank,
        initiative_id: rankItem.initiative_id,
        code: null, // Não existe no catálogo atual
        title: catalog.title || null
      };

      // Se não tem dependências -> ready_now
      if (dependencies.length === 0) {
        readyNow.push(initiativeData);
      } else {
        // Se tem dependências -> blocked_by
        // Buscar dados das iniciativas dependentes no catálogo
        const dependsOnData = [];
        
        for (const depId of dependencies) {
          const depCatalog = catalogMap[depId];
          if (depCatalog) {
            dependsOnData.push({
              initiative_id: depId,
              code: null, // Não existe no catálogo atual
              title: depCatalog.title || null,
              status: 'NOT_DONE' // Sem tabela de execução, todas são NOT_DONE
            });
          } else {
            // Se a iniciativa dependente não está no catálogo, ainda assim incluir
            dependsOnData.push({
              initiative_id: depId,
              code: null,
              title: null,
              status: 'NOT_DONE'
            });
          }
        }

        // Ordenar depends_on por initiative_id (determinístico)
        dependsOnData.sort((a, b) => {
          if (!a.initiative_id || !b.initiative_id) return 0;
          return a.initiative_id.localeCompare(b.initiative_id);
        });

        blockedBy.push({
          ...initiativeData,
          blocked_reason: 'DEPENDS_ON',
          depends_on: dependsOnData
        });
      }
    }

    // Ordenar ready_now por rank asc
    readyNow.sort((a, b) => a.rank - b.rank);

    // Ordenar blocked_by por rank asc
    blockedBy.sort((a, b) => a.rank - b.rank);

    // Montar resposta conforme contrato
    return res.status(200).json({
      ok: true,
      summary_version: 'C1',
      data_sources: {
        company_id: companyId,
        assessment_id: assessmentId,
        initiatives_ids: initiativeIds
      },
      ready_now: readyNow,
      blocked_by: blockedBy,
      generated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Erro no endpoint gateC/next-best-actions:', error.message);
    return res.status(500).json({ error: 'erro inesperado' });
  }
});

module.exports = router;
