/**
 * Recomendações "na lata" por processo e faixa de score.
 * Usado em /results e /recommendations quando API não retorna ou como fallback.
 * Linguagem de dono: caixa, cliente, atraso, risco.
 */
export type ProcessKey = 'COMERCIAL' | 'OPERACOES' | 'ADM_FIN' | 'GESTAO';

export type ScoreBucket = 'low' | 'mid' | 'high';

export type LightRecNaLata = {
  process: ProcessKey;
  title: string;
  why: string;
};

const BUCKET: Record<ProcessKey, Record<ScoreBucket, LightRecNaLata>> = {
  COMERCIAL: {
    low: {
      process: 'COMERCIAL',
      title: 'Criar rotina semanal de prospecção',
      why: 'Caixa depende de pipeline. Sem rotina, os clientes somem e o ciclo estica.',
    },
    mid: {
      process: 'COMERCIAL',
      title: 'Padronizar follow-up de propostas',
      why: 'Propostas paradas na mesa = vendas perdidas. Uma rotina simples já reduz o vazamento.',
    },
    high: {
      process: 'COMERCIAL',
      title: 'Refinar critérios de qualificação',
      why: 'Com base sólida, focar no que mais converte evita esforço jogado fora.',
    },
  },
  OPERACOES: {
    low: {
      process: 'OPERACOES',
      title: 'Checklist e responsável por etapa',
      why: 'Atrasos e retrabalho custam caro. Um padrão mínimo reduz risco e reclamação.',
    },
    mid: {
      process: 'OPERACOES',
      title: 'Revisar prazos prometidos vs entregues',
      why: 'Entregar antes ou no prazo vira diferencial. Ajustar expectativa evita cliente insatisfeito.',
    },
    high: {
      process: 'OPERACOES',
      title: 'Documentar etapas críticas',
      why: 'Padronizar o que já funciona protege contra falhas quando alguém sai.',
    },
  },
  ADM_FIN: {
    low: {
      process: 'ADM_FIN',
      title: 'Fluxo de caixa D+7',
      why: 'Sem visão de caixa, decisão vira aposta. Uma planilha semanal já reduz susto.',
    },
    mid: {
      process: 'ADM_FIN',
      title: 'Conferir contas a pagar/receber',
      why: 'Caixa projetado ajuda a priorizar o que pagar e quando cobrar.',
    },
    high: {
      process: 'ADM_FIN',
      title: 'Rever indicadores de margem',
      why: 'Saber o que rende mais permite cortar o que não paga.',
    },
  },
  GESTAO: {
    low: {
      process: 'GESTAO',
      title: 'Metas trimestrais + ritual semanal',
      why: 'Equipe sem direção clara perde foco. Poucas metas e uma reunião fixa já mudam.',
    },
    mid: {
      process: 'GESTAO',
      title: 'Acompanhar 2–3 indicadores chave',
      why: 'Dados mínimos evitam decisão no achismo.',
    },
    high: {
      process: 'GESTAO',
      title: 'Revisar metas e ajustar prioridades',
      why: 'Manter o que funciona e cortar o que não entrega.',
    },
  },
};

export const PROCESS_ORDER: ProcessKey[] = ['COMERCIAL', 'OPERACOES', 'ADM_FIN', 'GESTAO'];

export const PROCESS_LABELS: Record<ProcessKey, string> = {
  COMERCIAL: 'Comercial',
  OPERACOES: 'Operações',
  ADM_FIN: 'Adm/Fin',
  GESTAO: 'Gestão',
};

export function getScoreBucket(score: number | null): ScoreBucket {
  if (score === null) return 'mid';
  if (score < 4) return 'low';
  if (score < 7) return 'mid';
  return 'high';
}

export function getNaLataByProcessAndScore(
  process: ProcessKey,
  score: number | null
): LightRecNaLata {
  const bucket = getScoreBucket(score);
  return BUCKET[process][bucket];
}

export function getFallbackNaLata(): LightRecNaLata[] {
  return PROCESS_ORDER.map((p) => BUCKET[p].mid);
}
