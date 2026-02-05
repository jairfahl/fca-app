'use client';

import { Suspense, useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';

interface Recommendation {
  recommendation_id: string;
  process: string;
  title: string;
  why: string;
  risk: 'HIGH' | 'MED' | 'LOW';
  impact: 'HIGH' | 'MED' | 'LOW';
  checklist: string[];
  rank: number;
  is_free_eligible: boolean;
  is_selected_free: boolean;
  is_locked: boolean;
}

export default function RecommendationsPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
        <RecommendationsContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function RecommendationsContent() {
  const { user, session } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const assessmentId = searchParams.get('assessment_id');

  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [error, setError] = useState('');
  const [selecting, setSelecting] = useState<string | null>(null);

  useEffect(() => {
    if (!assessmentId || !session?.access_token) {
      return;
    }

    const loadRecommendations = async () => {
      try {
        setLoading(true);
        setError('');
        const data = await apiFetch(
          `/assessments/${assessmentId}/recommendations`,
          {},
          session.access_token
        );
        setRecommendations(data || []);
      } catch (err: any) {
        if (err instanceof ApiError && err.status === 401) {
          router.push('/login');
          return;
        }
        setError(err.message || 'Erro ao carregar recomendações');
      } finally {
        setLoading(false);
      }
    };

    loadRecommendations();
  }, [assessmentId, session?.access_token, router]);

  const handleSelectFree = async (recommendationId: string) => {
    if (!assessmentId || !session?.access_token) {
      return;
    }

    try {
      setSelecting(recommendationId);
      setError('');
      const freeAction = await apiFetch(
        `/assessments/${assessmentId}/free-actions/select`,
        {
          method: 'POST',
          body: { recommendation_id: recommendationId },
        },
        session.access_token
      );
      // Navegar para a tela de free action
      router.push(`/free-action/${freeAction.id}`);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 401) {
        router.push('/login');
        return;
      }
      setError(err.message || 'Erro ao selecionar ação gratuita');
      setSelecting(null);
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'HIGH': return '#dc3545';
      case 'MED': return '#ffc107';
      case 'LOW': return '#28a745';
      default: return '#6c757d';
    }
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'HIGH': return '#dc3545';
      case 'MED': return '#ffc107';
      case 'LOW': return '#28a745';
      default: return '#6c757d';
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center' }}>Carregando recomendações...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
        Logado como: {user?.email}
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <Link href="/logout" style={{ color: '#0070f3' }}>Sair</Link>
        {' | '}
        <Link href={`/diagnostico?company_id=${searchParams.get('company_id') || ''}`} style={{ color: '#0070f3' }}>
          Voltar ao Diagnóstico
        </Link>
      </div>

      <h1 style={{ marginBottom: '1rem' }}>Recomendações</h1>

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

      {recommendations.length === 0 && !loading && (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          Nenhuma recomendação encontrada.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {recommendations.map((rec) => (
          <div
            key={rec.recommendation_id}
            style={{
              border: '1px solid #ddd',
              borderRadius: '8px',
              padding: '1.5rem',
              backgroundColor: rec.is_locked ? '#f8f9fa' : '#fff',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <span style={{
                    backgroundColor: '#0070f3',
                    color: '#fff',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px',
                    fontSize: '0.875rem',
                    fontWeight: 'bold'
                  }}>
                    #{rec.rank}
                  </span>
                  <span style={{
                    backgroundColor: '#e9ecef',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px',
                    fontSize: '0.875rem'
                  }}>
                    {rec.process}
                  </span>
                </div>
                <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem' }}>{rec.title}</h2>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{
                  backgroundColor: getRiskColor(rec.risk),
                  color: '#fff',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '4px',
                  fontSize: '0.75rem'
                }}>
                  Risco: {rec.risk}
                </span>
                <span style={{
                  backgroundColor: getImpactColor(rec.impact),
                  color: '#fff',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '4px',
                  fontSize: '0.75rem'
                }}>
                  Impacto: {rec.impact}
                </span>
              </div>
            </div>

            <p style={{ marginBottom: '1rem', color: '#666' }}>{rec.why}</p>

            <div style={{ marginBottom: '1rem' }}>
              {rec.is_selected_free && (
                <span style={{
                  backgroundColor: '#28a745',
                  color: '#fff',
                  padding: '0.5rem 1rem',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                  fontWeight: 'bold'
                }}>
                  ✓ Selecionada grátis
                </span>
              )}
              {rec.is_free_eligible && !rec.is_selected_free && (
                <button
                  onClick={() => handleSelectFree(rec.recommendation_id)}
                  disabled={selecting === rec.recommendation_id}
                  style={{
                    backgroundColor: '#0070f3',
                    color: '#fff',
                    border: 'none',
                    padding: '0.5rem 1rem',
                    borderRadius: '4px',
                    cursor: selecting === rec.recommendation_id ? 'not-allowed' : 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 'bold'
                  }}
                >
                  {selecting === rec.recommendation_id ? 'Processando...' : 'Executar grátis'}
                </button>
              )}
              {rec.is_locked && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>🔒</span>
                  <span style={{ color: '#666' }}>Bloqueada</span>
                  <button
                    style={{
                      backgroundColor: '#6c757d',
                      color: '#fff',
                      border: 'none',
                      padding: '0.5rem 1rem',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      marginLeft: '0.5rem'
                    }}
                  >
                    CTA Full
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
