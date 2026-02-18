const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Fallback: mensagens amigáveis para códigos de erro da API (quando message_user não vem).
 */
const API_ERROR_MESSAGES: Record<string, string> = {
  CHECKLIST_INCOMPLETE: 'Falta confirmar o que conta como feito.',
  CHECKLIST_INVALID: 'Falta confirmar o que conta como feito.',
  DIAG_NOT_READY: 'Conclua o diagnóstico para sugerir ações.',
  DIAG_INCOMPLETE: 'Faltam respostas obrigatórias. Preencha todas as perguntas.',
  DIAG_NOT_FOUND: 'Diagnóstico não encontrado.',
  NO_ACTIONS_LEFT: 'Não há mais ações sugeridas. Acesse os resultados ou o dashboard.',
  CAUSE_PENDING: 'Responda às perguntas de causa antes de escolher suas ações.',
  MECHANISM_ACTION_REQUIRED: 'Sem atacar a causa, você volta ao mesmo problema. Inclua pelo menos uma ação do mecanismo indicado.',
  EVIDENCE_REQUIRED: 'Para concluir, registre a evidência (antes e depois).',
  DROP_REASON_REQUIRED: 'Ao descartar uma ação, informe o motivo.',
  CYCLE_CLOSED: 'Ciclo fechado. Somente leitura.',
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

/** Resposta do GET /me */
export interface MeResponse {
  user_id: string;
  email: string | null;
  role: 'USER' | 'CONSULTOR' | 'ADMIN';
}

/** Busca dados do usuário autenticado (incluindo role) */
export async function fetchMe(accessToken: string): Promise<MeResponse> {
  return apiFetch('/me', {}, accessToken);
}
