/**
 * Geração de PDF síncrona a partir de dados vivos do banco.
 *
 * Input:  assessment (full_assessments row, enriquecido com company_name)
 *         + scores   (full_process_scores, score_numeric já em 0-100)
 *         + findings (full_findings)
 *         + actions  (full_selected_actions merged com full_action_evidence)
 *
 * Output: Buffer PDF.
 * Textos canonicamente do banco — sem geração livre de conteúdo.
 */
const PDFDocument = require('pdfkit');
const { PROCESS_LABEL } = require('./fullResultCopy');

const BAND_LABEL = { LOW: 'Frágil', MEDIUM: 'Organizado', HIGH: 'Forte' };
const FALLBACK_PREFIX = 'fallback-';

function isFallback(item) {
  if (!item) return true;
  if (item.is_fallback) return true;
  if (item.action_key && String(item.action_key).startsWith(FALLBACK_PREFIX)) return true;
  return false;
}

/**
 * Gera PDF de relatório FULL a partir de dados vivos do banco.
 *
 * @param {object} assessment - row de full_assessments (enriquecido com company_name)
 * @param {Array}  scores     - rows de full_process_scores (score_numeric 0-100)
 * @param {Array}  findings   - rows de full_findings
 * @param {Array}  actions    - rows de full_selected_actions merged com full_action_evidence
 * @returns {Promise<Buffer>}
 */
function generateFullReportPdf(assessment, scores, findings, actions) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));

  const companyName = assessment.company_name || 'Empresa';
  const version = assessment.assessment_version ?? 1;
  const generatedAt = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  let pageNum = 1;
  function footer() {
    doc.fontSize(8).fillColor('#666666');
    doc.text(
      `FCA-MTR • Diagnóstico #${version} • ${assessment.id}`,
      50, doc.page.height - 30,
      { align: 'center', width: doc.page.width - 100 },
    );
    doc.text(`Página ${pageNum}`, 50, doc.page.height - 20, {
      align: 'center', width: doc.page.width - 100,
    });
    pageNum++;
    doc.fillColor('#000000');
  }

  // --- Capa ---
  doc.fontSize(24).text(companyName, 50, 100, { align: 'center', width: doc.page.width - 100 });
  doc.fontSize(18).text(`Diagnóstico FULL #${version}`, 50, 140, { align: 'center', width: doc.page.width - 100 });
  doc.fontSize(12).fillColor('#666666').text(generatedAt, 50, 180, { align: 'center', width: doc.page.width - 100 });
  doc.fillColor('#000000');
  footer();

  // --- Seção 1: Scores por processo ---
  doc.addPage();
  doc.fontSize(14).text('1. Diagnóstico por processo', 50, 50);
  doc.fontSize(10);
  const validScores = scores || [];
  if (validScores.length > 0) {
    const startY = 80;
    doc.text('Processo', 50, startY);
    doc.text('Banda', 260, startY);
    doc.text('Score (0-100)', 360, startY);
    doc.moveTo(50, startY + 15).lineTo(520, startY + 15).stroke();
    let rowY = startY + 25;
    validScores.forEach((s) => {
      const label = PROCESS_LABEL[s.process_key] || s.process_key;
      const band = BAND_LABEL[s.band] || s.band;
      const score = s.score_numeric != null ? String(s.score_numeric) : '—';
      doc.text(label, 50, rowY);
      doc.text(band, 260, rowY);
      doc.text(score, 360, rowY);
      rowY += 20;
    });
  } else {
    doc.text('Nenhum processo avaliado.', 50, 80);
  }
  footer();

  // --- Seção 2: Achados (vazamentos e alavancas) ---
  doc.addPage();
  doc.fontSize(14).text('2. Achados do diagnóstico', 50, 50);
  doc.fontSize(10);
  const realFindings = (findings || []).filter((f) => !f.is_fallback);
  const vazamentos = realFindings.filter((f) => f.finding_type === 'VAZAMENTO');
  const alavancas = realFindings.filter((f) => f.finding_type === 'ALAVANCA');
  let sec2Y = 80;

  if (vazamentos.length > 0) {
    doc.fontSize(12).text('Vazamentos', 50, sec2Y); sec2Y += 22;
    vazamentos.forEach((f) => {
      const p = f.payload || {};
      doc.fontSize(10).text(p.title || p.gap_label || '—', 50, sec2Y); sec2Y += 15;
      if (p.o_que_esta_acontecendo) { doc.text(`O que acontece: ${p.o_que_esta_acontecendo}`, 60, sec2Y); sec2Y += 15; }
      if (p.custo_de_nao_agir) { doc.text(`Custo de não agir: ${p.custo_de_nao_agir}`, 60, sec2Y); sec2Y += 15; }
      sec2Y += 8;
    });
    sec2Y += 10;
  }

  if (alavancas.length > 0) {
    doc.fontSize(12).text('Alavancas', 50, sec2Y); sec2Y += 22;
    alavancas.forEach((f) => {
      const p = f.payload || {};
      doc.fontSize(10).text(p.title || p.gap_label || '—', 50, sec2Y); sec2Y += 15;
      if (p.o_que_esta_acontecendo) { doc.text(`O que acontece: ${p.o_que_esta_acontecendo}`, 60, sec2Y); sec2Y += 15; }
      if (p.o_que_muda_em_30_dias) { doc.text(`Em 30 dias: ${p.o_que_muda_em_30_dias}`, 60, sec2Y); sec2Y += 15; }
      sec2Y += 8;
    });
  }

  if (vazamentos.length === 0 && alavancas.length === 0) {
    doc.text('Nenhum achado registrado para esta versão.', 50, sec2Y);
  }
  footer();

  // --- Seção 3: Plano de ações ---
  doc.addPage();
  doc.fontSize(14).text('3. Plano de ações', 50, 50);
  doc.fontSize(10);
  const realActions = (actions || []).filter((a) => !isFallback(a));
  if (realActions.length > 0) {
    let planY = 80;
    realActions.forEach((a, i) => {
      doc.text(`${i + 1}. ${a.title || a.action_key}`, 50, planY); planY += 15;
      if (a.before_baseline) { doc.text(`   Antes: ${a.before_baseline}`, 60, planY); planY += 15; }
      if (a.after_result) { doc.text(`   Depois: ${a.after_result}`, 60, planY); planY += 15; }
      if (a.declared_gain) { doc.text(`   Ganho declarado: ${a.declared_gain}`, 60, planY); planY += 15; }
      planY += 5;
    });
  } else {
    doc.text('Plano ainda não definido.', 50, 80);
  }
  footer();

  doc.end();

  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

module.exports = { generateFullReportPdf };
