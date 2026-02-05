'use client';

import { Suspense, useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/auth';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import PageHeader from '@/components/ui/PageHeader';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import PaywallCard from '@/components/PaywallCard';

type PageState = 'loading' | 'success' | 'error' | 'unauthorized' | 'missing_assessment' | 'blocked';

export default function FullInitiativesPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
        <FullInitiativesContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function FullInitiativesContent() {
  const { session, user } = useAuth();
  const searchParams = useSearchParams();
  const assessmentId = searchParams.get('assessment_id');

  const [state, setState] = useState<PageState>('loading');
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [processFilter, setProcessFilter] = useState('ALL');
  const [impactFilter, setImpactFilter] = useState('ALL');
  const [horizonFilter, setHorizonFilter] = useState('ALL');

  useEffect(() => {
    if (!assessmentId) {
      setState('missing_assessment');
      return;
    }

    if (!session?.access_token) {
      return;
    }

    const fetchInitiatives = async () => {
      try {
        setState('loading');
        setError('');

        const assessment = await apiFetch(
          `/assessments/${assessmentId}`,
          {},
          session.access_token
        );

        const resolvedCompanyId = assessment?.assessment?.company_id;
        setCompanyId(resolvedCompanyId || null);
        const url = resolvedCompanyId
          ? `/full/assessments/${assessmentId}/initiatives?company_id=${resolvedCompanyId}`
          : `/full/assessments/${assessmentId}/initiatives`;

        const initiatives = await apiFetch(url, {}, session.access_token);
        setData(initiatives);
        setState('success');
      } catch (err: any) {
        if (err instanceof ApiError && err.status === 401) {
          setState('unauthorized');
          return;
        }
        if (err instanceof ApiError && err.status === 403) {
          setState('blocked');
          return;
        }
        setError(err.message || 'Erro ao carregar iniciativas FULL');
        setState('error');
      }
    };

    fetchInitiatives();
  }, [assessmentId, session?.access_token]);

  const resultsHref = assessmentId ? `/results?assessment_id=${assessmentId}` : '/results';
  const paywallHref = companyId ? `/paywall?company_id=${companyId}` : '/paywall';

  const initiativesList = (() => {
    if (data && Array.isArray(data.initiatives)) return data.initiatives;
    if (data && Array.isArray(data.items)) return data.items;
    if (Array.isArray(data)) return data;
    return [];
  })();

  const processes = Array.from(new Set(initiativesList.map((i: any) => i.process).filter(Boolean)))
    .map((item) => String(item));
  const impacts = Array.from(new Set(initiativesList.map((i: any) => i.impact).filter(Boolean)))
    .map((item) => String(item));
  const horizons = Array.from(new Set(initiativesList.map((i: any) => i.horizon).filter(Boolean)))
    .map((item) => String(item));

  const filteredInitiatives = initiativesList.filter((item: any) => {
    if (processFilter !== 'ALL' && item.process !== processFilter) return false;
    if (impactFilter !== 'ALL' && item.impact !== impactFilter) return false;
    if (horizonFilter !== 'ALL' && item.horizon !== horizonFilter) return false;
    return true;
  });

  return (
    <AppShell showLogout userEmail={user?.email}>
      <PageHeader title="Prioridades Top-12" subtitle="Lista completa de iniciativas priorizadas." breadcrumbs={<Breadcrumbs />} />

      {state === 'missing_assessment' && (
        <div style={{ color: '#721c24', backgroundColor: '#f8d7da', padding: '1rem', borderRadius: '6px' }}>
          assessment_id é obrigatório.
          <div style={{ marginTop: '0.75rem' }}>
            <Link href={resultsHref} style={{ color: '#0070f3' }}>Voltar para Resultados</Link>
          </div>
        </div>
      )}

      {state === 'unauthorized' && (
        <div style={{ color: '#721c24', backgroundColor: '#f8d7da', padding: '1rem', borderRadius: '6px' }}>
          Sessão expirada. Faça login novamente.
        </div>
      )}
      {state === 'blocked' && (
        <PaywallCard
          primaryLabel="Ver planos"
          primaryHref={paywallHref}
          secondaryLabel="Voltar"
          secondaryHref={resultsHref}
          note={process.env.NODE_ENV === 'development'
            ? 'Ambiente de testes: acesso FULL depende de entitlement/configuração do servidor.'
            : undefined}
        />
      )}

      {state === 'error' && (
        <div style={{ color: '#721c24', backgroundColor: '#f8d7da', padding: '1rem', borderRadius: '6px' }}>
          {error}
        </div>
      )}

      {state === 'loading' && (
        <div style={{ padding: '1rem' }}>Carregando...</div>
      )}

      {state === 'success' && (
        <Card>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <select value={processFilter} onChange={(e) => setProcessFilter(e.target.value)}>
              <option value="ALL">Processo (todos)</option>
              {processes.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <select value={impactFilter} onChange={(e) => setImpactFilter(e.target.value)}>
              <option value="ALL">Impacto (todos)</option>
              {impacts.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <select value={horizonFilter} onChange={(e) => setHorizonFilter(e.target.value)}>
              <option value="ALL">Horizonte (todos)</option>
              {horizons.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {filteredInitiatives.length === 0 && (
            <EmptyState
              title="Sem iniciativas geradas"
              description="Ainda não há iniciativas para este diagnóstico."
              action={<Button variant="ghost" href={resultsHref}>Voltar</Button>}
            />
          )}

          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {filteredInitiatives.map((item: any, idx: number) => (
              <Card key={`${item.id || item.initiative_id || idx}`}>
                <div style={{ fontWeight: 'bold' }}>#{item.rank || idx + 1} — {item.title || item.name || 'Iniciativa'}</div>
                <div style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.25rem' }}>
                  Processo: {item.process || '—'} | Impacto: {item.impact || item.risk || '—'} | Horizonte: {item.horizon || '—'}
                </div>
                {item.rationale ? (
                  <div style={{ marginTop: '0.5rem', color: '#4b5563' }}>{item.rationale}</div>
                ) : null}
              </Card>
            ))}
          </div>
        </Card>
      )}
    </AppShell>
  );
}
