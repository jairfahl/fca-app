/**
 * Geração de PDF do diagnóstico FULL.
 * Input: snapshot (full_diagnostic_snapshot) + metadados (company, user).
 * Output: Buffer PDF + meta (pages, checksum).
 * Determinístico: mesma versão -> mesmo conteúdo.
 * Fallbacks omitidos (não imprime "Ação padrão..." genérica).
 */
const PDFDocument = require('pdfkit');
const crypto = require('crypto');
const { PROCESS_LABEL } = require('../fullResultCopy');

const TEMPLATE_VERSION = '1.0';
const BAND_LABEL = { LOW: 'Baixo', MEDIUM: 'Médio', HIGH: 'Alto' };
const FALLBACK_PREFIX = 'fallback-';
const FALLBACK_CONTENT = 'Conteúdo em definição pelo método';

function isFallback(item) {
  if (!item) return true;
  if (item.is_fallback) return true;
  if (item.action_key && String(item.action_key).startsWith(FALLBACK_PREFIX)) return true;
  if (item.recommendation_key && String(item.recommendation_key).startsWith(FALLBACK_PREFIX)) return true;
  if (item.title === FALLBACK_CONTENT) return true;
  return false;
}

function filterFallbacks(arr) {
  return (arr || []).filter((x) => !isFallback(x));
}

/**
 * Gera PDF a partir do snapshot.
 *
 * @param {object} snapshot - full_diagnostic_snapshot
 * @param {object} meta - { companyName, fullVersion, generatedAt, comparison? }
 * @returns {{ buffer: Buffer, meta: { pages: number, checksum: string, template_version: string } }}
 */
function generateFullPdf(snapshot, meta = {}) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));

  const companyName = meta.companyName || 'Empresa';
  const fullVersion = meta.fullVersion ?? 1;
  const generatedAt = meta.generatedAt ? new Date(meta.generatedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const comparison = meta.comparison || null;

  const processes = snapshot?.processes || [];
  const raiosX = snapshot?.raios_x || { vazamentos: [], alavancas: [] };
  const vazamentos = filterFallbacks(raiosX.vazamentos || []);
  const alavancas = filterFallbacks(raiosX.alavancas || []);
  const recommendations = filterFallbacks(snapshot?.recommendations || []);
  const plan = (snapshot?.plan || []).filter((p) => !String(p.action_key || '').startsWith(FALLBACK_PREFIX));
  const evidenceSummary = (snapshot?.evidence_summary || []).filter((e) => !String(e.action_key || '').startsWith(FALLBACK_PREFIX));

  let pageNum = 1;

  function footer() {
    doc.fontSize(8).fillColor('#666666');
    doc.text(`FCA-MTR • Template v${TEMPLATE_VERSION}`, 50, doc.page.height - 30, { align: 'center', width: doc.page.width - 100 });
    doc.text(`Página ${pageNum}`, 50, doc.page.height - 20, { align: 'center', width: doc.page.width - 100 });
    pageNum++;
    doc.fillColor('#000000');
  }

  // --- Capa ---
  doc.fontSize(24).text(companyName, 50, 100, { align: 'center', width: doc.page.width - 100 });
  doc.fontSize(18).text(`Diagnóstico FULL v${fullVersion}`, 50, 140, { align: 'center', width: doc.page.width - 100 });
  doc.fontSize(12).fillColor('#666666').text(generatedAt, 50, 180, { align: 'center', width: doc.page.width - 100 });
  doc.fillColor('#000000');
  footer();

  // --- Sumário ---
  doc.addPage();
  doc.fontSize(14).text('Sumário', 50, 50);
  doc.fontSize(10);
  let y = 80;
  doc.text('1. Diagnóstico por processo', 50, y); y += 20;
  doc.text('2. Raio-X do dono (vazamentos e alavancas)', 50, y); y += 20;
  doc.text('3. Recomendações derivadas', 50, y); y += 20;
  doc.text('4. Plano de 30 dias', 50, y); y += 20;
  doc.text('5. Evidências e ganhos declarados', 50, y); y += 20;
  if (comparison) {
    doc.text('6. Comparação com versão anterior', 50, y);
  }
  footer();

  // --- Seção 1: Diagnóstico por processo ---
  doc.addPage();
  doc.fontSize(14).text('1. Diagnóstico por processo', 50, 50);
  doc.fontSize(10);
  if (processes.length > 0) {
    const startY = 80;
    doc.text('Processo', 50, startY);
    doc.text('Banda', 200, startY);
    doc.text('Score', 280, startY);
    doc.text('Explicação', 330, startY);
    doc.moveTo(50, startY + 15).lineTo(550, startY + 15).stroke();
    let rowY = startY + 25;
    processes.forEach((p) => {
      const label = PROCESS_LABEL[p.process_key] || p.process_key;
      const band = BAND_LABEL[p.band] || p.band;
      const score = p.score_numeric != null ? String(p.score_numeric) : '—';
      const expl = p.band === 'LOW' ? 'Requer atenção' : p.band === 'MEDIUM' ? 'Em evolução' : 'Consolidado';
      doc.text(label, 50, rowY);
      doc.text(band, 200, rowY);
      doc.text(score, 280, rowY);
      doc.text(expl, 330, rowY);
      rowY += 22;
    });
  } else {
    doc.text('Nenhum processo avaliado.', 50, 80);
  }
  footer();

  // --- Seção 2: Raio-X ---
  doc.addPage();
  doc.fontSize(14).text('2. Raio-X do dono', 50, 50);
  doc.fontSize(10);
  let sec2Y = 80;
  if (vazamentos.length > 0) {
    doc.fontSize(12).text('Vazamentos', 50, sec2Y);
    sec2Y += 25;
    vazamentos.forEach((v) => {
      doc.fontSize(10).text(v.title || '—', 50, sec2Y);
      sec2Y += 15;
      if (v.o_que_acontece) {
        doc.text(`O que acontece: ${v.o_que_acontece}`, 60, sec2Y);
        sec2Y += 15;
      }
      if (v.custo_nao_agir) {
        doc.text(`Custo de não agir: ${v.custo_nao_agir}`, 60, sec2Y);
        sec2Y += 15;
      }
      if (v.muda_em_30_dias) {
        doc.text(`Em 30 dias: ${v.muda_em_30_dias}`, 60, sec2Y);
        sec2Y += 15;
      }
      sec2Y += 10;
    });
    sec2Y += 15;
  }
  if (alavancas.length > 0) {
    doc.fontSize(12).text('Alavancas', 50, sec2Y);
    sec2Y += 25;
    alavancas.forEach((a) => {
      doc.fontSize(10).text(a.title || '—', 50, sec2Y);
      sec2Y += 15;
      if (a.o_que_acontece) {
        doc.text(`O que acontece: ${a.o_que_acontece}`, 60, sec2Y);
        sec2Y += 15;
      }
      if (a.muda_em_30_dias) {
        doc.text(`Em 30 dias: ${a.muda_em_30_dias}`, 60, sec2Y);
        sec2Y += 15;
      }
      sec2Y += 10;
    });
  }
  if (vazamentos.length === 0 && alavancas.length === 0) {
    doc.text('Nenhum item no raio-x para esta versão.', 50, sec2Y);
  }
  footer();

  // --- Seção 3: Recomendações ---
  doc.addPage();
  doc.fontSize(14).text('3. Recomendações derivadas', 50, 50);
  doc.fontSize(10);
  if (recommendations.length > 0) {
    let recY = 80;
    recommendations.forEach((r) => {
      const procLabel = PROCESS_LABEL[r.process_key] || r.process_key;
      doc.text(`${procLabel} (${BAND_LABEL[r.band] || r.band}): ${r.title || '—'}`, 50, recY);
      recY += 25;
    });
  } else {
    doc.text('Nenhuma recomendação coerente para esta versão.', 50, 80);
  }
  footer();

  // --- Seção 4: Plano de 30 dias ---
  doc.addPage();
  doc.fontSize(14).text('4. Plano de 30 dias', 50, 50);
  doc.fontSize(10);
  if (plan.length > 0) {
    let planY = 80;
    plan.forEach((p, i) => {
      doc.text(`${i + 1}. ${p.title || p.action_key}`, 50, planY);
      planY += 15;
      if (p.owner_name) doc.text(`   Dono: ${p.owner_name}`, 60, planY), (planY += 15);
      if (p.metric_text) doc.text(`   Métrica: ${p.metric_text}`, 60, planY), (planY += 15);
      if (p.checkpoint_date) doc.text(`   Checkpoint: ${p.checkpoint_date}`, 60, planY), (planY += 15);
      planY += 5;
    });
  } else {
    doc.text('Plano ainda não definido.', 50, 80);
  }
  footer();

  // --- Seção 5: Evidências e ganhos ---
  doc.addPage();
  doc.fontSize(14).text('5. Evidências e ganhos declarados', 50, 50);
  doc.fontSize(10);
  if (evidenceSummary.length > 0) {
    let evY = 80;
    evidenceSummary.forEach((e) => {
      doc.text(e.title || e.action_key, 50, evY);
      evY += 15;
      if (e.before_baseline) doc.text(`Antes: ${e.before_baseline}`, 60, evY), (evY += 15);
      if (e.after_result) doc.text(`Depois: ${e.after_result}`, 60, evY), (evY += 15);
      if (e.declared_gain) doc.text(`Ganho declarado: ${e.declared_gain}`, 60, evY), (evY += 15);
      evY += 10;
    });
  } else {
    doc.text('Evidências e ganhos serão registrados ao concluir o ciclo.', 50, 80);
  }
  footer();

  // --- Seção 6: Comparação ---
  if (comparison) {
    doc.addPage();
    doc.fontSize(14).text('6. Comparação com versão anterior', 50, 50);
    doc.fontSize(10);
    let compY = 80;
    const evo = comparison.evolution_by_process || [];
    if (evo.length > 0) {
      doc.text('Evolução por processo:', 50, compY);
      compY += 20;
      evo.forEach((e) => {
        const label = PROCESS_LABEL[e.process_key] || e.process_key;
        const from = e.from ? `${BAND_LABEL[e.from.band]} (${e.from.score_numeric})` : '—';
        const to = e.to ? `${BAND_LABEL[e.to.band]} (${e.to.score_numeric})` : '—';
        doc.text(`${label}: ${from} → ${to}`, 60, compY);
        compY += 18;
      });
      compY += 10;
    }
    const entered = comparison.raio_x_entered || [];
    const left = comparison.raio_x_left || [];
    if (entered.length > 0) {
      doc.text('Novos no raio-x:', 50, compY);
      compY += 18;
      entered.forEach((t) => { doc.text(`• ${t}`, 60, compY); compY += 15; });
      compY += 5;
    }
    if (left.length > 0) {
      doc.text('Saíram do raio-x:', 50, compY);
      compY += 18;
      left.forEach((t) => { doc.text(`• ${t}`, 60, compY); compY += 15; });
      compY += 5;
    }
    const gainsPrev = comparison.gains_declared_previous || [];
    if (gainsPrev.length > 0) {
      doc.text('Ganhos declarados no ciclo anterior:', 50, compY);
      compY += 18;
      gainsPrev.forEach((g) => {
        doc.text(`• ${g.title || g.action_key}: ${g.declared_gain || '—'}`, 60, compY);
        compY += 15;
      });
    }
    if (evo.length === 0 && entered.length === 0 && left.length === 0 && gainsPrev.length === 0) {
      doc.text('Sem dados de comparação disponíveis.', 50, compY);
    }
    footer();
  }

  doc.end();

  return new Promise((resolve, reject) => {
    doc.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const checksum = crypto.createHash('md5').update(buffer).digest('hex');
      resolve({
        buffer,
        meta: {
          pages: pageNum - 1,
          checksum,
          template_version: TEMPLATE_VERSION,
        },
      });
    });
    doc.on('error', reject);
  });
}

module.exports = {
  generateFullPdf,
  TEMPLATE_VERSION,
};
