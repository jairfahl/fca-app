'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';

type Tab = 'diagnosticos' | 'mensagens';

interface DiagnosticosData {
  user_id: string;
  company_id: string;
  light: Array<{ id: string; status: string; created_at: string; submitted_at: string | null }>;
  full: Array<{ id: string; status: string; created_at: string; submitted_at: string | null; closed_at: string | null }>;
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

export default function ConsultorUserPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
        <ConsultorUserContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function ConsultorUserContent() {
  const { session } = useAuth();
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const userId = params.user_id as string;
  const companyId = searchParams.get('company_id') || '';

  const [tab, setTab] = useState<Tab>('diagnosticos');
  const [diagnosticos, setDiagnosticos] = useState<DiagnosticosData | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadDiagnosticos = useCallback(async () => {
    if (!companyId || !session?.access_token) return;
    try {
      const res = await apiFetch(`/consultor/users/${userId}/diagnosticos?company_id=${companyId}`, {}, session.access_token);
      setDiagnosticos(res);
    } catch {
      setDiagnosticos(null);
    }
  }, [userId, companyId, session?.access_token]);

  const loadMessages = useCallback(async () => {
    if (!companyId || !session?.access_token) return;
    try {
      const res = await apiFetch(`/consultor/messages?company_id=${companyId}&user_id=${userId}`, {}, session.access_token);
      setMessages(res?.messages || []);
    } catch {
      setMessages([]);
    }
  }, [userId, companyId, session?.access_token]);

  useEffect(() => {
    if (!companyId) {
      setError('company_id é obrigatório');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    Promise.all([loadDiagnosticos(), loadMessages()]).finally(() => setLoading(false));
  }, [companyId, loadDiagnosticos, loadMessages]);

  const handleReply = async () => {
    if (!replyBody.trim() || !session?.access_token) return;
    setSubmitting(true);
    try {
      await apiFetch(
        '/consultor/messages/reply',
        { method: 'POST', body: { company_id: companyId, to_user_id: userId, body: replyBody.trim() } },
        session.access_token
      );
      setReplyBody('');
      loadMessages();
    } catch (err: any) {
      alert(err.message || 'Erro ao enviar');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
        Carregando...
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <Link href="/consultor" style={{ color: '#0070f3' }}>← Usuários</Link>
      </div>

      <h1 style={{ marginBottom: '1.5rem' }}>Usuário {userId}</h1>
      {companyId && <p style={{ color: '#666', marginBottom: '1rem' }}>Empresa: {companyId}</p>}

      {error && (
        <div style={{ padding: '1rem', backgroundColor: '#f8d7da', color: '#721c24', borderRadius: '8px', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid #dee2e6' }}>
        <button
          onClick={() => setTab('diagnosticos')}
          style={{
            padding: '0.5rem 1rem',
            border: 'none',
            background: tab === 'diagnosticos' ? '#0d6efd' : 'transparent',
            color: tab === 'diagnosticos' ? '#fff' : '#212529',
            cursor: 'pointer',
            borderRadius: '6px 6px 0 0',
          }}
        >
          Diagnósticos
        </button>
        <button
          onClick={() => setTab('mensagens')}
          style={{
            padding: '0.5rem 1rem',
            border: 'none',
            background: tab === 'mensagens' ? '#0d6efd' : 'transparent',
            color: tab === 'mensagens' ? '#fff' : '#212529',
            cursor: 'pointer',
            borderRadius: '6px 6px 0 0',
          }}
        >
          Mensagens
        </button>
      </div>

      {tab === 'diagnosticos' && diagnosticos && (
        <div>
          <h2 style={{ marginBottom: '1rem' }}>LIGHT</h2>
          {diagnosticos.light.length === 0 ? (
            <p style={{ color: '#666' }}>Nenhum diagnóstico LIGHT.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, marginBottom: '1.5rem' }}>
              {diagnosticos.light.map((a) => (
                <li key={a.id} style={{ marginBottom: '0.5rem' }}>
                  <Link
                    href={`/consultor/light/${a.id}?company_id=${companyId}`}
                    style={{
                      display: 'inline-block',
                      padding: '0.75rem 1rem',
                      backgroundColor: '#f8f9fa',
                      borderRadius: '6px',
                      textDecoration: 'none',
                      color: '#212529',
                    }}
                  >
                    Ver LIGHT (leitura) — {a.status} — {new Date(a.created_at).toLocaleDateString('pt-BR')}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <h2 style={{ marginBottom: '1rem' }}>FULL</h2>
          {diagnosticos.full.length === 0 ? (
            <p style={{ color: '#666' }}>Nenhum diagnóstico FULL.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {diagnosticos.full.map((a) => (
                <li key={a.id} style={{ marginBottom: '0.5rem' }}>
                  <Link
                    href={`/consultor/full/${a.id}?company_id=${companyId}`}
                    style={{
                      display: 'inline-block',
                      padding: '0.75rem 1rem',
                      backgroundColor: '#f8f9fa',
                      borderRadius: '6px',
                      textDecoration: 'none',
                      color: '#212529',
                    }}
                  >
                    Ver FULL (leitura) — {a.status} — {new Date(a.created_at).toLocaleDateString('pt-BR')}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'mensagens' && (
        <div>
          <h2 style={{ marginBottom: '1rem' }}>Mensagens</h2>
          {messages.length === 0 ? (
            <p style={{ color: '#666' }}>Nenhuma mensagem.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, marginBottom: '1.5rem' }}>
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
                  <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem' }}>
                    {m.created_by_role} — {new Date(m.created_at).toLocaleString('pt-BR')}
                  </div>
                  <div>{m.body_preview}</div>
                </li>
              ))}
            </ul>
          )}

          <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
            <h3 style={{ marginBottom: '0.5rem' }}>Responder</h3>
            <textarea
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              rows={3}
              placeholder="Digite sua resposta..."
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #ced4da', marginBottom: '0.5rem' }}
            />
            <button
              onClick={handleReply}
              disabled={submitting || !replyBody.trim()}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: '#0d6efd',
                color: '#fff',
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Enviando...' : 'Enviar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
