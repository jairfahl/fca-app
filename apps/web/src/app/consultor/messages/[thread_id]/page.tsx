'use client';

import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { consultantSupportThread, consultantCloseThread, consultantCompanies, type SupportThreadMessage, type CompanyItem } from '@/lib/api/consultor';
import { consultantMessages } from '@/lib/consultorRoutes';
import { apiFetch } from '@/lib/api';
import { ApiError } from '@/lib/api';

export default function ConsultorThreadPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
        <ConsultorThreadContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function ConsultorThreadContent() {
  const { user, session } = useAuth();
  const params = useParams();
  const router = useRouter();
  const threadId = params.thread_id as string;

  const [thread, setThread] = useState<{ id: string; company_id: string; user_id: string; status: string; created_at: string } | null>(null);
  const [messages, setMessages] = useState<SupportThreadMessage[]>([]);
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    if (!threadId || !session?.access_token) return;
    setLoading(true);
    setError('');
    try {
      const [threadRes, companiesRes] = await Promise.all([
        consultantSupportThread(threadId, session.access_token),
        consultantCompanies(session.access_token),
      ]);
      setThread(threadRes?.thread || null);
      setMessages(threadRes?.messages || []);
      setCompanies(companiesRes?.companies || []);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        router.replace('/diagnostico');
        return;
      }
      setError((err as Error).message || 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, [threadId, session?.access_token, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !session?.access_token) return;
    setSending(true);
    setError('');
    try {
      const msg = await apiFetch(
        `/support/threads/${threadId}/messages`,
        { method: 'POST', body: { message: newMessage.trim() } },
        session.access_token
      );
      setMessages((prev) => [...prev, msg]);
      setNewMessage('');
    } catch (err) {
      setError((err as Error).message || 'Erro ao enviar');
    } finally {
      setSending(false);
    }
  };

  const handleClose = async () => {
    if (!session?.access_token) return;
    setClosing(true);
    try {
      await consultantCloseThread(threadId, session.access_token);
      await loadData();
    } catch (err) {
      setError((err as Error).message || 'Erro ao fechar');
    } finally {
      setClosing(false);
    }
  };

  const companyMap = Object.fromEntries(companies.map((c) => [c.company_id, c.name]));

  if (loading) {
    return (
      <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
        Carregando...
      </div>
    );
  }

  if (error && !thread) {
    return (
      <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ padding: '1rem', backgroundColor: '#f8d7da', color: '#721c24', borderRadius: '8px', marginBottom: '1rem' }}>
          {error}
        </div>
        <Link href={consultantMessages()} style={{ color: '#0d6efd' }}>
          ← Voltar às mensagens
        </Link>
      </div>
    );
  }

  const companyName = thread ? (companyMap[thread.company_id] || thread.company_id) : '';

  return (
    <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', minHeight: '70vh' }}>
      <div style={{ marginBottom: '1rem' }}>
        <Link href={consultantMessages()} style={{ color: '#0d6efd', textDecoration: 'none' }}>
          ← Mensagens
        </Link>
      </div>

      <h1 style={{ marginBottom: '0.5rem' }}>Thread — {companyName}</h1>
      <div style={{ fontSize: '0.85rem', color: '#6c757d', marginBottom: '1rem' }}>
        {thread?.status} · {thread && new Date(thread.created_at).toLocaleString('pt-BR')}
      </div>

      {error && (
        <div
          style={{
            padding: '0.75rem',
            backgroundColor: '#f8d7da',
            color: '#721c24',
            borderRadius: '6px',
            marginBottom: '1rem',
            fontSize: '0.9rem',
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1rem',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          marginBottom: '1rem',
          minHeight: '200px',
          maxHeight: '400px',
        }}
      >
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              marginBottom: '1rem',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              backgroundColor: m.author_role === 'USER' ? '#e7f3ff' : '#fff',
              borderLeft: m.author_role === 'USER' ? '4px solid #0d6efd' : '4px solid #6f42c1',
              maxWidth: '85%',
              marginLeft: m.author_role === 'USER' ? 0 : 'auto',
              marginRight: m.author_role === 'USER' ? 'auto' : 0,
            }}
          >
            <div style={{ fontSize: '0.75rem', color: '#6c757d', marginBottom: '0.25rem' }}>
              {m.author_role} · {new Date(m.created_at).toLocaleString('pt-BR')}
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{m.message}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {thread?.status === 'OPEN' && (
        <form onSubmit={handleSend} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
          <textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Digite sua resposta..."
            rows={2}
            disabled={sending}
            style={{
              flex: 1,
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              border: '1px solid #ced4da',
              fontSize: '0.9rem',
              resize: 'vertical',
            }}
          />
          <button
            type="submit"
            disabled={sending || !newMessage.trim()}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: '#0d6efd',
              color: '#fff',
              cursor: sending || !newMessage.trim() ? 'not-allowed' : 'pointer',
              fontSize: '0.9rem',
            }}
          >
            {sending ? 'Enviando...' : 'Enviar'}
          </button>
        </form>
      )}

      {thread?.status === 'OPEN' && (
        <div style={{ marginTop: '1rem' }}>
          <button
            onClick={handleClose}
            disabled={closing}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: '1px solid #dc3545',
              backgroundColor: '#fff',
              color: '#dc3545',
              cursor: closing ? 'not-allowed' : 'pointer',
              fontSize: '0.9rem',
            }}
          >
            {closing ? 'Fechando...' : 'Fechar thread'}
          </button>
        </div>
      )}
    </div>
  );
}
