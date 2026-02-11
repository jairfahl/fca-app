const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Fallback: mensagens amigáveis para códigos de erro da API (quando message_user não vem).
 */
const API_ERROR_MESSAGES: Record<string, string> = {
  CHECKLIST_INCOMPLETE: 'Falta confirmar o que conta como feito.',
  CHECKLIST_INVALID: 'Falta confirmar o que conta como feito.',
  DIAG_NOT_READY: 'Conclua o diagnóstico para ver o resultado.',
  DIAG_NOT_FOUND: 'Diagnóstico não encontrado.',
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
    try {
      const errorData = await response.json();
      errorMessage =
        errorData.message_user ||
        (errorData.code && API_ERROR_MESSAGES[errorData.code]) ||
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
    
    throw new ApiError(errorMessage, response.status);
  }

  // Se não tiver conteúdo, retornar null
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    return null;
  }

  return await response.json();
}
