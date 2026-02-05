'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import { auditLog } from '@/lib/auditLog';
import { Entitlement, getEntitlement } from '@/lib/entitlement';

type DiagnosticoState = 'loading' | 'ready' | 'submitting' | 'error' | 'unauthorized';

type Question = {
  process: string;
  activity: string;
  label: string;
  question: string;
};

function buildQuestions(segment?: string | null): Question[] {
  const operacoes = (() => {
    switch (segment) {
      case 'SERVICOS':
        return [
          { activity: 'PLANEJAMENTO_DA_ENTREGA', label: 'Operações - Planejamento da entrega' },
          { activity: 'EXECUCAO', label: 'Operações - Execução' },
          { activity: 'POS_ENTREGA', label: 'Operações - Pós-entrega' }
        ];
      case 'COMERCIO':
        return [
          { activity: 'COMPRAS_REPOSICAO', label: 'Operações - Compras/Reposição' },
          { activity: 'ESTOQUE', label: 'Operações - Estoque' },
          { activity: 'ENTREGA_POS_VENDA', label: 'Operações - Entrega/Pós-venda' }
        ];
      case 'INDUSTRIA':
        return [
          { activity: 'PCP', label: 'Operações - PCP' },
          { activity: 'PRODUCAO', label: 'Operações - Produção' },
          { activity: 'QUALIDADE_LOGISTICA', label: 'Operações - Qualidade/Logística' }
        ];
      default:
        return [
          { activity: 'PLANEJAMENTO', label: 'Operações - Planejamento' },
          { activity: 'EXECUCAO', label: 'Operações - Execução' },
          { activity: 'POS_ENTREGA', label: 'Operações - Pós-entrega' }
        ];
    }
  })();

  return [
    {
      process: 'COMERCIAL',
      activity: 'PROSPECCAO',
      label: 'Comercial - Prospecção',
      question: 'Você tem uma rotina consistente para gerar novos contatos e oportunidades de venda, toda semana, sem depender só de indicação?'
    },
    {
      process: 'COMERCIAL',
      activity: 'VENDA_PROPOSTA',
      label: 'Comercial - Venda/Proposta',
      question: 'Você tem um processo claro para atender, entender a necessidade e apresentar uma proposta/orçamento de forma padronizada?'
    },
    {
      process: 'COMERCIAL',
      activity: 'FECHAMENTO',
      label: 'Comercial - Fechamento',
      question: 'Você acompanha propostas em aberto e conduz a negociação até o ‘sim’ ou ‘não’, sem deixar oportunidades morrerem por falta de retorno?'
    },
    ...operacoes.map((item) => ({
      process: 'OPERACOES',
      ...item,
      question: item.activity === 'PLANEJAMENTO_DA_ENTREGA'
        ? 'Antes de prometer prazo ao cliente, você confirma capacidade (pessoas/tempo) e define o que será entregue, quando e por quem?'
        : item.activity === 'EXECUCAO'
          ? 'A execução do trabalho segue um padrão mínimo (checklist/etapas), com responsável definido, evitando retrabalho e improviso?'
          : 'Após entregar, você confirma com o cliente se ficou satisfeito, registra problemas e corrige a causa para não repetir?'
    })),
    {
      process: 'ADM_FIN',
      activity: 'SISTEMAS',
      label: 'Adm/Fin - Sistemas',
      question: 'Você usa algum sistema ou método organizado (não só memória) para registrar vendas, contas, estoques e gerar informações do negócio?'
    },
    {
      process: 'ADM_FIN',
      activity: 'CONTROLES_FINANCEIROS',
      label: 'Adm/Fin - Controles financeiros',
      question: 'Você controla contas a pagar/receber e fluxo de caixa com rotina definida, sabendo o saldo projetado das próximas semanas?'
    },
    {
      process: 'ADM_FIN',
      activity: 'PESSOAS_RH',
      label: 'Adm/Fin - Pessoas/RH',
      question: 'Você tem clareza de papéis e responsabilidades e uma rotina simples para contratar, acompanhar e corrigir desempenho das pessoas?'
    },
    {
      process: 'GESTAO',
      activity: 'PLANEJAMENTO',
      label: 'Gestão - Planejamento',
      question: 'Você define metas e prioridades do mês (vendas, entrega, caixa) e transforma isso em ações práticas para a equipe?'
    },
    {
      process: 'GESTAO',
      activity: 'ACOMPANHAMENTO',
      label: 'Gestão - Acompanhamento',
      question: 'Você acompanha poucos indicadores essenciais (vendas, caixa, entrega) com frequência e toma ação quando sai do rumo?'
    },
    {
      process: 'GESTAO',
      activity: 'TOMADA_DE_DECISAO',
      label: 'Gestão - Tomada de decisão',
      question: 'Você toma decisões com base em dados mínimos do negócio (e não só percepção), registrando o que decidiu e cobrando execução?'
    }
  ];
}

export default function DiagnosticoPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
        <DiagnosticoContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function DiagnosticoContent() {
  const { user, session } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const companyId = searchParams.get('company_id');

  const [state, setState] = useState<DiagnosticoState>('loading');
  const [error, setError] = useState('');
  const [scores, setScores] = useState<Record<string, string>>({});
  const [segment, setSegment] = useState<string | null>(null);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [lastAssessmentId, setLastAssessmentId] = useState<string | null>(null);
  const [existingCompletedId, setExistingCompletedId] = useState<string | null>(null);
  const hasLoggedEntitlement = useRef(false);
  const hasLoggedRenderState = useRef(false);
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    if (!session?.access_token) {
      return;
    }

    if (companyId) {
      return;
    }

    let cancelled = false;

    const loadCompanies = async () => {
      try {
        setState('loading');
        setError('');

        const companies = await apiFetch('/companies', {}, session.access_token);

        if (cancelled) return;

        if (companies && companies.length > 0) {
          router.replace(`/diagnostico?company_id=${companies[0].id}`);
          return;
        }

        setError('company_id é obrigatório');
        setState('error');
      } catch (err: any) {
        if (cancelled) return;
        setError(err.message || 'Erro ao carregar companies');
        setState('error');
      }
    };

    loadCompanies();

    return () => {
      cancelled = true;
    };
  }, [companyId, session?.access_token, router]);

  useEffect(() => {
    if (!companyId || !session?.access_token) {
      return;
    }

    let cancelled = false;

    const loadCompany = async () => {
      try {
        setState('loading');
        setError('');

        const companies = await apiFetch('/companies', {}, session.access_token);

        if (cancelled) return;

        const company = (companies || []).find((c: any) => c.id === companyId);
        if (!company) {
          setError('company_id inválido');
          setState('error');
          return;
        }

        setSegment(company.segment || null);

        const ent = await getEntitlement(companyId, session.access_token);
        if (!hasLoggedEntitlement.current) {
          auditLog('diagnostico_entitlement', {
            company_id: companyId,
            plan: ent.plan,
            status: ent.status,
          });
          if (ent.plan === 'UNKNOWN' && ent.status === 'UNKNOWN') {
            auditLog('diagnostico_entitlement_failed', { company_id: companyId });
          }
          hasLoggedEntitlement.current = true;
        }
        if (!cancelled) {
          setEntitlement(ent);
        }

        setState('ready');
      } catch (err: any) {
        if (cancelled) return;
        setError(err.message || 'Erro ao carregar company');
        setState('error');
      }
    };

    loadCompany();

    return () => {
      cancelled = true;
    };
  }, [companyId, session?.access_token]);

  useEffect(() => {
    if (!companyId || typeof window === 'undefined') {
      return;
    }
    const stored = window.localStorage.getItem(`light_last_assessment:${companyId}`);
    if (stored) {
      setLastAssessmentId(stored);
    }
  }, [companyId]);

  useEffect(() => {
    if (!lastAssessmentId || !companyId || !session?.access_token) {
      return;
    }
    let cancelled = false;

    const checkExisting = async () => {
      try {
        const data = await apiFetch(
          `/assessments/${lastAssessmentId}`,
          {},
          session.access_token
        );
        if (cancelled) return;
        const assessment = data?.assessment;
        if (
          assessment &&
          assessment.company_id === companyId &&
          assessment.status === 'COMPLETED'
        ) {
          setExistingCompletedId(lastAssessmentId);
          auditLog('diagnostico_existing_light', {
            company_id: companyId,
            assessment_id: lastAssessmentId,
          });
          if (!hasRedirectedRef.current) {
            hasRedirectedRef.current = true;
            setTimeout(() => {
              router.replace(`/results?assessment_id=${lastAssessmentId}&company_id=${companyId}`);
            }, 800);
          }
        }
      } catch {
        // ignore
      }
    };

    checkExisting();

    return () => {
      cancelled = true;
    };
  }, [lastAssessmentId, companyId, session?.access_token, router]);

  const handleScoreChange = (key: string, value: string) => {
    setScores((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!companyId || !session?.access_token) {
      setError('company_id é obrigatório');
      setState('error');
      return;
    }
    if (existingCompletedId) {
      setError('Diagnóstico LIGHT já concluído para esta empresa.');
      return;
    }

    setError('');
    setState('submitting');

    try {
      const questions = buildQuestions(segment);
      const items = questions.map((q) => {
        const key = `${q.process}_${q.activity}`;
        const rawValue = scores[key];
        const scoreInt = Number(rawValue);
        if (!Number.isFinite(scoreInt) || scoreInt < 0 || scoreInt > 10) {
          throw new Error('Todas as notas devem estar entre 0 e 10');
        }
        return {
          process: q.process,
          activity: q.activity,
          score_int: scoreInt
        };
      });

      const assessment = await apiFetch(
        '/assessments/light',
        {
          method: 'POST',
          body: { company_id: companyId }
        },
        session.access_token
      );

      await apiFetch(
        `/assessments/${assessment.id}/light/submit`,
        {
          method: 'POST',
          body: { items }
        },
        session.access_token
      );

      if (typeof window !== 'undefined' && companyId) {
        window.localStorage.setItem(`light_last_assessment:${companyId}`, assessment.id);
        setLastAssessmentId(assessment.id);
      }
      router.push(`/results?assessment_id=${assessment.id}&company_id=${companyId}`);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 401) {
        setState('unauthorized');
        return;
      }
      setError(err.message || 'Erro ao enviar diagnóstico');
      setState('ready');
    }
  };

  const isSubmitting = state === 'submitting';
  const questions = buildQuestions(segment);
  const answeredCount = questions.filter((q) => {
    const key = `${q.process}_${q.activity}`;
    return scores[key] !== undefined && scores[key] !== '';
  }).length;
  const totalQuestions = questions.length || 12;
  const missingCount = Math.max(0, totalQuestions - answeredCount);
  const progressPercent = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;
  const hasFullAccess = entitlement?.plan === 'FULL' && entitlement?.status === 'ACTIVE';

  useEffect(() => {
    if (!companyId || state !== 'ready' || hasLoggedRenderState.current) {
      return;
    }
    auditLog('diagnostico_render', {
      company_id: companyId,
      entitlement: entitlement ? `${entitlement.plan}/${entitlement.status}` : 'UNKNOWN/UNKNOWN',
      mode: hasFullAccess ? 'LIGHT+FULL_CTA' : 'LIGHT',
    });
    hasLoggedRenderState.current = true;
  }, [companyId, state, entitlement, hasFullAccess]);

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ marginBottom: '0.75rem', color: '#666', fontSize: '0.9rem' }}>
        Logado como: {user?.email}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
        <div style={{ color: '#666' }}>
          <span>Diagnóstico</span>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Link
            href="/logout"
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
            Sair
          </Link>
        </div>
      </div>

      <h1 style={{ marginBottom: '1rem' }}>Diagnóstico LIGHT</h1>

      {state === 'loading' && (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          Carregando...
        </div>
      )}

      {state === 'unauthorized' && (
        <div style={{
          border: '1px solid #dc3545',
          borderRadius: '8px',
          padding: '2rem',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          textAlign: 'center'
        }}>
          <p style={{ marginBottom: '1rem' }}>Sessão expirada</p>
          <Link href="/login" style={{ color: '#0070f3' }}>Login</Link>
        </div>
      )}

      {state === 'error' && (
        <div style={{
          border: '1px solid #dc3545',
          borderRadius: '8px',
          padding: '2rem',
          backgroundColor: '#f8d7da',
          color: '#721c24'
        }}>
          <p>Erro: {error || 'Erro ao carregar diagnóstico'}</p>
        </div>
      )}

      {state === 'ready' && (
        <form id="light-diagnostico-form" onSubmit={handleSubmit}>
          {existingCompletedId && (
            <div style={{
              border: '1px solid #ffeeba',
              borderRadius: '6px',
              padding: '0.75rem',
              backgroundColor: '#fff3cd',
              color: '#856404',
              marginBottom: '1rem',
              fontSize: '0.9rem'
            }}>
              Diagnóstico LIGHT já concluído para esta empresa. Redirecionando para o resultado.
            </div>
          )}
          <div style={{
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '1.5rem',
            backgroundColor: '#fff',
            marginBottom: '1.5rem'
          }}>
            <p style={{ marginBottom: '0.5rem', color: '#555' }}>
              Responda as 12 perguntas com notas de 0 a 10.
            </p>
            <div style={{ marginBottom: '0.75rem', fontSize: '0.9rem', color: '#6b7280' }}>
              {answeredCount} de {totalQuestions} respondidas
            </div>
            <div style={{ height: '8px', backgroundColor: '#e5e7eb', borderRadius: '999px', overflow: 'hidden' }}>
              <div style={{
                height: '8px',
                width: `${progressPercent}%`,
                backgroundColor: '#0070f3'
              }} />
            </div>
          </div>

          {hasFullAccess && companyId && (
            <div style={{
              border: '1px solid #28a745',
              borderRadius: '8px',
              padding: '1rem',
              backgroundColor: '#d4edda',
              color: '#155724',
              marginBottom: '1.5rem'
            }}>
              <strong>Plano FULL ativo.</strong>{' '}
              <Link href={`/full?company_id=${companyId}`} style={{ color: '#155724', textDecoration: 'underline' }}>
                Ir para diagnóstico completo
              </Link>
            </div>
          )}

          {(() => {
            const processLabels: Record<string, string> = {
              COMERCIAL: 'Comercial',
              OPERACOES: 'Operações',
              ADM_FIN: 'Adm/Fin',
              GESTAO: 'Gestão'
            };
            const processDescriptions: Record<string, string> = {
              COMERCIAL: 'Vendas, propostas e geração de oportunidades.',
              OPERACOES: 'Entrega, rotina e execução do dia a dia.',
              ADM_FIN: 'Caixa, custos e controles financeiros.',
              GESTAO: 'Metas, pessoas e acompanhamento.'
            };
            const groups = questions.reduce((acc: Record<string, Question[]>, q) => {
              acc[q.process] = acc[q.process] || [];
              acc[q.process].push(q);
              return acc;
            }, {});

            return Object.entries(groups).map(([process, items]) => (
              <div key={process} style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                  {processLabels[process] || process}
                </div>
                <div style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
                  {processDescriptions[process] || 'Avalie esta área usando a escala de 0 a 10.'}
                </div>
                <div style={{ display: 'grid', gap: '1rem' }}>
                  {items.map((q) => {
                    const key = `${q.process}_${q.activity}`;
                    return (
                      <div key={key} style={{ border: '1px solid #eee', borderRadius: '6px', padding: '1rem' }}>
                        <p style={{ margin: '0 0 0.5rem 0', color: '#333' }}>
                          {q.question}
                        </p>
                        <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                          Considere a rotina das últimas semanas.
                        </div>
                        <select
                          value={scores[key] || ''}
                          onChange={(e) => handleScoreChange(key, e.target.value)}
                          required
                          style={{
                            width: '100%',
                            padding: '0.75rem',
                            borderRadius: '4px',
                            border: '1px solid #ddd',
                            fontSize: '1rem'
                          }}
                        >
                          <option value="">Selecione...</option>
                          {Array.from({ length: 11 }, (_, i) => (
                            <option key={i} value={String(i)}>
                              {i} {i === 0 ? '— péssimo' : i === 10 ? '— excelente' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            ));
          })()}

          {error && (
            <div style={{
              marginBottom: '1rem',
              padding: '0.75rem',
              backgroundColor: '#f8d7da',
              color: '#721c24',
              borderRadius: '4px',
              fontSize: '0.875rem'
            }}>
              {error}
            </div>
          )}
          {missingCount > 0 && (
            <div style={{
              marginBottom: '1rem',
              padding: '0.75rem',
              backgroundColor: '#fff3cd',
              color: '#856404',
              borderRadius: '4px',
              fontSize: '0.875rem'
            }}>
              Faltam {missingCount} respostas.
            </div>
          )}

          <div style={{
            position: 'sticky',
            bottom: 0,
            backgroundColor: '#fff',
            paddingTop: '1rem',
            marginTop: '1rem',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            gap: '0.75rem',
            justifyContent: 'flex-end',
            flexWrap: 'wrap'
          }}>
            <button
              type="submit"
              disabled={isSubmitting || missingCount > 0 || !!existingCompletedId}
              style={{
                backgroundColor: isSubmitting || missingCount > 0 || existingCompletedId ? '#9ca3af' : '#0070f3',
                color: '#fff',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '6px',
                fontSize: '1rem',
                fontWeight: 'bold',
                cursor: isSubmitting || missingCount > 0 || existingCompletedId ? 'not-allowed' : 'pointer'
              }}
            >
              {isSubmitting ? 'Salvando...' : 'Salvar diagnóstico'}
            </button>
            {lastAssessmentId && (
              <Link
                href={`/results?assessment_id=${lastAssessmentId}&company_id=${companyId}`}
                style={{
                  display: 'inline-block',
                  backgroundColor: '#e9ecef',
                  color: '#333',
                  padding: '0.75rem 1.25rem',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  fontWeight: 'bold'
                }}
              >
                Ver resultado
              </Link>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
