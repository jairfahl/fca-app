import { supabase } from './supabaseClient';
import { ApiError } from './api';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Obtém o access_token atualizado do Supabase Auth.
 * Sempre busca a sessão mais recente para garantir token válido.
 */
export async function getAccessToken(): Promise<string> {
  const { data: { session }, error } = await supabase.auth.getSession();
  
  if (error || !session?.access_token) {
    throw new Error('Não autenticado. Faça login novamente.');
  }
  
  return session.access_token;
}

/**
 * Faz fetch autenticado para a API backend.
 * Sempre usa o token atualizado do Supabase (refresh-safe).
 * 
 * @param path - Caminho da API (ex: "/full/diagnostic?company_id=...")
 * @param options - Opções da requisição (method, body)
 * @returns Promise com os dados da resposta JSON
 * @throws ApiError se a resposta não for 2xx
 */
export async function apiFetchAuth(
  path: string,
  options: {
    method?: string;
    body?: any;
  } = {}
): Promise<any> {
  // Sempre buscar token atualizado antes de fazer a chamada
  const accessToken = await getAccessToken();
  
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
      errorMessage = errorData.message_user || errorData.error || errorMessage;
    } catch {
      errorMessage = `Erro ${response.status}: ${response.statusText}`;
    }
    
    // 401 → redirecionar para /login
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
