'use client';

import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { useSearchParams, useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import { humanizeBand, labels } from '@/lib/uiCopy';
import { auditLog } from '@/lib/auditLog';
import { getEntitlement } from '@/lib/entitlement';
import { assertFullAccess } from '@/lib/fullGuard';

type Question = {
  question_key: string;
  question_text: string;
  dimension?: string;
  answer_type?: string;
};

type ProcessData = {
  process_key: string;
  area_key: string;
  protects_dimension: string;
  protects_text: string | null;
  owner_alert_text: string | null;
  typical_impact_band: string | null;
  typical_impact_text?: string | null;
  impacto_tipico?: string | null;
  questions: Question[];
};

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

export default function FullDiagnosticoProcessPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
        <FullDiagnosticoProcessContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function FullDiagnosticoProcessContent() {
  const { user, session } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const params = useParams();
  const processKey = params?.process_key as string;
  const companyId = searchParams.get('company_id');
  const msgDiagIncomplete = searchParams.get('msg') === 'diag_incomplete';

  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'blocked' | 'missing_company'>('loading');
  const [error, setError] = useState('');
  const [processData, setProcessData] = useState<ProcessData | null>(null);
  const [assessment, setAssessment] = useState<{ id: string; segment: string } | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadData = useCallback(async () => {
    if (!companyId || !session?.access_token || !processKey) return;

    try {
      setState('loading');
      setError('');

      const entitlement = await getEntitlement(companyId, session.access_token);
      if (!assertFullAccess(entitlement, user?.email)) {
        setState('blocked');
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

      setAssessment({ id: current.id, segment: current.segment || 'C' });

      const seg = current.segment || 'C';
      const cat = await apiFetch(
        `/full/catalog?segment=${seg}`,
        {},
        session.access_token
      );

      const proc = (cat?.processes || []).find((p: ProcessData) => p.process_key === processKey);
      if (!proc) {
        setError('Processo não encontrado.');
        setState('error');
        return;
      }
      setProcessData(proc);

      const ans = await apiFetch(
        `/full/assessments/${current.id}/answers?company_id=${companyId}&process_key=${processKey}`,
        {},
        session.access_token
      );

      const ansMap: Record<string, number> = {};
      (ans?.answers || []).forEach((a: AnswerItem) => {
        ansMap[`${a.process_key}:${a.question_key}`] = a.answer_value;
      });
      setAnswers(ansMap);

      setState('ready');
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 403) {
        setState('blocked');
        return;
      }
      setError(err.message || 'Falha ao carregar');
      setState('error');
    }
  }, [companyId, session?.access_token, processKey]);

  useEffect(() => {
    if (!companyId) {
      setState('missing_company');
      return;
    }
    if (!session?.access_token) return;
    loadData();
  }, [companyId, session?.access_token, processKey, loadData]);

  const saveAnswer = useCallback(
    async (qKey: string, value: number) => {
      if (!assessment?.id || !companyId || !session?.access_token) return;

      setSaving(qKey);
      try {
        await apiFetch(
          `/full/assessments/${assessment.id}/answers?company_id=${companyId}`,
          {
            method: 'POST',
            body: {
              process_key: processKey,
              answers: [{ question_key: qKey, answer_value: value }],
            },
          },
          session.access_token
        );
      } catch (err) {
        console.error('Erro ao salvar resposta:', err);
      } finally {
        setSaving(null);
      }
    },
    [assessment?.id, companyId, session?.access_token, processKey]
  );

  const handleChange = useCallback(
    (qKey: string, value: number) => {
      setAnswers((prev) => ({ ...prev, [`${processKey}:${qKey}`]: value }));

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        saveAnswer(qKey, value);
      }, 400);
    },
    [processKey, saveAnswer]
  );

  const handleBlur = useCallback(
    (qKey: string) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      const val = answers[`${processKey}:${qKey}`];
      if (typeof val === 'number') saveAnswer(qKey, val);
    },
    [processKey, answers, saveAnswer]
  );

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  const totalQuestions = processData?.questions?.length || 0;
  const answeredCount = Object.keys(answers).filter((k) => k.startsWith(processKey + ':')).length;

  if (state === 'missing_company') {
    return (
      <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ padding: '1rem', backgroundColor: '#f8d7da', color: '#721c24', borderRadius: '8px' }}>
          {labels.missingCompany}
        </div>
        <Link href="/full/diagnostico" style={{ display: 'inline-block', marginTop: '1rem', color: '#0070f3' }}>
          Voltar
        </Link>
      </div>
    );
  }

  if (state === 'blocked') {
    return (
      <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ padding: '2rem', backgroundColor: '#fff3cd', borderRadius: '8px', textAlign: 'center' }}>
          <h2 style={{ color: '#856404' }}>Conteúdo disponível apenas no FULL</h2>
          <Link href={`/paywall?company_id=${companyId}`} style={{ color: '#0070f3' }}>Ver plano FULL</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1rem', color: '#666', fontSize: '0.9rem' }}>
        Logado como: {user?.email}
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <Link
          href={companyId ? `/full/diagnostico?company_id=${companyId}` : '/full/diagnostico'}
          style={{ color: '#0d6efd', textDecoration: 'none', fontSize: '0.9rem' }}
        >
          ← Voltar ao diagnóstico
        </Link>
      </div>

      {state === 'loading' && (
        <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando...</div>
      )}

      {msgDiagIncomplete && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem', borderRadius: '8px', background: '#fff3cd', color: '#856404', border: '1px solid #ffc107' }}>
          Faltam respostas neste bloco. Conclua para gerar ações.
        </div>
      )}

      {state === 'error' && (
        <div style={{ padding: '1rem', backgroundColor: '#f8d7da', color: '#721c24', borderRadius: '8px', marginBottom: '1.5rem' }}>
          {error}
        </div>
      )}

      {state === 'ready' && processData && (
        <>
          <h1 style={{ marginBottom: '0.5rem' }}>
            {PROCESS_LABELS[processData.process_key] || processData.process_key}
          </h1>
          <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '2rem' }}>
            {answeredCount} de {totalQuestions} perguntas respondidas
          </div>

          {/* Microvalor: o que protege, sinal de alerta, impacto */}
          <div
            style={{
              padding: '1.5rem',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              marginBottom: '2rem',
              border: '1px solid #dee2e6',
            }}
          >
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: '#495057' }}>
              O que esse processo protege
            </h3>
            <div style={{ marginBottom: '1rem' }}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '0.25rem 0.6rem',
                  borderRadius: '6px',
                  backgroundColor: '#e7f3ff',
                  color: '#0c5460',
                  fontSize: '0.85rem',
                  fontWeight: '600',
                }}
              >
                {PROTECTS_LABELS[processData.protects_dimension] || processData.protects_dimension}
              </span>
            </div>
            {processData.protects_text && (
              <p style={{ margin: '0 0 1rem 0', color: '#333', lineHeight: 1.5 }}>
                {processData.protects_text}
              </p>
            )}
            {processData.owner_alert_text && (
              <div style={{ marginBottom: '1rem' }}>
                <strong style={{ fontSize: '0.9rem', color: '#495057' }}>Sinal de alerta do dono:</strong>{' '}
                <span style={{ color: '#333' }}>{processData.owner_alert_text}</span>
              </div>
            )}
            {(processData.impacto_tipico || processData.typical_impact_text || processData.typical_impact_band) && (
              <div>
                <strong style={{ fontSize: '0.9rem', color: '#495057' }}>Impacto típico:</strong>{' '}
                <span style={{ color: '#333' }}>
                  {processData.impacto_tipico || processData.typical_impact_text || humanizeBand(processData.typical_impact_band)}
                </span>
              </div>
            )}
          </div>

          {/* Perguntas */}
          <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Perguntas</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {processData.questions.map((q) => {
              const key = `${processKey}:${q.question_key}`;
              const value = answers[key] ?? '';
              const isSaving = saving === q.question_key;

              return (
                <div
                  key={q.question_key}
                  style={{
                    padding: '1.25rem',
                    border: '1px solid #dee2e6',
                    borderRadius: '8px',
                    backgroundColor: '#fff',
                  }}
                >
                  <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: '500', color: '#333' }}>
                    {q.question_text}
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <input
                      type="range"
                      min={0}
                      max={10}
                      value={typeof value === 'number' ? value : 0}
                      onChange={(e) => handleChange(q.question_key, Number(e.target.value))}
                      onBlur={() => handleBlur(q.question_key)}
                      style={{ width: '200px', maxWidth: '100%' }}
                    />
                    <span style={{ minWidth: '2rem', fontSize: '0.95rem', fontWeight: '600' }}>
                      {typeof value === 'number' ? value : '—'}
                    </span>
                    {isSaving && <span style={{ fontSize: '0.8rem', color: '#6c757d' }}>Salvando...</span>}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
            <Link
              href={companyId ? `/full/diagnostico?company_id=${companyId}` : '/full/diagnostico'}
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
              Voltar ao diagnóstico
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
