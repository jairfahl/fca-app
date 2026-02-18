#!/usr/bin/env node
/**
 * Validador do catálogo FULL v1 (catalog.v1.json) e Motor de Causa (cause_engine.v1.json).
 * Garante: shape, enums, limites, ids únicos, action_key único por processo.
 *
 * Uso: npm run catalog:validate:full
 * Ou: node db/validate/validate_full_catalog.js
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '../..');
const CATALOG_V1 = path.join(ROOT, 'catalogs/full/catalog.v1.json');
const QUESTIONS_JSON = path.join(ROOT, 'catalogs/full/questions.json');
const PROCESSES_JSON = path.join(ROOT, 'catalogs/full/processes.json');
const CAUSE_ENGINE_V1 = path.join(ROOT, 'catalogs/full/cause_engine.v1.json');

const VALID_PROCESS_KEYS = ['COMERCIAL', 'OPERACOES', 'ADM_FIN', 'GESTAO'];
const REQUIRED_SEGMENTS = ['C', 'I', 'S'];
const QUESTIONS_PER_PROCESS = 12;
const VALID_NIVEL_UI = ['CRITICO', 'EM_AJUSTE', 'SOB_CONTROLE'];
const VALID_BAND_BACKEND = ['LOW', 'MEDIUM', 'HIGH'];
const NIVEL_TO_BAND = {
  CRITICO: 'LOW',
  EM_AJUSTE: 'MEDIUM',
  SOB_CONTROLE: 'HIGH',
};

function loadJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    console.error(`ERRO: ${label} não encontrado: ${filePath}`);
    process.exit(1);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error(`ERRO: ${label} inválido (JSON): ${e.message}`);
    process.exit(1);
  }
}

function buildValidQuestionIds(questionsRaw) {
  const ids = new Set();
  for (const [process, items] of Object.entries(questionsRaw)) {
    for (const q of items) {
      const key = q.key || q.question_key;
      if (key) ids.add(`${process}_${key}`);
    }
  }
  return ids;
}

function validate() {
  const catalog = loadJson(CATALOG_V1, 'catalog.v1.json');
  const questionsRaw = loadJson(QUESTIONS_JSON, 'questions.json');
  const validQuestionIds = buildValidQuestionIds(questionsRaw);

  const errors = [];

  // Top-level
  if (catalog.version !== 'v1') {
    errors.push(`version deve ser "v1", obtido: "${catalog.version}"`);
  }
  if (!Array.isArray(catalog.processes)) {
    errors.push('processes deve ser array');
  } else if (catalog.processes.length !== 4) {
    errors.push(`processes deve ter exatamente 4 itens, obtido: ${catalog.processes.length}`);
  }

  const allIds = new Set();
  const actionKeysByProcess = {};

  for (const proc of catalog.processes || []) {
    if (!VALID_PROCESS_KEYS.includes(proc.process_key)) {
      errors.push(`process_key inválido: "${proc.process_key}". Deve ser um de: ${VALID_PROCESS_KEYS.join(', ')}`);
    }
    if (!actionKeysByProcess[proc.process_key]) {
      actionKeysByProcess[proc.process_key] = new Set();
    }

    const items = proc.items || [];
    for (const item of items) {
      // id único
      if (allIds.has(item.id)) {
        errors.push(`id duplicado: "${item.id}"`);
      }
      allIds.add(item.id);

      // nivel_ui
      if (!VALID_NIVEL_UI.includes(item.nivel_ui)) {
        errors.push(`item "${item.id}": nivel_ui inválido "${item.nivel_ui}". Deve ser um de: ${VALID_NIVEL_UI.join(', ')}`);
      }

      // band_backend coerente com nivel_ui
      const expectedBand = NIVEL_TO_BAND[item.nivel_ui];
      if (item.band_backend !== expectedBand) {
        errors.push(`item "${item.id}": band_backend "${item.band_backend}" não corresponde a nivel_ui "${item.nivel_ui}" (esperado: ${expectedBand})`);
      }
      if (!VALID_BAND_BACKEND.includes(item.band_backend)) {
        errors.push(`item "${item.id}": band_backend inválido "${item.band_backend}"`);
      }

      // signals: 3-5, sem duplicados, ids de perguntas existentes
      const signals = item.signals || [];
      if (signals.length < 3 || signals.length > 5) {
        errors.push(`item "${item.id}": signals deve ter 3 a 5 itens, obtido: ${signals.length}`);
      }
      const seen = new Set();
      for (const s of signals) {
        if (seen.has(s)) {
          errors.push(`item "${item.id}": signal duplicado "${s}"`);
        }
        seen.add(s);
        if (!validQuestionIds.has(s)) {
          errors.push(`item "${item.id}": signal "${s}" não é id de pergunta existente em questions.json`);
        }
      }

      // recommendation
      const rec = item.recommendation || {};
      for (const k of ['title', 'what_is_happening', 'cost_of_not_acting', 'change_in_30_days']) {
        if (!rec[k] || typeof rec[k] !== 'string') {
          errors.push(`item "${item.id}": recommendation.${k} obrigatório e deve ser string`);
        }
      }

      // action
      const act = item.action || {};
      if (!act.action_key || typeof act.action_key !== 'string') {
        errors.push(`item "${item.id}": action.action_key obrigatório`);
      } else {
        if (actionKeysByProcess[proc.process_key].has(act.action_key)) {
          errors.push(`item "${item.id}": action_key "${act.action_key}" duplicado no processo ${proc.process_key}`);
        }
        actionKeysByProcess[proc.process_key].add(act.action_key);
      }
      for (const k of ['title', 'owner_suggested', 'metric_suggested']) {
        if (!act[k] || typeof act[k] !== 'string') {
          errors.push(`item "${item.id}": action.${k} obrigatório e deve ser string`);
        }
      }
      const steps3 = act.steps_3;
      if (!Array.isArray(steps3) || steps3.length !== 3) {
        errors.push(`item "${item.id}": action.steps_3 deve ter exatamente 3 itens, obtido: ${Array.isArray(steps3) ? steps3.length : 'não-array'}`);
      } else {
        for (let i = 0; i < 3; i++) {
          if (typeof steps3[i] !== 'string') {
            errors.push(`item "${item.id}": action.steps_3[${i}] deve ser string`);
          }
        }
      }
      const doneWhen = act.done_when || [];
      if (doneWhen.length < 2 || doneWhen.length > 5) {
        errors.push(`item "${item.id}": action.done_when deve ter 2 a 5 itens, obtido: ${doneWhen.length}`);
      }
      for (let i = 0; i < doneWhen.length; i++) {
        if (typeof doneWhen[i] !== 'string') {
          errors.push(`item "${item.id}": action.done_when[${i}] deve ser string`);
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error('VALIDAÇÃO FALHOU (catalog.v1.json):\n');
    errors.forEach((e) => console.error('  -', e));
    process.exit(1);
  }

  console.log('catalog.v1.json: OK');

  // processes.json e questions.json: segmentos e 4 processos com 12 perguntas
  validateProcessesAndQuestions();

  // Motor de Causa
  validateCauseEngine();
}

function validateProcessesAndQuestions() {
  if (!fs.existsSync(PROCESSES_JSON)) {
    console.error('ERRO: processes.json não encontrado:', PROCESSES_JSON);
    process.exit(1);
  }
  const processes = loadJson(PROCESSES_JSON, 'processes.json');
  const questionsRaw = loadJson(QUESTIONS_JSON, 'questions.json');
  const errors = [];

  if (!Array.isArray(processes)) {
    errors.push('processes.json deve ser array');
  } else if (processes.length !== 4) {
    errors.push(`processes.json deve ter exatamente 4 processos, obtido: ${processes.length}`);
  } else {
    for (const p of processes) {
      if (!VALID_PROCESS_KEYS.includes(p.process_key)) {
        errors.push(`processes.json: process_key inválido "${p.process_key}"`);
      }
      const seg = p.segment_applicability;
      if (!Array.isArray(seg) || seg.length === 0) {
        errors.push(`processes.json ${p.process_key}: segment_applicability obrigatório e deve ser array não vazio`);
      } else {
        for (const s of REQUIRED_SEGMENTS) {
          if (!seg.includes(s)) {
            errors.push(`processes.json ${p.process_key}: segment_applicability deve incluir "${s}" (obtido: ${JSON.stringify(seg)})`);
          }
        }
      }
    }
  }

  for (const processKey of VALID_PROCESS_KEYS) {
    const questions = questionsRaw[processKey];
    if (!Array.isArray(questions)) {
      errors.push(`questions.json: ${processKey} deve ser array de perguntas`);
    } else if (questions.length !== QUESTIONS_PER_PROCESS) {
      errors.push(`questions.json ${processKey}: deve ter ${QUESTIONS_PER_PROCESS} perguntas, obtido: ${questions.length}`);
    } else {
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const seg = q.segment_applicability || q.segment_flags;
        if (!Array.isArray(seg) || seg.length === 0) {
          errors.push(`questions.json ${processKey} Q${i + 1}: segment_applicability obrigatório`);
        } else {
          for (const s of REQUIRED_SEGMENTS) {
            if (!seg.includes(s)) {
              errors.push(`questions.json ${processKey} ${q.key || 'Q' + (i + 1)}: segment_applicability deve incluir "${s}"`);
            }
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error('VALIDAÇÃO FALHOU (processes.json / questions.json):\n');
    errors.forEach((e) => console.error('  -', e));
    process.exit(1);
  }

  console.log('processes.json: OK (4 processos, segmentos C,I,S)');
  console.log('questions.json: OK (12 perguntas/processo, segmentos C,I,S)');
}

const CAUSE_ID_REGEX = /^CAUSE_[A-Z0-9_]+$/;
const VALID_QUESTION_TIPOS = ['LIKERT_5'];

function validateCauseEngine() {
  if (!fs.existsSync(CAUSE_ENGINE_V1)) {
    console.error('ERRO: cause_engine.v1.json não encontrado:', CAUSE_ENGINE_V1);
    process.exit(1);
  }

  const causeEngine = loadJson(CAUSE_ENGINE_V1, 'cause_engine.v1.json');
  const errors = [];

  // version
  if (!causeEngine.version || typeof causeEngine.version !== 'string') {
    errors.push('cause_engine: version obrigatório');
  }

  // cause_classes
  const causeClasses = causeEngine.cause_classes || [];
  const causeIds = new Set();
  for (const c of causeClasses) {
    if (!c.id || typeof c.id !== 'string') {
      errors.push('cause_classes: id obrigatório');
    } else {
      if (!CAUSE_ID_REGEX.test(c.id)) {
        errors.push(`cause_classes: id "${c.id}" deve ter formato CAUSE_...`);
      }
      if (causeIds.has(c.id)) {
        errors.push(`cause_classes: id duplicado "${c.id}"`);
      }
      causeIds.add(c.id);
    }
    for (const k of ['label_cliente', 'descricao_cliente', 'mecanismo_primario']) {
      if (!c[k] || typeof c[k] !== 'string') {
        errors.push(`cause_classes "${c.id}": ${k} obrigatório e deve ser string`);
      }
    }
  }

  // gaps
  const gapIds = new Set();
  const gaps = causeEngine.gaps || [];
  for (const gap of gaps) {
    if (!gap.gap_id || typeof gap.gap_id !== 'string') {
      errors.push('gaps: gap_id obrigatório');
    } else {
      if (gapIds.has(gap.gap_id)) {
        errors.push(`gaps: gap_id duplicado "${gap.gap_id}"`);
      }
      gapIds.add(gap.gap_id);
    }

    // cause_questions
    const questions = gap.cause_questions || [];
    for (const q of questions) {
      if (!q.q_id || typeof q.q_id !== 'string') {
        errors.push(`gap "${gap.gap_id}": cause_questions q_id obrigatório`);
      }
      if (q.tipo && !VALID_QUESTION_TIPOS.includes(q.tipo)) {
        errors.push(`gap "${gap.gap_id}" question "${q.q_id}": tipo inválido "${q.tipo}". MVP aceita apenas: ${VALID_QUESTION_TIPOS.join(', ')}`);
      }
      if (!Array.isArray(q.opcoes) || q.opcoes.length === 0) {
        errors.push(`gap "${gap.gap_id}" question "${q.q_id}": opcoes obrigatório e deve ser array não vazio`);
      }
    }

    // rules.weights
    const rules = gap.rules || {};
    const weights = rules.weights || [];
    for (const w of weights) {
      if (!causeIds.has(w.cause_id)) {
        errors.push(`gap "${gap.gap_id}": weights cause_id "${w.cause_id}" não existe em cause_classes`);
      }
      if (!w.q_id || typeof w.q_id !== 'string') {
        errors.push(`gap "${gap.gap_id}": weights q_id obrigatório`);
      }
      if (!w.map || typeof w.map !== 'object') {
        errors.push(`gap "${gap.gap_id}": weights map obrigatório e deve ser objeto`);
      }
    }

    // rules.tie_breaker
    const tieBreaker = rules.tie_breaker || [];
    for (const tb of tieBreaker) {
      if (!causeIds.has(tb)) {
        errors.push(`gap "${gap.gap_id}": tie_breaker "${tb}" não existe em cause_classes`);
      }
    }

    // mechanism_actions
    const actions = gap.mechanism_actions || [];
    for (const a of actions) {
      if (!a.action_key || typeof a.action_key !== 'string' || a.action_key.trim() === '') {
        errors.push(`gap "${gap.gap_id}": mechanism_actions action_key deve ser string não vazia`);
      }
    }
  }

  if (errors.length > 0) {
    console.error('VALIDAÇÃO FALHOU (cause_engine.v1.json):\n');
    errors.forEach((e) => console.error('  -', e));
    process.exit(1);
  }

  console.log('cause_engine.v1.json: OK');
}

validate();
