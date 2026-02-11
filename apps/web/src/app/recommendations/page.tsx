'use client';

import { Suspense, useState, useEffect, useMemo } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import { Entitlement, getEntitlement } from '@/lib/entitlement';
import { assertFullAccess } from '@/lib/fullGuard';
import { AssinarFullButton } from '@/components/AssinarFullButton';
import { humanizeBand, labels } from '@/lib/uiCopy';

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
  is_fallback?: boolean;
}

type ProcessKey = 'COMERCIAL' | 'OPERACOES' | 'ADM_FIN' | 'GESTAO';
const PROCESS_ORDER: ProcessKey[] = ['COMERCIAL', 'OPERACOES', 'ADM_FIN', 'GESTAO'];

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
  const focusProcess = (searchParams.get('process') || '').toUpperCase();

  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [error, setError] = useState('');
  const [selecting, setSelecting] = useState<string | null>(null);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const emptySelections = {} as Record<ProcessKey, string>;
  const [lightSelections, setLightSelections] = useState<Record<ProcessKey, string>>(emptySelections);
  const [lightNotes, setLightNotes] = useState<Record<ProcessKey, string>>({
    COMERCIAL: '',
    OPERACOES: '',
    ADM_FIN: '',
    GESTAO: '',
  });
  const [lightNotesSaved, setLightNotesSaved] = useState('');
  const [lightLimitMessage, setLightLimitMessage] = useState('');
  const [planToastMessage, setPlanToastMessage] = useState<string | null>(null);
  const [allPlansDone, setAllPlansDone] = useState(false);

  useEffect(() => {
    if (!assessmentId || !session?.access_token) {
      return;
    }

    const loadRecommendations = async () => {
      try {
        setLoading(true);
        setError('');
        // AUDIT(LITE): relies on /assessments/:id/recommendations; empty catalog returns [].
        const data = await apiFetch(
          `/assessments/${assessmentId}/recommendations`,
          {},
          session.access_token
        );
        if (Array.isArray(data) && data.length > 0) {
          setRecommendations(data);
        } else {
          setError('Catálogo vazio. Mostrando sugestões padrão.');
          // AUDIT(LITE): fallback is display-only; selection is disabled when catalog is empty.
          setRecommendations([
            {
              recommendation_id: 'fallback-COMERCIAL',
              process: 'COMERCIAL',
              title: 'Criar rotina semanal de prospecção',
              why: 'Acelere a entrada de novas oportunidades com rotina simples.',
              risk: 'MED',
              impact: 'HIGH',
              checklist: ['Definir dias/horários fixos para prospecção', 'Listar metas semanais de novos contatos', 'Registrar resultados em planilha ou CRM', 'Revisar aprendizados e ajustar abordagem'],
              rank: 1,
              is_free_eligible: false,
              is_selected_free: false,
              is_locked: false,
              is_fallback: true,
            },
            {
              recommendation_id: 'fallback-OPERACOES',
              process: 'OPERACOES',
              title: 'Padronizar entrega com checklist e responsável',
              why: 'Reduza retrabalho e aumente consistência na entrega.',
              risk: 'MED',
              impact: 'HIGH',
              checklist: ['Definir as etapas críticas da entrega', 'Documentar checklist em papel ou digital', 'Atribuir responsável por etapa', 'Revisar checklist semanalmente'],
              rank: 1,
              is_free_eligible: false,
              is_selected_free: false,
              is_locked: false,
              is_fallback: true,
            },
            {
              recommendation_id: 'fallback-ADM_FIN',
              process: 'ADM_FIN',
              title: 'Organizar fluxo de caixa (D+7)',
              why: 'Tenha previsibilidade mínima para decisões semanais.',
              risk: 'HIGH',
              impact: 'HIGH',
              checklist: ['Projetar entradas e saídas dos próximos 7 dias', 'Atualizar diariamente com lançamentos reais', 'Comparar projetado vs realizado', 'Sinalizar alertas se houver gap crítico'],
              rank: 1,
              is_free_eligible: false,
              is_selected_free: false,
              is_locked: false,
              is_fallback: true,
            },
            {
              recommendation_id: 'fallback-GESTAO',
              process: 'GESTAO',
              title: 'Definir metas trimestrais e ritual de acompanhamento',
              why: 'Direcione a equipe com metas claras e revisão frequente.',
              risk: 'MED',
              impact: 'MED',
              checklist: ['Definir 3–5 metas claras para o trimestre', 'Comunicar metas à equipe', 'Agendar ritual semanal de acompanhamento', 'Revisar e ajustar metas conforme resultado'],
              rank: 1,
              is_free_eligible: false,
              is_selected_free: false,
              is_locked: false,
              is_fallback: true,
            },
          ]);
        }
      } catch (err: any) {
        if (err instanceof ApiError && err.status === 401) {
          router.push('/login');
          return;
        }
        setError('Não foi possível carregar recomendações. Mostrando sugestões padrão.');
        setRecommendations([
          {
            recommendation_id: 'fallback-COMERCIAL',
            process: 'COMERCIAL',
            title: 'Criar rotina semanal de prospecção',
            why: 'Acelere a entrada de novas oportunidades com rotina simples.',
            risk: 'MED',
            impact: 'HIGH',
            checklist: ['Definir dias/horários fixos para prospecção', 'Listar metas semanais de novos contatos', 'Registrar resultados em planilha ou CRM', 'Revisar aprendizados e ajustar abordagem'],
            rank: 1,
            is_free_eligible: false,
            is_selected_free: false,
            is_locked: false,
            is_fallback: true,
          },
          {
            recommendation_id: 'fallback-OPERACOES',
            process: 'OPERACOES',
            title: 'Padronizar entrega com checklist e responsável',
            why: 'Reduza retrabalho e aumente consistência na entrega.',
            risk: 'MED',
            impact: 'HIGH',
            checklist: ['Definir as etapas críticas da entrega', 'Documentar checklist em papel ou digital', 'Atribuir responsável por etapa', 'Revisar checklist semanalmente'],
            rank: 1,
            is_free_eligible: false,
            is_selected_free: false,
            is_locked: false,
            is_fallback: true,
          },
          {
            recommendation_id: 'fallback-ADM_FIN',
            process: 'ADM_FIN',
            title: 'Organizar fluxo de caixa (D+7)',
            why: 'Tenha previsibilidade mínima para decisões semanais.',
            risk: 'HIGH',
            impact: 'HIGH',
            checklist: ['Projetar entradas e saídas dos próximos 7 dias', 'Atualizar diariamente com lançamentos reais', 'Comparar projetado vs realizado', 'Sinalizar alertas se houver gap crítico'],
            rank: 1,
            is_free_eligible: false,
            is_selected_free: false,
            is_locked: false,
            is_fallback: true,
          },
          {
            recommendation_id: 'fallback-GESTAO',
            process: 'GESTAO',
            title: 'Definir metas trimestrais e ritual de acompanhamento',
            why: 'Direcione a equipe com metas claras e revisão frequente.',
            risk: 'MED',
            impact: 'MED',
            checklist: ['Definir 3–5 metas claras para o trimestre', 'Comunicar metas à equipe', 'Agendar ritual semanal de acompanhamento', 'Revisar e ajustar metas conforme resultado'],
            rank: 1,
            is_free_eligible: false,
            is_selected_free: false,
            is_locked: false,
            is_fallback: true,
          },
        ]);
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

  const notesStorageKey = useMemo(() => {
    const companyKey = companyId || 'unknown_company';
    const assessmentKey = assessmentId || 'unknown_assessment';
    return `light_action_notes:${companyKey}:${assessmentKey}`;
  }, [companyId, assessmentId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(localStorageKey);
      if (!raw) {
        setLightSelections(emptySelections);
        return;
      }
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        setLightSelections(parsed as Record<ProcessKey, string>);
      } else {
        setLightSelections(emptySelections);
      }
    } catch {
      setLightSelections(emptySelections);
    }
  }, [localStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(notesStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        setLightNotes((prev) => ({
          ...prev,
          ...parsed,
        }));
      }
    } catch {
      // ignore
    }
  }, [notesStorageKey]);

  const persistLightSelection = (process: ProcessKey, recommendationId: string) => {
    const current = lightSelections || {};
    const alreadySelected = current[process] === recommendationId;
    const selectedCount = PROCESS_ORDER.filter((proc) => current[proc]).length;
    if (!alreadySelected && selectedCount >= 4) {
      setLightLimitMessage(
        'Você já selecionou 4 ações no LIGHT. Assine o FULL para ter acesso a um diagnóstico mais completo com assessoria de especialista em gestão.'
      );
      return;
    }

    const next = {
      ...current,
      [process]: recommendationId,
    } as Record<ProcessKey, string>;
    setLightSelections(next);
    setLightNotesSaved('');
    setLightLimitMessage('');
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(localStorageKey, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const handleNoteChange = (process: ProcessKey, value: string) => {
    setLightNotes((prev) => ({
      ...prev,
      [process]: value,
    }));
    setLightNotesSaved('');
  };

  const handleSaveNotes = () => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(notesStorageKey, JSON.stringify(lightNotes));
      setLightNotesSaved('Anotações salvas.');
    } catch {
      setLightNotesSaved('Não foi possível salvar agora.');
    }
  };

  const processKeyToPath = (process: ProcessKey) =>
    ({ COMERCIAL: 'comercial', OPERACOES: 'operacoes', ADM_FIN: 'adm_fin', GESTAO: 'gestao' } as const)[process];

  const processLabels: Record<ProcessKey, string> = {
    COMERCIAL: 'Comercial',
    OPERACOES: 'Operações',
    ADM_FIN: 'Adm/Fin',
    GESTAO: 'Gestão',
  };

  const showPlanExistsAndNavigate = (process: ProcessKey, planId: string) => {
    const label = processLabels[process];
    setPlanToastMessage(`Plano já concluído para ${label}.`);
    setError('');
    setSelecting(null);
    const query = new URLSearchParams();
    if (companyId) query.set('company_id', companyId);
    if (assessmentId) query.set('assessment_id', assessmentId);
    router.push(`/free-action/${planId}?${query.toString()}`);
  };

  const handleSelectFree = async (recommendationId: string, process?: ProcessKey) => {
    if (!assessmentId || !session?.access_token) {
      return;
    }

    setSelecting(recommendationId);
    setError('');
    setPlanToastMessage(null);

    try {
      const key = process && companyId && processKeyToPath(process);

      // 1) Chamar STATUS antes (se temos process e companyId)
      if (key) {
        try {
          const status = await apiFetch(
            `/light/plans/${key}/status?assessment_id=${assessmentId}&company_id=${companyId}`,
            {},
            session.access_token
          );
          if (status?.exists && status?.plan_id) {
            showPlanExistsAndNavigate(process as ProcessKey, status.plan_id);
            return;
          }
        } catch {
          // fallback para select
        }
      }

      // 2) Chamar CREATE (select) — idempotente
      const freeAction = await apiFetch(
        `/assessments/${assessmentId}/free-actions/select`,
        {
          method: 'POST',
          body: { recommendation_id: recommendationId },
        },
        session.access_token
      );

      if (freeAction?.already_exists && freeAction?.plan_id && process) {
        showPlanExistsAndNavigate(process, freeAction.plan_id);
        return;
      }

      const planId = freeAction?.plan_id ?? freeAction?.id;
      const query = new URLSearchParams();
      if (companyId) query.set('company_id', companyId);
      if (assessmentId) query.set('assessment_id', assessmentId);
      router.push(`/free-action/${planId}?${query.toString()}`);
    } catch (err: any) {
      setSelecting(null);
      if (err instanceof ApiError && err.status === 401) {
        router.push('/login');
        return;
      }
      setError(err.status >= 500 ? 'Falha ao carregar plano. Tente novamente.' : (err.message || 'Erro ao selecionar ação gratuita'));
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

  const hasFullAccess = assertFullAccess(entitlement);
  const isLight = !hasFullAccess;
  const processOrder = PROCESS_ORDER;
  const safeLightSelections = lightSelections || {};
  const selectedLightIds = useMemo(() => {
    return processOrder.map((process) => safeLightSelections[process]).filter(Boolean) as string[];
  }, [processOrder, safeLightSelections]);
  const selectedLightCount = selectedLightIds.length;
  const validRecommendationIds = useMemo(() => {
    return new Set(recommendations.map((rec) => rec.recommendation_id));
  }, [recommendations]);
  const hasFallbackRecommendations = recommendations.some((rec) => rec.recommendation_id.startsWith('fallback-'));
  const hasInvalidSelection = selectedLightIds.some((id) => !validRecommendationIds.has(id));
  const canProceedLight = selectedLightCount === 4 && !hasInvalidSelection && recommendations.length > 0;
  const focusSelection = focusProcess && safeLightSelections[focusProcess as ProcessKey];
  const primaryLightRecommendationId = focusSelection || selectedLightIds[0] || null;
  const isProceedingLight = Boolean(primaryLightRecommendationId && selecting === primaryLightRecommendationId);
  const recommendationTitleById = recommendations.reduce<Record<string, string>>((acc, rec) => {
    acc[rec.recommendation_id] = rec.title;
    return acc;
  }, {});

  useEffect(() => {
    if (!assessmentId || !companyId || !session?.access_token) {
      return;
    }
    const loadPlansStatus = async () => {
      try {
        const data = await apiFetch(
          `/light/plans/status?assessment_id=${assessmentId}&company_id=${companyId}`,
          {},
          session.access_token
        );
        setAllPlansDone(!!data?.all_done);
      } catch {
        setAllPlansDone(false);
      }
    };
    loadPlansStatus();
  }, [assessmentId, companyId, session?.access_token]);

  useEffect(() => {
    if (!lightSelections || recommendations.length === 0) {
      return;
    }
    const filtered = Object.fromEntries(
      Object.entries(lightSelections).filter(([proc, id]) =>
        PROCESS_ORDER.includes(proc as ProcessKey) && validRecommendationIds.has(id)
      )
    ) as Record<ProcessKey, string>;
    if (Object.keys(filtered).length !== Object.keys(lightSelections).length) {
      setLightSelections(filtered);
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(localStorageKey, JSON.stringify(filtered));
        } catch {
          // ignore
        }
      }
      setLightLimitMessage('Algumas ações anteriores não estão mais disponíveis. Selecione novamente.');
    }
  }, [lightSelections, recommendations.length, validRecommendationIds, localStorageKey]);

  if (!assessmentId) {
    return (
      <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
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

      <h1 style={{ marginBottom: '0.25rem' }}>Selecione suas ações do plano Light</h1>
      <p style={{ marginBottom: '1.5rem', color: '#666' }}>
        1 ação por processo (4/4). Depois monte o Plano 30 dias e registre evidência.
      </p>
      {focusProcess && (
        <div style={{
          marginBottom: '1rem',
          padding: '0.75rem',
          backgroundColor: '#f0f7ff',
          border: '1px solid #cfe2ff',
          color: '#084298',
          borderRadius: '6px',
          fontSize: '0.9rem'
        }}>
          Processo em foco: <strong>{processLabels[focusProcess as ProcessKey] || focusProcess}</strong>
        </div>
      )}

      {isLight && (
        <div style={{
          border: '1px solid #e9ecef',
          borderRadius: '8px',
          padding: '1rem',
          backgroundColor: '#f8f9fa',
          marginBottom: '1.5rem'
        }}>
          {/* AUDIT(LITE): must enforce 1 action per process (4/4) before proceeding. */}
          <h2 style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>
            Suas 4 ações escolhidas (LIGHT)
          </h2>
          <div style={{ marginBottom: '0.75rem', color: '#666', fontSize: '0.9rem' }}>
            Selecionadas: {selectedLightCount}/4
          </div>
          <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {processOrder.map((process) => {
              const actionId = safeLightSelections[process];
              if (!actionId) return null;
              return (
                <div key={process} style={{ fontSize: '0.9rem', color: '#555' }}>
                  <strong>{processLabels[process]}</strong>: {recommendationTitleById[actionId] || actionId}
                </div>
              );
            })}
          </div>
          {lightLimitMessage && (
            <div style={{
              marginBottom: '0.75rem',
              padding: '0.75rem',
              backgroundColor: '#fff3cd',
              color: '#856404',
              borderRadius: '6px',
              fontSize: '0.9rem'
            }}>
              {lightLimitMessage}
            </div>
          )}
          {!canProceedLight && selectedLightCount === 4 && hasInvalidSelection && (
            <div style={{
              marginBottom: '0.75rem',
              padding: '0.75rem',
              backgroundColor: '#fff3cd',
              color: '#856404',
              borderRadius: '6px',
              fontSize: '0.9rem'
            }}>
              Há ações inválidas no seu histórico. Refaça a seleção para continuar.
            </div>
          )}
          {hasFallbackRecommendations && (
            <div style={{
              marginBottom: '0.75rem',
              padding: '0.75rem',
              backgroundColor: '#e7f3ff',
              color: '#004085',
              borderRadius: '6px',
              fontSize: '0.9rem'
            }}>
              {labels.fallbackExplain}
            </div>
          )}
          <Link
            href="#light-action-notes"
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
          {allPlansDone ? (
            <Link
              href={`/plano-30-dias?assessment_id=${assessmentId}&company_id=${companyId}`}
              data-testid="cta-visualizar-plano-30"
              style={{
                marginLeft: '0.75rem',
                display: 'inline-block',
                backgroundColor: '#28a745',
                color: '#fff',
                border: 'none',
                padding: '0.5rem 0.9rem',
                borderRadius: '6px',
                fontWeight: 'bold',
                fontSize: '0.875rem',
                textDecoration: 'none',
                cursor: 'pointer',
              }}
            >
              Visualizar plano de 30 dias
            </Link>
          ) : (
            <button
              data-testid="cta-montar-plano-30"
              onClick={() => primaryLightRecommendationId && handleSelectFree(primaryLightRecommendationId, focusProcess as ProcessKey)}
              disabled={!canProceedLight || !primaryLightRecommendationId || isProceedingLight}
              style={{
                marginLeft: '0.75rem',
                backgroundColor: canProceedLight ? '#28a745' : '#e9ecef',
                color: canProceedLight ? '#fff' : '#666',
                border: 'none',
                padding: '0.5rem 0.9rem',
                borderRadius: '6px',
                fontWeight: 'bold',
                fontSize: '0.875rem',
                cursor: canProceedLight ? 'pointer' : 'not-allowed'
              }}
            >
              {isProceedingLight ? 'Preparando plano...' : 'Continuar: montar Plano 30 dias'}
            </button>
          )}
          <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {processOrder.map((process) => {
              const actionId = safeLightSelections[process];
              if (!actionId) return null;
              return (
                <button
                  key={process}
                  onClick={() => handleSelectFree(actionId, process)}
                  disabled={!canProceedLight || selecting === actionId}
                  style={{
                    backgroundColor: focusProcess === process ? '#0070f3' : '#e9ecef',
                    color: focusProcess === process ? '#fff' : '#333',
                    border: 'none',
                    padding: '0.4rem 0.75rem',
                    borderRadius: '999px',
                    fontSize: '0.8rem',
                    fontWeight: 'bold',
                    cursor: !canProceedLight || selecting === actionId ? 'not-allowed' : 'pointer'
                  }}
                >
                  Abrir plano ({processLabels[process]})
                </button>
              );
            })}
          </div>
        </div>
      )}

      {isLight && (
        <div id="light-action-notes" style={{
          border: '1px solid #e9ecef',
          borderRadius: '8px',
          padding: '1rem',
          backgroundColor: '#fff',
          marginBottom: '1.5rem'
        }}>
          {/* AUDIT(LITE): notes are optional; "Editar ações" should jump here. */}
          <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>
            Detalhe da ação selecionada
          </h3>
          <p style={{ marginBottom: '1rem', color: '#666' }}>
            Escreva o que você vai fazer e como vai comprovar.
          </p>
          {selectedLightCount === 0 && (
            <div style={{
              padding: '0.75rem',
              backgroundColor: '#f8f9fa',
              borderRadius: '6px',
              color: '#666',
              fontSize: '0.9rem',
              marginBottom: '1rem'
            }}>
              Selecione 1 ação por processo para editar.
            </div>
          )}
          {processOrder.map((process) => {
            const actionId = lightSelections[process];
            if (!actionId) return null;
            return (
              <div key={process} style={{ marginBottom: '1rem' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '0.35rem' }}>
                  {processLabels[process]}: {recommendationTitleById[actionId] || actionId}
                </div>
                <textarea
                  value={lightNotes[process]}
                  onChange={(e) => handleNoteChange(process, e.target.value)}
                  placeholder="Ex.: atividade, prazo, responsável, evidência..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    fontFamily: 'inherit',
                  }}
                />
              </div>
            );
          })}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={handleSaveNotes}
              style={{
                backgroundColor: '#0070f3',
                color: '#fff',
                border: 'none',
                padding: '0.6rem 1rem',
                borderRadius: '6px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              Salvar anotações
            </button>
            {lightNotesSaved && (
              <span style={{ color: '#155724', fontSize: '0.9rem' }}>
                {lightNotesSaved}
              </span>
            )}
          </div>
        </div>
      )}

      {planToastMessage && (
        <div style={{
          marginBottom: '1rem',
          padding: '1rem',
          backgroundColor: '#d4edda',
          color: '#155724',
          border: '1px solid #c3e6cb',
          borderRadius: '6px',
          fontSize: '0.9rem'
        }}>
          {planToastMessage}
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

      <div id="light-selection" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {recommendations.map((rec) => (
          <div
            key={rec.recommendation_id}
            style={{
              border: focusProcess && rec.process === focusProcess ? '2px solid #0070f3' : '1px solid #ddd',
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
                  Risco: {humanizeBand(rec.risk)}
                </span>
                <span style={{
                  ...badgeBase,
                  backgroundColor: getImpactColor(rec.impact),
                  color: '#fff'
                }}>
                  Impacto: {humanizeBand(rec.impact)}
                </span>
              </div>
            </div>

            <p style={{ marginBottom: '1rem', color: '#666' }}>{rec.why}</p>

            <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              {isLight ? (
                <>
                  <button
                    onClick={() => persistLightSelection(rec.process as ProcessKey, rec.recommendation_id)}
                    disabled={loading}
                    style={{
                      backgroundColor: safeLightSelections[rec.process as ProcessKey] === rec.recommendation_id ? '#28a745' : '#0070f3',
                      color: '#fff',
                      border: 'none',
                      padding: '0.5rem 1rem',
                      borderRadius: '6px',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: 'bold'
                    }}
                  >
                    {safeLightSelections[rec.process as ProcessKey] === rec.recommendation_id ? 'Selecionada' : 'Selecionar'}
                  </button>
                  {rec.is_fallback && (
                    <span style={{ fontSize: '0.85rem', color: '#666' }}>
                      {labels.fallbackAction}
                    </span>
                  )}
                </>
              ) : (
                <>
                  {rec.is_free_eligible && (
                    <button
                      onClick={() => handleSelectFree(rec.recommendation_id, rec.process as ProcessKey)}
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
                      onClick={() => handleSelectFree(rec.recommendation_id, rec.process as ProcessKey)}
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
          <AssinarFullButton
            companyId={companyId}
            entitlement={entitlement}
            accessToken={session?.access_token ?? null}
            variant="secondary"
          />
        </div>
      )}

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
          href={assessmentId && companyId ? `/results?assessment_id=${assessmentId}&company_id=${companyId}` : '/diagnostico'}
          style={{ color: '#666', fontSize: '0.9rem', textDecoration: 'none' }}
        >
          Voltar
        </Link>
        <AssinarFullButton
          companyId={companyId || ''}
          entitlement={entitlement}
          accessToken={session?.access_token ?? null}
          variant="secondary"
        />
      </footer>
    </div>
  );
}
