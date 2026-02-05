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
import PaywallCard from '@/components/PaywallCard';

type PageState = 'loading' | 'success' | 'error' | 'unauthorized' | 'missing_assessment' | 'blocked';

export default function FullSummaryPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
        <FullSummaryContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function FullSummaryContent() {
  const { session, user } = useAuth();
  const searchParams = useSearchParams();
  const assessmentId = searchParams.get('assessment_id');

  const [state, setState] = useState<PageState>('loading');
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    if (!assessmentId) {
      setState('missing_assessment');
      return;
    }

    if (!session?.access_token) {
      return;
    }

    const fetchSummary = async () => {
      try {
        setState('loading');
        setError('');

        const assessment = await apiFetch(
          `/assessments/${assessmentId}`,
          {},
          session.access_token
        );

        const companyId = assessment?.assessment?.company_id;
        if (!companyId) {
          setError('company_id não encontrado para este assessment');
          setState('error');
          return;
        }
        setCompanyId(companyId);

        const summary = await apiFetch(
          `/full/assessments/${assessmentId}/summary?company_id=${companyId}`,
          {},
          session.access_token
        );

        setData(summary);
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
        setError(err.message || 'Erro ao carregar resumo FULL');
        setState('error');
      }
    };

    fetchSummary();
  }, [assessmentId, session?.access_token]);

  const resultsHref = assessmentId ? `/results?assessment_id=${assessmentId}` : '/results';
  const initiativesHref = assessmentId ? `/full/initiatives?assessment_id=${assessmentId}` : '/full/initiatives';
  const paywallHref = companyId ? `/paywall?company_id=${companyId}` : '/paywall';

  const getScoreColor = (score: number) => {
    if (score >= 7) return '#28a745';
    if (score >= 4) return '#ffc107';
    return '#dc3545';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 9) return 'Forte';
    if (score >= 7) return 'Organizado';
    if (score >= 4) return 'Frágil';
    return 'Crítico';
  };

  const buildHighlights = (scores: any) => {
    const entries = [
      { label: 'Comercial', value: Number(scores?.commercial || 0) },
      { label: 'Operações', value: Number(scores?.operations || 0) },
      { label: 'Adm/Fin', value: Number(scores?.admin_fin || 0) },
      { label: 'Gestão', value: Number(scores?.management || 0) }
    ];
    const worst = entries.reduce((min, cur) => (cur.value < min.value ? cur : min), entries[0]);
    const best = entries.reduce((max, cur) => (cur.value > max.value ? cur : max), entries[0]);

    return [
      `Principal gargalo agora: ${worst.label} (${worst.value.toFixed(1)})`,
      `Melhor processo: ${best.label} (${best.value.toFixed(1)})`,
      'Priorize disciplina semanal e rotina de execução para manter consistência.'
    ];
  };

  return (
    <AppShell showLogout userEmail={user?.email}>
      <PageHeader title="Resumo Executivo" subtitle="Visão geral dos scores e destaques." breadcrumbs={<Breadcrumbs />} />

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
        <div style={{ display: 'grid', gap: '1rem' }}>
          <Card>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '1rem',
              marginBottom: '1rem'
            }}>
              {[
                { label: 'Comercial', value: data?.scores?.commercial },
                { label: 'Operações', value: data?.scores?.operations },
                { label: 'Adm/Fin', value: data?.scores?.admin_fin },
                { label: 'Gestão', value: data?.scores?.management },
                { label: 'Geral', value: data?.scores?.overall }
              ].map((item) => (
                <div key={item.label} style={{ border: '1px solid #eee', borderRadius: '8px', padding: '1rem' }}>
                  <div style={{ fontSize: '0.875rem', color: '#666' }}>{item.label}</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: getScoreColor(Number(item.value || 0)) }}>
                    {Number(item.value || 0).toFixed(1)}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#666' }}>
                    {getScoreLabel(Number(item.value || 0))}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Principais gaps</div>
            <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
              {(Array.isArray(data?.critical_gaps) ? data.critical_gaps : []).slice(0, 3).map((gap: any, idx: number) => (
                <li key={idx} style={{ marginBottom: '0.25rem' }}>
                  {gap.process} — score {gap.score_int}
                </li>
              ))}
              {(!Array.isArray(data?.critical_gaps) || data.critical_gaps.length === 0) && (
                <li>Sem gaps identificados.</li>
              )}
            </ul>
          </Card>

          <Card>
            <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Top 3 iniciativas</div>
            <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
              {(Array.isArray(data?.top_initiatives) ? data.top_initiatives : []).slice(0, 3).map((item: any, idx: number) => (
                <li key={idx} style={{ marginBottom: '0.25rem' }}>
                  #{item.rank} — {item.title || 'Iniciativa'}
                </li>
              ))}
              {(!Array.isArray(data?.top_initiatives) || data.top_initiatives.length === 0) && (
                <li>Sem iniciativas priorizadas.</li>
              )}
            </ul>
            <div style={{ marginTop: '0.75rem' }}>
              <Button variant="ghost" href={initiativesHref}>Ver as 12 iniciativas</Button>
            </div>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
