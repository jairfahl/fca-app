/**
 * Seed FULL: Catálogo fechado (processos, perguntas, recomendações, ações)
 * Idempotente: UPSERT por chave única.
 * Carrega conteúdo dos JSONs canônicos em catalogs/full/
 */
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

const { createPgPool } = require('../lib/dbSsl');

if (!process.env.DATABASE_URL) {
  console.error('ERRO: DATABASE_URL não configurada no .env');
  process.exit(1);
}

const pool = createPgPool();

const CATALOGS_DIR = path.resolve(__dirname, '../../catalogs/full');

function loadJson(name) {
  const file = path.join(CATALOGS_DIR, `${name}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Arquivo catálogo não encontrado: ${file}`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const DEFAULT_SEGMENT_APPLICABILITY = ['C', 'I', 'S'];

function ensureSegmentApplicability(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return DEFAULT_SEGMENT_APPLICABILITY;
  const set = new Set(arr.map((s) => String(s)));
  for (const seg of DEFAULT_SEGMENT_APPLICABILITY) {
    if (!set.has(seg)) set.add(seg);
  }
  return Array.from(set).sort();
}

const PROCESSES = loadJson('processes');
const QUESTIONS_RAW = loadJson('questions');
const RECOMMENDATIONS = loadJson('recommendations');
const ACTIONS = loadJson('actions');

// Normaliza QUESTIONS para formato esperado pelo seed (dim, w, segment_flags)
const QUESTIONS = {};
for (const [process, items] of Object.entries(QUESTIONS_RAW)) {
  QUESTIONS[process] = items.map((q) => ({
    key: q.key,
    text: q.text,
    dim: q.dimension || q.dim,
    w: q.weight ?? q.w ?? 1,
    segment_flags: ensureSegmentApplicability(q.segment_applicability || q.segment_flags),
  }));
}

const BANDS = ['LOW', 'MEDIUM', 'HIGH'];

async function seedProcessCatalog(client) {
  let inserted = 0;
  let updated = 0;
  for (const p of PROCESSES) {
    const segmentApplicability = ensureSegmentApplicability(p.segment_applicability);
    const r = await client.query(
      'SELECT process_key FROM public.full_process_catalog WHERE process_key = $1',
      [p.process_key]
    );
    const quickWin = p.quick_win === true;
    const hasQuickWin = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='full_process_catalog' AND column_name='quick_win'
    `).then(x => x.rows.length > 0);
    if (r.rows.length > 0) {
      if (hasQuickWin) {
        await client.query(
          `UPDATE public.full_process_catalog SET area_key=$1, segment_applicability=$2, protects_dimension=$3, protects_text=$4, owner_alert_text=$5, typical_impact_band=$6, typical_impact_text=$7, quick_win=$8, is_active=TRUE, updated_at=NOW() WHERE process_key=$9`,
          [p.area_key, segmentApplicability, p.protects_dimension, p.protects_text, p.owner_alert_text, p.typical_impact_band, p.typical_impact_text || 'EM DEFINIÇÃO', quickWin, p.process_key]
        );
      } else {
        await client.query(
          `UPDATE public.full_process_catalog SET area_key=$1, segment_applicability=$2, protects_dimension=$3, protects_text=$4, owner_alert_text=$5, typical_impact_band=$6, typical_impact_text=$7, is_active=TRUE, updated_at=NOW() WHERE process_key=$8`,
          [p.area_key, segmentApplicability, p.protects_dimension, p.protects_text, p.owner_alert_text, p.typical_impact_band, p.typical_impact_text || 'EM DEFINIÇÃO', p.process_key]
        );
      }
      updated++;
    } else {
      if (hasQuickWin) {
        await client.query(
          `INSERT INTO public.full_process_catalog (
            area_key, process_key, segment_applicability, protects_dimension, protects_text,
            owner_alert_text, typical_impact_band, typical_impact_text, quick_win, is_active
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE)`,
          [p.area_key, p.process_key, segmentApplicability, p.protects_dimension, p.protects_text, p.owner_alert_text, p.typical_impact_band, p.typical_impact_text || 'EM DEFINIÇÃO', quickWin]
        );
      } else {
        await client.query(
          `INSERT INTO public.full_process_catalog (
            area_key, process_key, segment_applicability, protects_dimension, protects_text,
            owner_alert_text, typical_impact_band, typical_impact_text, is_active
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE)`,
          [p.area_key, p.process_key, segmentApplicability, p.protects_dimension, p.protects_text, p.owner_alert_text, p.typical_impact_band, p.typical_impact_text || 'EM DEFINIÇÃO']
        );
      }
      inserted++;
    }
  }
  return { inserted, updated };
}

const DEFAULT_ANSWER_TYPE = 'SCALE_0_10';

async function seedQuestionCatalog(client) {
  const hasAnswerType = await client.query(`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='full_question_catalog' AND column_name='answer_type'
  `).then(r => r.rows.length > 0);
  const hasSegmentFlags = await client.query(`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='full_question_catalog' AND column_name='segment_applicability'
  `).then(r => r.rows.length > 0);

  let inserted = 0;
  let updated = 0;
  for (const [process, questions] of Object.entries(QUESTIONS)) {
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const answerType = q.answer_type || DEFAULT_ANSWER_TYPE;
      const segmentFlags = q.segment_flags || ['C', 'I', 'S'];
      const r = await client.query(
        'SELECT 1 FROM public.full_question_catalog WHERE process_key=$1 AND question_key=$2',
        [process, q.key]
      );
      if (r.rows.length > 0) {
        if (hasAnswerType && hasSegmentFlags) {
          await client.query(
            `UPDATE public.full_question_catalog SET
              question_text=$1, dimension=$2, weight=$3, sort_order=$4, answer_type=$5, segment_applicability=$6, is_active=TRUE, updated_at=NOW()
            WHERE process_key=$7 AND question_key=$8`,
            [q.text, q.dim, q.w, i + 1, answerType, segmentFlags, process, q.key]
          );
        } else if (hasAnswerType) {
          await client.query(
            `UPDATE public.full_question_catalog SET
              question_text=$1, dimension=$2, weight=$3, sort_order=$4, answer_type=$5, is_active=TRUE, updated_at=NOW()
            WHERE process_key=$6 AND question_key=$7`,
            [q.text, q.dim, q.w, i + 1, answerType, process, q.key]
          );
        } else {
          await client.query(
            `UPDATE public.full_question_catalog SET
              question_text=$1, dimension=$2, weight=$3, sort_order=$4, is_active=TRUE, updated_at=NOW()
            WHERE process_key=$5 AND question_key=$6`,
            [q.text, q.dim, q.w, i + 1, process, q.key]
          );
        }
        updated++;
      } else {
        if (hasAnswerType && hasSegmentFlags) {
          await client.query(
            `INSERT INTO public.full_question_catalog (process_key, question_key, question_text, dimension, weight, sort_order, answer_type, segment_applicability, is_active)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE)`,
            [process, q.key, q.text, q.dim, q.w, i + 1, answerType, segmentFlags]
          );
        } else if (hasAnswerType) {
          await client.query(
            `INSERT INTO public.full_question_catalog (process_key, question_key, question_text, dimension, weight, sort_order, answer_type, is_active)
            VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE)`,
            [process, q.key, q.text, q.dim, q.w, i + 1, answerType]
          );
        } else {
          await client.query(
            `INSERT INTO public.full_question_catalog (process_key, question_key, question_text, dimension, weight, sort_order, is_active)
            VALUES ($1,$2,$3,$4,$5,$6,TRUE)`,
            [process, q.key, q.text, q.dim, q.w, i + 1]
          );
        }
        inserted++;
      }
    }
  }
  return { inserted, updated };
}

async function seedRecommendationCatalog(client) {
  let inserted = 0;
  let updated = 0;
  for (const rec of RECOMMENDATIONS) {
    const r = await client.query(
      'SELECT 1 FROM public.full_recommendation_catalog WHERE process_key=$1 AND band=$2 AND recommendation_key=$3',
      [rec.process_key, rec.band, rec.recommendation_key]
    );
    if (r.rows.length > 0) {
      await client.query(
        `UPDATE public.full_recommendation_catalog SET title=$1, owner_language_explanation=$2, is_active=TRUE, updated_at=NOW()
        WHERE process_key=$3 AND band=$4 AND recommendation_key=$5`,
        [rec.title, rec.owner_language_explanation, rec.process_key, rec.band, rec.recommendation_key]
      );
      updated++;
    } else {
      await client.query(
        `INSERT INTO public.full_recommendation_catalog (process_key, band, recommendation_key, title, owner_language_explanation, is_active)
        VALUES ($1,$2,$3,$4,$5,TRUE)`,
        [rec.process_key, rec.band, rec.recommendation_key, rec.title, rec.owner_language_explanation]
      );
      inserted++;
    }
  }
  return { inserted, updated };
}

async function seedActionCatalog(client) {
  let inserted = 0;
  let updated = 0;
  for (const a of ACTIONS) {
    const r = await client.query(
      'SELECT 1 FROM public.full_action_catalog WHERE process_key=$1 AND band=$2 AND action_key=$3',
      [a.process_key, a.band, a.action_key]
    );
    if (r.rows.length > 0) {
      await client.query(
        `UPDATE public.full_action_catalog SET
          title=$1, benefit_text=$2, metric_hint=$3, dod_checklist=$4::jsonb,
          segment_applicability=$5, is_active=TRUE, updated_at=NOW()
        WHERE process_key=$6 AND band=$7 AND action_key=$8`,
        [a.title, a.benefit_text, a.metric_hint, JSON.stringify(a.dod_checklist), a.segment_applicability, a.process_key, a.band, a.action_key]
      );
      updated++;
    } else {
      await client.query(
        `INSERT INTO public.full_action_catalog (process_key, band, action_key, title, benefit_text, metric_hint, dod_checklist, segment_applicability, is_active)
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,TRUE)`,
        [a.process_key, a.band, a.action_key, a.title, a.benefit_text, a.metric_hint, JSON.stringify(a.dod_checklist), a.segment_applicability]
      );
      inserted++;
    }
  }
  return { inserted, updated };
}

async function seedFallbacks(client) {
  let inserted = 0;
  for (const process of PROCESSES.map((p) => p.process_key)) {
    for (const band of BANDS) {
      const recKey = `fallback-${process}-${band}`;
      const r = await client.query(
        'SELECT 1 FROM public.full_recommendation_catalog WHERE process_key=$1 AND band=$2 AND recommendation_key=$3',
        [process, band, recKey]
      );
      if (r.rows.length === 0) {
        await client.query(
          `INSERT INTO public.full_recommendation_catalog (process_key, band, recommendation_key, title, owner_language_explanation, is_active)
          VALUES ($1,$2,$3,$4,$5,TRUE)`,
          [process, band, recKey, 'Recomendação em definição pelo método', 'Estamos finalizando esta recomendação.']
        );
        inserted++;
      }
    }
  }
  for (const process of PROCESSES.map((p) => p.process_key)) {
    for (const band of BANDS) {
      const actKey = `fallback-${process}-${band}`;
      const r = await client.query(
        'SELECT 1 FROM public.full_action_catalog WHERE process_key=$1 AND band=$2 AND action_key=$3',
        [process, band, actKey]
      );
      if (r.rows.length === 0) {
        await client.query(
          `INSERT INTO public.full_action_catalog (process_key, band, action_key, title, benefit_text, metric_hint, dod_checklist, segment_applicability, is_active)
          VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,TRUE)`,
          [process, band, actKey, 'Ação em definição pelo método', 'Estamos finalizando esta recomendação.', 'A definir.', JSON.stringify(['Definir escopo', 'Executar conforme contexto', 'Documentar resultado']), ['C', 'I', 'S']]
        );
        inserted++;
      }
    }
  }
  return { inserted };
}

async function runSeed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const proc = await seedProcessCatalog(client);
    const quest = await seedQuestionCatalog(client);
    const rec = await seedRecommendationCatalog(client);
    const act = await seedActionCatalog(client);
    const fall = await seedFallbacks(client);

    await client.query('COMMIT');

    console.log('SEED OK: full_process_catalog');
    console.log(`  - Processos: inseridos=${proc.inserted}, atualizados=${proc.updated}`);
    console.log('SEED OK: full_question_catalog');
    console.log(`  - Perguntas: inseridas=${quest.inserted}, atualizadas=${quest.updated}`);
    console.log('SEED OK: full_recommendation_catalog');
    console.log(`  - Recomendações: inseridas=${rec.inserted}, atualizadas=${rec.updated}`);
    console.log('SEED OK: full_action_catalog');
    console.log(`  - Ações: inseridas=${act.inserted}, atualizadas=${act.updated}`);
    console.log('SEED OK: fallbacks (recs + ações)');
    console.log(`  - Fallbacks inseridos: ${fall.inserted}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ERRO ao executar seed FULL:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runSeed().catch((e) => {
  console.error(e);
  process.exit(1);
});
