'use client';

import { Suspense, useState, useEffect, useMemo } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import { Entitlement, getEntitlement } from '@/lib/entitlement';

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

type ProcessKey = 'COMERCIAL' | 'OPERACOES' | 'ADM_FIN' | 'GESTAO';

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
  const companyId = searchParams.get('company_id');

  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [error, setError] = useState('');
  const [selecting, setSelecting] = useState<string | null>(null);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [lightSelections, setLightSelections] = useState<Record<string, string> | null>(null);

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

  useEffect(() => {
    if (!companyId || !session?.access_token) {
      return;
    }

    const loadEntitlement = async () => {
      const data = await getEntitlement(companyId, session.access_token);
      setEntitlement(data);
    };

    loadEntitlement();
  }, [companyId, session?.access_token]);

  const localStorageKey = useMemo(() => {
    const companyKey = companyId || 'unknown_company';
    const assessmentKey = assessmentId || 'unknown_assessment';
    return `light_selected_actions:${companyKey}:${assessmentKey}`;
  }, [companyId, assessmentId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(localStorageKey);
      if (!raw) {
        setLightSelections(null);
        return;
      }
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        setLightSelections(parsed);
      } else {
        setLightSelections(null);
      }
    } catch {
      setLightSelections(null);
    }
  }, [localStorageKey]);

  const persistLightSelection = (process: ProcessKey, recommendationId: string) => {
    const next = {
      ...(lightSelections || {}),
      [process]: recommendationId,
    } as Record<ProcessKey, string>;
    setLightSelections(next);
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(localStorageKey, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

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

  const badgeBase: Record<string, string | number> = {
    padding: '0.25rem 0.5rem',
    borderRadius: '999px',
    fontSize: '0.75rem',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: '0.02em'
  };

  const hasFullAccess = entitlement?.plan === 'FULL' && entitlement?.status === 'ACTIVE';
  const isLight = !hasFullAccess;
  const processOrder: ProcessKey[] = ['COMERCIAL', 'OPERACOES', 'ADM_FIN', 'GESTAO'];
  const processLabels: Record<ProcessKey, string> = {
    COMERCIAL: 'Comercial',
    OPERACOES: 'Operações',
    ADM_FIN: 'Adm/Fin',
    GESTAO: 'Gestão',
  };
  const recommendationTitleById = recommendations.reduce<Record<string, string>>((acc, rec) => {
    acc[rec.recommendation_id] = rec.title;
    return acc;
  }, {});

  if (loading) {
    return (
      <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center' }}>Carregando recomendações...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '0.75rem', color: '#666', fontSize: '0.9rem' }}>
        Logado como: {user?.email}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
        <div style={{ color: '#666' }}>
          <Link href={companyId ? `/diagnostico?company_id=${companyId}` : '/diagnostico'} style={{ color: '#0070f3', textDecoration: 'none' }}>
            Diagnóstico
          </Link>
          {' / '}
          <Link href={`/results?assessment_id=${assessmentId}&company_id=${companyId || ''}`} style={{ color: '#0070f3', textDecoration: 'none' }}>
            Resultados
          </Link>
          {' / '}
          <span>Recomendações</span>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Link
            href={`/results?assessment_id=${assessmentId}&company_id=${companyId || ''}`}
            style={{
              display: 'inline-block',
              backgroundColor: '#0070f3',
              color: '#fff',
              padding: '0.6rem 1rem',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: 'bold',
              fontSize: '0.9rem'
            }}
          >
            Voltar para Resultados
          </Link>
          <Link
            href={companyId ? `/diagnostico?company_id=${companyId}` : '/diagnostico'}
            style={{
              display: 'inline-block',
              backgroundColor: '#e9ecef',
              color: '#333',
              padding: '0.6rem 1rem',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: 'bold',
              fontSize: '0.9rem'
            }}
          >
            Voltar ao Diagnóstico
          </Link>
        </div>
      </div>

      <h1 style={{ marginBottom: '0.25rem' }}>Recomendações</h1>
      <p style={{ marginBottom: '1.5rem', color: '#666' }}>
        Selecione as ações prioritárias e avance para execução.
      </p>

      {lightSelections && (
        <div style={{
          border: '1px solid #e9ecef',
          borderRadius: '8px',
          padding: '1rem',
          backgroundColor: '#f8f9fa',
          marginBottom: '1.5rem'
        }}>
          <h2 style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>
            Suas ações escolhidas (LIGHT)
          </h2>
          <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {processOrder.map((process) => {
              const actionId = lightSelections[process];
              if (!actionId) return null;
              return (
                <div key={process} style={{ fontSize: '0.9rem', color: '#555' }}>
                  <strong>{processLabels[process]}</strong>: {recommendationTitleById[actionId] || actionId}
                </div>
              );
            })}
          </div>
          <Link
            href={`/results?assessment_id=${assessmentId}&company_id=${companyId}#light-actions`}
            style={{
              display: 'inline-block',
              backgroundColor: '#0070f3',
              color: '#fff',
              padding: '0.5rem 0.9rem',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 'bold',
              fontSize: '0.875rem'
            }}
          >
            Editar ações
          </Link>
        </div>
      )}

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
                    ...badgeBase,
                    backgroundColor: '#0070f3',
                    color: '#fff'
                  }}>
                    #{rec.rank}
                  </span>
                  <span style={{
                    ...badgeBase,
                    backgroundColor: '#e9ecef',
                    color: '#333'
                  }}>
                    {rec.process}
                  </span>
                </div>
                <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem' }}>{rec.title}</h2>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{
                  ...badgeBase,
                  backgroundColor: getRiskColor(rec.risk),
                  color: '#fff'
                }}>
                  Risco: {rec.risk}
                </span>
                <span style={{
                  ...badgeBase,
                  backgroundColor: getImpactColor(rec.impact),
                  color: '#fff'
                }}>
                  Impacto: {rec.impact}
                </span>
              </div>
            </div>

            <p style={{ marginBottom: '1rem', color: '#666' }}>{rec.why}</p>

            <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              {isLight ? (
                <button
                  onClick={() => persistLightSelection(rec.process as ProcessKey, rec.recommendation_id)}
                  style={{
                    backgroundColor: lightSelections?.[rec.process as ProcessKey] === rec.recommendation_id ? '#28a745' : '#0070f3',
                    color: '#fff',
                    border: 'none',
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 'bold'
                  }}
                >
                  {lightSelections?.[rec.process as ProcessKey] === rec.recommendation_id ? 'Selecionada' : 'Selecionar'}
                </button>
              ) : (
                <>
                  {rec.is_free_eligible && (
                    <button
                      onClick={() => handleSelectFree(rec.recommendation_id)}
                      disabled={selecting === rec.recommendation_id}
                      style={{
                        backgroundColor: rec.is_selected_free ? '#28a745' : '#0070f3',
                        color: '#fff',
                        border: 'none',
                        padding: '0.5rem 1rem',
                        borderRadius: '6px',
                        cursor: selecting === rec.recommendation_id ? 'not-allowed' : 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: 'bold'
                      }}
                    >
                      {rec.is_selected_free ? 'Selecionada' : 'Selecionar'}
                    </button>
                  )}
                  {rec.is_selected_free && (
                    <button
                      onClick={() => handleSelectFree(rec.recommendation_id)}
                      disabled={selecting === rec.recommendation_id}
                      style={{
                        backgroundColor: '#e9ecef',
                        color: '#333',
                        border: 'none',
                        padding: '0.5rem 1rem',
                        borderRadius: '6px',
                        cursor: selecting === rec.recommendation_id ? 'not-allowed' : 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: 'bold'
                      }}
                    >
                      Registrar evidência
                    </button>
                  )}
                </>
              )}
              {rec.is_locked && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>🔒</span>
                  <span style={{ color: '#666' }}>Disponível no FULL</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {companyId && (
        <div style={{
          border: '1px solid #e9ecef',
          borderRadius: '8px',
          padding: '1.5rem',
          backgroundColor: '#f8f9fa',
          marginTop: '2rem'
        }}>
          <h2 style={{ marginBottom: '0.5rem' }}>Aprofunde com o FULL</h2>
          <p style={{ marginBottom: '1rem', color: '#666' }}>
            Destrave análises completas e próximos passos.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link
              href={`/full/diagnostic?company_id=${companyId}`}
              style={{
                display: 'inline-block',
                backgroundColor: '#0070f3',
                color: '#fff',
                padding: '0.6rem 1rem',
                borderRadius: '8px',
                textDecoration: 'none',
                fontWeight: 'bold'
              }}
            >
              Diagnóstico FULL
            </Link>
            <Link
              href={`/full?company_id=${companyId}#initiatives`}
              style={{
                display: 'inline-block',
                backgroundColor: '#e9ecef',
                color: '#333',
                padding: '0.6rem 1rem',
                borderRadius: '8px',
                textDecoration: 'none',
                fontWeight: 'bold'
              }}
            >
              Iniciativas
            </Link>
            <Link
              href={`/full?company_id=${companyId}#summary`}
              style={{
                display: 'inline-block',
                backgroundColor: '#e9ecef',
                color: '#333',
                padding: '0.6rem 1rem',
                borderRadius: '8px',
                textDecoration: 'none',
                fontWeight: 'bold'
              }}
            >
              Resumo
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
