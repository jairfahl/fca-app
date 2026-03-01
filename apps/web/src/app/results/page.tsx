'use client';

import { Suspense, useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import { Entitlement, getEntitlement } from '@/lib/entitlement';
import { assertFullAccess } from '@/lib/fullGuard';
import { AssinarFullButton } from '@/components/AssinarFullButton';
import PedirAjudaConsultor from '@/components/PedirAjudaConsultor';
import { labels } from '@/lib/uiCopy';
import {
  type ProcessKey,
  PROCESS_ORDER,
  PROCESS_LABELS,
  getNaLataByProcessAndScore,
} from '@/lib/lightRecommendations';

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

type LightRecommendation = {
  process: ProcessKey;
  title: string;
  why: string;
};

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
  const companyId = searchParams.get('company_id');

  const [loading, setLoading] = useState(true);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [scores, setScores] = useState<Scores | null>(null);
  const [error, setError] = useState('');
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [lightRecommendations, setLightRecommendations] = useState<LightRecommendation[]>([]);
  const [recLoading, setRecLoading] = useState(true);
  const [recError, setRecError] = useState('');

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
    if (score >= 8) return 'Forte';
    if (score >= 6) return 'Organizado';
    if (score >= 3) return 'Frágil';
    return 'Crítico';
  };

  const getProcessScore = (process: ProcessKey) => {
    if (!scores) return null;
    switch (process) {
      case 'COMERCIAL':
        return scores.commercial;
      case 'OPERACOES':
        return scores.operations;
      case 'ADM_FIN':
        return scores.admin_fin;
      case 'GESTAO':
        return scores.management;
      default:
        return null;
    }
  };

  const processOrder = PROCESS_ORDER;
  const processLabels = PROCESS_LABELS;
  const processHints: Record<ProcessKey, { achado: string; impacto: string; recomendacao: string }> = {
    COMERCIAL: {
      achado: 'Gargalo em geração e fechamento de oportunidades.',
      impacto: 'Vendas perdidas e ciclo comercial mais longo.',
      recomendacao: 'Padronizar rotina de prospecção e follow-up.',
    },
    OPERACOES: {
      achado: 'Execução com pouca padronização.',
      impacto: 'Atrasos, retrabalho e custo operacional maior.',
      recomendacao: 'Criar checklist e responsável por etapa.',
    },
    ADM_FIN: {
      achado: 'Controle financeiro inconsistente.',
      impacto: 'Baixa previsibilidade de caixa e margem.',
      recomendacao: 'Atualizar fluxo de caixa semanalmente.',
    },
    GESTAO: {
      achado: 'Metas e acompanhamento pouco estruturados.',
      impacto: 'Equipe sem direção clara e baixa cadência.',
      recomendacao: 'Definir metas trimestrais e rituais semanais.',
    },
  };

  const buildRadiograph = () => {
    if (!scores) return [];
    const ranked = processOrder
      .map((process) => ({ process, score: getProcessScore(process) ?? 0 }))
      .sort((a, b) => {
        if (a.score !== b.score) return a.score - b.score;
        return processOrder.indexOf(a.process) - processOrder.indexOf(b.process);
      })
      .slice(0, 3);

    const sections = ['Dinheiro', 'Cliente', 'Risco'] as const;
    return sections.map((section, idx) => {
      const item = ranked[idx] || ranked[0];
      const hint = processHints[item.process];
      const custo = item.score <= 3 ? 'alto' : item.score <= 6 ? 'médio' : 'baixo';
      return {
        section,
        process: item.process,
        achado: hint.achado,
        impacto: hint.impacto,
        custo,
        recomendacao: hint.recomendacao,
      };
    });
  };

  useEffect(() => {
    const entCompanyId = assessment?.company_id || companyId;
    if (!entCompanyId || !session?.access_token) {
      return;
    }

    const loadEntitlement = async () => {
      const data = await getEntitlement(entCompanyId, session.access_token);
      setEntitlement(data);
    };

    loadEntitlement();
  }, [assessment?.company_id, companyId, session?.access_token]);

  useEffect(() => {
    if (!assessmentId || !session?.access_token) {
      return;
    }

    const loadRecommendations = async () => {
      let pickedRecommendations: LightRecommendation[] = [];
      try {
        setRecLoading(true);
        setRecError('');
        const data = await apiFetch(
          `/assessments/${assessmentId}/recommendations`,
          {},
          session.access_token
        );
        if (Array.isArray(data)) {
          const byProcess: Record<ProcessKey, LightRecommendation | null> = {
            COMERCIAL: null,
            OPERACOES: null,
            ADM_FIN: null,
            GESTAO: null,
          };

          data.forEach((rec: any) => {
            const proc = rec?.process as ProcessKey;
            if (!byProcess[proc]) {
              byProcess[proc] = {
                process: proc,
                title: rec?.title || '',
                why: rec?.why || '',
              };
            }
          });

          const picked = (Object.values(byProcess).filter(Boolean) as LightRecommendation[]);
          pickedRecommendations = picked;
          if (pickedRecommendations.length === 0) {
            setRecError('Catálogo vazio. Mostrando sugestões padrão.');
            pickedRecommendations = [
              { process: 'COMERCIAL', title: 'Criar rotina semanal de prospecção', why: 'Acelere a entrada de novas oportunidades com rotina simples.' },
              { process: 'OPERACOES', title: 'Padronizar entrega com checklist e responsável', why: 'Reduza retrabalho e aumente consistência na entrega.' },
              { process: 'ADM_FIN', title: 'Organizar fluxo de caixa (D+7)', why: 'Tenha previsibilidade mínima para decisões semanais.' },
              { process: 'GESTAO', title: 'Definir metas trimestrais e ritual de acompanhamento', why: 'Direcione a equipe com metas claras e revisão frequente.' },
            ];
          }
        }
      } catch {
        setRecError('Não foi possível carregar recomendações rápidas.');
        pickedRecommendations = [
          { process: 'COMERCIAL', title: 'Criar rotina semanal de prospecção', why: 'Acelere a entrada de novas oportunidades com rotina simples.' },
          { process: 'OPERACOES', title: 'Padronizar entrega com checklist e responsável', why: 'Reduza retrabalho e aumente consistência na entrega.' },
          { process: 'ADM_FIN', title: 'Organizar fluxo de caixa (D+7)', why: 'Tenha previsibilidade mínima para decisões semanais.' },
          { process: 'GESTAO', title: 'Definir metas trimestrais e ritual de acompanhamento', why: 'Direcione a equipe com metas claras e revisão frequente.' },
        ];
      } finally {
        setLightRecommendations(pickedRecommendations);
        setRecLoading(false);
      }
    };

    loadRecommendations();
  }, [assessmentId, session?.access_token]);

  const buildWhy = (process: ProcessKey, fallbackWhy: string) => {
    const score = getProcessScore(process);
    if (score === null) return fallbackWhy || 'Uma melhoria simples agora acelera os próximos resultados.';
    if (score < 4) {
      return 'Este ponto está baixo. Uma ação direta aqui tende a gerar ganho rápido.';
    }
    if (score < 7) {
      return 'Há espaço claro para evoluir com um ajuste simples nesta área.';
    }
    return 'Mesmo com bom desempenho, padronizar agora ajuda a manter consistência.';
  };

  const hasFullAccess = assertFullAccess(entitlement, user?.email);

  if (!assessmentId) {
    return (
      <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{ color: '#dc3545', marginBottom: '1rem' }}>
          {labels.assessmentNotInformed}
        </div>
        <Link href={companyId ? `/diagnostico?company_id=${companyId}` : '/diagnostico'} style={{ color: '#0070f3', fontWeight: 'bold' }}>
          Voltar
        </Link>
      </div>
    );
  }

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
          {error || labels.assessmentNotFound}
        </div>
        <Link href={companyId ? `/diagnostico?company_id=${companyId}` : '/diagnostico'} style={{ color: '#0070f3' }}>Voltar ao Diagnóstico</Link>
      </div>
    );
  }

  const resultsCompanyId = assessment?.company_id || companyId || '';

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1rem', color: '#666' }}>
        Logado como: {user?.email}
      </div>

      <h1 style={{ marginBottom: '0.25rem' }}>Resultados do Diagnóstico</h1>
      <p style={{ marginBottom: '1.25rem', color: '#666' }}>
        Escolha 1 ação por área e execute por 7 dias.
      </p>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem', alignItems: 'center' }}>
        <Link
          href={`/recommendations?assessment_id=${assessmentId}&company_id=${resultsCompanyId}`}
          style={{
            display: 'inline-block',
            backgroundColor: '#0070f3',
            color: '#fff',
            padding: '0.75rem 1.25rem',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: 'bold'
          }}
        >
          Escolher ações (Light)
        </Link>
        {resultsCompanyId && (
          <>
            <PedirAjudaConsultor companyId={resultsCompanyId} />
            <AssinarFullButton
              companyId={resultsCompanyId}
              entitlement={entitlement}
              accessToken={session?.access_token ?? null}
              userEmail={user?.email}
              variant="secondary"
            />
          </>
        )}
        {assessment.status !== 'COMPLETED' && (
          <Link
            href={resultsCompanyId ? `/diagnostico?company_id=${resultsCompanyId}` : '/diagnostico'}
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
            Refazer diagnóstico
          </Link>
        )}
      </div>

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
            {/* AUDIT(LITE): Raio-X Executivo must be visible after LIGHT completion. */}
            <h2 style={{ marginBottom: '0.5rem' }}>Raio-X Executivo</h2>
            <p style={{ marginBottom: '1rem', color: '#666' }}>
              Diagnóstico rápido do que mais impacta o negócio agora.
            </p>
            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
              {buildRadiograph().map((item) => (
                <div
                  key={item.section}
                  style={{
                    border: '1px solid #e9ecef',
                    borderRadius: '8px',
                    padding: '1rem',
                    backgroundColor: '#fff',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem'
                  }}
                >
                  <div style={{ fontWeight: 'bold' }}>{item.section}</div>
                  <div style={{ color: '#666', fontSize: '0.9rem' }}>
                    <strong>Achado:</strong> {item.achado}
                  </div>
                  <div style={{ color: '#666', fontSize: '0.9rem' }}>
                    <strong>Impacto:</strong> {item.impacto}
                  </div>
                  <div style={{ color: '#666', fontSize: '0.9rem' }}>
                    <strong>Custo de não agir:</strong> {item.custo} — risco de perda contínua.
                  </div>
                  <div style={{ color: '#666', fontSize: '0.9rem' }}>
                    <strong>Recomendação na lata:</strong> {item.recomendacao}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: '1rem' }}>
              <Link
                href={`/recommendations?assessment_id=${assessmentId}&company_id=${resultsCompanyId}`}
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
                Escolher ações (Light)
              </Link>
            </div>
          </div>

          <div style={{ marginBottom: '2rem' }}>
            {/* AUDIT(LITE): 4 recommendations "na lata" + per-process CTA. */}
            <h2 style={{ marginBottom: '0.5rem' }}>4 recomendações na lata</h2>
            <p style={{ marginBottom: '1.25rem', color: '#666' }}>
              1 ação direta por área para destravar o próximo passo.
            </p>
            {recError && (
              <div style={{
                marginBottom: '1rem',
                padding: '0.75rem',
                backgroundColor: '#fff3cd',
                color: '#856404',
                borderRadius: '6px',
                fontSize: '0.9rem'
              }}>
                {recError}
              </div>
            )}
            {recLoading ? (
              <div style={{ padding: '1rem', color: '#666' }}>Carregando recomendações rápidas...</div>
            ) : (
              <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                {processOrder.map((process) => {
                  const rec = (lightRecommendations.length > 0 && !recError)
                    ? lightRecommendations.find((item) => item.process === process)
                    : getNaLataByProcessAndScore(process, getProcessScore(process));
                  return (
                    <div
                      key={process}
                      style={{
                        border: '1px solid #e9ecef',
                        borderRadius: '8px',
                        padding: '1rem',
                        backgroundColor: '#fff',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem'
                      }}
                    >
                      <div style={{
                        display: 'inline-flex',
                        backgroundColor: '#e9ecef',
                        color: '#333',
                        padding: '0.2rem 0.6rem',
                        borderRadius: '999px',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        alignSelf: 'flex-start'
                      }}>
                        {processLabels[process]}
                      </div>
                      <div style={{ fontWeight: 'bold' }}>
                        {rec?.title || 'Sem recomendação disponível'}
                      </div>
                      <div style={{ color: '#666', fontSize: '0.9rem' }}>
                        {rec?.why || 'Uma melhoria simples nesta área acelera os próximos resultados.'}
                      </div>
                      <Link
                        href={`/recommendations?assessment_id=${assessmentId}&company_id=${resultsCompanyId}&process=${process}`}
                        style={{
                          color: '#0070f3',
                          textDecoration: 'none',
                          fontWeight: 'bold',
                          fontSize: '0.9rem'
                        }}
                      >
                        Escolher ação ({processLabels[process]})
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <footer style={{
            position: 'sticky',
            bottom: 0,
            backgroundColor: '#fff',
            borderTop: '1px solid #e9ecef',
            padding: '0.75rem 0',
            marginTop: '2rem',
            display: 'flex',
            gap: '0.75rem',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <Link
              href={resultsCompanyId ? `/diagnostico?company_id=${resultsCompanyId}` : '/diagnostico'}
              style={{ color: '#666', fontSize: '0.9rem', textDecoration: 'none' }}
            >
              Voltar
            </Link>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <Link
                href={`/recommendations?assessment_id=${assessmentId}&company_id=${resultsCompanyId}`}
                style={{
                  display: 'inline-block',
                  backgroundColor: '#0070f3',
                  color: '#fff',
                  padding: '0.65rem 1.25rem',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  fontWeight: 'bold',
                  fontSize: '0.9rem'
                }}
              >
                Escolher ações (Light)
              </Link>
              <AssinarFullButton
                companyId={resultsCompanyId || ''}
                entitlement={entitlement}
                accessToken={session?.access_token ?? null}
                userEmail={user?.email}
                variant="secondary"
              />
            </div>
          </footer>
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
          <Link href={companyId ? `/diagnostico?company_id=${companyId}` : '/diagnostico'} style={{ color: '#0070f3' }}>Voltar ao Diagnóstico</Link>
        </div>
      )}
    </div>
  );
}
