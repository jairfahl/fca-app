'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import { labels } from '@/lib/uiCopy';
import { auditLog } from '@/lib/auditLog';
import { getEntitlement } from '@/lib/entitlement';
import { assertFullAccess } from '@/lib/fullGuard';

type CatalogProcess = {
  process_key: string;
  area_key: string;
  protects_dimension: string;
  protects_text: string | null;
  owner_alert_text: string | null;
  typical_impact_band: string | null;
  questions: Array<{ question_key: string; question_text: string }>;
};

type CatalogData = {
  segment: string;
  processes: CatalogProcess[];
};

type AssessmentData = { id: string; status: string; segment: string };

type AnswerItem = { process_key: string; question_key: string; answer_value: number };

const PROCESS_LABELS: Record<string, string> = {
  COMERCIAL: 'Comercial',
  OPERACOES: 'Operações',
  ADM_FIN: 'Adm/Fin',
  GESTAO: 'Gestão',
};

const PROTECTS_LABELS: Record<string, string> = {
  DINHEIRO: 'Dinheiro',
  CLIENTE: 'Cliente',
  RISCO: 'Risco',
  GARGALO: 'Gargalo',
};

export default function FullDiagnosticoPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
        <FullDiagnosticoContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function FullDiagnosticoContent() {
  const { user, session } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const companyId = searchParams.get('company_id');

  const [state, setState] = useState<'loading' | 'ready' | 'submitting' | 'error' | 'blocked' | 'missing_company'>('loading');
  const [error, setError] = useState('');
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [assessment, setAssessment] = useState<AssessmentData | null>(null);
  const [answers, setAnswers] = useState<AnswerItem[]>([]);

  const loadData = useCallback(async () => {
    if (!companyId || !session?.access_token) return;

    try {
      setState('loading');
      setError('');

      const entitlement = await getEntitlement(companyId, session.access_token);
      if (!assertFullAccess(entitlement, user?.email)) {
        setState('blocked');
        auditLog('full_diagnostico_blocked', { company_id: companyId });
        return;
      }

      const current = await apiFetch(
        `/full/assessments/current?company_id=${companyId}`,
        {},
        session.access_token
      );
      if (!current?.id) {
        setError('Não foi possível obter o diagnóstico atual.');
        setState('error');
        return;
      }

      setAssessment({ id: current.id, status: current.status, segment: current.segment || 'C' });

      const seg = current.segment || 'C';
      const cat = await apiFetch(
        `/full/catalog?segment=${seg}`,
        {},
        session.access_token
      );
      setCatalog(cat);

      const ans = await apiFetch(
        `/full/assessments/${current.id}/answers?company_id=${companyId}`,
        {},
        session.access_token
      );
      setAnswers(ans?.answers || []);

      setState('ready');
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 403) {
        setState('blocked');
        return;
      }
      setError(err.message || 'Falha ao carregar diagnóstico');
      setState('error');
    }
  }, [companyId, session?.access_token]);

  useEffect(() => {
    if (!companyId) {
      setState('missing_company');
      return;
    }
    if (!session?.access_token) return;
    loadData();
  }, [companyId, session?.access_token, loadData]);

  const handleSubmit = async () => {
    if (!companyId || !assessment?.id || !session?.access_token) return;
    setState('submitting');
    setError('');
    try {
      await apiFetch(
        `/full/assessments/${assessment.id}/submit?company_id=${companyId}`,
        { method: 'POST' },
        session.access_token
      );
      router.push(`/full/resultados?company_id=${companyId}&assessment_id=${assessment.id}`);
    } catch (err: any) {
      const code = (err as any)?.code;
      const missingProcessKeys = (err as any)?.missing_process_keys as string[] | undefined;
      const debugId = (err as any)?.debug_id as string | undefined;

      if (code === 'DIAG_INCOMPLETE') {
        const processKey = missingProcessKeys?.[0] || nextIncomplete?.process_key;
        if (processKey && companyId && assessment?.id) {
          router.push(`/full/wizard?company_id=${companyId}&assessment_id=${assessment.id}&process_key=${processKey}&msg=diag_incomplete`);
          return;
        }
      }

      if (code === 'FINDINGS_FAILED') {
        setError(debugId
          ? `Falha ao concluir diagnóstico (ref: ${debugId}). Tente novamente ou contate o suporte.`
          : 'Falha ao concluir diagnóstico. Tente novamente ou contate o suporte.');
      } else {
        setError(err.message || 'Erro ao submeter');
      }
      setState('ready');
    }
  };

  const answeredByProcess = (processKey: string) => {
    const qs = catalog?.processes?.find((p) => p.process_key === processKey)?.questions || [];
    const keys = new Set(qs.map((q) => `${processKey}:${q.question_key}`));
    return [...answers].filter((a) => keys.has(`${a.process_key}:${a.question_key}`)).length;
  };

  const totalQuestions = catalog?.processes?.reduce((s, p) => s + p.questions.length, 0) || 0;
  const totalAnswered = answers.length;
  const allComplete = totalQuestions > 0 && totalAnswered >= totalQuestions;
  const isSubmitted = assessment?.status === 'SUBMITTED' || assessment?.status === 'CLOSED';

  const processes = catalog?.processes || [];
  const nextIncomplete = processes.find((p) => answeredByProcess(p.process_key) < p.questions.length);

  if (state === 'missing_company') {
    return (
      <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ padding: '1rem', backgroundColor: '#f8d7da', color: '#721c24', borderRadius: '8px' }}>
          {labels.missingCompany}
        </div>
        <Link href="/full" style={{ display: 'inline-block', marginTop: '1rem', color: '#0070f3' }}>
          Voltar ao FULL
        </Link>
      </div>
    );
  }

  if (state === 'blocked') {
    return (
      <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ padding: '2rem', backgroundColor: '#fff3cd', borderRadius: '8px', textAlign: 'center' }}>
          <h2 style={{ color: '#856404' }}>Conteúdo disponível apenas no FULL</h2>
          <p style={{ margin: '1rem 0' }}>Este diagnóstico requer um plano FULL ativo.</p>
          <Link href={`/paywall?company_id=${companyId}`} style={{ color: '#0070f3', fontWeight: 'bold' }}>
            Ver plano FULL
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1rem', color: '#666', fontSize: '0.9rem' }}>
        Logado como: {user?.email}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
        <h1 style={{ margin: 0 }}>Diagnóstico FULL</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link
            href={companyId ? `/full?company_id=${companyId}` : '/full'}
            style={{
              display: 'inline-block',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              backgroundColor: '#6c757d',
              color: '#fff',
              textDecoration: 'none',
              fontSize: '0.9rem',
            }}
          >
            Voltar ao FULL
          </Link>
        </div>
      </div>

      {state === 'loading' && (
        <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando diagnóstico...</div>
      )}

      {state === 'error' && (
        <div style={{ padding: '1rem', backgroundColor: '#f8d7da', color: '#721c24', borderRadius: '8px', marginBottom: '1.5rem' }}>
          {error}
        </div>
      )}

      {(state === 'ready' || state === 'submitting') && catalog && (
        <>
          {isSubmitted ? (
            <div
              style={{
                padding: '1.25rem',
                backgroundColor: '#d4edda',
                borderRadius: '8px',
                marginBottom: '2rem',
                border: '1px solid #28a745',
                color: '#155724',
              }}
            >
              <strong>Diagnóstico FULL já enviado.</strong>
              <Link
                href={`/full/dashboard?company_id=${companyId}&assessment_id=${assessment?.id}`}
                style={{ display: 'inline-block', marginTop: '0.5rem', color: '#155724', fontWeight: '600' }}
              >
                Ir para o dashboard →
              </Link>
            </div>
          ) : (
            <div
              style={{
                padding: '1.25rem',
                backgroundColor: '#e7f3ff',
                borderRadius: '8px',
                marginBottom: '2rem',
                border: '1px solid #b6d4fe',
              }}
            >
              <div style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '0.25rem' }}>
                Progresso: {totalAnswered} de {totalQuestions} perguntas respondidas
              </div>
              <div style={{ color: '#0c5460', fontSize: '0.9rem' }}>
                {allComplete
                  ? 'Todas as perguntas foram respondidas. Você pode submeter o diagnóstico.'
                  : 'Responda todas as perguntas para habilitar o envio.'}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {processes.map((proc) => {
              const answered = answeredByProcess(proc.process_key);
              const total = proc.questions.length;
              const complete = answered >= total;
              const label = PROCESS_LABELS[proc.process_key] || proc.process_key;

              return (
                <div
                  key={proc.process_key}
                  style={{
                    border: '1px solid #dee2e6',
                    borderRadius: '8px',
                    padding: '1.25rem',
                    backgroundColor: '#fff',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '1rem',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '1.1rem', marginBottom: '0.25rem' }}>{label}</div>
                    <div style={{ fontSize: '0.9rem', color: '#666' }}>
                      {answered} de {total} perguntas respondidas
                    </div>
                  </div>
                  <Link
                    href={`/full/diagnostico/${encodeURIComponent(proc.process_key)}?company_id=${companyId}`}
                    style={{
                      display: 'inline-block',
                      padding: '0.5rem 1rem',
                      borderRadius: '6px',
                      backgroundColor: complete ? '#198754' : '#0d6efd',
                      color: '#fff',
                      textDecoration: 'none',
                      fontSize: '0.9rem',
                      fontWeight: '500',
                    }}
                  >
                    {complete ? 'Revisar' : 'Responder'}
                  </Link>
                </div>
              );
            })}
          </div>

          {!isSubmitted && (
            <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              {nextIncomplete && (
                <Link
                  href={`/full/diagnostico/${encodeURIComponent(nextIncomplete.process_key)}?company_id=${companyId}`}
                  style={{
                    display: 'inline-block',
                    padding: '0.75rem 1.5rem',
                    borderRadius: '8px',
                    backgroundColor: '#0d6efd',
                    color: '#fff',
                    textDecoration: 'none',
                    fontWeight: 'bold',
                  }}
                >
                  Continuar
                </Link>
              )}
              <button
                onClick={handleSubmit}
                disabled={!allComplete || state === 'submitting'}
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: allComplete ? '#198754' : '#adb5bd',
                  color: '#fff',
                  fontWeight: 'bold',
                  cursor: allComplete ? 'pointer' : 'not-allowed',
                }}
              >
                {state === 'submitting' ? 'Enviando...' : 'Submeter FULL'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
