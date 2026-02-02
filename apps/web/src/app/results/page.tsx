'use client';

import { Suspense, useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import PaywallModal from '@/components/PaywallModal';

interface Assessment {
  id: string;
  company_id: string;
  type: string;
  status: string;
  created_at: string;
  completed_at: string | null;
}

interface Scores {
  commercial: number;
  operations: number;
  admin_fin: number;
  management: number;
  overall: number;
}

export default function ResultsPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
        <ResultsContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function ResultsContent() {
  const { user, session } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const assessmentId = searchParams.get('assessment_id');

  const [loading, setLoading] = useState(true);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [scores, setScores] = useState<Scores | null>(null);
  const [error, setError] = useState('');
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeError, setUpgradeError] = useState('');
  const [showPaywall, setShowPaywall] = useState(false);

  useEffect(() => {
    if (!assessmentId || !session?.access_token) {
      return;
    }

    const loadResults = async () => {
      try {
        setLoading(true);
        setError('');
        const data = await apiFetch(
          `/assessments/${assessmentId}`,
          {},
          session.access_token
        );
        setAssessment(data.assessment);
        setScores(data.scores);
      } catch (err: any) {
        if (err instanceof ApiError && err.status === 401) {
          router.push('/login');
          return;
        }
        setError(err.message || 'Erro ao carregar resultados');
      } finally {
        setLoading(false);
      }
    };

    loadResults();
  }, [assessmentId, session?.access_token, router]);

  const getScoreColor = (score: number) => {
    if (score >= 7) return '#28a745';
    if (score >= 4) return '#ffc107';
    return '#dc3545';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 7) return 'Bom';
    if (score >= 4) return 'Regular';
    return 'Baixo';
  };

  const handleUpgrade = async () => {
    if (!session?.access_token || !assessment?.company_id) {
      setUpgradeError('Sessão inválida');
      return;
    }

    try {
      setUpgradeLoading(true);
      setUpgradeError('');

      const companyId = assessment.company_id;

      // 1. Registrar evento CLICK_UPGRADE
      await apiFetch('/paywall/events', {
        method: 'POST',
        body: {
          event: 'CLICK_UPGRADE',
          company_id: companyId,
          meta: {
            from: 'results',
            assessment_id: assessmentId
          }
        }
      }, session.access_token);

      if (process.env.NODE_ENV === 'development') {
        console.log('PAYWALL click_upgrade');
      }

      // 2. Tentar acessar FULL
      try {
        const fullData = await apiFetch(
          `/full/diagnostic?company_id=${companyId}`,
          {},
          session.access_token
        );

        if (process.env.NODE_ENV === 'development') {
          console.log('PAYWALL full_gate status=200');
        }

        // 200: navegar para /full
        router.push(`/full?company_id=${companyId}`);
      } catch (fullErr: any) {
        if (fullErr instanceof ApiError && fullErr.status === 403) {
          // 403: mostrar paywall
          if (process.env.NODE_ENV === 'development') {
            console.log('PAYWALL full_gate status=403');
          }
          setShowPaywall(true);
        } else {
          throw fullErr;
        }
      }
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 401) {
        router.push('/login');
        return;
      }
      setUpgradeError(err.message || 'Erro ao processar upgrade');
    } finally {
      setUpgradeLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center' }}>Carregando resultados...</div>
      </div>
    );
  }

  if (error || !assessment) {
    return (
      <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{ color: '#dc3545', marginBottom: '1rem' }}>
          {error || 'Assessment não encontrado'}
        </div>
        <Link href="/diagnostico" style={{ color: '#0070f3' }}>Voltar ao Diagnóstico</Link>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
        Logado como: {user?.email}
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <Link href="/logout" style={{ color: '#0070f3' }}>Sair</Link>
        {' | '}
        <Link href="/diagnostico" style={{ color: '#0070f3' }}>Voltar ao Diagnóstico</Link>
      </div>

      <h1 style={{ marginBottom: '1rem' }}>Resultados do Diagnóstico</h1>

      {assessment.status === 'COMPLETED' && scores ? (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginBottom: '2rem'
          }}>
            <div style={{
              border: '1px solid #ddd',
              borderRadius: '8px',
              padding: '1.5rem',
              textAlign: 'center',
              backgroundColor: '#fff'
            }}>
              <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.5rem' }}>Comercial</div>
              <div style={{
                fontSize: '2rem',
                fontWeight: 'bold',
                color: getScoreColor(scores.commercial),
                marginBottom: '0.25rem'
              }}>
                {scores.commercial.toFixed(1)}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#666' }}>
                {getScoreLabel(scores.commercial)}
              </div>
            </div>

            <div style={{
              border: '1px solid #ddd',
              borderRadius: '8px',
              padding: '1.5rem',
              textAlign: 'center',
              backgroundColor: '#fff'
            }}>
              <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.5rem' }}>Operações</div>
              <div style={{
                fontSize: '2rem',
                fontWeight: 'bold',
                color: getScoreColor(scores.operations),
                marginBottom: '0.25rem'
              }}>
                {scores.operations.toFixed(1)}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#666' }}>
                {getScoreLabel(scores.operations)}
              </div>
            </div>

            <div style={{
              border: '1px solid #ddd',
              borderRadius: '8px',
              padding: '1.5rem',
              textAlign: 'center',
              backgroundColor: '#fff'
            }}>
              <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.5rem' }}>Adm-Fin</div>
              <div style={{
                fontSize: '2rem',
                fontWeight: 'bold',
                color: getScoreColor(scores.admin_fin),
                marginBottom: '0.25rem'
              }}>
                {scores.admin_fin.toFixed(1)}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#666' }}>
                {getScoreLabel(scores.admin_fin)}
              </div>
            </div>

            <div style={{
              border: '1px solid #ddd',
              borderRadius: '8px',
              padding: '1.5rem',
              textAlign: 'center',
              backgroundColor: '#fff'
            }}>
              <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.5rem' }}>Gestão</div>
              <div style={{
                fontSize: '2rem',
                fontWeight: 'bold',
                color: getScoreColor(scores.management),
                marginBottom: '0.25rem'
              }}>
                {scores.management.toFixed(1)}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#666' }}>
                {getScoreLabel(scores.management)}
              </div>
            </div>

            <div style={{
              border: '2px solid #0070f3',
              borderRadius: '8px',
              padding: '1.5rem',
              textAlign: 'center',
              backgroundColor: '#f0f7ff'
            }}>
              <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.5rem' }}>Geral</div>
              <div style={{
                fontSize: '2rem',
                fontWeight: 'bold',
                color: getScoreColor(scores.overall),
                marginBottom: '0.25rem'
              }}>
                {scores.overall.toFixed(1)}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#666' }}>
                {getScoreLabel(scores.overall)}
              </div>
            </div>
          </div>

          <div style={{
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '2rem',
            backgroundColor: '#fff',
            textAlign: 'center'
          }}>
            <h2 style={{ marginBottom: '1rem' }}>Próximos Passos</h2>
            <p style={{ marginBottom: '1.5rem', color: '#666' }}>
              Veja as recomendações personalizadas baseadas nos seus resultados.
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link
                href={`/recommendations?assessment_id=${assessmentId}&company_id=${searchParams.get('company_id') || ''}`}
                style={{
                  display: 'inline-block',
                  backgroundColor: '#0070f3',
                  color: '#fff',
                  padding: '1rem 2rem',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  fontSize: '1.125rem',
                  fontWeight: 'bold',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#0051cc';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#0070f3';
                }}
              >
                Ver Recomendações
              </Link>
              <button
                onClick={handleUpgrade}
                disabled={upgradeLoading}
                style={{
                  backgroundColor: upgradeLoading ? '#6c757d' : '#28a745',
                  color: '#fff',
                  border: 'none',
                  padding: '1rem 2rem',
                  borderRadius: '8px',
                  fontSize: '1.125rem',
                  fontWeight: 'bold',
                  cursor: upgradeLoading ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (!upgradeLoading) {
                    e.currentTarget.style.backgroundColor = '#218838';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!upgradeLoading) {
                    e.currentTarget.style.backgroundColor = '#28a745';
                  }
                }}
              >
                {upgradeLoading ? 'Processando...' : 'Desbloquear diagnóstico completo'}
              </button>
            </div>
            {upgradeError && (
              <div style={{
                marginTop: '1rem',
                padding: '0.75rem',
                backgroundColor: '#f8d7da',
                color: '#721c24',
                borderRadius: '4px',
                fontSize: '0.875rem'
              }}>
                {upgradeError}
              </div>
            )}
          </div>
          {showPaywall && session?.access_token && (
            <PaywallModal
              isOpen={showPaywall}
              onClose={() => setShowPaywall(false)}
              companyId={assessment.company_id}
              accessToken={session.access_token}
            />
          )}
        </>
      ) : (
        <div style={{
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '2rem',
          backgroundColor: '#fff',
          textAlign: 'center'
        }}>
          <p>Diagnóstico ainda não foi concluído.</p>
          <Link href="/diagnostico" style={{ color: '#0070f3' }}>Voltar ao Diagnóstico</Link>
        </div>
      )}
    </div>
  );
}
