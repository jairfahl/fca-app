'use client';

import { Suspense, useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, downloadFullReport, ApiError } from '@/lib/api';
import { getEntitlement } from '@/lib/entitlement';
import { assertFullAccess } from '@/lib/fullGuard';
import { humanizeStatus, labels } from '@/lib/uiCopy';

type VersionItem = {
  full_version: number;
  assessment_id: string;
  status: string;
  created_at: string;
  closed_at: string | null;
  answered_count: number;
  is_current: boolean;
};

type ScoreSummary = {
  score: number;
  band: string;
};

function bandLabel(band: string): string {
  if (band === 'HIGH') return 'Forte';
  if (band === 'MEDIUM') return 'Organizado';
  return 'Frágil';
}

function bandColor(band: string): string {
  if (band === 'HIGH') return '#198754';
  if (band === 'MEDIUM') return '#0d6efd';
  return '#dc3545';
}

function scoreToBand(score: number): string {
  if (score >= 70) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  return 'LOW';
}

function statusLabel(status: string): string {
  if (status === 'DRAFT') return 'Em andamento';
  if (status === 'SUBMITTED') return 'Concluído';
  if (status === 'CLOSED') return 'Ciclo finalizado';
  return humanizeStatus(status);
}

function formatDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function cta(bg: string): React.CSSProperties {
  return {
    display: 'inline-block',
    backgroundColor: bg,
    color: '#fff',
    padding: '0.65rem 1rem',
    borderRadius: '8px',
    textDecoration: 'none',
    fontWeight: 'bold',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.9rem',
  };
}

export default function FullHistoricoPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
        <FullHistoricoContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function FullHistoricoContent() {
  const { user, session } = useAuth();
  const searchParams = useSearchParams();
  const companyId = searchParams.get('company_id');

  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'missing'>('loading');
  const [error, setError] = useState('');
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [scores, setScores] = useState<Record<string, ScoreSummary>>({});
  const [downloadLoading, setDownloadLoading] = useState<number | null>(null);

  useEffect(() => {
    if (!companyId || !session?.access_token) {
      if (!companyId) setState('missing');
      return;
    }
    const load = async () => {
      try {
        setState('loading');
        setError('');
        const ent = await getEntitlement(companyId, session.access_token);
        if (!assertFullAccess(ent, user?.email)) {
          setError('Conteúdo disponível apenas no FULL.');
          setState('error');
          return;
        }
        const data = await apiFetch(`/full/versions?company_id=${companyId}`, {}, session.access_token);
        const list: VersionItem[] = Array.isArray(data) ? data : [];
        setVersions(list);

        // Fetch scores in parallel for all SUBMITTED/CLOSED assessments
        const scorable = list.filter((v) => v.status === 'SUBMITTED' || v.status === 'CLOSED');
        if (scorable.length > 0) {
          const scoreResults = await Promise.allSettled(
            scorable.map((v) =>
              apiFetch(`/full/results?assessment_id=${v.assessment_id}&company_id=${companyId}`, {}, session.access_token)
            )
          );
          const scoreMap: Record<string, ScoreSummary> = {};
          scoreResults.forEach((result, i) => {
            if (result.status === 'fulfilled') {
              const payload = result.value as { scores_by_process?: Array<{ score_numeric: number; band: string }> };
              const ps = payload?.scores_by_process || [];
              if (ps.length > 0) {
                const avg = Math.round(ps.reduce((s, p) => s + p.score_numeric, 0) / ps.length);
                scoreMap[scorable[i].assessment_id] = { score: avg, band: scoreToBand(avg) };
              }
            }
          });
          setScores(scoreMap);
        }

        setState('ready');
      } catch (err: any) {
        setError(err?.message || 'Falha ao carregar histórico.');
        setState('error');
      }
    };
    load();
  }, [companyId, session?.access_token, user?.email]);

  const handleDownload = async (v: number) => {
    if (!companyId || !session?.access_token) return;
    setDownloadLoading(v);
    try {
      await downloadFullReport(companyId, v, session.access_token);
    } catch (err: any) {
      alert(err?.message || 'Falha ao baixar relatório.');
    } finally {
      setDownloadLoading(null);
    }
  };

  const canOpen = (v: VersionItem) => v.status === 'SUBMITTED' || v.status === 'CLOSED';
  const canDownload = (v: VersionItem) => v.status === 'SUBMITTED' || v.status === 'CLOSED';
  const canCompare = (v: VersionItem) => v.full_version > 1 && (v.status === 'SUBMITTED' || v.status === 'CLOSED');

  if (state === 'missing') {
    return (
      <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ padding: '1rem', borderRadius: '8px', backgroundColor: '#f8d7da', color: '#721c24' }}>
          {labels.missingCompany}
        </div>
        <Link href="/full" style={{ ...cta('#6c757d'), marginTop: '1rem', display: 'inline-block' }}>
          Voltar ao FULL
        </Link>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1rem', color: '#666', fontSize: '0.9rem' }}>Logado como: {user?.email}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Histórico de versões</h1>
        <Link href={companyId ? `/full?company_id=${companyId}` : '/full'} style={{ ...cta('#6c757d'), display: 'inline-block' }}>
          Voltar ao FULL
        </Link>
      </div>

      {error && (
        <div style={{ padding: '1rem', marginBottom: '1rem', borderRadius: '8px', backgroundColor: '#f8d7da', color: '#721c24' }}>
          {error}
        </div>
      )}

      {state === 'loading' && <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando...</div>}

      {state === 'ready' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {versions.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: '#f8f9fa', borderRadius: '8px', color: '#6c757d' }}>
              Nenhuma versão ainda. Conclua o diagnóstico FULL para gerar o primeiro relatório.
            </div>
          ) : (
            versions.map((v) => (
              <div
                key={v.full_version}
                style={{
                  border: '1px solid #dee2e6',
                  borderRadius: '8px',
                  padding: '1.25rem',
                  backgroundColor: '#fff',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div>
                    <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>Diagnóstico FULL v{v.full_version}</span>
                    {v.is_current && (
                      <span style={{ marginLeft: '0.5rem', fontWeight: 'normal', fontSize: '0.85rem', color: '#0d6efd' }}>
                        (atual)
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      padding: '0.25rem 0.6rem',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      backgroundColor: v.status === 'CLOSED' ? '#d4edda' : v.status === 'SUBMITTED' ? '#cce5ff' : '#fff3cd',
                      color: v.status === 'CLOSED' ? '#155724' : v.status === 'SUBMITTED' ? '#004085' : '#856404',
                    }}
                  >
                    {statusLabel(v.status)}
                  </span>
                </div>
                <div style={{ fontSize: '0.9rem', color: '#6c757d', marginBottom: '0.5rem' }}>
                  {formatDate(v.created_at)}
                  {v.closed_at && ` • Ciclo finalizado em ${formatDate(v.closed_at)}`}
                  {v.answered_count > 0 && ` • ${v.answered_count} respostas`}
                </div>
                {canOpen(v) && scores[v.assessment_id] && (
                  <div style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                    Score geral:{' '}
                    <span style={{ fontWeight: 'bold', color: bandColor(scores[v.assessment_id].band) }}>
                      {scores[v.assessment_id].score}/100
                    </span>
                    {' · '}
                    <span style={{ fontWeight: 'bold', color: bandColor(scores[v.assessment_id].band) }}>
                      {bandLabel(scores[v.assessment_id].band)}
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {canOpen(v) && (
                    <Link
                      href={`/full/resultados?company_id=${companyId}&assessment_id=${v.assessment_id}`}
                      style={{ ...cta('#6f42c1'), textDecoration: 'none' }}
                      data-testid="cta-open-version"
                    >
                      Abrir
                    </Link>
                  )}
                  {canOpen(v) && (
                    <Link
                      href={`/full/relatorio?company_id=${companyId}&full_version=${v.full_version}`}
                      style={{ ...cta('#198754'), textDecoration: 'none' }}
                      data-testid="cta-relatorio"
                    >
                      Relatório PDF
                    </Link>
                  )}
                  {canDownload(v) && (
                    <button
                      onClick={() => handleDownload(v.full_version)}
                      disabled={downloadLoading === v.full_version}
                      style={{ ...cta('#0d6efd'), opacity: downloadLoading === v.full_version ? 0.7 : 1 }}
                      data-testid="cta-download-report"
                    >
                      {downloadLoading === v.full_version ? 'Baixando...' : 'Baixar relatório'}
                    </button>
                  )}
                  {canCompare(v) && (
                    <Link
                      href={`/full/comparar?company_id=${companyId}&from=${v.full_version - 1}&to=${v.full_version}`}
                      style={{ ...cta('#0d6efd'), textDecoration: 'none' }}
                      data-testid="cta-compare"
                    >
                      Comparar com anterior
                    </Link>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
