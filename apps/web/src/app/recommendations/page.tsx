'use client';

import { Suspense, useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/auth';
import { useSearchParams, useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import PageHeader from '@/components/ui/PageHeader';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Alert from '@/components/ui/Alert';
import Skeleton from '@/components/ui/Skeleton';

interface Recommendation {
  recommendation_id: string;
  process: string;
  title: string;
  why: string;
  risk: 'HIGH' | 'MED' | 'LOW';
  impact: 'HIGH' | 'MED' | 'LOW';
  checklist: string[];
  rank: number;
  is_free_eligible: boolean;
  is_selected_free: boolean;
  is_locked: boolean;
}

export default function RecommendationsPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
        <RecommendationsContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function RecommendationsContent() {
  const { user, session } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const assessmentId = searchParams.get('assessment_id');
  const companyIdParam = searchParams.get('company_id');
  const diagnosticoHref = companyIdParam ? `/diagnostico?company_id=${companyIdParam}` : '/diagnostico';
  const resultsHref = assessmentId ? `/results?assessment_id=${assessmentId}${companyIdParam ? `&company_id=${companyIdParam}` : ''}` : '/results';
  const recommendationsHref = assessmentId ? `/recommendations?assessment_id=${assessmentId}${companyIdParam ? `&company_id=${companyIdParam}` : ''}` : '/recommendations';
  const fullDiagnosticHref = assessmentId ? `/full/diagnostic?assessment_id=${assessmentId}` : '/full/diagnostic';
  const fullInitiativesHref = assessmentId ? `/full/initiatives?assessment_id=${assessmentId}` : '/full/initiatives';
  const fullSummaryHref = assessmentId ? `/full/summary?assessment_id=${assessmentId}` : '/full/summary';

  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [error, setError] = useState('');
  const [selecting, setSelecting] = useState<string | null>(null);
  const selectedFreeCount = recommendations.filter((rec) => rec.is_selected_free).length;
  const selectedProcesses = new Set(
    recommendations.filter((rec) => rec.is_selected_free).map((rec) => rec.process)
  );

  useEffect(() => {
    if (!assessmentId || !session?.access_token) {
      return;
    }

    const loadRecommendations = async () => {
      try {
        setLoading(true);
        setError('');
        const data = await apiFetch(
          `/assessments/${assessmentId}/recommendations`,
          {},
          session.access_token
        );
        setRecommendations(data || []);
      } catch (err: any) {
        if (err instanceof ApiError && err.status === 401) {
          router.push('/login');
          return;
        }
        setError(err.message || 'Erro ao carregar recomendações');
      } finally {
        setLoading(false);
      }
    };

    loadRecommendations();
  }, [assessmentId, session?.access_token, router]);

  const handleSelectFree = async (recommendationId: string) => {
    if (!assessmentId || !session?.access_token) {
      return;
    }

    try {
      const target = recommendations.find((rec) => rec.recommendation_id === recommendationId);
      if (!target) {
        return;
      }
      if (selectedFreeCount >= 4) {
        setError('Limite de 4 ações gratuitas atingido para este diagnóstico.');
        return;
      }
      if (selectedProcesses.has(target.process)) {
        setError('Você já selecionou uma ação gratuita para este processo.');
        return;
      }

      setSelecting(recommendationId);
      setError('');
      const freeAction = await apiFetch(
        `/assessments/${assessmentId}/free-actions/select`,
        {
          method: 'POST',
          body: { recommendation_id: recommendationId },
        },
        session.access_token
      );
      // Navegar para a tela de free action
      router.push(`/free-action/${freeAction.id}?assessment_id=${assessmentId}${companyIdParam ? `&company_id=${companyIdParam}` : ''}`);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 401) {
        router.push('/login');
        return;
      }
      setError(err.message || 'Erro ao selecionar ação gratuita');
      setSelecting(null);
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'HIGH': return '#dc3545';
      case 'MED': return '#ffc107';
      case 'LOW': return '#28a745';
      default: return '#6c757d';
    }
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'HIGH': return '#dc3545';
      case 'MED': return '#ffc107';
      case 'LOW': return '#28a745';
      default: return '#6c757d';
    }
  };

  if (loading) {
    return (
      <AppShell showLogout userEmail={user?.email}>
        <PageHeader
          title="Recomendações"
          subtitle="Ações priorizadas para melhorar seu diagnóstico."
          breadcrumbs={<Breadcrumbs />}
        />
        <Card>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <Skeleton height="24px" />
            <Skeleton height="24px" />
            <Skeleton height="24px" />
          </div>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell showLogout userEmail={user?.email}>
      <PageHeader
        title="Recomendações"
        subtitle="Ações priorizadas para melhorar seu diagnóstico."
        breadcrumbs={<Breadcrumbs />}
        actions={(
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Button variant="ghost" href={resultsHref}>Voltar para Resultados</Button>
            <Button variant="ghost" href={diagnosticoHref}>Voltar ao Diagnóstico</Button>
          </div>
        )}
      />
      <Card style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>FULL (teste)</div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Button variant="ghost" href={fullDiagnosticHref}>Ver Diagnóstico FULL</Button>
          <Button variant="ghost" href={fullInitiativesHref}>Ver Iniciativas FULL</Button>
          <Button variant="ghost" href={fullSummaryHref}>Ver Resumo Executivo FULL</Button>
        </div>
      </Card>

      {error && (
        <div style={{ marginBottom: '1rem' }}>
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      {recommendations.length === 0 && !loading && (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          Nenhuma recomendação encontrada.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {recommendations.map((rec) => (
          <Card key={rec.recommendation_id} style={{ backgroundColor: rec.is_locked ? '#f8f9fa' : '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <Badge>#{rec.rank}</Badge>
                  <Badge>{rec.process}</Badge>
                </div>
                <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem' }}>{rec.title}</h2>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <Badge variant="warning">Risco: {rec.risk}</Badge>
                <Badge variant="success">Impacto: {rec.impact}</Badge>
              </div>
            </div>

            <p style={{ marginBottom: '1rem', color: '#666' }}>{rec.why}</p>

            <div>
              <Button
                onClick={() => handleSelectFree(rec.recommendation_id)}
                disabled={
                  rec.is_locked ||
                  selecting === rec.recommendation_id ||
                  selectedFreeCount >= 4 ||
                  selectedProcesses.has(rec.process)
                }
              >
                {selecting === rec.recommendation_id ? 'Processando...' : 'Registrar evidência'}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
