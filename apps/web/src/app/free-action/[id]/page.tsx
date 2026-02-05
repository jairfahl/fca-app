'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';

interface FreeAction {
  id: string;
  assessment_id: string;
  recommendation_id: string;
  process: string;
  status: 'ACTIVE' | 'COMPLETED';
  created_at: string;
  completed_at: string | null;
  recommendation: {
    title: string;
    checklist: string[];
  };
  evidence: {
    evidence_text: string;
    created_at: string;
  } | null;
}

export default function FreeActionPage() {
  return (
    <ProtectedRoute>
      <FreeActionContent />
    </ProtectedRoute>
  );
}

function FreeActionContent() {
  const { user, session } = useAuth();
  const params = useParams();
  const router = useRouter();
  const freeActionId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [freeAction, setFreeAction] = useState<FreeAction | null>(null);
  const [error, setError] = useState('');
  const [evidenceText, setEvidenceText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (!freeActionId || !session?.access_token) {
      return;
    }

    const loadFreeAction = async () => {
      try {
        setLoading(true);
        setError('');
        const data = await apiFetch(
          `/free-actions/${freeActionId}`,
          {},
          session.access_token
        );
        setFreeAction(data);
        if (data.evidence) {
          setEvidenceText(data.evidence.evidence_text);
        }
      } catch (err: any) {
        if (err instanceof ApiError && err.status === 401) {
          router.push('/login');
          return;
        }
        setError(err.message || 'Erro ao carregar ação gratuita');
      } finally {
        setLoading(false);
      }
    };

    loadFreeAction();
  }, [freeActionId, session?.access_token, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!evidenceText.trim() || !session?.access_token) {
      setError('Evidência é obrigatória');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      setSuccessMessage('');

      await apiFetch(
        `/free-actions/${freeActionId}/evidence`,
        {
          method: 'POST',
          body: { evidence_text: evidenceText.trim() },
        },
        session.access_token
      );

      setSuccessMessage('Evidência registrada com sucesso!');
      
      // Recarregar dados para mostrar status COMPLETED
      const data = await apiFetch(
        `/free-actions/${freeActionId}`,
        {},
        session.access_token
      );
      setFreeAction(data);
      if (data.evidence) {
        setEvidenceText(data.evidence.evidence_text);
      }
    } catch (err: any) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          router.push('/login');
          return;
        }
        if (err.status === 409) {
          setError('Evidência já registrada.');
        } else {
          setError(err.message || 'Erro ao registrar evidência');
        }
      } else {
        setError(err.message || 'Erro ao registrar evidência');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center' }}>Carregando ação gratuita...</div>
      </div>
    );
  }

  if (!freeAction) {
    return (
      <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ color: '#dc3545' }}>Ação gratuita não encontrada.</div>
        <Link href="/diagnostico" style={{ color: '#0070f3' }}>Voltar ao Diagnóstico</Link>
      </div>
    );
  }

  const isCompleted = freeAction.status === 'COMPLETED';
  const hasEvidence = freeAction.evidence !== null;

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
        Logado como: {user?.email}
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <Link href="/logout" style={{ color: '#0070f3' }}>Sair</Link>
        {' | '}
        <Link href={`/recommendations?assessment_id=${freeAction.assessment_id}`} style={{ color: '#0070f3' }}>
          Voltar às Recomendações
        </Link>
      </div>

      <h1 style={{ marginBottom: '1rem' }}>Ação Gratuita</h1>

      {error && (
        <div style={{
          padding: '1rem',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          borderRadius: '4px',
          marginBottom: '1rem'
        }}>
          {error}
        </div>
      )}

      {successMessage && (
        <div style={{
          padding: '1rem',
          backgroundColor: '#d4edda',
          color: '#155724',
          borderRadius: '4px',
          marginBottom: '1rem'
        }}>
          {successMessage}
        </div>
      )}

      <div style={{
        border: '1px solid #ddd',
        borderRadius: '8px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
        backgroundColor: '#fff'
      }}>
        <div style={{ marginBottom: '1rem' }}>
          <span style={{
            backgroundColor: '#e9ecef',
            padding: '0.25rem 0.5rem',
            borderRadius: '4px',
            fontSize: '0.875rem',
            marginRight: '0.5rem'
          }}>
            {freeAction.process}
          </span>
          {isCompleted && (
            <span style={{
              backgroundColor: '#28a745',
              color: '#fff',
              padding: '0.25rem 0.5rem',
              borderRadius: '4px',
              fontSize: '0.875rem',
              fontWeight: 'bold'
            }}>
              ✓ Concluída
            </span>
          )}
        </div>

        <h2 style={{ marginBottom: '1rem' }}>{freeAction.recommendation.title}</h2>

        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>Checklist:</h3>
          <ul style={{ marginLeft: '1.5rem', color: '#666' }}>
            {freeAction.recommendation.checklist.map((item, idx) => (
              <li key={idx} style={{ marginBottom: '0.25rem' }}>{item}</li>
            ))}
          </ul>
        </div>

        <div>
          <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>
            Evidência {hasEvidence && '(já registrada)'}:
          </h3>
          {isCompleted && hasEvidence ? (
            <div style={{
              padding: '1rem',
              backgroundColor: '#f8f9fa',
              borderRadius: '4px',
              border: '1px solid #ddd',
              whiteSpace: 'pre-wrap',
              color: '#333'
            }}>
              {freeAction.evidence!.evidence_text}
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <textarea
                value={evidenceText}
                onChange={(e) => setEvidenceText(e.target.value)}
                placeholder="Descreva a evidência da ação realizada..."
                rows={6}
                disabled={submitting || isCompleted}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  marginBottom: '1rem'
                }}
              />
              {!isCompleted && (
                <button
                  type="submit"
                  disabled={submitting || !evidenceText.trim()}
                  style={{
                    backgroundColor: submitting ? '#6c757d' : '#0070f3',
                    color: '#fff',
                    border: 'none',
                    padding: '0.75rem 1.5rem',
                    borderRadius: '4px',
                    cursor: submitting || !evidenceText.trim() ? 'not-allowed' : 'pointer',
                    fontSize: '1rem',
                    fontWeight: 'bold'
                  }}
                >
                  {submitting ? 'Concluindo...' : 'Concluir'}
                </button>
              )}
            </form>
          )}
        </div>

        {isCompleted && freeAction.completed_at && (
          <div style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#666' }}>
            Concluída em: {new Date(freeAction.completed_at).toLocaleString('pt-BR')}
          </div>
        )}
      </div>
    </div>
  );
}
