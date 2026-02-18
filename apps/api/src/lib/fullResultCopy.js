/**
 * Templates "de dono" para o resultado FULL (Raio-X).
 * Sem consultorês: dinheiro, atraso, retrabalho, risco, gargalo.
 * Rastreável: cada frase por process_key + protects + band.
 */

const PROCESS_LABEL = {
  COMERCIAL: 'Comercial',
  OPERACOES: 'Operações',
  ADM_FIN: 'Adm/Fin',
  GESTAO: 'Gestão',
};

const PROTECTS_LABEL = {
  DINHEIRO: 'Dinheiro',
  CLIENTE: 'Cliente',
  RISCO: 'Risco',
  GARGALO: 'Gargalo',
};

/**
 * O que está acontecendo — linguagem de dono, por protects + processo.
 * VAZAMENTO: foco no que está faltando/vazando.
 * ALAVANCA: foco no que pode gerar ganho rápido.
 */
function getOQueEstaAcontecendo(type, processKey, protects, band, processMeta) {
  const label = PROCESS_LABEL[processKey] || processKey;
  const key = `${type}:${processKey}:${protects}`;

  const VAZAMENTO = {
    'VAZAMENTO:COMERCIAL:CLIENTE': 'Seu pipeline comercial está sem previsibilidade: entra e sai no improviso.',
    'VAZAMENTO:COMERCIAL:DINHEIRO': 'Vendas perdidas ou atrasadas por falta de rotina comercial.',
    'VAZAMENTO:COMERCIAL:RISCO': 'Oportunidades caem no esquecimento; ninguém sabe quem cuida.',
    'VAZAMENTO:COMERCIAL:GARGALO': 'Prospecção e follow-up no improviso; conversão fraca.',
    'VAZAMENTO:OPERACOES:GARGALO': 'Sua operação está sem padrão: atrasos e retrabalho frequentes.',
    'VAZAMENTO:OPERACOES:DINHEIRO': 'Retrabalho e atraso de entrega custam dinheiro e cliente.',
    'VAZAMENTO:OPERACOES:CLIENTE': 'Entrega no improviso; cliente reclama e não sabe quando vai sair.',
    'VAZAMENTO:OPERACOES:RISCO': 'Gargalos escondidos; quando estoura, já é crise.',
    'VAZAMENTO:ADM_FIN:DINHEIRO': 'Seu caixa está sem previsibilidade: entra e sai no improviso.',
    'VAZAMENTO:ADM_FIN:CLIENTE': 'Cobrança atrasada e inadimplência sobem; cliente some.',
    'VAZAMENTO:ADM_FIN:RISCO': 'Obrigações fiscais e pagamentos no esquecimento; risco de multa.',
    'VAZAMENTO:ADM_FIN:GARGALO': 'Decisões financeiras no escuro; não sabe se pode investir.',
    'VAZAMENTO:GESTAO:RISCO': 'Prioridades mudam toda semana; execução perde ritmo.',
    'VAZAMENTO:GESTAO:DINHEIRO': 'Metas sem dono e sem acompanhamento; dinheiro escorre.',
    'VAZAMENTO:GESTAO:CLIENTE': 'Equipe sem direção clara; cliente sente desorganização.',
    'VAZAMENTO:GESTAO:GARGALO': 'O dono vira apagador de incêndio; não sobra tempo para crescer.',
  };

  const ALAVANCA = {
    'ALAVANCA:COMERCIAL:CLIENTE': 'Comercial pode capturar mais resultado com rotina simples de prospecção e follow-up.',
    'ALAVANCA:COMERCIAL:DINHEIRO': 'Uma cadência de vendas organizada aumenta pipeline e previsão de receita.',
    'ALAVANCA:COMERCIAL:RISCO': 'Definir dono e rotina reduz risco de oportunidade perdida.',
    'ALAVANCA:COMERCIAL:GARGALO': 'Padronizar o funil libera o dono para fechar, não para correr atrás.',
    'ALAVANCA:OPERACOES:GARGALO': 'Operação pode ganhar ritmo com checklist e responsável por etapa.',
    'ALAVANCA:OPERACOES:DINHEIRO': 'Menos retrabalho e menos atraso = mais margem e cliente satisfeito.',
    'ALAVANCA:OPERACOES:CLIENTE': 'Entrega previsível gera confiança e renovação.',
    'ALAVANCA:OPERACOES:RISCO': 'Mapear gargalos reduz surpresa e custo de apagar fogo.',
    'ALAVANCA:ADM_FIN:DINHEIRO': 'Fluxo de caixa projetado D+7 evita aperto e decisão no escuro.',
    'ALAVANCA:ADM_FIN:CLIENTE': 'Cobrança em dia e inadimplência controlada protegem o relacionamento.',
    'ALAVANCA:ADM_FIN:RISCO': 'Controle de obrigações e conciliação reduz risco fiscal.',
    'ALAVANCA:ADM_FIN:GARGALO': 'Saber quanto entra e sai libera o dono para decidir.',
    'ALAVANCA:GESTAO:RISCO': 'Metas claras e ritual de acompanhamento dão direção à equipe.',
    'ALAVANCA:GESTAO:DINHEIRO': 'Priorizar e acompanhar evita desperdício e retrabalho.',
    'ALAVANCA:GESTAO:CLIENTE': 'Equipe alinhada entrega melhor para o cliente.',
    'ALAVANCA:GESTAO:GARGALO': 'O dono sai do operacional e consegue pensar no estratégico.',
  };

  const map = type === 'VAZAMENTO' ? VAZAMENTO : ALAVANCA;
  const specific = map[key];
  if (specific) return specific;

  // Fallback por protects (genérico mas ainda "de dono")
  if (type === 'VAZAMENTO') {
    if (protects === 'DINHEIRO') return `Dinheiro escorre em ${label} por falta de rotina e controle.`;
    if (protects === 'CLIENTE') return `Cliente e receita em risco em ${label}; sem rotina definida.`;
    if (protects === 'RISCO') return `Risco alto em ${label}: prioridades mudam e responsável não está claro.`;
    if (protects === 'GARGALO') return `Gargalo em ${label}: retrabalho, atraso e improviso.`;
  }
  if (type === 'ALAVANCA') {
    if (protects === 'DINHEIRO') return `${label} pode virar ganho com disciplina operacional.`;
    if (protects === 'CLIENTE') return `${label} pode gerar mais receita e retenção com rotina.`;
    if (protects === 'RISCO') return `${label} pode reduzir risco com metas e acompanhamento.`;
    if (protects === 'GARGALO') return `${label} pode eliminar gargalo com padronização.`;
  }

  return processMeta?.owner_alert_text || processMeta?.protects_text || `${label} precisa de atenção.`;
}

/**
 * Custo de não agir — usa typical_impact_text do catálogo (faixa) + enriquecimento por protects.
 * Nunca só "baixo/médio/alto".
 */
function getCustoDeNaoAgir(processMeta, band, protects) {
  const base = processMeta?.typical_impact_text;
  if (base) return base;

  const label = PROTECTS_LABEL[protects] || protects;
  const bandQual = { LOW: 'baixo', MEDIUM: 'médio', HIGH: 'alto' }[band] || 'médio';
  return `Custo ${bandQual}: perda de ${label} (dinheiro, atraso ou retrabalho).`;
}

/**
 * O que muda em 30 dias — verbos operacionais, específico por protects + processo.
 */
function getOQueMudaEm30Dias(type, processKey, protects, band) {
  const label = PROCESS_LABEL[processKey] || processKey;
  const key = `${type}:${processKey}:${protects}`;

  const VAZAMENTO = {
    'VAZAMENTO:COMERCIAL:CLIENTE': 'Em 30 dias, você tem rotina de prospecção e follow-up; pipeline deixa de depender do improviso.',
    'VAZAMENTO:COMERCIAL:DINHEIRO': 'Em 30 dias, vendas começam a ter cadência; previsão de receita melhora.',
    'VAZAMENTO:COMERCIAL:RISCO': 'Em 30 dias, dono definido e rotina reduzem oportunidade perdida.',
    'VAZAMENTO:COMERCIAL:GARGALO': 'Em 30 dias, funil padronizado diminui retrabalho comercial.',
    'VAZAMENTO:OPERACOES:GARGALO': 'Em 30 dias, checklist e responsável por etapa cortam retrabalho e atraso.',
    'VAZAMENTO:OPERACOES:DINHEIRO': 'Em 30 dias, menos retrabalho e entrega no prazo geram margem.',
    'VAZAMENTO:OPERACOES:CLIENTE': 'Em 30 dias, entrega previsível; cliente confia e renova.',
    'VAZAMENTO:OPERACOES:RISCO': 'Em 30 dias, gargalos mapeados reduzem surpresa e custo de crise.',
    'VAZAMENTO:ADM_FIN:DINHEIRO': 'Em 30 dias, fluxo de caixa D+7; você sabe quanto entra e sai.',
    'VAZAMENTO:ADM_FIN:CLIENTE': 'Em 30 dias, cobrança em dia e inadimplência controlada.',
    'VAZAMENTO:ADM_FIN:RISCO': 'Em 30 dias, obrigações e conciliação sob controle.',
    'VAZAMENTO:ADM_FIN:GARGALO': 'Em 30 dias, decisão financeira deixa de ser no escuro.',
    'VAZAMENTO:GESTAO:RISCO': 'Em 30 dias, metas e ritual de acompanhamento dão direção.',
    'VAZAMENTO:GESTAO:DINHEIRO': 'Em 30 dias, prioridades claras reduzem desperdício.',
    'VAZAMENTO:GESTAO:CLIENTE': 'Em 30 dias, equipe alinhada entrega melhor.',
    'VAZAMENTO:GESTAO:GARGALO': 'Em 30 dias, dono sai do operacional e ganha fôlego.',
  };

  const ALAVANCA = {
    'ALAVANCA:COMERCIAL:CLIENTE': 'Em 30 dias, Comercial converte consistência em mais pipeline e conversão.',
    'ALAVANCA:COMERCIAL:DINHEIRO': 'Em 30 dias, rotina de vendas vira previsão de receita.',
    'ALAVANCA:COMERCIAL:RISCO': 'Em 30 dias, dono e rotina reduzem risco de perda de oportunidade.',
    'ALAVANCA:COMERCIAL:GARGALO': 'Em 30 dias, funil padronizado libera o dono para vender.',
    'ALAVANCA:OPERACOES:GARGALO': 'Em 30 dias, Operações ganha ritmo e reduz retrabalho.',
    'ALAVANCA:OPERACOES:DINHEIRO': 'Em 30 dias, menos retrabalho vira margem e cliente satisfeito.',
    'ALAVANCA:OPERACOES:CLIENTE': 'Em 30 dias, entrega previsível vira renovação.',
    'ALAVANCA:OPERACOES:RISCO': 'Em 30 dias, gargalos mapeados reduzem surpresa.',
    'ALAVANCA:ADM_FIN:DINHEIRO': 'Em 30 dias, fluxo de caixa projetado evita aperto.',
    'ALAVANCA:ADM_FIN:CLIENTE': 'Em 30 dias, cobrança e inadimplência sob controle.',
    'ALAVANCA:ADM_FIN:RISCO': 'Em 30 dias, obrigações e conciliação em dia.',
    'ALAVANCA:ADM_FIN:GARGALO': 'Em 30 dias, visibilidade financeira libera decisão.',
    'ALAVANCA:GESTAO:RISCO': 'Em 30 dias, metas e acompanhamento viram execução.',
    'ALAVANCA:GESTAO:DINHEIRO': 'Em 30 dias, prioridades claras reduzem desperdício.',
    'ALAVANCA:GESTAO:CLIENTE': 'Em 30 dias, equipe alinhada entrega melhor.',
    'ALAVANCA:GESTAO:GARGALO': 'Em 30 dias, dono ganha fôlego para crescer.',
  };

  const map = type === 'VAZAMENTO' ? VAZAMENTO : ALAVANCA;
  const specific = map[key];
  if (specific) return specific;

  if (type === 'VAZAMENTO') {
    return `Em 30 dias, ${label} ganha rotina mínima e reduz retrabalho.`;
  }
  return `Em 30 dias, ${label} converte consistência em ganho operacional.`;
}

/**
 * Humaniza answer_value (0-10) para texto.
 */
function humanizeAnswerValue(value) {
  if (value <= 2) return 'quase nunca';
  if (value <= 4) return 'às vezes';
  if (value <= 7) return 'com frequência';
  return 'frequentemente';
}

/**
 * Deriva "como isso puxou o nível" a partir das dimensões com nota baixa.
 */
function getComoPuxouNivel(processAnswers, questionCatalog) {
  const DIM_LABEL = {
    EXISTENCIA: 'Sem definição clara',
    ROTINA: 'Sem rotina',
    DONO: 'Sem responsável definido',
    CONTROLE: 'Sem acompanhamento',
  };
  const lowDims = [];
  const seen = new Set();
  for (const a of processAnswers || []) {
    const q = questionCatalog?.find(
      (x) => x.process_key === a.process_key && x.question_key === a.question_key
    );
    const dim = q?.dimension || q?.cost_axis;
    if (dim && a.answer_value <= 4 && !seen.has(dim)) {
      seen.add(dim);
      lowDims.push(DIM_LABEL[dim] || dim);
    }
  }
  if (lowDims.length === 0) return null;
  if (lowDims.length === 1) return `${lowDims[0]} = fica no improviso.`;
  return `${lowDims.join(' + ')} = fica no improviso.`;
}

const FALLBACK_ACTION_TITLE = 'Ação em definição pelo método';

/** Fallback determinístico quando gap não coberto (fora do MVP). Sem inventar causa. */
const FALLBACK_CONTENT_NAO_DEFINIDO = 'Conteúdo em definição pelo método';

/**
 * Faixa canônica de custo (não número preciso). Usado em recomendações/sugestões.
 */
function getCustoDeNaoAgirFaixa(band, processMeta) {
  const base = processMeta?.typical_impact_text;
  if (base) return base;
  const bandQual = { LOW: 'baixo', MEDIUM: 'médio', HIGH: 'alto' }[band] || 'médio';
  return `Custo ${bandQual}: perda de dinheiro, atraso ou retrabalho.`;
}

module.exports = {
  getOQueEstaAcontecendo,
  getCustoDeNaoAgir,
  getCustoDeNaoAgirFaixa,
  getOQueMudaEm30Dias,
  humanizeAnswerValue,
  getComoPuxouNivel,
  FALLBACK_ACTION_TITLE,
  FALLBACK_CONTENT_NAO_DEFINIDO,
  PROCESS_LABEL,
  PROTECTS_LABEL,
};
