'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import ConsultorGuard from '@/components/ConsultorGuard';
import { useAuth } from '@/lib/auth';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';

interface OverviewData {
  company: { id: string; name: string; segment?: string };
  light_status: string | null;
  full_status: string | null;
  full_assessment_id: string | null;
  plan_progress: string | null;
}

export default function ConsultorCompanyPage() {
  return (
    <ProtectedRoute>
      <ConsultorGuard>
        <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
          <ConsultorCompanyContent />
        </Suspense>
      </ConsultorGuard>
    </ProtectedRoute>
  );
}

function ConsultorCompanyContent() {
  const { session } = useAuth();
  const params = useParams();
  const router = useRouter();
  const companyId = params.company_id as string;

  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOverview = useCallback(async () => {
    if (!companyId || !session?.access_token) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`/consultor/company/${companyId}/overview`, {}, session.access_token);
      setData(res);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 403) {
        router.replace('/diagnostico');
        return;
      }
      setError(err.message || 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, [companyId, session?.access_token, router]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  if (loading) {
    return (
      <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
        Carregando...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
        {error && (
          <div style={{ padding: '1rem', backgroundColor: '#f8d7da', color: '#721c24', borderRadius: '8px', marginBottom: '1rem' }}>
            {error}
          </div>
        )}
        <Link href="/consultor" style={{ color: '#0070f3' }}>Voltar às empresas</Link>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <Link href="/consultor" style={{ color: '#0070f3' }}>← Empresas</Link>
      </div>

      <h1 style={{ marginBottom: '1.5rem' }}>{data.company.name}</h1>

      <div
        style={{
          padding: '1.25rem',
          backgroundColor: '#e7f3ff',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          border: '1px solid #b6d4fe',
        }}
      >
        <div style={{ marginBottom: '0.5rem' }}>
          <strong>Segmento:</strong> {data.company.segment || '—'}
        </div>
        <div style={{ marginBottom: '0.5rem' }}>
          <strong>Diagnóstico LIGHT:</strong> {data.light_status || '—'}
        </div>
        <div style={{ marginBottom: '0.5rem' }}>
          <strong>Diagnóstico FULL:</strong> {data.full_status || '—'}
        </div>
        {data.plan_progress && (
          <div>
            <strong>Progresso do plano:</strong> {data.plan_progress}
          </div>
        )}
      </div>

      {data.full_assessment_id && (
        <Link
          href={`/consultor/${companyId}/acoes`}
          style={{
            display: 'inline-block',
            padding: '0.75rem 1.25rem',
            backgroundColor: '#0d6efd',
            color: '#fff',
            borderRadius: '6px',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Ver ações e evidências
        </Link>
      )}
    </div>
  );
}
