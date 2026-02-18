/**
 * Loader do catálogo FULL v1 (catalog.v1.json).
 * Cache em memória. Valida shape mínimo.
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '../../../../');
const CATALOG_V1_PATH = path.join(ROOT, 'catalogs/full/catalog.v1.json');

let _cache = null;

const VALID_PROCESS_KEYS = ['COMERCIAL', 'OPERACOES', 'ADM_FIN', 'GESTAO'];
const VALID_NIVEL_UI = ['CRITICO', 'EM_AJUSTE', 'SOB_CONTROLE'];
const VALID_BAND = ['LOW', 'MEDIUM', 'HIGH'];

function loadFullCatalogV1() {
  if (_cache) return _cache;

  if (!fs.existsSync(CATALOG_V1_PATH)) {
    throw new Error(`Catálogo v1 não encontrado: ${CATALOG_V1_PATH}`);
  }

  const raw = fs.readFileSync(CATALOG_V1_PATH, 'utf8');
  let catalog;
  try {
    catalog = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Catálogo v1 inválido (JSON): ${e.message}`);
  }

  if (catalog.version !== 'v1') {
    throw new Error(`Catálogo v1 esperado, obtido version: ${catalog.version}`);
  }
  if (!Array.isArray(catalog.processes) || catalog.processes.length !== 4) {
    throw new Error(`Catálogo v1 deve ter 4 processos, obtido: ${(catalog.processes || []).length}`);
  }

  for (const proc of catalog.processes) {
    if (!VALID_PROCESS_KEYS.includes(proc.process_key)) {
      throw new Error(`process_key inválido: ${proc.process_key}`);
    }
  }

  _cache = catalog;
  return _cache;
}

/**
 * Retorna { process_key, band } para action_key do catálogo v1, ou null.
 */
function getActionMetaFromCatalog(actionKey) {
  const entry = getActionEntryFromCatalog(actionKey);
  return entry ? { process_key: entry.process_key, band: entry.band_backend } : null;
}

/**
 * Retorna { process_key, band_backend, title, dod_checklist } para action_key do catálogo v1, ou null.
 * dod_checklist = action.done_when do catálogo.
 */
function getActionEntryFromCatalog(actionKey) {
  const catalog = loadFullCatalogV1();
  for (const proc of catalog.processes) {
    for (const item of proc.items || []) {
      if (item.action?.action_key === actionKey) {
        const act = item.action || {};
        const doneWhen = Array.isArray(act.done_when) ? act.done_when : [];
        return {
          process_key: proc.process_key,
          band_backend: item.band_backend,
          title: act.title,
          dod_checklist: doneWhen,
        };
      }
    }
  }
  return null;
}

/**
 * Limpa cache (útil para testes).
 */
function clearCatalogCache() {
  _cache = null;
}

module.exports = { loadFullCatalogV1, getActionMetaFromCatalog, getActionEntryFromCatalog, clearCatalogCache, VALID_PROCESS_KEYS, VALID_NIVEL_UI, VALID_BAND };
