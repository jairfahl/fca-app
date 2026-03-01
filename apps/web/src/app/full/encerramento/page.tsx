'use client';

import { Suspense, useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import ConsultorBlock from '@/components/ConsultorBlock';
import { useAuth } from '@/lib/auth';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { labels } from '@/lib/uiCopy';

type ProcessScore = {
  process_key: string;
  band: string;
  score_numeric: number;
};

type ResultsData = {
  scores_by_process: ProcessScore[];
};

function bandLabel(band: string): string {
  if (band === 'HIGH') return 'Forte';
  if (band === 'MEDIUM') return 'Organizado';
  return 'Frágil';
}

function scoreToBand(score: number): string {
  if (score >= 70) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  return 'LOW';
}

function bandColor(band: string): string {
  if (band === 'HIGH') return '#198754';
  if (band === 'MEDIUM') return '#0d6efd';
  return '#dc3545';
}

function computeOverall(scores: ProcessScore[]): number | null {
  if (!scores.length) return null;
  return Math.round(scores.reduce((s, p) => s + p.score_numeric, 0) / scores.length);
}

function cta(bg: string, disabled = false): React.CSSProperties {
  return {
    display: 'inline-block',
    backgroundColor: disabled ? '#adb5bd' : bg,
    color: '#fff',
    padding: '0.75rem 1.25rem',
    borderRadius: '8px',
    textDecoration: 'none',
    fontWeight: 'bold',
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '1rem',
  };
}

export default function FullEncerramentoPage() {
  return (
    <ProtectedRoute>
      <ConsultorBlock>
        <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
          <FullEncerramentoContent />
        </Suspense>
      </ConsultorBlock>
    </ProtectedRoute>
  );
}

function FullEncerramentoContent() {
  const { user, session } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const companyId = searchParams.get('company_id');
  const assessmentId = searchParams.get('assessment_id');

  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'missing'>('loading');
  const [error, setError] = useState('');
  const [results, setResults] = useState<ResultsData | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!companyId || !assessmentId) {
      setState('missing');
      return;
    }
    if (!session?.access_token) return;

    const load = async () => {
      try {
        setState('loading');
        setError('');
        const data = await apiFetch(
          `/full/results?assessment_id=${assessmentId}&company_id=${companyId}`,
          {},
          session.access_token
        ) as ResultsData;
        setResults(data);
        setState('ready');
      } catch (err: any) {
        setError(err?.message || 'Falha ao carregar resultados do ciclo.');
        setState('error');
      }
    };
    load();
  }, [companyId, assessmentId, session?.access_token]);

  const handleNovoDiagnostico = async () => {
    if (!companyId || !session?.access_token || starting) return;
    setStarting(true);
    setError('');
    try {
      const data = await apiFetch(
        `/full/versions/new?company_id=${companyId}`,
        { method: 'POST' },
        session.access_token
      ) as { assessment_id: string };
      router.push(`/full/wizard?company_id=${companyId}&assessment_id=${data.assessment_id}`);
    } catch (err: any) {
      setError(err?.message || 'Falha ao iniciar novo diagnóstico. Tente novamente.');
      setStarting(false);
    }
  };

  if (state === 'missing') {
    return (
      <div style={{ padding: '2rem', maxWidth: '700px', margin: '0 auto' }}>
        <div style={{ padding: '1rem', borderRadius: '8px', backgroundColor: '#f8d7da', color: '#721c24', marginBottom: '1rem' }}>
          {labels.missingCompany}
        </div>
        <Link href="/full" style={{ ...cta('#6c757d'), display: 'inline-block' }}>
          Voltar ao FULL
        </Link>
      </div>
    );
  }

  const scores = results?.scores_by_process || [];
  const overall = computeOverall(scores);
  const overallBand = overall !== null ? scoreToBand(overall) : null;

  return (
    <div style={{ padding: '2rem', maxWidth: '700px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1rem', color: '#666', fontSize: '0.9rem' }}>Logado como: {user?.email}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Ciclo encerrado</h1>
        <Link
          href={companyId ? `/full?company_id=${companyId}` : '/full'}
          style={{ ...cta('#6c757d'), display: 'inline-block' }}
        >
          Voltar ao FULL
        </Link>
      </div>

      {error && (
        <div style={{ padding: '1rem', marginBottom: '1rem', borderRadius: '8px', backgroundColor: '#f8d7da', color: '#721c24' }}>
          {error}
        </div>
      )}

      {state === 'loading' && (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#6c757d' }}>Carregando resultados...</div>
      )}

      {state === 'ready' && (
        <>
          {overall !== null && overallBand !== null ? (
            <div style={{ border: '1px solid #dee2e6', borderRadius: '12px', padding: '2rem', backgroundColor: '#fff', marginBottom: '1.5rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.9rem', color: '#6c757d', marginBottom: '0.5rem' }}>Score geral do diagnóstico</div>
              <div style={{ fontSize: '3rem', fontWeight: 'bold', color: bandColor(overallBand), lineHeight: 1.1 }}>
                {overall}
                <span style={{ fontSize: '1.5rem', color: '#6c757d' }}>/100</span>
              </div>
              <div style={{
                display: 'inline-block',
                marginTop: '0.75rem',
                padding: '0.35rem 1rem',
                borderRadius: '20px',
                backgroundColor: bandColor(overallBand),
                color: '#fff',
                fontWeight: 'bold',
                fontSize: '1rem',
              }}>
                {bandLabel(overallBand)}
              </div>
            </div>
          ) : (
            <div style={{ padding: '1rem', marginBottom: '1.5rem', borderRadius: '8px', backgroundColor: '#fff3cd', color: '#856404' }}>
              Score não disponível para este ciclo.
            </div>
          )}

          {scores.length > 0 && (
            <div style={{ border: '1px solid #dee2e6', borderRadius: '8px', padding: '1rem', backgroundColor: '#fff', marginBottom: '1.5rem' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '0.75rem' }}>Pontuação por processo</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {scores.map((p) => (
                  <div key={p.process_key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.95rem' }}>{p.process_key}</span>
                    <span style={{
                      padding: '0.2rem 0.6rem',
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                      fontWeight: 'bold',
                      backgroundColor: bandColor(p.band),
                      color: '#fff',
                    }}>
                      {Math.round(p.score_numeric)}/100 · {bandLabel(p.band)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {assessmentId && companyId && (
              <Link
                href={`/full/resultados?company_id=${companyId}&assessment_id=${assessmentId}`}
                style={{ ...cta('#6f42c1'), display: 'inline-block' }}
              >
                Ver resultados completos
              </Link>
            )}
            <button
              onClick={handleNovoDiagnostico}
              disabled={starting}
              data-testid="btn-novo-diagnostico"
              style={cta('#198754', starting)}
            >
              {starting ? 'Iniciando...' : 'Iniciar novo diagnóstico'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
