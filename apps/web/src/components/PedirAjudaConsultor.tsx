'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { createSupportThread, getSupportThread, sendSupportMessage, type SupportThreadMessage } from '@/lib/api/support';

interface PedirAjudaConsultorProps {
  companyId: string;
  label?: string;
  style?: React.CSSProperties;
}

/** Botão "Pedir ajuda ao consultor" — USER abre thread (POST /support/threads) e conversa. */
export default function PedirAjudaConsultor({
  companyId,
  label = 'Pedir ajuda ao consultor',
  style,
}: PedirAjudaConsultorProps) {
  const { session, me } = useAuth();
  const [open, setOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportThreadMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadThread = useCallback(async () => {
    if (!threadId || !session?.access_token) return;
    try {
      const res = await getSupportThread(threadId, session.access_token);
      setMessages(res?.messages || []);
    } catch {
      setMessages([]);
    }
  }, [threadId, session?.access_token]);

  const openModal = async () => {
    if (!session?.access_token || !companyId) return;
    setOpen(true);
    setLoading(true);
    setError('');
    setThreadId(null);
    setMessages([]);
    setNewMessage('');
    try {
      const thread = await createSupportThread(companyId, session.access_token);
      setThreadId(thread.id);
      if (thread.id) {
        const res = await getSupportThread(thread.id, session.access_token);
        setMessages(res?.messages || []);
      }
    } catch (err) {
      setError((err as Error).message || 'Erro ao abrir conversa');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && threadId) {
      loadThread();
    }
  }, [open, threadId, loadThread]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !threadId || !session?.access_token) return;
    setSending(true);
    setError('');
    try {
      const msg = await sendSupportMessage(threadId, newMessage.trim(), session.access_token);
      setMessages((prev) => [...prev, msg]);
      setNewMessage('');
    } catch (err) {
      setError((err as Error).message || 'Erro ao enviar');
    } finally {
      setSending(false);
    }
  };

  if (me?.role === 'CONSULTOR' || me?.role === 'ADMIN') {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        style={{
          display: 'inline-block',
          backgroundColor: '#6f42c1',
          color: '#fff',
          padding: '0.5rem 1rem',
          borderRadius: '6px',
          border: 'none',
          cursor: 'pointer',
          fontSize: '0.9rem',
          ...style,
        }}
      >
        {label}
      </button>
      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => !loading && !sending && setOpen(false)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              padding: '1.5rem',
              borderRadius: '8px',
              maxWidth: '500px',
              width: '90%',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 1rem 0' }}>Conversa com o consultor</h3>

            {loading ? (
              <p style={{ color: '#6c757d' }}>Abrindo conversa...</p>
            ) : (
              <>
                <div
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '1rem',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '6px',
                    marginBottom: '1rem',
                    minHeight: '150px',
                    maxHeight: '250px',
                  }}
                >
                  {messages.length === 0 ? (
                    <p style={{ color: '#6c757d', fontSize: '0.9rem' }}>
                      Nenhuma mensagem ainda. Envie a primeira.
                    </p>
                  ) : (
                    messages.map((m) => (
                      <div
                        key={m.id}
                        style={{
                          marginBottom: '0.75rem',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '6px',
                          backgroundColor: m.author_role === 'USER' ? '#e7f3ff' : '#fff',
                          borderLeft: m.author_role === 'USER' ? '3px solid #0d6efd' : '3px solid #6f42c1',
                          fontSize: '0.9rem',
                        }}
                      >
                        <div style={{ fontSize: '0.75rem', color: '#6c757d', marginBottom: '0.25rem' }}>
                          {m.author_role} · {new Date(m.created_at).toLocaleString('pt-BR')}
                        </div>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{m.message}</div>
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {error && (
                  <div style={{ color: '#dc3545', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                    {error}
                  </div>
                )}

                <form onSubmit={handleSend} style={{ display: 'flex', gap: '0.5rem' }}>
                  <textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Digite sua mensagem..."
                    rows={2}
                    disabled={sending}
                    style={{
                      flex: 1,
                      padding: '0.5rem',
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
                      backgroundColor: '#6f42c1',
                      color: '#fff',
                      cursor: sending || !newMessage.trim() ? 'not-allowed' : 'pointer',
                      fontSize: '0.9rem',
                    }}
                  >
                    {sending ? '...' : 'Enviar'}
                  </button>
                </form>
              </>
            )}

            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={loading || sending}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  border: '1px solid #dee2e6',
                  backgroundColor: '#fff',
                  cursor: loading || sending ? 'not-allowed' : 'pointer',
          }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
