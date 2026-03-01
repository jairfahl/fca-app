'use client';

import { Suspense, useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, downloadFullReport, ApiError } from '@/lib/api';
import { humanizeStatus, labels } from '@/lib/uiCopy';
import { companyBreadcrumb } from '@/components/ConsultorBreadcrumb';
import {
  consultantCompanyOverview,
  consultantCompanyAssessment,
  consultantRelatorio,
  consultantHome,
  isCompanyIdValid,
} from '@/lib/consultorRoutes';

type VersionItem = {
  full_version: number;
  assessment_id: string;
  status: string;
  created_at: string;
  closed_at: string | null;
  answered_count: number;
  is_current: boolean;
};

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

const btnStyle = (bg: string): React.CSSProperties => ({
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
});

export default function ConsultorHistoricoPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
        <ConsultorHistoricoContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function ConsultorHistoricoContent() {
  const { session } = useAuth();
  const params = useParams();
  const companyId = params.company_id as string;

  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [companyName, setCompanyName] = useState<string>(companyId);
  const [downloadLoading, setDownloadLoading] = useState<number | null>(null);

  useEffect(() => {
    if (!companyId || !session?.access_token || !isCompanyIdValid(companyId)) return;
    const load = async () => {
      try {
        setState('loading');
        setError('');
        const [versionsRes, overviewRes] = await Promise.all([
          apiFetch(`/full/versions?company_id=${companyId}`, {}, session.access_token),
          apiFetch(`/consultor/company/${companyId}/overview`, {}, session.access_token),
        ]);
        setVersions(Array.isArray(versionsRes) ? versionsRes : []);
        setCompanyName(overviewRes?.company?.name || companyId);
        setState('ready');
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 403) {
          setError('Acesso negado.');
        } else {
          setError((err as Error)?.message || 'Falha ao carregar histórico.');
        }
        setState('error');
      }
    };
    load();
  }, [companyId, session?.access_token]);

  const handleDownload = async (v: number) => {
    if (!companyId || !session?.access_token) return;
    setDownloadLoading(v);
    try {
      await downloadFullReport(companyId, v, session.access_token);
    } catch (err: unknown) {
      alert((err as Error)?.message || 'Falha ao baixar relatório.');
    } finally {
      setDownloadLoading(null);
    }
  };

  const canOpen = (v: VersionItem) => v.status === 'SUBMITTED' || v.status === 'CLOSED';
  const canDownload = (v: VersionItem) => v.status === 'SUBMITTED' || v.status === 'CLOSED';
  const canCompare = (v: VersionItem) => v.full_version > 1 && (v.status === 'SUBMITTED' || v.status === 'CLOSED');

  if (!isCompanyIdValid(companyId)) {
    return (
      <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ padding: '1rem', borderRadius: '8px', backgroundColor: '#f8d7da', color: '#721c24' }}>
          Selecione uma empresa válida.
        </div>
        <Link href={consultantHome()} style={{ ...btnStyle('#6c757d'), marginTop: '1rem', display: 'inline-block' }}>
          Voltar ao painel
        </Link>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      {companyBreadcrumb(companyId, companyName, 'Histórico de versões')}
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Histórico de versões</h1>
        <Link
          href={consultantCompanyOverview(companyId)}
          style={{ ...btnStyle('#6c757d'), display: 'inline-block' }}
        >
          Voltar à empresa
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
              Nenhuma versão FULL ainda. A empresa precisa concluir o diagnóstico FULL.
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
                <div style={{ fontSize: '0.9rem', color: '#6c757d', marginBottom: '1rem' }}>
                  {formatDate(v.created_at)}
                  {v.closed_at && ` • Ciclo finalizado em ${formatDate(v.closed_at)}`}
                  {v.answered_count > 0 && ` • ${v.answered_count} respostas`}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {canOpen(v) && (
                    <Link
                      href={consultantCompanyAssessment(companyId, v.assessment_id, 'FULL')}
                      style={{ ...btnStyle('#6f42c1'), textDecoration: 'none' }}
                    >
                      Ver diagnóstico
                    </Link>
                  )}
                  {canOpen(v) && (
                    <Link
                      href={`${consultantRelatorio(companyId)}?full_version=${v.full_version}`}
                      style={{ ...btnStyle('#198754'), textDecoration: 'none' }}
                    >
                      Relatório PDF
                    </Link>
                  )}
                  {canDownload(v) && (
                    <button
                      onClick={() => handleDownload(v.full_version)}
                      disabled={downloadLoading === v.full_version}
                      style={{ ...btnStyle('#0d6efd'), opacity: downloadLoading === v.full_version ? 0.7 : 1 }}
                    >
                      {downloadLoading === v.full_version ? 'Baixando...' : 'Baixar relatório'}
                    </button>
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
