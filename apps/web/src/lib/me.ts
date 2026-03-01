/**
 * Cache de /me — evita fetch repetido na mesma sessão.
 * TTL 5 min. Invalidar no logout.
 */
import { fetchMe } from './api';
import type { MeResponse } from './api';

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { token: string; data: MeResponse | null; ts: number } | null = null;

/**
 * Retorna /me do cache se token igual e TTL válido; senão busca e cacheia.
 */
export async function getMe(accessToken: string): Promise<MeResponse | null> {
  const now = Date.now();
  if (cache?.token === accessToken && now - cache.ts < CACHE_TTL_MS) {
    return cache.data;
  }
  const data = await fetchMe(accessToken);
  cache = { token: accessToken, data, ts: now };
  return data;
}

/** Invalida cache (chamar no logout). */
export function invalidateMe(): void {
  cache = null;
}
