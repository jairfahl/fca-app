'use client';

import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import { humanizeActionStatus, humanizeBandInText, labels } from '@/lib/uiCopy';
import SolicitarAjudaButton from '@/components/SolicitarAjudaButton';
import PedirApoioButton from '@/components/PedirApoioButton';
import PedirAjudaConsultor from '@/components/PedirAjudaConsultor';

type SixPackItem = {
  title: string;
  o_que_acontece: string;
  custo_nao_agir: string;
  muda_em_30_dias: string;
  primeiro_passo?: string | null;
};

type SixPack = { vazamentos: SixPackItem[]; alavancas: SixPackItem[] };

function displayActionTitle(title: string): string {
  return title?.includes('Ação padrão') ? labels.fallbackAction : title || labels.fallbackAction;
}

interface ConsultantNote {
  note_type: string;
  note_text: string;
  created_at: string;
}

type WhyItem = { question_key: string; answer: number | string; label?: string };

const LIKERT_LABELS: Record<string, string> = {
  DISCORDO_PLENAMENTE: 'Discordo plenamente',
  DISCORDO: 'Discordo',
  NEUTRO: 'Neutro',
  CONCORDO: 'Concordo',
  CONCORDO_PLENAMENTE: 'Concordo plenamente',
};

function formatWhyAnswer(a: number | string): string {
  if (typeof a === 'number') return `${a}/10`;
  return LIKERT_LABELS[String(a)] || String(a);
}

interface DashboardAction {
  position: number;
  process_key: string;
  action_key: string;
  title: string;
  owner_name: string;
  metric_text: string;
  checkpoint_date: string;
  status: string;
  dod_checklist: string[];
  dod_confirmed: boolean;
  evidence_exists: boolean;
  before_baseline: string | null;
  after_result: string | null;
  declared_gain: string | null;
  dropped_reason: string | null;
  consultant_notes?: ConsultantNote[];
  cause_label?: string | null;
  why?: WhyItem[] | null;
}

interface DashboardData {
  assessment_id?: string;
  progress: string;
  next_action_key: string | null;
  actions: DashboardAction[];
  assessment_status?: string;
}

const STATUS_COLORS: Record<string, string> = {
  NOT_STARTED: '#6c757d',
  IN_PROGRESS: '#0d6efd',
  DONE: '#198754',
  DROPPED: '#dc3545',
};

const NOTE_TYPE_LABELS: Record<string, string> = {
  ORIENTACAO: 'Orientação',
  IMPEDIMENTO: 'Impedimento',
  PROXIMO_PASSO: 'Próximo passo',
};

export default function FullDashboardPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
        <FullDashboardContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function FullDashboardContent() {
  const { user, session } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const assessmentId = searchParams.get('assessment_id');
  const companyId = searchParams.get('company_id');

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [modalAction, setModalAction] = useState<DashboardAction | null>(null);
  const [dodConfirmItems, setDodConfirmItems] = useState<string[]>([]);
  const [evidenceForm, setEvidenceForm] = useState({ evidence_text: '', before_baseline: '', after_result: '' });
  const [dropReason, setDropReason] = useState('');
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [closeLoading, setCloseLoading] = useState(false);
  const [newCycleLoading, setNewCycleLoading] = useState(false);
  const [sixPack, setSixPack] = useState<SixPack | null>(null);
  const [sixPackLoading, setSixPackLoading] = useState(false);
  const actionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const focusActionKey = searchParams.get('action_key');
  const msgNoActionsLeft = searchParams.get('msg') === 'no_actions_left';
  const msgDiagAlreadySubmitted = searchParams.get('msg') === 'diag_already_submitted';

  useEffect(() => {
    if (!loading && data?.actions && focusActionKey && actionRefs.current[focusActionKey]) {
      actionRefs.current[focusActionKey]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [loading, data?.actions, focusActionKey]);

  const effectiveAssessmentId = assessmentId || data?.assessment_id || null;
  useEffect(() => {
    if (!companyId || !effectiveAssessmentId || !session?.access_token || loading) return;
    const status = data?.assessment_status;
    if (status !== 'SUBMITTED' && status !== 'CLOSED') return;
    const loadResults = async () => {
      setSixPackLoading(true);
      try {
        const res = await apiFetch(
          `/full/results?company_id=${companyId}&assessment_id=${effectiveAssessmentId}`,
          {},
          session.access_token
        );
        setSixPack(res?.six_pack || { vazamentos: [], alavancas: [] });
      } catch {
        setSixPack(null);
      } finally {
        setSixPackLoading(false);
      }
    };
    loadResults();
  }, [companyId, effectiveAssessmentId, session?.access_token, loading, data?.assessment_status]);

  const loadDashboard = useCallback(async () => {
    if (!companyId || !session?.access_token) return;
    let aid = assessmentId;
    if (!aid) {
      try {
        const current = await apiFetch(
          `/full/assessments/current?company_id=${companyId}`,
          {},
          session.access_token
        );
        aid = current?.id;
        if (aid) {
          const params = new URLSearchParams(searchParams.toString());
          params.set('assessment_id', aid);
          router.replace(`/full/dashboard?${params.toString()}`, { scroll: false });
        } else {
          setError('Falha ao carregar diagnóstico');
          setLoading(false);
          return;
        }
      } catch (err: any) {
        const status = err instanceof ApiError ? err.status : 0;
        setError((status === 404 || status === 500) ? 'Falha ao carregar diagnóstico' : (err.message || 'Falha ao carregar diagnóstico'));
        setLoading(false);
        return;
      }
    }
    try {
      setLoading(true);
      setError('');
      const res = await apiFetch(
        `/full/assessments/${aid}/dashboard?company_id=${companyId}`,
        {},
        session.access_token
      );
      setData(res);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 401) {
        router.push('/login');
        return;
      }
      setError(err.message || 'Erro ao carregar dashboard');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [assessmentId, companyId, session?.access_token, router, searchParams]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleDodConfirm = async (action: DashboardAction) => {
    if (!assessmentId || !companyId || !session?.access_token) return;
    setActionLoading(action.action_key);
    try {
      await apiFetch(
        `/full/assessments/${assessmentId}/plan/${encodeURIComponent(action.action_key)}/dod/confirm?company_id=${companyId}`,
        { method: 'POST', body: { confirmed_items: action.dod_checklist } },
        session.access_token
      );
      setModalAction(null);
      await loadDashboard();
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409) {
        alert('Ciclo fechado. Somente leitura.');
        await loadDashboard();
      } else {
        alert(err.message || 'Erro ao confirmar o que conta como feito');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleEvidenceSubmit = async (action: DashboardAction) => {
    if (!assessmentId || !companyId || !session?.access_token) return;
    const { evidence_text, before_baseline, after_result } = evidenceForm;
    if (!evidence_text.trim() || !before_baseline.trim() || !after_result.trim()) {
      alert('Preencha todos os campos.');
      return;
    }
    setActionLoading(action.action_key);
    try {
      await apiFetch(
        `/full/assessments/${assessmentId}/plan/${encodeURIComponent(action.action_key)}/evidence?company_id=${companyId}`,
        {
          method: 'POST',
          body: { evidence_text: evidence_text.trim(), before_baseline: before_baseline.trim(), after_result: after_result.trim() },
        },
        session.access_token
      );
      setModalAction(null);
      setEvidenceForm({ evidence_text: '', before_baseline: '', after_result: '' });
      await loadDashboard();
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409) {
        alert('Ciclo fechado. Somente leitura.');
        await loadDashboard();
      } else {
        alert(err.message || 'Erro ao registrar evidência');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleMarkDone = async (action: DashboardAction) => {
    if (!assessmentId || !companyId || !session?.access_token) return;
    setActionLoading(action.action_key);
    try {
      await apiFetch(
        `/full/assessments/${assessmentId}/plan/${encodeURIComponent(action.action_key)}/status?company_id=${companyId}`,
        { method: 'PATCH', body: { status: 'DONE' } },
        session.access_token
      );
      setModalAction(null);
      await loadDashboard();
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409) {
        alert('Ciclo fechado. Somente leitura.');
        await loadDashboard();
      } else {
        alert(err.message || 'Erro ao marcar como concluído');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleDrop = async (action: DashboardAction) => {
    if (!assessmentId || !companyId || !session?.access_token) return;
    if (!dropReason.trim()) {
      alert('Informe o motivo do descarte.');
      return;
    }
    setActionLoading(action.action_key);
    try {
      await apiFetch(
        `/full/assessments/${assessmentId}/plan/${encodeURIComponent(action.action_key)}/status?company_id=${companyId}`,
        { method: 'PATCH', body: { status: 'DROPPED', dropped_reason: dropReason.trim() } },
        session.access_token
      );
      setDropTarget(null);
      setDropReason('');
      setModalAction(null);
      await loadDashboard();
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409) {
        alert('Ciclo fechado. Somente leitura.');
        await loadDashboard();
      } else {
        alert(err.message || 'Erro ao descartar');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleClose = async () => {
    if (!assessmentId || !companyId || !session?.access_token) return;
    setCloseLoading(true);
    try {
      await apiFetch(
        `/full/assessments/${assessmentId}/close?company_id=${companyId}`,
        { method: 'POST' },
        session.access_token
      );
      await loadDashboard();
    } catch (err: any) {
      alert(err.message || 'Erro ao fechar ciclo');
    } finally {
      setCloseLoading(false);
    }
  };

  const handleNewCycle = async () => {
    if (!assessmentId || !companyId || !session?.access_token) return;
    setNewCycleLoading(true);
    try {
      const res = await apiFetch(
        `/full/assessments/${assessmentId}/new-cycle?company_id=${companyId}`,
        { method: 'POST' },
        session.access_token
      );
      const aid = res?.assessment_id;
      if (aid) {
        router.replace(`/full/acoes?assessment_id=${aid}&company_id=${companyId}`);
      }
    } catch (err: any) {
      alert(err.message || 'Erro ao iniciar novo ciclo');
    } finally {
      setNewCycleLoading(false);
    }
  };

  const handleRefazerDiagnostico = async () => {
    if (!companyId || !session?.access_token) return;
    setNewCycleLoading(true);
    try {
      const res = await apiFetch(
        `/full/versions/new?company_id=${companyId}`,
        { method: 'POST' },
        session.access_token
      );
      const aid = res?.assessment_id;
      if (aid) {
        router.replace(`/full/wizard?company_id=${companyId}&assessment_id=${aid}`);
      }
    } catch (err: any) {
      alert(err?.message || 'Erro ao criar novo diagnóstico');
    } finally {
      setNewCycleLoading(false);
    }
  };

  const nextAction = data?.actions?.find((a) => a.action_key === data?.next_action_key);
  const isClosed = data?.assessment_status === 'CLOSED';
  const canClose = data?.progress === '3/3' && !isClosed && data?.actions?.every((a) => a.status === 'DONE' || a.status === 'DROPPED');

  if (loading) {
    return (
      <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center' }}>Carregando dashboard...</div>
      </div>
    );
  }

  if (!companyId) {
    return (
      <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ padding: '1rem', backgroundColor: '#f8d7da', color: '#721c24', borderRadius: '8px' }}>
          {labels.missingCompany}
        </div>
        <Link href="/full" style={{ display: 'inline-block', marginTop: '1rem', color: '#0070f3' }}>
          Voltar ao FULL
        </Link>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1rem', color: '#666', fontSize: '0.9rem' }}>
        Logado como: {user?.email}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
        <h1 style={{ margin: 0 }}>Dashboard FULL</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {companyId && (
            <>
              <PedirAjudaConsultor companyId={companyId} />
              <SolicitarAjudaButton companyId={companyId} />
            </>
          )}
          <Link
            href={`/full?company_id=${companyId}`}
            style={{
              display: 'inline-block',
              backgroundColor: '#6c757d',
              color: '#fff',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              textDecoration: 'none',
              fontSize: '0.9rem',
            }}
          >
            Voltar ao FULL
          </Link>
        </div>
      </div>

      {msgDiagAlreadySubmitted && (
        <div style={{ padding: '1rem', backgroundColor: '#d4edda', color: '#155724', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #c3e6cb' }}>
          Diagnóstico já foi enviado. Acesse suas ações abaixo.
        </div>
      )}
      {msgNoActionsLeft && (
        <div style={{ padding: '1rem', backgroundColor: '#fff3cd', color: '#856404', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #ffc107' }}>
          Não há mais ações sugeridas. Todas foram concluídas ou descartadas.
        </div>
      )}
      {error && (
        <div style={{ padding: '1rem', backgroundColor: '#f8d7da', color: '#721c24', borderRadius: '8px', marginBottom: '1.5rem' }}>
          {error}
        </div>
      )}

      {data && (
        <>
          {isClosed && (
            <div
              style={{
                padding: '1rem',
                backgroundColor: '#fff3cd',
                borderRadius: '8px',
                marginBottom: '1.5rem',
                border: '1px solid #ffc107',
                color: '#856404',
              }}
            >
              Ciclo fechado. Somente leitura.
            </div>
          )}

          <div
            style={{
              padding: '1.25rem',
              backgroundColor: isClosed ? '#d4edda' : '#e7f3ff',
              borderRadius: '8px',
              marginBottom: '2rem',
              border: isClosed ? '1px solid #28a745' : '1px solid #b6d4fe',
            }}
          >
            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>
              Progresso: {data.progress}
            </div>
            <div style={{ color: isClosed ? '#155724' : '#0c5460' }}>
              {labels.nextStep}: {nextAction ? displayActionTitle(nextAction.title) : 'Todas as ações foram concluídas ou descartadas.'}
            </div>
            {canClose && (
              <button
                onClick={handleClose}
                disabled={closeLoading}
                style={{
                  marginTop: '1rem',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#198754',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                }}
              >
                {closeLoading ? 'Fechando...' : 'Fechar ciclo'}
              </button>
            )}
            {isClosed && (
              <>
                <div style={{ marginTop: '1rem', fontWeight: '600' }}>Ganhos declarados:</div>
                <ul style={{ margin: '0.5rem 0 0 1.25rem', padding: 0 }}>
                  {data.actions
                    ?.filter((a) => a.declared_gain)
                    .map((a) => (
                      <li key={a.action_key} style={{ marginBottom: '0.35rem', padding: '0.25rem 0.5rem', backgroundColor: '#d4edda', borderRadius: '4px', color: '#155724' }}>
                        {displayActionTitle(a.title)}: {a.declared_gain}
                      </li>
                    ))}
                </ul>
                <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={handleRefazerDiagnostico}
                    disabled={newCycleLoading}
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: '#0d6efd',
                      color: '#fff',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                    }}
                    data-testid="cta-refazer-diagnostico"
                  >
                    {newCycleLoading ? 'Criando...' : 'Fazer novo diagnóstico para medir evolução'}
                  </button>
                  <button
                    onClick={handleNewCycle}
                    disabled={newCycleLoading}
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: '6px',
                      border: '1px solid #0d6efd',
                      backgroundColor: 'transparent',
                      color: '#0d6efd',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                    }}
                    data-testid="cta-new-cycle"
                  >
                    {newCycleLoading ? 'Iniciando...' : 'Iniciar novo ciclo (mais 3 movimentos)'}
                  </button>
                  {assessmentId && (
                    <>
                      <Link
                        href={`/full/resultados?company_id=${companyId}&assessment_id=${assessmentId}`}
                        style={{
                          display: 'inline-block',
                          padding: '0.5rem 1rem',
                          borderRadius: '6px',
                          backgroundColor: '#6c757d',
                          color: '#fff',
                          textDecoration: 'none',
                          fontWeight: 'bold',
                        }}
                      >
                        Ver resultados do diagnóstico
                      </Link>
                      <Link
                        href={`/full/relatorio?company_id=${companyId}`}
                        style={{
                          display: 'inline-block',
                          padding: '0.5rem 1rem',
                          borderRadius: '6px',
                          backgroundColor: '#198754',
                          color: '#fff',
                          textDecoration: 'none',
                          fontWeight: 'bold',
                        }}
                        data-testid="cta-relatorio"
                      >
                        Baixar relatório PDF
                      </Link>
                      <Link
                        href={`/full/historico?company_id=${companyId}`}
                        style={{
                          display: 'inline-block',
                          padding: '0.5rem 1rem',
                          borderRadius: '6px',
                          backgroundColor: '#6c757d',
                          color: '#fff',
                          textDecoration: 'none',
                          fontWeight: 'bold',
                        }}
                      >
                        Histórico de versões
                      </Link>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          {(isClosed || data.assessment_status === 'SUBMITTED') && (sixPack?.vazamentos?.length || sixPack?.alavancas?.length) ? (
            <div style={{ marginBottom: '2rem', border: '1px solid #dee2e6', borderRadius: '8px', padding: '1.25rem', backgroundColor: '#fff' }}>
              <h2 style={{ margin: '0 0 1rem 0' }}>Raio-X do dono</h2>
              {sixPackLoading ? (
                <div style={{ padding: '1rem', textAlign: 'center', color: '#6c757d' }}>Carregando diagnóstico...</div>
              ) : (
                <>
                  {sixPack.vazamentos?.length ? (
                    <div style={{ marginBottom: '1.5rem' }}>
                      <h3 style={{ marginBottom: '0.75rem' }}>3 Vazamentos</h3>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
                        {sixPack.vazamentos.map((item, i) => (
                          <div
                            key={`v-${i}`}
                            style={{ textAlign: 'left', border: '1px solid #dee2e6', borderRadius: '8px', background: '#fff', padding: '1rem' }}
                          >
                            <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{humanizeBandInText(item.title)}</div>
                            <div style={{ fontSize: '0.9rem', marginBottom: '0.35rem' }}><strong>{labels.raioXWhatHappening}:</strong> {item.o_que_acontece || '—'}</div>
                            <div style={{ fontSize: '0.85rem', color: '#6c757d' }}><strong>{labels.raioXCusto}:</strong> {item.custo_nao_agir || '—'}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {sixPack.alavancas?.length ? (
                    <div>
                      <h3 style={{ marginBottom: '0.75rem' }}>3 Alavancas</h3>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
                        {sixPack.alavancas.map((item, i) => (
                          <div
                            key={`a-${i}`}
                            style={{ textAlign: 'left', border: '1px solid #dee2e6', borderRadius: '8px', background: '#fff', padding: '1rem' }}
                          >
                            <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{humanizeBandInText(item.title)}</div>
                            <div style={{ fontSize: '0.9rem', marginBottom: '0.35rem' }}><strong>{labels.raioXWhatHappening}:</strong> {item.o_que_acontece || '—'}</div>
                            <div style={{ fontSize: '0.85rem', color: '#6c757d' }}><strong>{labels.raioXCusto}:</strong> {item.custo_nao_agir || '—'}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {effectiveAssessmentId && (
                    <div style={{ marginTop: '1rem' }}>
                      <Link
                        href={`/full/resultados?company_id=${companyId}&assessment_id=${effectiveAssessmentId}`}
                        style={{
                          display: 'inline-block',
                          padding: '0.5rem 1rem',
                          borderRadius: '6px',
                          backgroundColor: '#6f42c1',
                          color: '#fff',
                          textDecoration: 'none',
                          fontWeight: 600,
                          fontSize: '0.9rem',
                        }}
                      >
                        Ver diagnóstico completo
                      </Link>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : null}

          {(!data.actions || data.actions.length === 0) && (
            <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: '#f8f9fa', borderRadius: '8px', color: '#666' }}>
              <div style={{ marginBottom: '0.75rem' }}>Nenhum plano de 3 ações ainda. Assine o plano mínimo para iniciar o ciclo.</div>
              <Link
                href={`/full/acoes?company_id=${companyId}&assessment_id=${assessmentId || ''}`}
                style={{
                  display: 'inline-block',
                  backgroundColor: '#0d6efd',
                  color: '#fff',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  fontSize: '0.9rem',
                  fontWeight: 'bold',
                }}
              >
                {labels.planMinimal}
              </Link>
            </div>
          )}

          {data.actions && data.actions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {data.actions.map((action) => (
                <div
                  key={action.action_key}
                  ref={(el) => { actionRefs.current[action.action_key] = el; }}
                  style={{ scrollMarginTop: '1rem' }}
                >
                  <ActionCard
                    action={action}
                    assessmentId={assessmentId || ''}
                    companyId={companyId}
                    isClosed={isClosed}
                    onConfirmDod={() => setModalAction({ ...action, modalType: 'dod' } as any)}
                    onRegisterEvidence={() => {
                      setEvidenceForm({ evidence_text: '', before_baseline: '', after_result: '' });
                      setModalAction({ ...action, modalType: 'evidence' } as any);
                    }}
                    onMarkDone={() => setModalAction({ ...action, modalType: 'done' } as any)}
                    onDrop={() => {
                      setDropReason('');
                      setDropTarget(action.action_key);
                      setModalAction({ ...action, modalType: 'drop' } as any);
                    }}
                    loading={actionLoading === action.action_key}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {modalAction && (
        <ActionModal
          action={modalAction}
          onClose={() => {
            setModalAction(null);
            setDropTarget(null);
          }}
          onDodConfirm={() => handleDodConfirm(modalAction)}
          onEvidenceSubmit={() => handleEvidenceSubmit(modalAction)}
          evidenceForm={evidenceForm}
          setEvidenceForm={setEvidenceForm}
          onMarkDone={() => handleMarkDone(modalAction)}
          onDrop={() => handleDrop(modalAction)}
          dropReason={dropReason}
          setDropReason={setDropReason}
          dropTarget={dropTarget}
          loading={!!actionLoading}
        />
      )}
    </div>
  );
}

function ActionCard({
  action,
  assessmentId,
  companyId,
  isClosed: cycleClosed,
  onConfirmDod,
  onRegisterEvidence,
  onMarkDone,
  onDrop,
  loading,
}: {
  action: DashboardAction;
  assessmentId: string;
  companyId: string;
  isClosed?: boolean;
  onConfirmDod: () => void;
  onRegisterEvidence: () => void;
  onMarkDone: () => void;
  onDrop: () => void;
  loading: boolean;
}) {
  const canMarkDone = action.dod_confirmed && action.evidence_exists;
  const actionClosed = action.status === 'DONE' || action.status === 'DROPPED';
  const disabled = cycleClosed || loading;

  return (
    <div
      style={{
        border: '1px solid #dee2e6',
        borderRadius: '8px',
        padding: '1.25rem',
        backgroundColor: '#fff',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
        <div>
          <span
            style={{
              display: 'inline-block',
              padding: '0.25rem 0.6rem',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: '600',
              backgroundColor: `${STATUS_COLORS[action.status] || '#6c757d'}22`,
              color: STATUS_COLORS[action.status] || '#6c757d',
            }}
          >
            {humanizeActionStatus(action.status)}
          </span>
          <span style={{ marginLeft: '0.5rem', fontWeight: '600' }}>Ação {action.position}</span>
        </div>
      </div>
      <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.1rem' }}>{displayActionTitle(action.title)}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1rem', fontSize: '0.9rem', color: '#555' }}>
        <div><strong>Dono:</strong> {action.owner_name}</div>
        <div><strong>Métrica:</strong> {action.metric_text}</div>
        <div><strong>Checkpoint:</strong> {action.checkpoint_date}</div>
      </div>

      {(action.cause_label || (action.why && action.why.length > 0)) && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#f8f9fa', borderRadius: '6px', fontSize: '0.9rem' }}>
          {action.cause_label && (
            <div style={{ marginBottom: '0.5rem' }}><strong>Causa provável:</strong> {action.cause_label}</div>
          )}
          {action.why && action.why.length > 0 && (
            <div>
              <strong>Respostas que sustentam:</strong>
              <ul style={{ margin: '0.25rem 0 0 1.25rem', padding: 0 }}>
                {action.why.map((w, i) => (
                  <li key={i}>{w.label || w.question_key}: {formatWhyAnswer(w.answer)}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div style={{ marginBottom: '1rem' }}>
        <strong style={{ fontSize: '0.85rem' }}>{labels.dod}:</strong>
        <ul style={{ margin: '0.25rem 0 0 1.25rem', padding: 0, fontSize: '0.9rem' }}>
          {action.dod_checklist.map((item, i) => (
            <li key={i} style={{ marginBottom: '0.2rem' }}>
              {item}
              {action.dod_confirmed && <span style={{ color: '#198754', marginLeft: '0.5rem' }}>✓</span>}
            </li>
          ))}
        </ul>
        {!action.dod_confirmed && <span style={{ fontSize: '0.8rem', color: '#6c757d' }}>{labels.checklistIncomplete}</span>}
      </div>

      {action.evidence_exists && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#f8f9fa', borderRadius: '6px', fontSize: '0.9rem' }}>
          <strong>Evidência:</strong>
          {action.before_baseline && <div>Antes: {action.before_baseline}</div>}
          {action.after_result && <div>Depois: {action.after_result}</div>}
          {action.declared_gain && (
            <div style={{ marginTop: '0.5rem', padding: '0.35rem 0.5rem', backgroundColor: '#d4edda', borderRadius: '4px', fontWeight: '600', color: '#155724' }}>
              Ganho: {action.declared_gain}
            </div>
          )}
        </div>
      )}

      {action.consultant_notes && action.consultant_notes.length > 0 && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#f0f4ff', borderRadius: '6px', fontSize: '0.9rem', border: '1px solid #cce5ff' }}>
          <strong>Notas de acompanhamento:</strong>
          <ul style={{ margin: '0.5rem 0 0 0', padding: 0, listStyle: 'none' }}>
            {action.consultant_notes.map((n, i) => (
              <li key={i} style={{ marginBottom: '0.5rem', padding: '0.5rem', backgroundColor: '#fff', borderRadius: '4px', borderLeft: '3px solid #0d6efd' }}>
                <span style={{ fontSize: '0.8rem', color: '#6c757d' }}>
                  {NOTE_TYPE_LABELS[n.note_type] || n.note_type} — {new Date(n.created_at).toLocaleDateString('pt-BR')}
                </span>
                <div style={{ marginTop: '0.25rem' }}>{n.note_text}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {action.status === 'DROPPED' && action.dropped_reason && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#f8d7da', borderRadius: '6px', fontSize: '0.9rem' }}>
          <strong>Motivo do descarte:</strong> {action.dropped_reason}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem' }}>
        {companyId && assessmentId && (
          <PedirApoioButton
            companyId={companyId}
            assessmentId={assessmentId}
            actionId={action.action_key}
            actionTitle={displayActionTitle(action.title)}
            label="Pedir apoio"
          />
        )}
        {!actionClosed && !cycleClosed && (
          <>
            <Link
            href={`/full/acao/${encodeURIComponent(action.action_key)}?assessment_id=${assessmentId}&company_id=${companyId}`}
            style={{ ...btnStyle('#6f42c1'), textDecoration: 'none', display: 'inline-block' }}
          >
            Detalhe da ação
          </Link>
          {!action.dod_confirmed && (
            <button onClick={onConfirmDod} disabled={disabled} style={btnStyle('#0d6efd')}>
              {labels.confirmDod}
            </button>
          )}
          {!action.evidence_exists && (
            <button onClick={onRegisterEvidence} disabled={disabled} style={btnStyle('#0d6efd')}>
              Registrar evidência
            </button>
          )}
          {canMarkDone && (
            <button onClick={onMarkDone} disabled={disabled} style={btnStyle('#198754')}>
              {labels.markDone}
            </button>
          )}
            <button onClick={onDrop} disabled={disabled} style={btnStyle('#dc3545')}>
              {labels.dropAction}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ActionModal({
  action,
  onClose,
  onDodConfirm,
  onEvidenceSubmit,
  evidenceForm,
  setEvidenceForm,
  onMarkDone,
  onDrop,
  dropReason,
  setDropReason,
  dropTarget,
  loading,
}: {
  action: DashboardAction & { modalType?: string };
  onClose: () => void;
  onDodConfirm: () => void;
  onEvidenceSubmit: () => void;
  evidenceForm: { evidence_text: string; before_baseline: string; after_result: string };
  setEvidenceForm: (v: any) => void;
  onMarkDone: () => void;
  onDrop: () => void;
  dropReason: string;
  setDropReason: (v: string) => void;
  dropTarget: string | null;
  loading: boolean;
}) {
  const type = (action as any).modalType;
  if (!type) return null;

  if (type === 'dod') {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
          <h3 style={{ margin: '0 0 1rem 0' }}>{labels.confirmDod} — {displayActionTitle(action.title)}</h3>
          <p style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>Confirme que todos os itens foram concluídos:</p>
          <ul style={{ marginBottom: '1rem', paddingLeft: '1.25rem' }}>
            {action.dod_checklist.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={btnStyle('#6c757d')}>Cancelar</button>
            <button onClick={onDodConfirm} disabled={loading} style={btnStyle('#198754')}>Confirmar</button>
          </div>
        </div>
      </div>
    );
  }

  if (type === 'evidence') {
    const isMechanism = !!action.cause_label;
    const metricHint = action.metric_text || 'métrica';
    const beforePlaceholder = isMechanism ? `Ex: 0 ${metricHint}` : 'Ex: situação antes da ação';
    const afterPlaceholder = isMechanism ? `Ex: 15 ${metricHint}` : 'Ex: situação após a ação';
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
          <h3 style={{ margin: '0 0 1rem 0' }}>Registrar evidência — {displayActionTitle(action.title)}</h3>
          {isMechanism && (
            <p style={{ marginBottom: '1rem', fontSize: '0.9rem', color: '#6c757d' }}>
              Ação de mecanismo: use texto curto e métrica simples ({metricHint}).
            </p>
          )}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '600' }}>Descrição</label>
            <textarea
              value={evidenceForm.evidence_text}
              onChange={(e) => setEvidenceForm({ ...evidenceForm, evidence_text: e.target.value })}
              rows={2}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #ced4da' }}
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '600' }}>Antes (baseline)</label>
            <input
              type="text"
              value={evidenceForm.before_baseline}
              onChange={(e) => setEvidenceForm({ ...evidenceForm, before_baseline: e.target.value })}
              placeholder={beforePlaceholder}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #ced4da' }}
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '600' }}>Depois (resultado)</label>
            <input
              type="text"
              value={evidenceForm.after_result}
              onChange={(e) => setEvidenceForm({ ...evidenceForm, after_result: e.target.value })}
              placeholder={afterPlaceholder}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #ced4da' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={btnStyle('#6c757d')}>Cancelar</button>
            <button onClick={() => onEvidenceSubmit()} disabled={loading} style={btnStyle('#198754')}>Salvar</button>
          </div>
        </div>
      </div>
    );
  }

  if (type === 'done') {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
          <h3 style={{ margin: '0 0 1rem 0' }}>{labels.markDoneTitle} — {displayActionTitle(action.title)}</h3>
          <p style={{ marginBottom: '1rem' }}>Confirma que requisitos e evidência estão completos?</p>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={btnStyle('#6c757d')}>Cancelar</button>
            <button onClick={onMarkDone} disabled={loading} style={btnStyle('#198754')}>{labels.markDoneConfirm}</button>
          </div>
        </div>
      </div>
    );
  }

  if (type === 'drop') {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
          <h3 style={{ margin: '0 0 1rem 0' }}>{labels.dropActionTitle} — {displayActionTitle(action.title)}</h3>
          <p style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>Informe o motivo do descarte (obrigatório):</p>
          <textarea
            value={dropReason}
            onChange={(e) => setDropReason(e.target.value)}
            rows={3}
            placeholder="Ex: Prioridades mudaram; recurso indisponível..."
            style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #ced4da', marginBottom: '1rem' }}
          />
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={btnStyle('#6c757d')}>Cancelar</button>
            <button onClick={onDrop} disabled={loading || !dropReason.trim()} style={btnStyle('#dc3545')}>Confirmar descarte</button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  backgroundColor: '#fff',
  borderRadius: '8px',
  padding: '1.5rem',
  maxWidth: '480px',
  width: '90%',
};

function btnStyle(bg: string): React.CSSProperties {
  return {
    padding: '0.5rem 1rem',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: bg,
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.9rem',
  };
}
