'use client';

import { Suspense, useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/auth';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import PaywallModal from '@/components/PaywallModal';
import TriageModal from '@/components/TriageModal';
import PageHeader from '@/components/ui/PageHeader';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Alert from '@/components/ui/Alert';

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

interface TeaserItem {
  title: string;
  process: string;
  impact: string;
  dependency_phrase: string | null;
  next_best_action_phrase: string | null;
}

interface TeaserData {
  items: TeaserItem[];
  locked_count: number;
  inaction_cost: string | null;
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
  const companyIdParam = searchParams.get('company_id');

  const [loading, setLoading] = useState(true);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [scores, setScores] = useState<Scores | null>(null);
  const [error, setError] = useState('');
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeError, setUpgradeError] = useState('');
  const [showPaywall, setShowPaywall] = useState(false);
  const [teaserData, setTeaserData] = useState<TeaserData | null>(null);
  const [teaserLoading, setTeaserLoading] = useState(false);
  const [teaserError, setTeaserError] = useState(false);
  const [showTriageModal, setShowTriageModal] = useState(false);
  const [triageSubmitted, setTriageSubmitted] = useState(false);
  const fullAccessMode = (process.env.NEXT_PUBLIC_FULL_ACCESS_MODE || 'ENFORCED').toUpperCase();

  const diagnosticoHref = assessment?.company_id
    ? `/diagnostico?company_id=${assessment.company_id}`
    : (companyIdParam ? `/diagnostico?company_id=${companyIdParam}` : '/diagnostico');
  const resultsHref = assessmentId ? `/results?assessment_id=${assessmentId}${(assessment?.company_id || companyIdParam) ? `&company_id=${assessment?.company_id || companyIdParam}` : ''}` : '/results';
  const recommendationsHref = assessmentId ? `/recommendations?assessment_id=${assessmentId}${(assessment?.company_id || companyIdParam) ? `&company_id=${assessment?.company_id || companyIdParam}` : ''}` : '/recommendations';
  const fullDiagnosticHref = assessmentId ? `/full/diagnostic?assessment_id=${assessmentId}` : '/full/diagnostic';
  const fullInitiativesHref = assessmentId ? `/full/initiatives?assessment_id=${assessmentId}` : '/full/initiatives';
  const fullSummaryHref = assessmentId ? `/full/summary?assessment_id=${assessmentId}` : '/full/summary';

  useEffect(() => {
    if (!assessmentId && session?.access_token) {
      setLoading(false);
      setError('assessment_id é obrigatório');
    }
  }, [assessmentId, session?.access_token]);

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

  // Carregar teaser FULL quando assessment estiver completo
  useEffect(() => {
    if (!assessmentId || !session?.access_token || !assessment || assessment.status !== 'COMPLETED') {
      return;
    }

    const loadTeaser = async () => {
      try {
        setTeaserLoading(true);
        const data = await apiFetch(
          `/assessments/${assessmentId}/full-teaser`,
          {},
          session.access_token
        );
        setTeaserData(data);
        setTeaserError(false);
      } catch (err: any) {
        setTeaserError(true);
      } finally {
        setTeaserLoading(false);
      }
    };

    loadTeaser();
  }, [assessmentId, session?.access_token, assessment]);

  const getScoreColor = (score: number) => {
    if (score >= 7) return '#28a745';
    if (score >= 4) return '#ffc107';
    return '#dc3545';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 9) return 'Forte';
    if (score >= 7) return 'Organizado';
    if (score >= 4) return 'Frágil';
    return 'Crítico';
  };

  const getReadingText = (score: number) => {
    if (score <= 3) {
      return 'Está desorganizado. Hoje você depende de improviso e apaga incêndio. Isso drena caixa e trava crescimento.';
    }
    if (score <= 6) {
      return 'Funciona, mas é instável. Você consegue tocar, porém perde venda/tempo por falta de rotina e controle.';
    }
    if (score <= 8) {
      return 'Está organizado. Há rotina e controle mínimo. O ganho agora vem de padronizar e cobrar consistência.';
    }
    return 'Está forte. Você tem disciplina e controle. O foco é manter padrão e escalar sem perder qualidade.';
  };

  const getWorstProcess = (scores: Scores) => {
    const entries = [
      { key: 'Comercial', value: scores.commercial },
      { key: 'Operações', value: scores.operations },
      { key: 'Adm/Fin', value: scores.admin_fin },
      { key: 'Gestão', value: scores.management }
    ];
    return entries.reduce((min, cur) => (cur.value < min.value ? cur : min), entries[0]);
  };

  const handleTriageSubmit = async (data: { pain: string; horizon: string; budget_monthly: string }) => {
    if (!session?.access_token || !assessment) {
      throw new Error('Sessão inválida');
    }

    await apiFetch('/leads/triage', {
      method: 'POST',
      body: {
        company_id: assessment.company_id,
        assessment_id: assessment.id,
        pain: data.pain,
        horizon: data.horizon,
        budget_monthly: data.budget_monthly,
        consent: true
      }
    }, session.access_token);

    setTriageSubmitted(true);
  };

  const handleUpgrade = async () => {
    if (!session?.access_token || !assessment?.company_id) {
      setUpgradeError('Sessão inválida');
      return;
    }

    try {
      if (fullAccessMode === 'BYPASS_DEV') {
        const target = assessmentId
          ? `/full/diagnostic?assessment_id=${assessmentId}`
          : `/full/diagnostic?company_id=${assessment.company_id}`;
        router.push(target);
        return;
      }

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
      <AppShell showLogout userEmail={user?.email}>
        <PageHeader title="Resultados" subtitle="Resumo do seu diagnóstico." breadcrumbs={<Breadcrumbs />} />
        <div style={{ textAlign: 'center' }}>Carregando resultados...</div>
      </AppShell>
    );
  }

  if (error || !assessment) {
    return (
      <AppShell showLogout userEmail={user?.email}>
        <PageHeader title="Resultados" subtitle="Resumo do seu diagnóstico." breadcrumbs={<Breadcrumbs />} />
        <div style={{ color: '#dc3545', marginBottom: '1rem' }}>
          {error || 'Assessment não encontrado'}
        </div>
        <Link href={diagnosticoHref} style={{ color: '#0070f3' }}>Voltar ao Diagnóstico</Link>
      </AppShell>
    );
  }

  return (
    <AppShell showLogout userEmail={user?.email}>
      <PageHeader title="Resultados" subtitle="Seu diagnóstico rápido." breadcrumbs={<Breadcrumbs />} />

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

          <div style={{ marginBottom: '2rem' }}>
            <Card>
              <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>O que isso significa</div>
              <div style={{ color: '#555' }}>
                Seus scores mostram onde estão os gargalos mais críticos. Foque primeiro nas áreas com menor nota para
                gerar ganhos rápidos, e depois avance para as melhorias estruturais.
              </div>
            </Card>
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <div style={{ marginBottom: '1rem', fontWeight: 'bold' }}>Leitura rápida por processo</div>
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '1rem' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Comercial</div>
                <div style={{ color: '#555' }}>{getReadingText(scores.commercial)}</div>
              </div>
              <div style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '1rem' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Operações</div>
                <div style={{ color: '#555' }}>{getReadingText(scores.operations)}</div>
              </div>
              <div style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '1rem' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Adm/Fin</div>
                <div style={{ color: '#555' }}>{getReadingText(scores.admin_fin)}</div>
              </div>
              <div style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '1rem' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Gestão</div>
                <div style={{ color: '#555' }}>{getReadingText(scores.management)}</div>
              </div>
            </div>
          </div>

          <div style={{
            marginBottom: '2rem',
            padding: '1rem',
            borderRadius: '8px',
            backgroundColor: '#f8f9fa',
            border: '1px solid #ddd'
          }}>
            {(() => {
              const worst = getWorstProcess(scores);
              return (
                <div style={{ fontWeight: 'bold' }}>
                  Comece pelo básico em {worst.key}: crie uma rotina semanal e cobre execução por 7 dias.
                </div>
              );
            })()}
          </div>

          <div style={{
            border: '2px solid #0070f3',
            borderRadius: '8px',
            padding: '1.5rem',
            backgroundColor: '#f0f7ff',
            marginBottom: '2rem'
          }}>
            <h2 style={{ marginBottom: '1rem', color: '#0070f3' }}>Teaser FULL</h2>

            {teaserLoading && (
              <div style={{ color: '#666' }}>Carregando teaser...</div>
            )}

            {(!teaserLoading && (!teaserData || teaserData.items.length === 0) || teaserError) && (
              <div style={{ color: '#666' }}>Teaser FULL indisponível no momento (modo teste/paywall).</div>
            )}

            {!teaserLoading && teaserData && teaserData.items.length > 0 && (
              <>
                <div style={{ marginBottom: '1rem' }}>
                  {teaserData.items.map((item, index) => (
                    <div
                      key={index}
                      style={{
                        marginBottom: '0.75rem',
                        padding: '0.75rem',
                        backgroundColor: '#fff',
                        borderRadius: '4px',
                        border: '1px solid #ddd'
                      }}
                    >
                      <div style={{ fontWeight: 'bold' }}>{item.title}</div>
                      <div style={{ fontSize: '0.875rem', color: '#666' }}>
                        Impacto: {item.impact || '—'}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{
                  padding: '0.75rem',
                  backgroundColor: '#fff',
                  borderRadius: '4px',
                  textAlign: 'center',
                  border: '1px dashed #0070f3'
                }}>
                  +{teaserData.locked_count || 9} bloqueadas
                </div>
              </>
            )}
          </div>

          {scores && (scores.commercial <= 3 || scores.operations <= 3 || scores.admin_fin <= 3 || scores.management <= 3) && (
            <div style={{
              marginBottom: '2rem',
              padding: '1rem',
              backgroundColor: '#fff3cd',
              borderRadius: '8px',
              border: '1px solid #ffeeba',
              color: '#856404'
            }}>
              Se você não atacar o gargalo crítico agora, o padrão é: caixa apertado, venda irregular e retrabalho. Não é falta de esforço — é falta de rotina.
            </div>
          )}

          {triageSubmitted && (
            <div style={{
              marginBottom: '1.5rem',
              padding: '1rem',
              backgroundColor: '#d4edda',
              color: '#155724',
              borderRadius: '4px',
              border: '1px solid #c3e6cb'
            }}>
              <p style={{ margin: 0 }}>
                ✓ Sua solicitação foi enviada. Entraremos em contato em breve.
              </p>
            </div>
          )}

          <Card>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button href={recommendationsHref}>Ver recomendações</Button>
              <Button variant="ghost" href={diagnosticoHref}>Refazer diagnóstico</Button>
            </div>
          </Card>

          <div style={{ marginTop: '1.5rem' }}>
            <Card>
              <div style={{ marginBottom: '1rem', fontWeight: 'bold' }}>Aprofunde com o FULL</div>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <Button onClick={handleUpgrade} disabled={upgradeLoading}>
                  {upgradeLoading ? 'Processando...' : 'Liberar Relatório Executivo Completo (FULL)'}
                </Button>
                <Button variant="ghost" onClick={() => setShowTriageModal(true)} disabled={triageSubmitted}>
                  {triageSubmitted ? 'Solicitação enviada ✓' : 'Falar com consultor'}
                </Button>
              </div>
              {upgradeError && (
                <div style={{ marginTop: '1rem' }}>
                  <Alert variant="error">{upgradeError}</Alert>
                </div>
              )}
            </Card>
          </div>
          {showPaywall && session?.access_token && (
            <PaywallModal
              isOpen={showPaywall}
              onClose={() => setShowPaywall(false)}
              companyId={assessment.company_id}
              accessToken={session.access_token}
            />
          )}
          {showTriageModal && assessment && (
            <TriageModal
              isOpen={showTriageModal}
              onClose={() => setShowTriageModal(false)}
              onSubmit={handleTriageSubmit}
              companyId={assessment.company_id}
              assessmentId={assessment.id}
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
          <Link href={diagnosticoHref} style={{ color: '#0070f3' }}>Voltar ao Diagnóstico</Link>
        </div>
      )}
    </AppShell>
  );
}
