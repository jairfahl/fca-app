/**
 * Snapshot determinístico do diagnóstico FULL.
 * Gravado no SUBMIT (processes, raios_x, recommendations, plan vazio).
 * Atualizado no CLOSE (plan completo, evidence_summary com progresso 3/3).
 * Textos finais renderizáveis — sem inventar; catálogo/estrutura canônica.
 */
const { supabase } = require('./supabase');
const { loadCauseCatalog } = require('./causeEngine');
const { getCustoDeNaoAgirFaixa, FALLBACK_CONTENT_NAO_DEFINIDO } = require('./fullResultCopy');

const CAUSE_ENGINE_GAP_IDS = ['GAP_CAIXA_PREVISAO', 'GAP_VENDAS_FUNIL', 'GAP_ROTINA_GERENCIAL'];
const PROCESS_BAND_TO_GAP = {
  ADM_FIN: 'GAP_CAIXA_PREVISAO',
  COMERCIAL: 'GAP_VENDAS_FUNIL',
  GESTAO: 'GAP_ROTINA_GERENCIAL',
};
const PROCESS_OWNER_LABEL = {
  COMERCIAL: 'Comercial',
  OPERACOES: 'Operações',
  ADM_FIN: 'Adm/Fin',
  GESTAO: 'Gestão',
};

/**
 * Deriva recomendações por processo/banda e persiste em full_generated_recommendations.
 * Usa catálogo e motor de causa; fallback honesto quando não há fit.
 * Retorna array com título renderizável para snapshot.
 *
 * @param {string} assessmentId
 * @param {string} segment C/I/S
 * @param {Array<{process_key, band, score_numeric}>} scores
 * @returns {Promise<Array<{process_key, band, recommendation_key, title, action_keys, is_fallback}>>}
 */
async function deriveAndPersistRecommendations(assessmentId, segment, scores) {
  const processKeys = (scores || []).map((s) => s.process_key);
  if (processKeys.length === 0) return [];

  const { data: gapCauses } = await supabase
    .schema('public')
    .from('full_gap_causes')
    .select('gap_id, cause_primary')
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

  const snapshotRecs = [];
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
    let title = null;

    if (gapId && gapDef) {
      if (gapCause && causeDef) {
        title = gapDef.titulo_cliente;
        const mechList = mechByGapCause[`${gapId}:${gapCause.cause_primary}`] || [];
        const catalogMech = (gapDef.mechanism_actions || []).slice(0, 3);
        if (mechList.length > 0) {
          acts = mechList.map((m) => ({
            action_key: m.action_key,
            title: m.titulo_cliente || m.action_key,
          }));
        } else if (catalogMech.length > 0) {
          acts = catalogMech.map((a) => ({
            action_key: a.action_key,
            title: a.titulo_cliente || a.action_key,
          }));
        }
        recs = [{ recommendation_key: `gap-${gapId}-${gapCause.cause_primary}`, title }];
      } else {
        isFallback = true;
        gapReason = 'gap_not_classified';
        title = FALLBACK_CONTENT_NAO_DEFINIDO;
        recs = [{ recommendation_key: `fallback-${s.process_key}-${s.band}`, title }];
        acts = [{ action_key: `fallback-${s.process_key}-${s.band}`, title }];
      }
    }

    if (recs.length === 0) {
      title = FALLBACK_CONTENT_NAO_DEFINIDO;
      recs = [{ recommendation_key: `fallback-${s.process_key}-${s.band}`, title }];
      isFallback = true;
      gapReason = gapReason || 'catálogo vazio para processo/banda';
    } else if (title == null) {
      title = recs[0]?.title ?? FALLBACK_CONTENT_NAO_DEFINIDO;
    }

    if (acts.length === 0 && !gapId) {
      acts = [{ action_key: `fallback-${s.process_key}-${s.band}`, title: FALLBACK_CONTENT_NAO_DEFINIDO }];
      isFallback = true;
      gapReason = gapReason || 'ações não encontradas no catálogo';
    }

    const rec = recs[0];
    const actionKeys = acts.map((a) => a.action_key);
    const recTitle = title ?? rec?.title ?? FALLBACK_CONTENT_NAO_DEFINIDO;

    await supabase
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

    snapshotRecs.push({
      process_key: s.process_key,
      band: s.band,
      recommendation_key: rec.recommendation_key,
      title: recTitle,
      action_keys: actionKeys,
      is_fallback: isFallback,
    });
  }

  return snapshotRecs;
}

/**
 * Persiste snapshot no SUBMIT. Processos, raio-x, recomendações derivadas.
 * Plan e evidence_summary vazios.
 *
 * @param {string} assessmentId
 * @param {string} companyId
 * @param {string} segment
 * @param {Array} scores
 * @param {Array} findings - do buildAndPersistFindings
 * @param {Function} getAssessmentById
 */
async function persistSnapshotOnSubmit(assessmentId, companyId, segment, scores, findings, getAssessmentById) {
  const assessment = await getAssessmentById(assessmentId);
  if (!assessment) return;

  const fullVersion = assessment.full_version ?? 1;

  const processes = (scores || []).map((s) => ({
    process_key: s.process_key,
    band: s.band,
    score_numeric: s.score_numeric,
  }));

  const recommendations = await deriveAndPersistRecommendations(assessmentId, segment, scores);

  const toRaioXItem = (f) => {
    const p = f.payload || {};
    return {
      title: p.gap_label || `${PROCESS_OWNER_LABEL[p.processo] || p.processo} (${p.maturity_band})`,
      o_que_acontece: p.gap_label || p.o_que_esta_acontecendo,
      custo_nao_agir: p.custo_de_nao_agir,
      muda_em_30_dias: p.o_que_muda_em_30_dias,
      primeiro_passo: p.primeiro_passo?.action_title,
      is_fallback: !!f.is_fallback,
    };
  };

  const vazamentos = (findings || [])
    .filter((f) => f.finding_type === 'VAZAMENTO')
    .slice(0, 3)
    .map(toRaioXItem);

  const alavancas = (findings || [])
    .filter((f) => f.finding_type === 'ALAVANCA')
    .slice(0, 3)
    .map(toRaioXItem);

  await supabase
    .schema('public')
    .from('full_diagnostic_snapshot')
    .upsert({
      company_id: companyId,
      full_assessment_id: assessmentId,
      full_version: fullVersion,
      segment,
      processes,
      raios_x: { vazamentos, alavancas },
      recommendations,
      plan: [],
      evidence_summary: [],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'full_assessment_id' });
}

/**
 * Atualiza snapshot no CLOSE. Plan completo (3 ações) e evidence_summary com antes/depois e ganhos.
 * Inclui progresso 3/3.
 *
 * @param {string} assessmentId
 * @param {string} companyId
 * @param {Array} plan - full_selected_actions ordenado
 */
async function persistSnapshotOnClose(assessmentId, companyId, plan) {
  const { data: snapshot } = await supabase
    .schema('public')
    .from('full_diagnostic_snapshot')
    .select('id')
    .eq('full_assessment_id', assessmentId)
    .maybeSingle();

  if (!snapshot) return;

  const { data: catalog } = await supabase
    .schema('public')
    .from('full_action_catalog')
    .select('action_key, title')
    .in('action_key', (plan || []).map((p) => p.action_key));

  const catalogMap = {};
  (catalog || []).forEach((c) => { catalogMap[c.action_key] = c; });

  const { data: evRows } = await supabase
    .schema('public')
    .from('full_action_evidence')
    .select('action_key, before_baseline, after_result, declared_gain')
    .eq('assessment_id', assessmentId);

  const evMap = {};
  (evRows || []).forEach((e) => { evMap[e.action_key] = e; });

  const planJson = (plan || []).map((p) => ({
    action_key: p.action_key,
    title: catalogMap[p.action_key]?.title || p.action_key,
    position: p.position,
    status: p.status,
    owner_name: p.owner_name,
    metric_text: p.metric_text,
    checkpoint_date: p.checkpoint_date,
  }));

  const evidenceSummary = (plan || []).map((p) => {
    const ev = evMap[p.action_key];
    return {
      action_key: p.action_key,
      title: catalogMap[p.action_key]?.title || p.action_key,
      before_baseline: ev?.before_baseline,
      after_result: ev?.after_result,
      declared_gain: ev?.declared_gain,
    };
  });

  await supabase
    .schema('public')
    .from('full_diagnostic_snapshot')
    .update({
      plan: planJson,
      evidence_summary: evidenceSummary,
      updated_at: new Date().toISOString(),
    })
    .eq('full_assessment_id', assessmentId);
}

module.exports = {
  deriveAndPersistRecommendations,
  persistSnapshotOnSubmit,
  persistSnapshotOnClose,
};
