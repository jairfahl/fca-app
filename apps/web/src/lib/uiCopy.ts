/**
 * Glossário de UI — substituição de jargões por copy legível para PME.
 * Regra: UI nunca exibe códigos/IDs/enum cru.
 *
 * Mapa canônico para FULL: labels + funções de apresentação.
 */


// --- Labels de interface ---
export const labels = {
  dod: 'Critérios de conclusão',
  confirmDod: 'Confirmar o que conta como feito',
  checklistIncomplete: 'Falta confirmar o que conta como feito',
  doneRequiresChecklist: 'Para concluir, confirme o que conta como feito',
  assessment: 'Diagnóstico',
  planMinimal: 'Plano mínimo (3 movimentos em 30 dias)',
  planMinimalCta: 'Assinar plano mínimo (3 movimentos em 30 dias)',
  verAcaoSugerida: 'Ver ação sugerida',
  verProximoPasso: 'Ver próximo passo',
  conteudoEmDefinicao: 'Conteúdo em definição pelo método.',
  fallbackAction: 'Ação em definição pelo método',
  missingParams: 'Parâmetros ausentes. Acesse a partir do menu ou link correto.',
  missingCompany: 'Empresa não informada. Acesse a partir do menu ou link correto.',
  assessmentNotInformed: 'Diagnóstico não informado.',
  assessmentNotFound: 'Diagnóstico não encontrado.',
  fallbackExplain: 'Algumas ações estão em definição pelo método. Você pode selecionar e registrar evidência normalmente.',
  consultantView: 'Acompanhamento',
  consultantLoginLabel: 'Acompanhamento como:',
  dropAction: 'Descartar',
  dropActionTitle: 'Descartar ação',
  nextStep: 'Próximo passo',
  markDone: 'Marcar como concluído',
  markDoneConfirm: 'Sim, concluir',
  markDoneTitle: 'Concluir ação',
  situation: 'Situação',
  planProgressLabel: 'Progresso do plano (3 ações)',
  followExecution: 'Acompanhar execução',
  raioXWhatHappening: 'O que está acontecendo',
  raioXCusto: 'Custo de não agir',
  raioX30Dias: 'O que muda em 30 dias',
  raioXPrimeiroPasso: 'Primeiro passo',
  raioXWhyTitle: 'Por que isso apareceu',
  raioXWhatWeSaw: 'O que vimos',
  raioXWhatCauses: 'O que costuma causar isso',
  raioXSignals: 'Sinais nas suas respostas',
  raioXComoPuxou: 'Como isso puxou o nível',
} as const;

/** Monta o texto de progresso: "Progresso do plano (3 ações): X/3" */
export function formatPlanProgress(progress: string): string {
  return `${labels.planProgressLabel}: ${progress}`;
}

// --- Humanizers para valores vindos do backend ---

/**
 * Converte status de assessment para texto legível.
 */
export function humanizeStatus(status: string | null | undefined): string {
  if (!status) return '—';
  const map: Record<string, string> = {
    DRAFT: 'Em andamento',
    SUBMITTED: 'Concluído',
    CLOSED: 'Encerrado',
    COMPLETED: 'Concluído',
  };
  return map[status] ?? status;
}

/**
 * Converte maturity_band (LOW/MEDIUM/HIGH) para texto legível.
 */
export function humanizeBand(band: string | null | undefined): string {
  if (!band) return '—';
  const map: Record<string, string> = {
    LOW: 'Frágil',
    MED: 'Organizado',
    MEDIUM: 'Organizado',
    HIGH: 'Forte',
  };
  return map[band.toUpperCase()] ?? band;
}

/**
 * Converte segmento (C/I/S) para texto legível.
 */
export function humanizeSegment(segment: string | null | undefined): string {
  if (!segment) return '—';
  const map: Record<string, string> = {
    C: 'Comércio',
    I: 'Indústria',
    S: 'Serviços',
  };
  const s = String(segment).toUpperCase();
  return map[s] ?? segment;
}

/**
 * Converte status de ação (NOT_STARTED/IN_PROGRESS/DONE/DROPPED) para texto legível.
 */
export function humanizeActionStatus(status: string | null | undefined): string {
  if (!status) return '—';
  const map: Record<string, string> = {
    NOT_STARTED: 'Não iniciado',
    IN_PROGRESS: 'Em andamento',
    DONE: 'Concluído',
    DROPPED: 'Descartado',
  };
  return map[status] ?? status;
}

/**
 * Substitui LOW/MED/MEDIUM/HIGH em texto (ex.: títulos) por Baixo/Médio/Alto.
 */
/**
 * Converte answer_value (0-10) para interpretação simples.
 */
export function humanizeAnswerValue(value: number): string {
  if (value <= 2) return 'quase nunca';
  if (value <= 4) return 'às vezes';
  if (value <= 7) return 'com frequência';
  return 'frequentemente';
}

export function humanizeBandInText(text: string): string {
  return text
    .replace(/\bLOW\b/g, 'Frágil')
    .replace(/\bMEDIUM\b|\bMED\b/g, 'Organizado')
    .replace(/\bHIGH\b/g, 'Forte');
}

/** Aliases para compatibilidade (FULL_COPY). */
export const uiStatusLabel = humanizeStatus;
export const uiBandLabel = humanizeBand;
export const uiSegmentLabel = humanizeSegment;
export const labelStatus = humanizeStatus;
export const labelBand = humanizeBand;
export const labelSegment = humanizeSegment;
export function labelChecklist(): string {
  return labels.dod;
}

/**
 * Se for is_fallback, retorna label de fallback; senão retorna o valor humanizado.
 */
export function humanizeBandOrFallback(
  band: string | null | undefined,
  isFallback?: boolean
): string {
  if (isFallback) return labels.fallbackAction;
  return humanizeBand(band);
}

/** Dicionário canônico de textos da UI do FULL. */
export const FULL_COPY = {
  labels,
  uiStatusLabel: humanizeStatus,
  uiBandLabel: humanizeBand,
  uiSegmentLabel: humanizeSegment,
};
