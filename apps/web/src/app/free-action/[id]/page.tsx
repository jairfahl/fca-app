'use client';

import { useCallback, useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
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
  const searchParams = useSearchParams();
  const freeActionId = params.id as string;
  const companyId = searchParams.get('company_id');
  const assessmentId = searchParams.get('assessment_id');

  const [loading, setLoading] = useState(true);
  const [freeAction, setFreeAction] = useState<FreeAction | null>(null);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [evidenceText, setEvidenceText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const loadFreeAction = useCallback(async () => {
    if (!freeActionId || !session?.access_token) {
      return;
    }

    try {
      setLoading(true);
      setLoadError('');
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
      setLoadError(err.message || 'Erro ao carregar evidência');
    } finally {
      setLoading(false);
    }
  }, [freeActionId, session?.access_token, router]);

  useEffect(() => {
    loadFreeAction();
  }, [loadFreeAction]);

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

  const backToRecommendations = assessmentId
    ? `/recommendations?assessment_id=${assessmentId}${companyId ? `&company_id=${companyId}` : ''}`
    : '/recommendations';
  const backToResults = assessmentId
    ? `/results?assessment_id=${assessmentId}${companyId ? `&company_id=${companyId}` : ''}`
    : '/results';

  if (!freeAction) {
    if (loadError) {
      return (
        <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
          <h1 style={{ marginBottom: '0.25rem' }}>Evidência</h1>
          <p style={{ marginBottom: '0.5rem', color: '#666' }}>
            Registre o que foi feito e como você comprova.
          </p>
          <div style={{
            padding: '0.75rem',
            backgroundColor: '#fff3cd',
            color: '#856404',
            borderRadius: '6px',
            marginBottom: '1rem',
            fontSize: '0.9rem'
          }}>
            Não foi possível carregar evidência anterior. Você pode salvar uma nova evidência.
          </div>
          <form id="evidence-form-fallback" onSubmit={handleSubmit}>
            <textarea
              value={evidenceText}
              onChange={(e) => setEvidenceText(e.target.value)}
              placeholder="Ex.: criei planilha X, defini rotina Y, anexei print Z..."
              rows={6}
              disabled={submitting}
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
            {error && (
              <div style={{
                padding: '0.5rem 0.75rem',
                backgroundColor: '#f8d7da',
                color: '#721c24',
                borderRadius: '4px',
                marginBottom: '1rem',
                fontSize: '0.875rem'
              }}>
                {error}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                type="submit"
                disabled={submitting || !evidenceText.trim()}
                style={{
                  backgroundColor: submitting || !evidenceText.trim() ? '#9ca3af' : '#0070f3',
                  color: '#fff',
                  border: 'none',
                  padding: '0.75rem 1.25rem',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  cursor: submitting || !evidenceText.trim() ? 'not-allowed' : 'pointer'
                }}
              >
                {submitting ? 'Salvando...' : 'Salvar evidência'}
              </button>
              <Link
                href={backToRecommendations}
                style={{
                  display: 'inline-block',
                  backgroundColor: '#e9ecef',
                  color: '#333',
                  padding: '0.75rem 1.25rem',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  fontWeight: 'bold'
                }}
              >
                Voltar para Recomendações
              </Link>
              <Link
                href={backToResults}
                style={{
                  display: 'inline-block',
                  backgroundColor: '#e9ecef',
                  color: '#333',
                  padding: '0.75rem 1.25rem',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  fontWeight: 'bold'
                }}
              >
                Voltar para Resultados
              </Link>
            </div>
          </form>
        </div>
      );
    }

    return (
      <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ color: '#dc3545' }}>Ação gratuita não encontrada.</div>
        <Link href="/diagnostico" style={{ color: '#0070f3' }}>Voltar ao Diagnóstico</Link>
      </div>
    );
  }

  const isCompleted = freeAction.status === 'COMPLETED';
  const hasEvidence = freeAction.evidence !== null;

  const backToRecommendationsFromData = freeAction.assessment_id
    ? `/recommendations?assessment_id=${freeAction.assessment_id}${companyId ? `&company_id=${companyId}` : ''}`
    : backToRecommendations;
  const backToResultsFromData = freeAction.assessment_id
    ? `/results?assessment_id=${freeAction.assessment_id}${companyId ? `&company_id=${companyId}` : ''}`
    : backToResults;

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1rem', color: '#666' }}>
        Logado como: {user?.email}
      </div>

      <h1 style={{ marginBottom: '0.25rem' }}>Evidência</h1>
      <p style={{ marginBottom: '1.5rem', color: '#666' }}>
        Registre o que foi feito e como você comprova.
      </p>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        {!isCompleted && (
          <button
            type="submit"
            form="evidence-form"
            disabled={submitting || !evidenceText.trim()}
            style={{
              backgroundColor: submitting || !evidenceText.trim() ? '#9ca3af' : '#0070f3',
              color: '#fff',
              border: 'none',
              padding: '0.75rem 1.25rem',
              borderRadius: '8px',
              fontWeight: 'bold',
              cursor: submitting || !evidenceText.trim() ? 'not-allowed' : 'pointer'
            }}
          >
            {submitting ? 'Salvando...' : 'Salvar evidência'}
          </button>
        )}
        <Link
          href={backToRecommendationsFromData}
          style={{
            display: 'inline-block',
            backgroundColor: '#e9ecef',
            color: '#333',
            padding: '0.75rem 1.25rem',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: 'bold'
          }}
        >
          Voltar para Recomendações
        </Link>
        <Link
          href={backToResultsFromData}
          style={{
            display: 'inline-block',
            backgroundColor: '#e9ecef',
            color: '#333',
            padding: '0.75rem 1.25rem',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: 'bold'
          }}
        >
          Voltar para Resultados
        </Link>
      </div>

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
            <form id="evidence-form" onSubmit={handleSubmit}>
              <textarea
                value={evidenceText}
                onChange={(e) => setEvidenceText(e.target.value)}
                placeholder="Ex.: criei planilha X, defini rotina Y, anexei print Z..."
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
