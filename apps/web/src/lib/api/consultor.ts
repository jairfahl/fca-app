/**
 * API client para endpoints do consultor (Prompt 4).
 * 401 → redireciona para /login. 403 → mostra erro.
 */
import { apiFetch, ApiError } from '../api';

export interface CompanyItem {
  company_id: string;
  company_name?: string | null;
  name: string | null;
  trade_name?: string | null;
  owner_user_id: string | null;
  created_at: string | null;
  entitlement: string;
  full_status: string | null;
  full_version: number | null;
  full_assessment_id: string | null;
  plan_progress: string | null;
}

export interface DiagnosticItem {
  assessment_id: string;
  type: 'LIGHT' | 'FULL';
  status: string;
  answered_count: number;
  last_saved_at: string | null;
  created_at: string;
}

export interface DiagnosticDetail {
  type: 'LIGHT' | 'FULL';
  assessment: Record<string, unknown>;
  answers?: unknown[];
  scores?: unknown[];
  items?: unknown[];
  plan?: unknown[];
  evidence?: unknown[];
  snapshot?: unknown;
  findings?: unknown[];
  resultados?: unknown[];
  causas?: unknown[];
  read_only: boolean;
}

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

export async function consultantCompanies(token: string): Promise<{ companies: CompanyItem[] }> {
  return apiFetch('/consultor/companies', {}, token);
}

export async function consultantDiagnostics(
  companyId: string,
  token: string
): Promise<{ company_id: string; light: DiagnosticItem[]; full: DiagnosticItem[] }> {
  return apiFetch(`/consultor/companies/${companyId}/diagnostics`, {}, token);
}

export async function consultantDiagnosticDetail(
  companyId: string,
  assessmentId: string,
  token: string
): Promise<DiagnosticDetail> {
  return apiFetch(
    `/consultor/companies/${companyId}/diagnostics/${assessmentId}`,
    {},
    token
  );
}

export async function consultantSupportThreads(
  status: 'OPEN' | 'CLOSED',
  token: string
): Promise<{ threads: SupportThread[] }> {
  return apiFetch(`/consultor/support/threads?status=${status}`, {}, token);
}

export async function consultantSupportThread(
  threadId: string,
  token: string
): Promise<{ thread: SupportThread; messages: SupportThreadMessage[] }> {
  return apiFetch(`/consultor/support/threads/${threadId}`, {}, token);
}

export async function consultantCloseThread(
  threadId: string,
  token: string
): Promise<SupportThread> {
  return apiFetch(`/consultor/support/threads/${threadId}/close`, {
    method: 'POST',
  }, token);
}
