'use client';

import { Suspense, useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { labels } from '@/lib/uiCopy';
import { getEntitlement } from '@/lib/entitlement';
import { assertFullAccess } from '@/lib/fullGuard';

type CatalogQuestion = {
  process_key: string;
  question_key: string;
  question_text: string;
  answer_type?: string;
  dimension?: string;
  cost_axis?: 'DINHEIRO' | 'CLIENTE' | 'RISCO' | 'GARGALO' | 'TRAVAMENTO';
};

type CatalogProcess = {
  area_key: string;
  process_key: string;
  o_que_protege: string;
  sinal_alerta: string;
  impacto_tipico: string;
  questions: CatalogQuestion[];
};

type CatalogArea = {
  area: string;
  processes: CatalogProcess[];
};

type WizardData = {
  segment: string;
  areas: CatalogArea[];
  processes: CatalogProcess[];
};

type CurrentAssessment = {
  id: string;
  status: string;
  type: 'FULL';
  answers: Array<{
    process_key: string;
    question_key: string;
    answer_value: number;
    answered_at?: string;
  }>;
};

const PROCESS_LABELS: Record<string, string> = {
  COMERCIAL: 'Comercial',
  OPERACOES: 'Operações',
  ADM_FIN: 'Adm/Fin',
  GESTAO: 'Gestão',
};

export default function FullWizardPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
        <FullWizardContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function FullWizardContent() {
  const { user, session } = useAuth();
  const searchParams = useSearchParams();
  const companyId = searchParams.get('company_id');
  const assessmentIdFromQuery = searchParams.get('assessment_id');

  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'blocked' | 'missing_company'>('loading');
  const [error, setError] = useState('');
  const [wizard, setWizard] = useState<WizardData | null>(null);
  const [assessment, setAssessment] = useState<CurrentAssessment | null>(null);
  const [activeProcessKey, setActiveProcessKey] = useState<string | null>(null);
  const [answersMap, setAnswersMap] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const processList = useMemo(() => wizard?.processes || [], [wizard]);
  const activeProcess = useMemo(
    () => processList.find((p) => p.process_key === activeProcessKey) || processList[0] || null,
    [processList, activeProcessKey]
  );

  const keyOf = (processKey: string, questionKey: string) => `${processKey}:${questionKey}`;

  const answeredCountByProcess = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of processList) {
      out[p.process_key] = p.questions.filter((q) => typeof answersMap[keyOf(p.process_key, q.question_key)] === 'number').length;
    }
    return out;
  }, [processList, answersMap]);

  const firstIncompleteProcessKey = useMemo(() => {
    for (const p of processList) {
      const answered = answeredCountByProcess[p.process_key] || 0;
      if (answered < p.questions.length) return p.process_key;
    }
    return processList[0]?.process_key || null;
  }, [processList, answeredCountByProcess]);

  const load = useCallback(async () => {
    if (!companyId || !session?.access_token) return;
    try {
      setState('loading');
      setError('');

      const ent = await getEntitlement(companyId, session.access_token);
      if (!assertFullAccess(ent)) {
        setState('blocked');
        return;
      }

      const current = await apiFetch(`/full/assessments/current?company_id=${companyId}`, {}, session.access_token) as CurrentAssessment;
      if (!current?.id) {
        setError('Falha ao carregar assessment FULL');
        setState('error');
        return;
      }
      setAssessment(current);

      const cat = await apiFetch(`/full/catalog?company_id=${companyId}`, {}, session.access_token) as WizardData;
      setWizard(cat);

      const map: Record<string, number> = {};
      (current.answers || []).forEach((a) => {
        map[keyOf(a.process_key, a.question_key)] = a.answer_value;
      });
      setAnswersMap(map);

      const storageKey = `full_wizard_last_process:${companyId}:${current.id}`;
      const fromStorage = typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null;
      const candidate = (assessmentIdFromQuery && current.id === assessmentIdFromQuery && fromStorage) ? fromStorage : null;
      const first = candidate || cat?.processes?.find((p) => p.process_key === fromStorage)?.process_key || cat?.processes?.[0]?.process_key || null;
      setActiveProcessKey(first);

      setState('ready');
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar wizard FULL');
      setState('error');
    }
  }, [companyId, session?.access_token, assessmentIdFromQuery]);

  useEffect(() => {
    if (!companyId) {
      setState('missing_company');
      return;
    }
    if (!session?.access_token) return;
    load();
  }, [companyId, session?.access_token, load]);

  useEffect(() => {
    if (!companyId || !assessment?.id || !activeProcessKey || typeof window === 'undefined') return;
    window.localStorage.setItem(`full_wizard_last_process:${companyId}:${assessment.id}`, activeProcessKey);
  }, [companyId, assessment?.id, activeProcessKey]);

  const saveQuestion = useCallback(async (processKey: string, questionKey: string, value: number) => {
    if (!session?.access_token || !companyId || !assessment?.id) return;
    await apiFetch(
      `/full/assessments/${assessment.id}/answers?company_id=${companyId}`,
      {
        method: 'POST',
        body: {
          process_key: processKey,
          question_key: questionKey,
          answer_value: value,
          answered_at: new Date().toISOString(),
        },
      },
      session.access_token
    );
  }, [session?.access_token, companyId, assessment?.id]);

  const handleChange = (processKey: string, questionKey: string, value: number) => {
    setAnswersMap((prev) => ({ ...prev, [keyOf(processKey, questionKey)]: value }));
  };

  const handleBlur = async (processKey: string, questionKey: string) => {
    const val = answersMap[keyOf(processKey, questionKey)];
    if (typeof val !== 'number') return;
    try {
      await saveQuestion(processKey, questionKey, val);
    } catch (e) {
      setError('Falha ao salvar resposta');
    }
  };

  const saveDraft = async () => {
    if (!activeProcess || !assessment?.id) return;
    setSaving(true);
    try {
      for (const q of activeProcess.questions) {
        const val = answersMap[keyOf(activeProcess.process_key, q.question_key)];
        if (typeof val === 'number') {
          // eslint-disable-next-line no-await-in-loop
          await saveQuestion(activeProcess.process_key, q.question_key, val);
        }
      }
      setError('');
    } catch (e) {
      setError('Falha ao salvar rascunho');
    } finally {
      setSaving(false);
    }
  };

  const saveAndContinue = async () => {
    await saveDraft();
    if (!activeProcess) return;
    const idx = processList.findIndex((p) => p.process_key === activeProcess.process_key);
    const nextProcess = processList.slice(idx + 1).find((p) => (answeredCountByProcess[p.process_key] || 0) < p.questions.length)
      || processList[idx + 1]
      || null;
    if (nextProcess?.process_key) {
      setActiveProcessKey(nextProcess.process_key);
    } else if (firstIncompleteProcessKey) {
      setActiveProcessKey(firstIncompleteProcessKey);
    }
  };

  const allComplete = processList.length > 0 && processList.every((p) => (answeredCountByProcess[p.process_key] || 0) >= p.questions.length);

  const handleSubmit = async () => {
    if (!assessment?.id || !companyId || !session?.access_token || !allComplete) return;
    setSubmitting(true);
    setError('');
    try {
      await apiFetch(
        `/full/assessments/${assessment.id}/submit?company_id=${companyId}`,
        { method: 'POST' },
        session.access_token
      );
      if (typeof window !== 'undefined') {
        window.location.href = `/full?company_id=${companyId}`;
      }
    } catch (e: any) {
      setError(e?.message || 'Falha ao submeter');
    } finally {
      setSubmitting(false);
    }
  };

  if (state === 'missing_company') {
    return <div style={{ padding: '2rem' }}>{labels.missingCompany}</div>;
  }
  if (state === 'blocked') {
    return <div style={{ padding: '2rem' }}>Conteúdo disponível apenas no FULL.</div>;
  }
  if (state === 'loading') {
    return <div style={{ padding: '2rem' }}>Carregando wizard FULL...</div>;
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1rem', color: '#666' }}>Logado como: {user?.email}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>Fazer diagnóstico FULL</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link href={`/full?company_id=${companyId}`} style={linkBtn('#6c757d')}>Voltar ao FULL</Link>
          <Link href={`/full/dashboard?company_id=${companyId}&assessment_id=${assessment?.id || ''}`} style={linkBtn('#198754')}>Dashboard</Link>
        </div>
      </div>
      {error && <div style={{ marginBottom: '1rem', padding: '0.75rem', borderRadius: '8px', background: '#f8d7da', color: '#721c24' }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1rem' }}>
        <div style={{ border: '1px solid #dee2e6', borderRadius: '8px', padding: '0.75rem', background: '#fff' }}>
          <h3 style={{ marginTop: 0 }}>Áreas e processos</h3>
          {(wizard?.areas || []).map((area) => (
            <div key={area.area} style={{ marginBottom: '0.8rem' }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#495057', marginBottom: '0.3rem' }}>{area.area}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {area.processes.map((p) => {
                  const answered = answeredCountByProcess[p.process_key] || 0;
                  const total = p.questions.length;
                  const active = activeProcessKey === p.process_key;
                  return (
                    <button
                      key={p.process_key}
                      onClick={() => setActiveProcessKey(p.process_key)}
                      style={{
                        textAlign: 'left',
                        border: active ? '2px solid #0d6efd' : '1px solid #dee2e6',
                        background: '#fff',
                        borderRadius: '8px',
                        padding: '0.55rem',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{PROCESS_LABELS[p.process_key] || p.process_key}</div>
                      <div style={{ fontSize: '0.82rem', color: '#666' }}>{answered} de {total} respondidas</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div style={{ border: '1px solid #dee2e6', borderRadius: '8px', padding: '1rem', background: '#fff' }}>
          {activeProcess ? (
            <>
              <h2 style={{ marginTop: 0 }}>{PROCESS_LABELS[activeProcess.process_key] || activeProcess.process_key}</h2>
              <div style={{ border: '1px solid #e9ecef', borderRadius: '8px', padding: '0.75rem', background: '#f8f9fa', marginBottom: '1rem' }}>
                <div><strong>O que isso protege:</strong> {activeProcess.o_que_protege}</div>
                <div><strong>Sinal de alerta do dono:</strong> {activeProcess.sinal_alerta}</div>
                <div><strong>Impacto típico:</strong> {activeProcess.impacto_tipico}</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                {activeProcess.questions.map((q) => {
                  const key = keyOf(activeProcess.process_key, q.question_key);
                  const value = answersMap[key];
                  return (
                    <div key={q.question_key} style={{ border: '1px solid #dee2e6', borderRadius: '8px', padding: '0.75rem' }}>
                      <div style={{ marginBottom: '0.5rem' }}>{q.question_text}</div>
                      <div style={{ fontSize: '0.8rem', color: '#6c757d', marginBottom: '0.5rem' }}>
                        Dimensão: {q.dimension || 'EM DEFINIÇÃO'} · Eixo de custo: {q.cost_axis || 'TRAVAMENTO'}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <input
                          type="range"
                          min={0}
                          max={10}
                          value={typeof value === 'number' ? value : 0}
                          onChange={(e) => handleChange(activeProcess.process_key, q.question_key, Number(e.target.value))}
                          onBlur={() => handleBlur(activeProcess.process_key, q.question_key)}
                          style={{ width: 220 }}
                        />
                        <span style={{ minWidth: '2rem', textAlign: 'center', fontWeight: 600 }}>
                          {typeof value === 'number' ? value : '-'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                <button onClick={saveDraft} disabled={saving || submitting} style={btn('#6c757d')}>
                  {saving ? 'Salvando...' : 'Salvar rascunho'}
                </button>
                <button onClick={saveAndContinue} disabled={saving || submitting} style={btn('#0d6efd')}>
                  Salvar e continuar
                </button>
                {allComplete && (
                  <button onClick={handleSubmit} disabled={saving || submitting} style={btn('#198754')}>
                    {submitting ? 'Enviando...' : 'Submeter diagnóstico'}
                  </button>
                )}
              </div>
            </>
          ) : (
            <div>Nenhum processo disponível para este segmento.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function btn(bg: string): CSSProperties {
  return {
    backgroundColor: bg,
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '0.6rem 1rem',
    fontWeight: 700,
    cursor: 'pointer',
  };
}

function linkBtn(bg: string): CSSProperties {
  return {
    display: 'inline-block',
    backgroundColor: bg,
    color: '#fff',
    borderRadius: '8px',
    padding: '0.5rem 0.9rem',
    textDecoration: 'none',
    fontWeight: 700,
  };
}

