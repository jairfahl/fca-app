'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { labels } from '@/lib/uiCopy';

const LIKERT_LABELS: Record<string, string> = {
  DISCORDO_PLENAMENTE: 'Discordo plenamente',
  DISCORDO: 'Discordo',
  NEUTRO: 'Neutro',
  CONCORDO: 'Concordo',
  CONCORDO_PLENAMENTE: 'Concordo plenamente',
};

type CauseQuestion = {
  q_id: string;
  texto_cliente: string;
  tipo: string;
  opcoes: string[];
};

type PendingGap = {
  gap_instance_id: string;
  gap_id: string;
  process_key: string;
  titulo_cliente: string;
  descricao_cliente: string;
  cause_questions: CauseQuestion[];
};

type CauseClass = {
  id: string;
  label_cliente: string;
  descricao_cliente: string;
  mecanismo_primario?: string;
};

type CauseCatalog = {
  version: string;
  cause_classes: CauseClass[];
  gaps: { gap_id: string; titulo_cliente: string }[];
};

interface CauseBlockProps {
  companyId: string;
  assessmentId: string;
  accessToken: string;
  onPendingResolved?: () => void;
}

type AnsweredResult = {
  gap_id: string;
  titulo_cliente: string;
  cause_label: string;
  mudanca_30_dias: string | null;
};

export default function CauseBlock({ companyId, assessmentId, accessToken, onPendingResolved }: CauseBlockProps) {
  const [pending, setPending] = useState<PendingGap[]>([]);
  const [answered, setAnswered] = useState<AnsweredResult[]>([]);
  const [catalog, setCatalog] = useState<CauseCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadPending = useCallback(async (): Promise<PendingGap[]> => {
    if (!companyId || !assessmentId) return [];
    try {
      const data = await apiFetch(
        `/full/causes/pending?assessment_id=${assessmentId}&company_id=${companyId}`,
        {},
        accessToken
      );
      const list = data?.pending || [];
      setPending(list);
      return list;
    } catch {
      setPending([]);
      return [];
    }
  }, [companyId, assessmentId, accessToken]);

  useEffect(() => {
    const load = async () => {
      if (!companyId || !assessmentId) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError('');
        await Promise.all([
          loadPending(),
          apiFetch('/full/cause/catalog', {}, accessToken).then(setCatalog).catch(() => null),
        ]);
      } catch (err: any) {
        setError(err?.message || 'Erro ao carregar');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [companyId, assessmentId, accessToken, loadPending]);

  const handleAnswered = useCallback(async (res: AnsweredResult) => {
    const wasLastPending = pending.length === 1;
    setAnswered((prev) => [...prev.filter((a) => a.gap_id !== res.gap_id), res]);
    setPending((prev) => prev.filter((p) => p.gap_id !== res.gap_id));
    if (wasLastPending) onPendingResolved?.();
    const stillPending = await loadPending();
    if (stillPending.length === 0) onPendingResolved?.();
  }, [loadPending, onPendingResolved, pending.length]);

  if (loading) return <div style={{ padding: '1rem', color: '#666' }}>Carregando...</div>;
  if (error) return null;
  if (pending.length === 0 && answered.length === 0) return null;

  return (
    <div style={{ marginBottom: '2rem' }}>
      <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>{labels.causeBlockTitle}</h2>
      <p style={{ color: '#6c757d', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
        {labels.causeBlockIntro}
      </p>
      {pending.map((gap) => (
        <GapCard
          key={gap.gap_instance_id}
          gap={gap}
          causeClasses={catalog?.cause_classes || []}
          companyId={companyId}
          assessmentId={assessmentId}
          accessToken={accessToken}
          onAnswered={handleAnswered}
        />
      ))}
      {answered.map((a) => (
        <div
          key={a.gap_id}
          style={{
            border: '1px solid #d4edda',
            borderRadius: '8px',
            padding: '1.25rem',
            marginBottom: '1rem',
            backgroundColor: '#f8fdf8',
          }}
        >
          <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem' }}>{a.titulo_cliente}</h3>
          <div style={{ marginBottom: '0.5rem' }}><strong>Causa provável:</strong> {a.cause_label}</div>
          {a.mudanca_30_dias && (
            <div style={{ fontSize: '0.95rem', color: '#155724' }}><strong>O que muda em 30 dias:</strong> {a.mudanca_30_dias}</div>
          )}
        </div>
      ))}
    </div>
  );
}

type Evidence = { q_id: string; answer: string; texto_cliente: string };

function GapCard({
  gap,
  causeClasses,
  companyId,
  assessmentId,
  accessToken,
  onAnswered,
}: {
  gap: PendingGap;
  causeClasses: CauseClass[];
  companyId: string;
  assessmentId: string;
  accessToken: string;
  onAnswered: (res: AnsweredResult) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{
    cause_primary: string;
    cause_label: string;
    cause_secondary: string | null;
    evidence: Evidence[];
  } | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    const required = (gap.cause_questions || []).map((q) => q.q_id);
    const missing = required.filter((qid) => !answers[qid] || answers[qid] === '');
    if (missing.length > 0) return;
    setEvaluating(true);
    setError('');
    try {
      const data = await apiFetch(
        `/full/causes/answer?assessment_id=${assessmentId}&company_id=${companyId}`,
        {
          method: 'POST',
          body: {
            gap_id: gap.gap_id,
            answers: Object.entries(answers).map(([q_id, answer]) => ({ q_id, answer })),
          },
        },
        accessToken
      );
      const causeDef = causeClasses.find((c) => c.id === data.cause_primary);
      const causeLabel = data.cause_label || causeDef?.label_cliente || data.cause_primary;
      const mudanca30 = causeDef?.mecanismo_primario ? `Em 30 dias: ${causeDef.mecanismo_primario}` : null;
      setResult({
        cause_primary: data.cause_primary,
        cause_label: causeLabel,
        cause_secondary: data.cause_secondary || null,
        evidence: data.evidence || [],
      });
      onAnswered({
        gap_id: gap.gap_id,
        titulo_cliente: gap.titulo_cliente,
        cause_label: causeLabel,
        mudanca_30_dias: mudanca30,
      });
    } catch (err: any) {
      setError(err?.message || 'Erro ao salvar');
    } finally {
      setEvaluating(false);
    }
  };

  const questions = gap.cause_questions || [];
  const allAnswered = questions.every((q) => answers[q.q_id]);
  const causeDef = result ? causeClasses.find((c) => c.id === result.cause_primary) : null;
  const mudanca30 = causeDef?.mecanismo_primario ? `Em 30 dias: ${causeDef.mecanismo_primario}` : null;

  return (
    <div
      style={{
        border: '1px solid #dee2e6',
        borderRadius: '8px',
        padding: '1.25rem',
        marginBottom: '1rem',
        backgroundColor: result ? '#f8fdf8' : '#fff',
      }}
    >
      <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem' }}>{gap.titulo_cliente}</h3>
      <p style={{ color: '#6c757d', marginBottom: '1rem', fontSize: '0.9rem' }}>{gap.descricao_cliente}</p>

      {result ? (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ marginBottom: '0.75rem' }}>
            <strong>Causa provável:</strong> {result.cause_label}
          </div>
          {mudanca30 && (
            <div style={{ marginBottom: '0.75rem', fontSize: '0.95rem', color: '#155724' }}>
              <strong>O que muda em 30 dias:</strong> {mudanca30}
            </div>
          )}
          {result.evidence.length > 0 && (
            <div style={{ marginBottom: '0.75rem', fontSize: '0.9rem', color: '#495057' }}>
              <strong>Respostas que sustentam:</strong>
              <ul style={{ margin: '0.25rem 0 0 1rem', padding: 0 }}>
                {result.evidence.map((e, i) => (
                  <li key={i} style={{ marginBottom: '0.25rem' }}>
                    {e.texto_cliente}: {LIKERT_LABELS[e.answer] || e.answer}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <>
          {questions.map((q) => (
            <div key={q.q_id} style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.95rem' }}>
                {q.texto_cliente}
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {(q.opcoes || []).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setAnswers((prev) => ({ ...prev, [q.q_id]: opt }))}
                    style={{
                      padding: '0.4rem 0.75rem',
                      borderRadius: '6px',
                      border: answers[q.q_id] === opt ? '2px solid #0d6efd' : '1px solid #dee2e6',
                      background: answers[q.q_id] === opt ? '#e7f3ff' : '#fff',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                    }}
                  >
                    {LIKERT_LABELS[opt] || opt}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {error && (
            <div style={{ color: '#dc3545', marginBottom: '0.5rem', fontSize: '0.9rem' }}>{error}</div>
          )}
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!allAnswered || evaluating}
            style={{
              display: 'inline-block',
              padding: '0.6rem 1.25rem',
              borderRadius: '6px',
              border: 'none',
              background: allAnswered && !evaluating ? '#0d6efd' : '#ccc',
              color: '#fff',
              cursor: allAnswered && !evaluating ? 'pointer' : 'not-allowed',
              fontWeight: 600,
              marginTop: '0.5rem',
            }}
          >
            {evaluating ? 'Salvando...' : 'Confirmar causa provável'}
          </button>
        </>
      )}
    </div>
  );
}
