/**
 * API client para suporte (threads) — USER e CONSULTOR.
 */
import { apiFetch } from '../api';

export interface SupportThread {
  id: string;
  company_id: string;
  user_id: string;
  status: string;
  created_at: string;
  closed_at: string | null;
}

export interface SupportThreadMessage {
  id: string;
  author_user_id: string;
  author_role: string;
  message: string;
  created_at: string;
}

/** POST /support/threads — USER abre thread (idempotente) */
export async function createSupportThread(
  companyId: string,
  token: string
): Promise<SupportThread> {
  return apiFetch('/support/threads', {
    method: 'POST',
    body: { company_id: companyId },
  }, token);
}

/** GET /support/threads/:thread_id — USER lê próprio thread */
export async function getSupportThread(
  threadId: string,
  token: string
): Promise<{ thread: SupportThread; messages: SupportThreadMessage[] }> {
  return apiFetch(`/support/threads/${threadId}`, {}, token);
}

/** POST /support/threads/:thread_id/messages — USER/CONSULTOR/ADMIN envia mensagem */
export async function sendSupportMessage(
  threadId: string,
  message: string,
  token: string
): Promise<SupportThreadMessage> {
  return apiFetch(`/support/threads/${threadId}/messages`, {
    method: 'POST',
    body: { message },
  }, token);
}
