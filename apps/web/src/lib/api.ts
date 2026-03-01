const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Fallback: mensagens amigáveis para códigos de erro da API (quando message_user não vem).
 */
const API_ERROR_MESSAGES: Record<string, string> = {
  CHECKLIST_INCOMPLETE: 'Falta confirmar o que conta como feito.',
  CHECKLIST_INVALID: 'Falta confirmar o que conta como feito.',
  DIAG_NOT_READY: 'Conclua o diagnóstico para sugerir ações.',
  DIAG_IN_PROGRESS: 'Conclua ou feche o ciclo atual antes de refazer o diagnóstico.',
  SNAPSHOT_MISSING: 'Conclua o diagnóstico para gerar relatório.',
  DIAG_INCOMPLETE: 'Faltam respostas obrigatórias. Preencha todas as perguntas.',
  DIAG_NOT_FOUND: 'Diagnóstico não encontrado.',
  NO_ACTIONS_LEFT: 'Não há mais ações sugeridas. Acesse os resultados ou o dashboard.',
  CAUSE_PENDING: 'Responda às perguntas de causa antes de escolher suas ações.',
  MECHANISM_ACTION_REQUIRED: 'Sem atacar a causa, você volta ao mesmo problema. Inclua pelo menos uma ação do mecanismo indicado.',
  EVIDENCE_REQUIRED: 'Para concluir, registre a evidência (antes e depois).',
  DROP_REASON_REQUIRED: 'Ao descartar uma ação, informe o motivo.',
  CYCLE_CLOSED: 'Ciclo fechado. Somente leitura.',
  CONSULTOR_READ_ONLY: 'Consultor não preenche diagnóstico. Use o painel de consultor.',
  CONSULTOR_NOT_ALLOWED: 'Acesso de consultor é pelo painel do consultor.',
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public originalError?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch(
  path: string,
  options: {
    method?: string;
    body?: any;
  },
  accessToken: string
): Promise<any> {
  const url = `${API_BASE_URL}${path}`;
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
  };

  const config: RequestInit = {
    method: options.method || 'GET',
    headers,
  };

  if (options.body) {
    config.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, config);

  if (!response.ok) {
    let errorMessage = 'Erro na requisição';
    let errorCode: string | undefined;
    let errorPayload: Record<string, unknown> | undefined;
    try {
      const errorData = await response.json();
      errorPayload = errorData;
      errorCode = errorData.code;
      errorMessage =
        errorData.message_user ||
        (errorCode && API_ERROR_MESSAGES[errorCode]) ||
        errorData.error ||
        errorMessage;
    } catch {
      errorMessage = `Erro ${response.status}: ${response.statusText}`;
    }

    // 401 → redirecionar para /login (será tratado no componente)
    if (response.status === 401) {
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }

    const err = new ApiError(errorMessage, response.status);
    (err as any).code = errorCode;
    if (errorPayload?.missing) (err as any).missing = errorPayload.missing;
    if (errorPayload?.missing_process_keys) (err as any).missing_process_keys = errorPayload.missing_process_keys;
    if (errorPayload?.debug_id) (err as any).debug_id = errorPayload.debug_id;
    if (errorPayload?.message_user) (err as any).message_user = errorPayload.message_user;
    if (errorPayload?.mechanism_action_keys) (err as any).mechanism_action_keys = errorPayload.mechanism_action_keys;
    throw err;
  }

  // Se não tiver conteúdo, retornar null
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    return null;
  }

  return await response.json();
}

/** Baixa PDF do relatório FULL (stream) e dispara download no navegador */
export async function downloadFullReport(
  companyId: string,
  fullVersion: number,
  accessToken: string
): Promise<void> {
  const url = `${API_BASE_URL}/full/reports/download?company_id=${encodeURIComponent(companyId)}&full_version=${fullVersion}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(
      data.message_user || data.message || data.error || `Erro ${res.status}`,
      res.status
    );
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = `diagnostico-full-v${fullVersion}.pdf`;
  a.click();
  URL.revokeObjectURL(objectUrl);
}

/** Resposta do GET /me */
export interface MeResponse {
  user_id: string;
  email: string | null;
  role: 'USER' | 'CONSULTOR' | 'ADMIN';
}

/** In-flight dedupe: evita múltiplos /me simultâneos para o mesmo token */
let _inFlight: { token: string; promise: Promise<MeResponse | null> } | null = null;

/**
 * Busca dados do usuário autenticado (incluindo role).
 * Se 401: retorna null (fluxo de login age).
 * Deduplicado por token.
 */
export async function fetchMe(accessToken: string): Promise<MeResponse | null> {
  if (_inFlight?.token === accessToken) {
    return _inFlight.promise;
  }
  const url = `${API_BASE_URL}/me`;
  const promise = (async (): Promise<MeResponse | null> => {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 401) {
      return null;
    }
    if (!res.ok) {
      return null;
    }
    const data = await res.json().catch(() => null);
    return data as MeResponse;
  })();
  _inFlight = { token: accessToken, promise };
  try {
    const result = await promise;
    if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
      console.log(`[ME_FETCH] role=${result?.role ?? 'null'}`);
    }
    return result;
  } finally {
    if (_inFlight?.token === accessToken) _inFlight = null;
  }
}
