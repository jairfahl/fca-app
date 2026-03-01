'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/api';

interface PedirApoioButtonProps {
  companyId: string;
  assessmentId?: string;
  actionId?: string;
  actionTitle?: string;
  label?: string;
  style?: React.CSSProperties;
}

/** Botão "Pedir apoio do consultor" — USER cria consulting_request. Consultor vê em /consultor — Pedidos de apoio. */
export default function PedirApoioButton({
  companyId,
  assessmentId,
  actionId,
  actionTitle,
  label = 'Pedir apoio do consultor',
  style,
}: PedirApoioButtonProps) {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !session?.access_token || !companyId) return;
    setLoading(true);
    setError('');
    try {
      await apiFetch(
        '/support/request',
        {
          method: 'POST',
          body: {
            company_id: companyId,
            assessment_id: assessmentId || undefined,
            action_id: actionId || undefined,
            text: text.trim(),
          },
        },
        session.access_token
      );
      setSent(true);
      setText('');
      setTimeout(() => {
        setOpen(false);
        setSent(false);
      }, 1500);
    } catch (err: unknown) {
      setError((err as Error).message || 'Erro ao enviar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-block',
          backgroundColor: '#6f42c1',
          color: '#fff',
          padding: '0.4rem 0.8rem',
          borderRadius: '6px',
          border: 'none',
          cursor: 'pointer',
          fontSize: '0.85rem',
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
          onClick={() => !loading && setOpen(false)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              padding: '1.5rem',
              borderRadius: '8px',
              maxWidth: '400px',
              width: '90%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 1rem 0' }}>Pedir apoio do consultor</h3>
            {actionTitle && (
              <p style={{ fontSize: '0.9rem', color: '#6c757d', marginBottom: '0.75rem' }}>
                Ação: {actionTitle}
              </p>
            )}
            {sent ? (
              <p style={{ color: '#198754' }}>Pedido enviado. Um consultor entrará em contato.</p>
            ) : (
              <form onSubmit={handleSubmit}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
                  Descreva em que precisa de apoio:
                </label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={4}
                  required
                  placeholder="Ex.: Estou com dúvida sobre como definir a métrica..."
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: '6px',
                    border: '1px solid #ced4da',
                    marginBottom: '1rem',
                    boxSizing: 'border-box',
                  }}
                />
                {error && (
                  <div style={{ color: '#dc3545', marginBottom: '0.5rem', fontSize: '0.9rem' }}>{error}</div>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    disabled={loading}
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: '6px',
                      border: '1px solid #dee2e6',
                      backgroundColor: '#fff',
                      cursor: loading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !text.trim()}
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: '#6f42c1',
                      color: '#fff',
                      cursor: loading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {loading ? 'Enviando...' : 'Enviar'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
