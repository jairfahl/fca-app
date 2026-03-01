'use client';

import { Suspense, useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, downloadFullReport, ApiError } from '@/lib/api';
import { getEntitlement } from '@/lib/entitlement';
import { assertFullAccess } from '@/lib/fullGuard';
import { labels } from '@/lib/uiCopy';

type ReportStatus = 'null' | 'PENDING' | 'READY' | 'FAILED';

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
    fontSize: '1rem',
  };
}

export default function FullRelatorioPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
        <FullRelatorioContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function FullRelatorioContent() {
  const { user, session } = useAuth();
  const searchParams = useSearchParams();
  const companyId = searchParams.get('company_id');
  const fullVersionParam = searchParams.get('full_version');
  const fullVersion = fullVersionParam ? parseInt(fullVersionParam, 10) : null;

  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'missing'>('loading');
  const [error, setError] = useState('');
  const [reportStatus, setReportStatus] = useState<ReportStatus | null>(null);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [effectiveVersion, setEffectiveVersion] = useState(1);

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
        let version = fullVersion ?? 1;
        if (!fullVersion) {
          const versionsRes = await apiFetch(`/full/versions?company_id=${companyId}`, {}, session.access_token);
          const versions = Array.isArray(versionsRes) ? versionsRes : [];
          const lastReady = versions.find((v: { status: string }) => v.status === 'SUBMITTED' || v.status === 'CLOSED');
          if (lastReady) version = lastReady.full_version;
        }
        setEffectiveVersion(version);
        const statusRes = await apiFetch(
          `/full/reports/status?company_id=${companyId}&full_version=${version}`,
          {},
          session.access_token
        );
        setReportStatus(statusRes?.status ?? 'null');
        setState('ready');
      } catch (err: any) {
        setError(err?.message || 'Falha ao carregar status do relatório.');
        setState('error');
      }
    };
    load();
  }, [companyId, fullVersion, session?.access_token, user?.email]);

  const handleGenerate = async () => {
    if (!companyId || !session?.access_token) return;
    setGenerateLoading(true);
    setError('');
    try {
      const res = await apiFetch(
        `/full/reports/generate?company_id=${companyId}&full_version=${effectiveVersion}`,
        { method: 'POST' },
        session.access_token
      );
      setReportStatus(res?.status ?? 'READY');
    } catch (err: any) {
      setError(err?.message || 'Falha ao gerar relatório.');
    } finally {
      setGenerateLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!companyId || !session?.access_token) return;
    setDownloadLoading(true);
    setError('');
    try {
      await downloadFullReport(companyId, effectiveVersion, session.access_token);
    } catch (err: any) {
      setError(err?.message || 'Falha ao baixar relatório.');
    } finally {
      setDownloadLoading(false);
    }
  };

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
        <h1 style={{ margin: 0 }}>Relatório PDF — Diagnóstico FULL v{effectiveVersion}</h1>
        <Link
          href={companyId ? `/full/historico?company_id=${companyId}` : '/full'}
          style={{ ...cta('#6c757d'), display: 'inline-block' }}
        >
          Ver histórico de versões
        </Link>
      </div>

      {error && (
        <div style={{ padding: '1rem', marginBottom: '1rem', borderRadius: '8px', backgroundColor: '#f8d7da', color: '#721c24' }}>
          {error}
        </div>
      )}

      {state === 'loading' && <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando...</div>}

      {state === 'ready' && (
        <div style={{ border: '1px solid #dee2e6', borderRadius: '8px', background: '#fff', padding: '1.5rem' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            {reportStatus === 'PENDING' && (
              <div style={{ padding: '1rem', backgroundColor: '#fff3cd', color: '#856404', borderRadius: '8px', marginBottom: '1rem' }}>
                Relatório em geração. Tente novamente em instantes.
              </div>
            )}
            {reportStatus === 'READY' && (
              <div style={{ marginBottom: '1rem' }}>
                <button
                  onClick={handleDownload}
                  disabled={downloadLoading}
                  style={{ ...cta('#198754') }}
                  data-testid="cta-download-report"
                >
                  {downloadLoading ? 'Baixando...' : 'Baixar relatório'}
                </button>
              </div>
            )}
            {(reportStatus === 'null' || reportStatus === 'FAILED') && (
              <div style={{ marginBottom: '1rem' }}>
                <button
                  onClick={handleGenerate}
                  disabled={generateLoading}
                  style={{ ...cta('#0d6efd') }}
                  data-testid="cta-generate-report"
                >
                  {generateLoading ? 'Gerando...' : 'Gerar relatório'}
                </button>
              </div>
            )}
          </div>

          <h3 style={{ marginBottom: '0.75rem' }}>O que entra no relatório</h3>
          <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#555', lineHeight: 1.8 }}>
            <li>Capa com empresa e data</li>
            <li>Diagnóstico por processo (bandas e explicação)</li>
            <li>Raio-X do dono (vazamentos e alavancas)</li>
            <li>Recomendações derivadas</li>
            <li>Plano de 30 dias (3 ações)</li>
            <li>Evidências e ganhos declarados (se ciclo concluído)</li>
            <li>Comparação com versão anterior (se existir)</li>
          </ul>
        </div>
      )}
    </div>
  );
}
