/**
 * Rotas de relatórios FULL:
 *   POST /full/reports/generate
 *   GET  /full/reports/status
 *   GET  /full/reports/download
 *   GET  /full/reports/:assessmentId.pdf
 */
const express = require('express');
const router = express.Router();
const { supabase } = require('../../lib/supabase');
const { requireAuth } = require('../../middleware/requireAuth');
const { requireFullEntitlement } = require('../../middleware/requireFullEntitlement');
const { blockConsultorOnMutation } = require('../../middleware/requireRole');
const { ensureConsultantOrOwnerAccess } = require('../../lib/companyAccess');
const { logEvent } = require('../../lib/auditLog');
const { apiError, toExternalScore } = require('../../lib/fullHelpers');
const { getAssessment } = require('../../lib/repositories/fullAssessmentRepo');

// POST /full/reports/generate?company_id=...&full_version=...
router.post('/full/reports/generate', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
  const path = require('path');
  const fs = require('fs');
  try {
    const userId = req.user.id;
    const companyId = req.query.company_id || req.body.company_id;
    const fullVersion = parseInt(req.query.full_version || req.body.full_version, 10);
    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada.');
    if (isNaN(fullVersion) || fullVersion < 1) return apiError(res, 400, 'INVALID_VERSION', 'Versão inválida.');

    const access = await ensureConsultantOrOwnerAccess(userId, companyId, req.user?.email, req.user?.role);
    if (!access) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');

    const { data: assessment } = await supabase
      .schema('public')
      .from('full_assessments')
      .select('id, status')
      .eq('company_id', companyId)
      .eq('full_version', fullVersion)
      .maybeSingle();
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado para esta versão.');
    if (assessment.status !== 'SUBMITTED' && assessment.status !== 'CLOSED') {
      return apiError(res, 400, 'DIAG_NOT_READY', 'Conclua o diagnóstico para gerar relatório.');
    }

    const { data: company } = await supabase
      .schema('public')
      .from('companies')
      .select('name')
      .eq('id', companyId)
      .maybeSingle();

    const { data: snapshot } = await supabase
      .schema('public')
      .from('full_diagnostic_snapshot')
      .select('*')
      .eq('full_assessment_id', assessment.id)
      .maybeSingle();
    if (!snapshot) {
      return apiError(res, 400, 'SNAPSHOT_MISSING', 'Conclua o diagnóstico para gerar relatório.');
    }

    let comparison = null;
    if (fullVersion > 1) {
      const { data: prevAssessment } = await supabase
        .schema('public')
        .from('full_assessments')
        .select('id')
        .eq('company_id', companyId)
        .eq('full_version', fullVersion - 1)
        .maybeSingle();
      if (prevAssessment) {
        const { data: snapPrev } = await supabase
          .schema('public')
          .from('full_diagnostic_snapshot')
          .select('processes, raios_x, plan, evidence_summary')
          .eq('full_assessment_id', prevAssessment.id)
          .maybeSingle();
        const processesFrom = (snapPrev?.processes || []).reduce((acc, p) => { acc[p.process_key] = p; return acc; }, {});
        const processesTo = (snapshot?.processes || []).reduce((acc, p) => { acc[p.process_key] = p; return acc; }, {});
        const allKeys = [...new Set([...Object.keys(processesFrom), ...Object.keys(processesTo)])];
        const raiosFrom = snapPrev?.raios_x || { vazamentos: [], alavancas: [] };
        const raiosTo = snapshot?.raios_x || { vazamentos: [], alavancas: [] };
        const titlesFrom = new Set([
          ...(raiosFrom.vazamentos || []).map((v) => v.title),
          ...(raiosFrom.alavancas || []).map((a) => a.title),
        ]);
        const titlesTo = new Set([
          ...(raiosTo.vazamentos || []).map((v) => v.title),
          ...(raiosTo.alavancas || []).map((a) => a.title),
        ]);
        comparison = {
          evolution_by_process: allKeys.map((pk) => ({
            process_key: pk,
            from: processesFrom[pk] ? { band: processesFrom[pk].band, score_numeric: toExternalScore(processesFrom[pk].score_numeric) } : null,
            to: processesTo[pk] ? { band: processesTo[pk].band, score_numeric: toExternalScore(processesTo[pk].score_numeric) } : null,
          })),
          raio_x_entered: [...titlesTo].filter((t) => !titlesFrom.has(t)),
          raio_x_left: [...titlesFrom].filter((t) => !titlesTo.has(t)),
          gains_declared_previous: (snapPrev?.evidence_summary || []).filter((e) => e.declared_gain).map((e) => ({
            action_key: e.action_key,
            title: e.title,
            declared_gain: e.declared_gain,
          })),
        };
      }
    }

    const { generateFullPdf } = require('../../lib/reports/fullPdf');
    const now = new Date().toISOString();
    const { buffer, meta } = await generateFullPdf(snapshot, {
      companyName: company?.name || 'Empresa',
      fullVersion,
      generatedAt: now,
      comparison,
    });

    const reportsDir = path.join(process.cwd(), 'data', 'reports', companyId);
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    const filePath = path.join(reportsDir, `${assessment.id}.pdf`);
    fs.writeFileSync(filePath, buffer);

    const dbFilePath = `${companyId}/${assessment.id}.pdf`;
    const { data: existingReport } = await supabase
      .schema('public')
      .from('full_reports')
      .select('id')
      .eq('company_id', companyId)
      .eq('full_assessment_id', assessment.id)
      .maybeSingle();

    if (existingReport) {
      await supabase
        .schema('public')
        .from('full_reports')
        .update({
          status: 'READY',
          generated_at: now,
          file_path: dbFilePath,
          checksum: meta.checksum,
          meta: { pages: meta.pages, locale: 'pt-BR', template_version: meta.template_version },
          error: null,
          updated_at: now,
        })
        .eq('id', existingReport.id);
    } else {
      await supabase
        .schema('public')
        .from('full_reports')
        .insert({
          company_id: companyId,
          full_assessment_id: assessment.id,
          full_version: fullVersion,
          status: 'READY',
          generated_at: now,
          file_path: dbFilePath,
          checksum: meta.checksum,
          meta: { pages: meta.pages, locale: 'pt-BR', template_version: meta.template_version },
          error: null,
          updated_at: now,
        });
    }

    const { data: report } = await supabase
      .schema('public')
      .from('full_reports')
      .select('id, status, generated_at')
      .eq('company_id', companyId)
      .eq('full_assessment_id', assessment.id)
      .single();

    return res.status(200).json({
      report_id: report.id,
      status: report.status,
      generated_at: report.generated_at,
    });
  } catch (err) {
    console.error('Erro POST /full/reports/generate:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// GET /full/reports/status?company_id=...&full_version=...
router.get('/full/reports/status', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.query.company_id;
    const fullVersion = parseInt(req.query.full_version, 10);
    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada.');
    if (isNaN(fullVersion) || fullVersion < 1) return apiError(res, 400, 'INVALID_VERSION', 'Versão inválida.');

    const access = await ensureConsultantOrOwnerAccess(userId, companyId, req.user?.email, req.user?.role);
    if (!access) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');

    const { data: assessment } = await supabase
      .schema('public')
      .from('full_assessments')
      .select('id')
      .eq('company_id', companyId)
      .eq('full_version', fullVersion)
      .maybeSingle();
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

    const { data: report } = await supabase
      .schema('public')
      .from('full_reports')
      .select('status, generated_at, file_path, error')
      .eq('company_id', companyId)
      .eq('full_assessment_id', assessment.id)
      .maybeSingle();

    if (!report) {
      return res.json({ status: null, generated_at: null, download_url: null, message: 'Relatório ainda não solicitado.' });
    }
    const downloadUrl = report.status === 'READY' && report.file_path
      ? `/full/reports/download?company_id=${companyId}&full_version=${fullVersion}`
      : null;
    return res.json({
      status: report.status,
      generated_at: report.generated_at,
      download_url: downloadUrl,
      error: report.error,
    });
  } catch (err) {
    console.error('Erro GET /full/reports/status:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// GET /full/reports/download?company_id=...&full_version=...
router.get('/full/reports/download', requireAuth, blockConsultorOnMutation, requireFullEntitlement, async (req, res) => {
  const path = require('path');
  const fs = require('fs');
  try {
    const userId = req.user.id;
    const companyId = req.query.company_id;
    const fullVersion = parseInt(req.query.full_version, 10);
    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada.');
    if (isNaN(fullVersion) || fullVersion < 1) return apiError(res, 400, 'INVALID_VERSION', 'Versão inválida.');

    const access = await ensureConsultantOrOwnerAccess(userId, companyId, req.user?.email, req.user?.role);
    if (!access) return apiError(res, 404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada ou sem acesso.');

    const { data: assessment } = await supabase
      .schema('public')
      .from('full_assessments')
      .select('id')
      .eq('company_id', companyId)
      .eq('full_version', fullVersion)
      .maybeSingle();
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');

    const { data: report } = await supabase
      .schema('public')
      .from('full_reports')
      .select('status, file_path, error')
      .eq('company_id', companyId)
      .eq('full_assessment_id', assessment.id)
      .maybeSingle();

    if (!report) return apiError(res, 404, 'REPORT_NOT_FOUND', 'Relatório não encontrado.');
    if (report.status === 'PENDING') {
      return res.status(202).json({ message: 'Relatório em geração. Tente novamente em instantes.' });
    }
    if (report.status === 'FAILED') {
      return apiError(res, 500, 'REPORT_FAILED', report.error || 'Falha ao gerar relatório.');
    }
    if (report.status !== 'READY' || !report.file_path) {
      return apiError(res, 404, 'REPORT_NOT_READY', 'Relatório ainda não disponível.');
    }

    const fullPath = path.join(process.cwd(), 'data', 'reports', report.file_path);
    if (!fs.existsSync(fullPath)) {
      console.error('PDF não encontrado em disco:', fullPath);
      return apiError(res, 500, 'REPORT_FILE_MISSING', 'Arquivo do relatório não encontrado. Gere novamente.');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="diagnostico-full-v${fullVersion}.pdf"`);
    const stream = fs.createReadStream(fullPath);
    stream.pipe(res);
  } catch (err) {
    console.error('Erro GET /full/reports/download:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.');
  }
});

// GET /full/reports/:assessmentId.pdf — relatório síncrono, sem job em background.
router.get('/full/reports/:assessmentId.pdf', requireAuth, async (req, res) => {
  const { generateFullReportPdf } = require('../../lib/fullReportPdf');
  try {
    const userId = req.user.id;
    const assessmentId = req.params.assessmentId;
    const companyId = req.query.company_id;

    if (!companyId) return apiError(res, 400, 'COMPANY_REQUIRED', 'Empresa não informada.');

    const access = await ensureConsultantOrOwnerAccess(userId, companyId, req.user?.email, req.user?.role);
    if (!access) return apiError(res, 403, 'FORBIDDEN', 'Sem acesso a este diagnóstico.');

    const assessment = await getAssessment(assessmentId, companyId);
    if (!assessment) return apiError(res, 404, 'DIAG_NOT_FOUND', 'Diagnóstico não encontrado.');
    if (assessment.status === 'DRAFT') {
      return apiError(res, 400, 'DIAG_NOT_READY', 'Diagnóstico ainda em rascunho. Finalize antes de gerar o relatório.');
    }

    const [scoresRes, findingsRes, planRes, evidenceRes, companyRes] = await Promise.all([
      supabase.schema('public').from('full_process_scores').select('*').eq('assessment_id', assessmentId).order('process_key'),
      supabase.schema('public').from('full_findings').select('*').eq('assessment_id', assessmentId).order('finding_type').order('position'),
      supabase.schema('public').from('full_selected_actions').select('*').eq('assessment_id', assessmentId).order('position'),
      supabase.schema('public').from('full_action_evidence').select('*').eq('assessment_id', assessmentId),
      supabase.schema('public').from('companies').select('name').eq('id', companyId).maybeSingle(),
    ]);

    const scores = (scoresRes.data || []).map((s) => ({ ...s, score_numeric: toExternalScore(s.score_numeric) }));
    const findings = findingsRes.data || [];
    const plan = planRes.data || [];
    const evidenceMap = {};
    (evidenceRes.data || []).forEach((e) => { evidenceMap[e.action_key] = e; });
    const actions = plan.map((p) => ({ ...p, ...(evidenceMap[p.action_key] || {}) }));
    const enrichedAssessment = { ...assessment, company_name: companyRes.data?.name || 'Empresa' };

    const buffer = await generateFullReportPdf(enrichedAssessment, scores, findings, actions);

    logEvent(supabase, { event: 'report_generated', userId, companyId, assessmentId });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="diagnostico-full-${assessmentId}.pdf"`);
    return res.send(buffer);
  } catch (err) {
    console.error('Erro GET /full/reports/:assessmentId.pdf:', err.message);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Erro inesperado ao gerar relatório.');
  }
});

module.exports = router;
