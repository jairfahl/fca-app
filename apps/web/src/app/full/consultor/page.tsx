'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import { formatPlanProgress, humanizeActionStatus, humanizeSegment, humanizeStatus, labels } from '@/lib/uiCopy';

function displayActionTitle(title: string): string {
  return title?.includes('Ação padrão') ? labels.fallbackAction : title || labels.fallbackAction;
}

interface ConsultantNote {
  id?: string;
  note_type: string;
  note_text: string;
  created_at: string;
}

type WhyItem = { question_key: string; answer: number | string; label?: string };

interface DashboardAction {
  position: number;
  action_key: string;
  title: string;
  owner_name: string;
  metric_text: string;
  checkpoint_date: string;
  status: string;
  declared_gain: string | null;
  cause_label?: string | null;
  why?: WhyItem[] | null;
}

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

interface ConsultantData {
  assessment: { id: string; company_id: string; company_name?: string | null; segment: string; status: string };
  dashboard: { progress: string; actions: DashboardAction[] };
}

type CompanyItem = {
  id: string;
  name: string;
  full_status: string | null;
  full_version: number | null;
  full_assessment_id: string | null;
  plan_progress: string | null;
};

const NOTE_TYPE_OPTIONS = [
  { value: 'ORIENTACAO', label: 'Orientação' },
  { value: 'IMPEDIMENTO', label: 'Impedimento' },
  { value: 'PROXIMO_PASSO', label: 'Próximo passo' },
];

const NOTE_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  NOTE_TYPE_OPTIONS.map((o) => [o.value, o.label])
);

function statusLabel(status: string): string {
  if (status === 'DRAFT') return 'Em andamento';
  if (status === 'SUBMITTED') return 'Concluído';
  if (status === 'CLOSED') return 'Ciclo finalizado';
  return humanizeStatus(status);
}

export default function FullConsultorPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
        <ConsultorContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function ConsultorContent() {
  const { user, session } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const assessmentId = searchParams.get('assessment_id');
  const companyId = searchParams.get('company_id');

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ConsultantData | null>(null);
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [companyOverview, setCompanyOverview] = useState<{
    company: { id: string; name: string };
    full_status: string | null;
    full_assessment_id: string | null;
    plan_progress: string | null;
  } | null>(null);
  const [error, setError] = useState('');
  const [notesByAction, setNotesByAction] = useState<Record<string, ConsultantNote[]>>({});
  const [noteForm, setNoteForm] = useState<Record<string, { note_type: string; note_text: string }>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  const loadCompanies = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/consultor/companies', {}, session.access_token);
      setCompanies(res?.companies || []);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 403) {
        router.replace('/full');
        return;
      }
      setError(err?.message || 'Erro ao carregar empresas');
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, router]);

  const loadCompanyOverview = useCallback(async () => {
    if (!companyId || !session?.access_token) return;
    setError('');
    try {
      const res = await apiFetch(`/consultor/company/${companyId}/overview`, {}, session.access_token);
      setCompanyOverview({
        company: res.company,
        full_status: res.full_status || null,
        full_assessment_id: res.full_assessment_id || null,
        plan_progress: res.plan_progress || null,
      });
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 403) {
        router.replace('/full');
        return;
      }
      setError(err?.message || 'Erro ao carregar empresa');
    }
  }, [companyId, session?.access_token, router]);

  const loadConsultorView = useCallback(async () => {
    if (!assessmentId || !session?.access_token) return;
    const qs = companyId ? `?company_id=${companyId}` : '';
    try {
      setLoading(true);
      setError('');
      const res = await apiFetch(
        `/full/consultor/assessments/${assessmentId}${qs}`,
        {},
        session.access_token
      );
      setData(res);
      setNotesByAction({});
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 401) {
        router.push('/login');
        return;
      }
      setError(err.message || 'Erro ao carregar');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [assessmentId, companyId, session?.access_token, router]);

  const loadNotes = useCallback(
    async (actionKey: string) => {
      if (!assessmentId || !session?.access_token) return;
      const cid = data?.assessment?.company_id || companyId;
      const qs = cid ? `?company_id=${cid}` : '';
      try {
        const res = await apiFetch(
          `/full/assessments/${assessmentId}/actions/${encodeURIComponent(actionKey)}/notes${qs}`,
          {},
          session.access_token
        );
        setNotesByAction((prev) => ({ ...prev, [actionKey]: res.notes || [] }));
      } catch {
        setNotesByAction((prev) => ({ ...prev, [actionKey]: [] }));
      }
    },
    [assessmentId, companyId, data?.assessment?.company_id, session?.access_token]
  );

  useEffect(() => {
    if (assessmentId) {
      loadConsultorView();
    } else {
      loadCompanies();
    }
  }, [assessmentId, loadConsultorView, loadCompanies]);

  useEffect(() => {
    if (companyId && !assessmentId) {
      loadCompanyOverview();
    } else {
      setCompanyOverview(null);
    }
  }, [companyId, assessmentId, loadCompanyOverview]);

  useEffect(() => {
    if (data?.dashboard?.actions) {
      data.dashboard.actions.forEach((a) => loadNotes(a.action_key));
    }
  }, [data?.dashboard?.actions, loadNotes]);

  const handleSubmitNote = async (actionKey: string) => {
    const form = noteForm[actionKey];
    if (!form?.note_text?.trim() || !assessmentId || !session?.access_token) return;
    const cid = data?.assessment?.company_id || companyId;
    const qs = cid ? `?company_id=${cid}` : '';
    setSubmitting(actionKey);
    try {
      await apiFetch(
        `/full/consultor/assessments/${assessmentId}/actions/${encodeURIComponent(actionKey)}/notes${qs}`,
        {
          method: 'POST',
          body: { note_type: form.note_type || 'ORIENTACAO', note_text: form.note_text.trim() },
        },
        session.access_token
      );
      setNoteForm((prev) => ({ ...prev, [actionKey]: { note_type: 'ORIENTACAO', note_text: '' } }));
      await loadNotes(actionKey);
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar nota');
    } finally {
      setSubmitting(null);
    }
  };

  if (loading && !data) {
    return (
      <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center' }}>Carregando...</div>
      </div>
    );
  }

  // Modo 1: Lista de empresas (home do consultor)
  if (!assessmentId && !companyId) {
    return (
      <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ marginBottom: '1rem', color: '#666', fontSize: '0.9rem' }}>
          {labels.consultantLoginLabel} {user?.email}
        </div>
        <h1 style={{ marginBottom: '1.5rem' }}>Área do consultor — Diagnóstico FULL</h1>
        <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Link href="/logout" style={{ color: '#0070f3' }}>Sair</Link>
          <span style={{ color: '#dee2e6' }}>|</span>
          <Link href="/consultor" style={{ color: '#0070f3' }}>Pedidos de ajuda e visão LIGHT</Link>
        </div>

        {error && (
          <div style={{ padding: '1rem', backgroundColor: '#f8d7da', color: '#721c24', borderRadius: '8px', marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        <h2 style={{ marginBottom: '1rem' }}>Empresas</h2>
        {companies.length === 0 ? (
          <p style={{ color: '#666' }}>Nenhuma empresa cadastrada.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {companies.map((c) => (
              <li key={c.id} style={{ marginBottom: '0.5rem' }}>
                <Link
                  href={`/full/consultor?company_id=${c.id}`}
                  style={{
                    display: 'block',
                    padding: '1rem 1.25rem',
                    backgroundColor: '#fff',
                    borderRadius: '8px',
                    textDecoration: 'none',
                    color: '#212529',
                    border: '1px solid #dee2e6',
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{c.name}</span>
                  {c.full_status && (
                    <span style={{ marginLeft: '0.5rem', fontSize: '0.9rem', color: '#6c757d' }}>
                      — v{c.full_version ?? '?'} {statusLabel(c.full_status)}
                      {c.plan_progress && ` (${c.plan_progress})`}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // Modo 2: Visão da empresa (company_id, sem assessment_id) — links para histórico, dashboard, relatório
  if (companyId && !assessmentId) {
    const ov = companyOverview;
    const companyName = ov?.company?.name || companyId;
    return (
      <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ marginBottom: '1rem', color: '#666', fontSize: '0.9rem' }}>
          {labels.consultantLoginLabel} {user?.email}
        </div>
        <div style={{ marginBottom: '1.5rem' }}>
          <Link href="/full/consultor" style={{ color: '#0070f3' }}>← Empresas</Link>
        </div>
        <h1 style={{ marginBottom: '1.5rem' }}>{companyName}</h1>
        {ov && (
          <div style={{ marginBottom: '0.5rem', color: '#6c757d' }}>
            {ov.full_status && `Diagnóstico FULL — ${statusLabel(ov.full_status)}`}
            {ov.plan_progress && ` • Progresso: ${ov.plan_progress}`}
          </div>
        )}
        {error && (
          <div style={{ padding: '1rem', backgroundColor: '#f8d7da', color: '#721c24', borderRadius: '8px', marginBottom: '1rem' }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem' }}>
          <Link
            href={`/full/historico?company_id=${companyId}`}
            style={{
              display: 'inline-block',
              padding: '0.65rem 1rem',
              backgroundColor: '#0d6efd',
              color: '#fff',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: 'bold',
            }}
          >
            Histórico de versões
          </Link>
          <Link
            href={`/full/relatorio?company_id=${companyId}`}
            style={{
              display: 'inline-block',
              padding: '0.65rem 1rem',
              backgroundColor: '#198754',
              color: '#fff',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: 'bold',
            }}
          >
            Relatório PDF
          </Link>
          {ov?.full_assessment_id && (
            <Link
              href={`/full/dashboard?company_id=${companyId}&assessment_id=${ov.full_assessment_id}`}
              style={{
                display: 'inline-block',
                padding: '0.65rem 1rem',
                backgroundColor: '#6f42c1',
                color: '#fff',
                borderRadius: '8px',
                textDecoration: 'none',
                fontWeight: 'bold',
              }}
            >
              Dashboard / Acompanhar execução
            </Link>
          )}
          {ov?.full_assessment_id && (
            <Link
              href={`/full/consultor?company_id=${companyId}&assessment_id=${ov.full_assessment_id}`}
              style={{
                display: 'inline-block',
                padding: '0.65rem 1rem',
                backgroundColor: '#6c757d',
                color: '#fff',
                borderRadius: '8px',
                textDecoration: 'none',
                fontWeight: 'bold',
              }}
            >
              Ver ações e notas
            </Link>
          )}
        </div>
      </div>
    );
  }

  // Modo 3: Detalhe do assessment (assessment_id) — visão existente com notas
  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1rem', color: '#666', fontSize: '0.9rem' }}>
        {labels.consultantLoginLabel} {user?.email}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
        <h1 style={{ margin: 0 }}>Diagnóstico FULL</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <Link
            href={`/full/dashboard?company_id=${data?.assessment?.company_id || companyId || ''}&assessment_id=${assessmentId || ''}`}
            style={{
              display: 'inline-block',
              backgroundColor: '#0d6efd',
              color: '#fff',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              textDecoration: 'none',
              fontSize: '0.9rem',
            }}
          >
            {labels.followExecution}
          </Link>
          <Link
            href={`/full/consultor?company_id=${data?.assessment?.company_id || companyId || ''}`}
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
            Voltar à empresa
          </Link>
          <Link
            href="/full/consultor"
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
            Empresas
          </Link>
        </div>
      </div>

      {error && (
        <div style={{ padding: '1rem', backgroundColor: '#f8d7da', color: '#721c24', borderRadius: '8px', marginBottom: '1.5rem' }}>
          {error}
        </div>
      )}

      {data && (
        <>
          <div
            style={{
              padding: '1.25rem',
              backgroundColor: '#e7f3ff',
              borderRadius: '8px',
              marginBottom: '2rem',
              border: '1px solid #b6d4fe',
            }}
          >
            <div style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              Diagnóstico FULL — Segmento: {humanizeSegment(data.assessment.segment)} — {labels.situation}: {humanizeStatus(data.assessment.status)}
            </div>
            {data.assessment.company_name && (
              <div style={{ fontSize: '1rem', marginBottom: '0.25rem' }}>Empresa: {data.assessment.company_name}</div>
            )}
            <div style={{ fontSize: '1rem', fontWeight: 600 }}>{formatPlanProgress(data.dashboard.progress)}</div>
          </div>

          {(!data.dashboard.actions || data.dashboard.actions.length === 0) && (
            <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: '#f8f9fa', borderRadius: '8px', color: '#666' }}>
              Nenhuma ação no plano ainda.
            </div>
          )}

          {data.dashboard.actions && data.dashboard.actions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {data.dashboard.actions.map((action) => (
                <div
                  key={action.action_key}
                  style={{
                    border: '1px solid #dee2e6',
                    borderRadius: '8px',
                    padding: '1.25rem',
                    backgroundColor: '#fff',
                  }}
                >
                  <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.1rem' }}>Ação {action.position}: {displayActionTitle(action.title)}</h3>
                  <table style={{ width: '100%', fontSize: '0.9rem', marginBottom: '1rem' }}>
                    <tbody>
                      <tr>
                        <td style={{ padding: '0.25rem 1rem 0.25rem 0', fontWeight: 600 }}>{labels.situation}</td>
                        <td>{humanizeActionStatus(action.status)}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '0.25rem 1rem 0.25rem 0', fontWeight: 600 }}>Dono</td>
                        <td>{action.owner_name}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '0.25rem 1rem 0.25rem 0', fontWeight: 600 }}>Checkpoint</td>
                        <td>{action.checkpoint_date}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '0.25rem 1rem 0.25rem 0', fontWeight: 600 }}>Ganho declarado</td>
                        <td>{action.declared_gain || '—'}</td>
                      </tr>
                    </tbody>
                  </table>

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

                  <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #eee' }}>
                    <strong>Notas de acompanhamento</strong>
                    {notesByAction[action.action_key]?.length ? (
                      <ul style={{ margin: '0.5rem 0', padding: 0, listStyle: 'none' }}>
                        {notesByAction[action.action_key].map((n, i) => (
                          <li key={i} style={{ marginBottom: '0.5rem', padding: '0.5rem', backgroundColor: '#f8f9fa', borderRadius: '4px', fontSize: '0.9rem' }}>
                            <span style={{ color: '#6c757d' }}>{NOTE_TYPE_LABELS[n.note_type] || n.note_type} — {new Date(n.created_at).toLocaleDateString('pt-BR')}</span>
                            <div>{n.note_text}</div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div style={{ color: '#6c757d', fontSize: '0.9rem', marginTop: '0.25rem' }}>Nenhuma nota ainda.</div>
                    )}

                    <div style={{ marginTop: '1rem' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        {NOTE_TYPE_OPTIONS.map((opt) => (
                          <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <input
                              type="radio"
                              name={`note_type_${action.action_key}`}
                              value={opt.value}
                              checked={(noteForm[action.action_key]?.note_type || 'ORIENTACAO') === opt.value}
                              onChange={() =>
                                setNoteForm((prev) => ({
                                  ...prev,
                                  [action.action_key]: { ...(prev[action.action_key] || { note_type: 'ORIENTACAO', note_text: '' }), note_type: opt.value },
                                }))
                              }
                            />
                            {opt.label}
                          </label>
                        ))}
                      </div>
                      <textarea
                        value={noteForm[action.action_key]?.note_text || ''}
                        onChange={(e) =>
                          setNoteForm((prev) => ({
                            ...prev,
                            [action.action_key]: { ...(prev[action.action_key] || { note_type: 'ORIENTACAO', note_text: '' }), note_text: e.target.value },
                          }))
                        }
                        rows={2}
                        placeholder="Nova nota..."
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #ced4da', marginBottom: '0.5rem' }}
                      />
                      <button
                        onClick={() => handleSubmitNote(action.action_key)}
                        disabled={submitting === action.action_key || !(noteForm[action.action_key]?.note_text?.trim())}
                        style={{
                          padding: '0.5rem 1rem',
                          borderRadius: '6px',
                          border: 'none',
                          backgroundColor: '#0d6efd',
                          color: '#fff',
                          cursor: 'pointer',
                          fontSize: '0.9rem',
                        }}
                      >
                        {submitting === action.action_key ? 'Salvando...' : 'Adicionar nota'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
