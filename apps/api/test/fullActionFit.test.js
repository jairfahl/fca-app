/**
 * Testes do motor FIT (catalog.v1 + signals).
 * - Respostas com valor <= 2 geram signals_true
 * - match = count(signals_item ∩ signals_true)
 * - Só aceita se match >= 2
 * - Sem match: retorna vazio para o processo (sem fallback)
 */
const { deriveSuggestionsFromAnswers, buildSignalsTrueByProcess } = require('../src/lib/fullActionFit');
const { clearCatalogCache } = require('../src/lib/fullCatalog');

beforeEach(() => clearCatalogCache());

describe('fullActionFit (catalog.v1)', () => {
  it('retorna sugestões quando signals_true tem match >= 2', () => {
    // OPERACOES-CRITICO-1 tem signals: OPERACOES_Q01, Q02, Q03. Respostas 0,1,2 = falharam
    const answers = [
      { process_key: 'OPERACOES', question_key: 'Q01', answer_value: 0 },
      { process_key: 'OPERACOES', question_key: 'Q02', answer_value: 1 },
      { process_key: 'OPERACOES', question_key: 'Q03', answer_value: 2 },
    ];
    const scoresByProcess = { OPERACOES: { band: 'LOW' } };
    const excludeActionKeys = new Set();
    const { suggestions, content_gaps } = deriveSuggestionsFromAnswers(
      answers,
      scoresByProcess,
      excludeActionKeys,
      {}
    );

    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    expect(suggestions.some((s) => s.action_key === 'OPERACOES_ACAO_MAPEAR_ENTREGA')).toBe(true);
    expect(suggestions[0].why).toBeDefined();
    expect(suggestions[0].recommendation).toBeDefined();
    expect(suggestions[0].action).toBeDefined();
  });

  it('retorna vazio quando respostas não geram match >= 2', () => {
    // Respostas altas (5,6,7) não geram signals_true
    const answers = [
      { process_key: 'OPERACOES', question_key: 'Q01', answer_value: 5 },
      { process_key: 'OPERACOES', question_key: 'Q02', answer_value: 6 },
      { process_key: 'OPERACOES', question_key: 'Q03', answer_value: 7 },
    ];
    const scoresByProcess = { OPERACOES: { band: 'LOW' } };
    const excludeActionKeys = new Set();
    const { suggestions } = deriveSuggestionsFromAnswers(
      answers,
      scoresByProcess,
      excludeActionKeys,
      {}
    );

    expect(suggestions.length).toBe(0);
  });

  it('exclui actions já usadas', () => {
    const answers = [
      { process_key: 'OPERACOES', question_key: 'Q01', answer_value: 0 },
      { process_key: 'OPERACOES', question_key: 'Q02', answer_value: 1 },
      { process_key: 'OPERACOES', question_key: 'Q03', answer_value: 0 },
    ];
    const scoresByProcess = { OPERACOES: { band: 'LOW' } };
    const excludeActionKeys = new Set(['OPERACOES_ACAO_MAPEAR_ENTREGA']);
    const { suggestions } = deriveSuggestionsFromAnswers(
      answers,
      scoresByProcess,
      excludeActionKeys,
      {}
    );

    expect(suggestions.some((s) => s.action_key === 'OPERACOES_ACAO_MAPEAR_ENTREGA')).toBe(false);
  });

  it('buildSignalsTrueByProcess considera valor <= 2 como falha', () => {
    const answers = [
      { process_key: 'COMERCIAL', question_key: 'Q01', answer_value: 0 },
      { process_key: 'COMERCIAL', question_key: 'Q02', answer_value: 2 },
      { process_key: 'COMERCIAL', question_key: 'Q03', answer_value: 3 },
    ];
    const byProcess = buildSignalsTrueByProcess(answers);
    expect(byProcess.COMERCIAL).toBeDefined();
    expect(byProcess.COMERCIAL.has('COMERCIAL_Q01')).toBe(true);
    expect(byProcess.COMERCIAL.has('COMERCIAL_Q02')).toBe(true);
    expect(byProcess.COMERCIAL.has('COMERCIAL_Q03')).toBe(false);
  });
});
