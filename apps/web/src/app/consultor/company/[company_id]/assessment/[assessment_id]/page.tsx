'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import { humanizeStatus } from '@/lib/uiCopy';
import { consultantHome as routeConsultorHome, consultantCompanyOverview } from '@/lib/consultorRoutes';

type Tab = 'resumo' | 'resultado' | 'plano' | 'evidencias' | 'mensagens';

interface SummaryData {
  type: 'LIGHT' | 'FULL';
  assessment_id: string;
  company_id: string;
  status: string;
  scores?: Array<{ process_key?: string; category?: string; band?: string; score?: number; score_numeric?: number; percentage?: number }>;
  gaps?: unknown[];
  causas?: Array<{ gap_id: string; cause_primary: string }>;
  recommendations?: unknown[];
  plan_30_dias?: unknown[];
  actions?: Array<{
    action_key: string;
    position?: number;
    owner_name?: string;
    metric_text?: string;
    checkpoint_date?: string;
    status: string;
    title?: string;
  }>;
  evidence?: Array<{
    action_key: string;
    before_baseline?: string;
    after_result?: string;
    declared_gain?: string;
  }>;
  ganhos_declarados?: Array<{ action_key: string; declared_gain: string }>;
  answered_count?: number;
}

interface MessageItem {
  id: string;
  company_id: string;
  from_user_id: string;
  to_user_id: string | null;
  subject: string | null;
  body_preview: string;
  created_at: string;
  read_at: string | null;
  created_by_role: string;
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'resultado', label: 'Resultado' },
  { id: 'plano', label: 'Plano 30 dias' },
  { id: 'evidencias', label: 'Evidências e ganhos' },
  { id: 'mensagens', label: 'Mensagens' },
];

export default function ConsultorAssessmentPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
        <ConsultorAssessmentContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function ConsultorAssessmentContent() {
  const { session } = useAuth();
  const params = useParams();
  const router = useRouter();
  const companyId = params.company_id as string;
  const assessmentId = params.assessment_id as string;

  const [tab, setTab] = useState<Tab>('resumo');
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadSummary = useCallback(async () => {
    if (!assessmentId || !companyId || !session?.access_token) return;
    try {
      const res = await apiFetch(
        `/consultor/assessment/${assessmentId}/summary?company_id=${companyId}`,
        {},
        session.access_token
      );
      setSummary(res);
    } catch {
      setSummary(null);
    }
  }, [assessmentId, companyId, session?.access_token]);

  const loadMessages = useCallback(async () => {
    if (!companyId || !session?.access_token) return;
    try {
      const res = await apiFetch(`/consultor/messages?company_id=${companyId}`, {}, session.access_token);
      setMessages(res?.messages || []);
    } catch {
      setMessages([]);
    }
  }, [companyId, session?.access_token]);

  const loadData = useCallback(async () => {
    if (!assessmentId || !companyId || !session?.access_token) return;
    setLoading(true);
    setError('');
    try {
      await Promise.all([loadSummary(), loadMessages()]);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 403) {
        router.replace('/diagnostico');
        return;
      }
      setError((err as Error).message || 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, [assessmentId, companyId, session?.access_token, router, loadSummary, loadMessages]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
        Carregando...
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
        {error && (
          <div
            style={{
              padding: '1rem',
              backgroundColor: '#f8d7da',
              color: '#721c24',
              borderRadius: '8px',
              marginBottom: '1rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '1rem',
            }}
          >
            <span>{error}</span>
            <button
              onClick={loadData}
              style={{
                padding: '0.4rem 0.8rem',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: '#721c24',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              Recarregar
            </button>
          </div>
        )}
        <Link href={consultantCompanyOverview(companyId)} style={{ color: '#0d6efd' }}>
          ← Voltar à empresa
        </Link>
      </div>
    );
  }

  const isFull = summary.type === 'FULL';
  const answeredCount = summary.answered_count ?? (summary.scores?.length ?? 0);
  const answeredDisplay = typeof answeredCount === 'number' ? answeredCount : '—';

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <Link href={consultantCompanyOverview(companyId)} style={{ color: '#0d6efd', textDecoration: 'none' }}>
          ← Empresa
        </Link>
        <span style={{ margin: '0 0.5rem', color: '#dee2e6' }}>|</span>
        <Link href={routeConsultorHome()} style={{ color: '#0d6efd', textDecoration: 'none' }}>
          Empresas
        </Link>
      </div>

      <h1 style={{ marginBottom: '0.5rem' }}>
        Diagnóstico {summary.type} — {humanizeStatus(summary.status)}
      </h1>
      <div style={{ fontSize: '0.9rem', color: '#6c757d', marginBottom: '1.5rem' }}>
        Somente leitura
      </div>

      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', flexWrap: 'wrap', borderBottom: '1px solid #dee2e6' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '0.5rem 1rem',
              border: 'none',
              background: tab === t.id ? '#0d6efd' : 'transparent',
              color: tab === t.id ? '#fff' : '#212529',
              cursor: 'pointer',
              borderRadius: '6px 6px 0 0',
              fontSize: '0.9rem',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'resumo' && (
        <section>
          <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Resumo</h2>
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div>
              <strong>Status:</strong> {humanizeStatus(summary.status)}
            </div>
            <div>
              <strong>Respostas:</strong> {answeredDisplay}
            </div>
            <div>
              <strong>Tipo:</strong> {summary.type}
            </div>
          </div>
        </section>
      )}

      {tab === 'resultado' && (
        <section>
          <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Resultado</h2>
          {summary.scores && summary.scores.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {summary.scores.map((s, i) => (
                <div
                  key={i}
                  style={{
                    padding: '1rem',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '8px',
                    border: '1px solid #dee2e6',
                  }}
                >
                  <strong>{s.process_key || s.category || '—'}</strong>
                  <span style={{ marginLeft: '0.5rem' }}>
                    {s.band || s.score ?? s.score_numeric ?? s.percentage ?? '—'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#6c757d' }}>Nenhum score disponível.</p>
          )}
          {isFull && summary.causas && summary.causas.length > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
              <h3 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>Causas</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {summary.causas.map((c, i) => (
                  <li key={i} style={{ padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>
                    {c.gap_id}: {c.cause_primary}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {tab === 'plano' && (
        <section>
          <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Plano 30 dias</h2>
          {summary.actions && summary.actions.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {summary.actions.map((a, i) => (
                <div
                  key={a.action_key}
                  style={{
                    padding: '1.25rem',
                    backgroundColor: '#fff',
                    borderRadius: '8px',
                    border: '1px solid #dee2e6',
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                    {a.position ?? i + 1}. {a.title || a.action_key}
                  </div>
                  <div style={{ fontSize: '0.9rem', color: '#6c757d' }}>
                    {a.owner_name && <div>Dono: {a.owner_name}</div>}
                    {a.metric_text && <div>Métrica: {a.metric_text}</div>}
                    {a.checkpoint_date && <div>Checkpoint: {a.checkpoint_date}</div>}
                    <div>Status: {humanizeStatus(a.status)}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#6c757d' }}>Nenhuma ação no plano.</p>
          )}
        </section>
      )}

      {tab === 'evidencias' && (
        <section>
          <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Evidências e ganhos</h2>
          {summary.evidence && summary.evidence.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {summary.evidence.map((e) => (
                <div
                  key={e.action_key}
                  style={{
                    padding: '1.25rem',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '8px',
                    border: '1px solid #dee2e6',
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{e.action_key}</div>
                  {e.before_baseline && (
                    <div style={{ marginBottom: '0.5rem' }}>
                      <strong>Antes:</strong> {e.before_baseline}
                    </div>
                  )}
                  {e.after_result && (
                    <div style={{ marginBottom: '0.5rem' }}>
                      <strong>Depois:</strong> {e.after_result}
                    </div>
                  )}
                  {e.declared_gain && (
                    <div style={{ color: '#155724', fontWeight: 500 }}>
                      <strong>Ganho declarado:</strong> {e.declared_gain}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (summary.ganhos_declarados && summary.ganhos_declarados.length > 0) ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {summary.ganhos_declarados.map((g) => (
                <div key={g.action_key} style={{ padding: '1rem', backgroundColor: '#d4edda', borderRadius: '8px' }}>
                  <strong>{g.action_key}:</strong> {g.declared_gain}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#6c757d' }}>Nenhuma evidência ou ganho registrado.</p>
          )}
        </section>
      )}

      {tab === 'mensagens' && (
        <section>
          <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Mensagens</h2>
          {messages.length === 0 ? (
            <p style={{ color: '#6c757d' }}>Nenhuma mensagem.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {messages.map((m) => (
                <li
                  key={m.id}
                  style={{
                    padding: '1rem',
                    marginBottom: '0.5rem',
                    backgroundColor: m.created_by_role === 'USER' ? '#e7f3ff' : '#f8f9fa',
                    borderRadius: '8px',
                    borderLeft: `4px solid ${m.created_by_role === 'USER' ? '#0d6efd' : '#6c757d'}`,
                  }}
                >
                  <div style={{ fontSize: '0.85rem', color: '#6c757d', marginBottom: '0.25rem' }}>
                    {m.created_by_role} — {new Date(m.created_at).toLocaleString('pt-BR')}
                  </div>
                  <div>{m.body_preview}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
