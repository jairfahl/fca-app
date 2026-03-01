'use client';

import { Suspense, useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, downloadFullReport, ApiError } from '@/lib/api';
import { labels } from '@/lib/uiCopy';
import { companyBreadcrumb } from '@/components/ConsultorBreadcrumb';
import {
  consultantCompanyOverview,
  consultantHistorico,
  consultantHome,
  isCompanyIdValid,
} from '@/lib/consultorRoutes';

type ReportStatus = 'null' | 'PENDING' | 'READY' | 'FAILED';

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
  fontSize: '1rem',
});

export default function ConsultorRelatorioPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
        <ConsultorRelatorioContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function ConsultorRelatorioContent() {
  const { session } = useAuth();
  const params = useParams();
  const searchParams = useSearchParams();
  const companyId = params.company_id as string;
  const fullVersionParam = searchParams.get('full_version');
  const fullVersion = fullVersionParam ? parseInt(fullVersionParam, 10) : null;

  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [reportStatus, setReportStatus] = useState<ReportStatus | null>(null);
  const [companyName, setCompanyName] = useState<string>(companyId);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [effectiveVersion, setEffectiveVersion] = useState(1);

  useEffect(() => {
    if (!companyId || !session?.access_token || !isCompanyIdValid(companyId)) return;
    const load = async () => {
      try {
        setState('loading');
        setError('');
        let version = fullVersion ?? 1;
        if (!fullVersion) {
          const versionsRes = await apiFetch(`/full/versions?company_id=${companyId}`, {}, session.access_token);
          const versions = Array.isArray(versionsRes) ? versionsRes : [];
          const lastReady = versions.find((v: { status: string }) => v.status === 'SUBMITTED' || v.status === 'CLOSED');
          if (lastReady) version = lastReady.full_version;
        }
        setEffectiveVersion(version);
        const [statusRes, overviewRes] = await Promise.all([
          apiFetch(
            `/full/reports/status?company_id=${companyId}&full_version=${version}`,
            {},
            session.access_token
          ),
          apiFetch(`/consultor/company/${companyId}/overview`, {}, session.access_token),
        ]);
        setReportStatus(statusRes?.status ?? 'null');
        setCompanyName(overviewRes?.company?.name || companyId);
        setState('ready');
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 403) {
          setError('Acesso negado.');
        } else {
          setError((err as Error)?.message || 'Falha ao carregar status do relatório.');
        }
        setState('error');
      }
    };
    load();
  }, [companyId, fullVersion, session?.access_token]);

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
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Falha ao gerar relatório.');
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
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Falha ao baixar relatório.');
    } finally {
      setDownloadLoading(false);
    }
  };

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
      {companyBreadcrumb(companyId, companyName, 'Relatório PDF')}
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Relatório PDF — Diagnóstico FULL v{effectiveVersion}</h1>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Link
            href={consultantHistorico(companyId)}
            style={{ ...btnStyle('#6c757d'), display: 'inline-block' }}
          >
            Ver histórico de versões
          </Link>
          <Link
            href={consultantCompanyOverview(companyId)}
            style={{ ...btnStyle('#6c757d'), display: 'inline-block' }}
          >
            Voltar à empresa
          </Link>
        </div>
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
                  style={{ ...btnStyle('#198754') }}
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
                  style={{ ...btnStyle('#0d6efd') }}
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
