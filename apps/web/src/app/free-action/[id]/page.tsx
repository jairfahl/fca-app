'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/auth';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import PageHeader from '@/components/ui/PageHeader';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Alert from '@/components/ui/Alert';
import PaywallCard from '@/components/PaywallCard';

interface FreeAction {
  id: string;
  assessment_id: string;
  recommendation_id: string;
  process: string;
  status: 'ACTIVE' | 'COMPLETED';
  created_at: string;
  completed_at: string | null;
  recommendation: {
    title: string;
    checklist: string[];
  };
  evidence: {
    evidence_text: string;
    created_at: string;
  } | null;
}

export default function FreeActionPage() {
  return (
    <ProtectedRoute>
      <FreeActionContent />
    </ProtectedRoute>
  );
}

function FreeActionContent() {
  const { user, session } = useAuth();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const freeActionId = params.id as string;
  const companyIdParam = searchParams.get('company_id');
  const assessmentIdParam = searchParams.get('assessment_id');
  const diagnosticoHref = companyIdParam ? `/diagnostico?company_id=${companyIdParam}` : '/diagnostico';

  const [loading, setLoading] = useState(true);
  const [freeAction, setFreeAction] = useState<FreeAction | null>(null);
  const [error, setError] = useState('');
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [evidenceText, setEvidenceText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (!freeActionId || !session?.access_token) {
      return;
    }

    const loadFreeAction = async () => {
      try {
        setLoading(true);
        setError('');
        setErrorStatus(null);
        const data = await apiFetch(
          `/free-actions/${freeActionId}`,
          {},
          session.access_token
        );
        setFreeAction(data);
        if (data.evidence) {
          setEvidenceText(data.evidence.evidence_text);
        }
      } catch (err: any) {
        if (err instanceof ApiError && err.status === 401) {
          router.push('/login');
          return;
        }
        if (err instanceof ApiError) {
          setErrorStatus(err.status);
          if (err.status === 404) {
            setError('Ação não encontrada ou link inválido.');
            return;
          }
          if (err.status === 403) {
            setError('Conteúdo disponível apenas no FULL.');
            return;
          }
          if (err.status >= 500) {
            setError('Erro interno. Tente novamente.');
            return;
          }
        }
        setError('Erro interno. Tente novamente.');
      } finally {
        setLoading(false);
      }
    };

    loadFreeAction();
  }, [freeActionId, session?.access_token, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!evidenceText.trim() || !session?.access_token) {
      setError('Evidência é obrigatória');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      setErrorStatus(null);
      setSuccessMessage('');

      await apiFetch(
        `/free-actions/${freeActionId}/evidence`,
        {
          method: 'POST',
          body: { evidence_text: evidenceText.trim() },
        },
        session.access_token
      );

      setSuccessMessage('Evidência registrada com sucesso!');
      
      // Recarregar dados para mostrar status COMPLETED
      const data = await apiFetch(
        `/free-actions/${freeActionId}`,
        {},
        session.access_token
      );
      setFreeAction(data);
      if (data.evidence) {
        setEvidenceText(data.evidence.evidence_text);
      }
    } catch (err: any) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          router.push('/login');
          return;
        }
        setErrorStatus(err.status);
        if (err.status === 409) {
          setError('Evidência já registrada.');
          return;
        }
        if (err.status === 403) {
          setError('Conteúdo disponível apenas no FULL.');
          return;
        }
        if (err.status === 404) {
          setError('Ação não encontrada ou link inválido.');
          return;
        }
        if (err.status >= 500) {
          setError('Erro interno. Tente novamente.');
          return;
        }
        setError('Erro interno. Tente novamente.');
      } else {
        setError('Erro interno. Tente novamente.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AppShell showLogout userEmail={user?.email}>
        <PageHeader title="Evidência" subtitle="Comprove a execução da ação escolhida." breadcrumbs={<Breadcrumbs />} />
        <Card>
          <div style={{ textAlign: 'center' }}>Carregando ação gratuita...</div>
        </Card>
      </AppShell>
    );
  }

  if (!freeAction) {
    return (
      <AppShell showLogout userEmail={user?.email}>
        <PageHeader title="Evidência" subtitle="Comprove a execução da ação escolhida." breadcrumbs={<Breadcrumbs />} />
        {errorStatus === 403 ? (
          <PaywallCard
            primaryLabel="Ver planos"
            primaryHref={companyIdParam ? `/paywall?company_id=${companyIdParam}` : '/paywall'}
            secondaryLabel="Voltar"
            secondaryHref={diagnosticoHref}
          />
        ) : (
          <Card>
            <div style={{ color: '#dc3545', marginBottom: '0.75rem' }}>
              {error || 'Ação não encontrada ou link inválido.'}
            </div>
            <Button variant="ghost" href={diagnosticoHref}>Voltar ao Diagnóstico</Button>
          </Card>
        )}
      </AppShell>
    );
  }

  const isCompleted = freeAction.status === 'COMPLETED';
  const hasEvidence = freeAction.evidence !== null;
  const assessmentId = freeAction.assessment_id || assessmentIdParam;
  const resultsHref = assessmentId
    ? `/results?assessment_id=${assessmentId}${companyIdParam ? `&company_id=${companyIdParam}` : ''}`
    : '/results';
  const recommendationsHref = assessmentId
    ? `/recommendations?assessment_id=${assessmentId}${companyIdParam ? `&company_id=${companyIdParam}` : ''}`
    : '/recommendations';

  return (
    <AppShell showLogout userEmail={user?.email}>
      <PageHeader
        title="Evidência"
        subtitle="Comprove a execução da ação escolhida."
        breadcrumbs={<Breadcrumbs />}
        actions={(
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Button variant="ghost" href={recommendationsHref}>Voltar para Recomendações</Button>
            <Button variant="ghost" href={resultsHref}>Voltar para Resultados</Button>
          </div>
        )}
      />

      {!assessmentId && (
        <div style={{
          padding: '1rem',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          borderRadius: '4px',
          marginBottom: '1rem'
        }}>
          assessment_id ausente. Não é possível montar a navegação de retorno.
        </div>
      )}

      {error && (
        <div style={{ marginBottom: '1rem' }}>
          <Alert variant="error">{error}</Alert>
        </div>
      )}


      {successMessage && (
        <div style={{ marginBottom: '1rem' }}>
          <Alert variant="success">
            Evidência salva.
          </Alert>
          <div style={{ marginTop: '0.5rem' }}>
            <Button variant="ghost" href={recommendationsHref}>Voltar para Recomendações</Button>
          </div>
        </div>
      )}

      <Card style={{ marginBottom: '1.5rem' }}>
        <div style={{ marginBottom: '1rem' }}>
          <span style={{
            backgroundColor: '#e9ecef',
            padding: '0.25rem 0.5rem',
            borderRadius: '4px',
            fontSize: '0.875rem',
            marginRight: '0.5rem'
          }}>
            {freeAction.process}
          </span>
          {isCompleted && (
            <span style={{
              backgroundColor: '#28a745',
              color: '#fff',
              padding: '0.25rem 0.5rem',
              borderRadius: '4px',
              fontSize: '0.875rem',
              fontWeight: 'bold'
            }}>
              ✓ Concluída
            </span>
          )}
        </div>

        <h2 style={{ marginBottom: '1rem' }}>{freeAction.recommendation.title}</h2>

        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>Checklist:</h3>
          {freeAction.recommendation.checklist.length === 0 ? (
            <div style={{ color: '#6b7280' }}>
              Sem checklist padrão. Descreva o que foi feito e como comprovou.
            </div>
          ) : (
            <ul style={{ marginLeft: '1.5rem', color: '#666' }}>
              {freeAction.recommendation.checklist.map((item, idx) => (
                <li key={idx} style={{ marginBottom: '0.25rem' }}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card>
        <div>
          <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>
            Evidência {hasEvidence && '(já registrada)'}:
          </h3>
          {isCompleted && hasEvidence ? (
            <div style={{
              padding: '1rem',
              backgroundColor: '#f8f9fa',
              borderRadius: '4px',
              border: '1px solid #ddd',
              whiteSpace: 'pre-wrap',
              color: '#333'
            }}>
              {freeAction.evidence!.evidence_text}
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <textarea
                value={evidenceText}
                onChange={(e) => setEvidenceText(e.target.value)}
                placeholder="Ex.: Foto do quadro de rotina\nEx.: Link do documento ou print do sistema"
                rows={8}
                disabled={submitting || isCompleted}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '0.95rem',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  marginBottom: '1rem'
                }}
              />
              {!isCompleted && (
                <Button type="submit" disabled={submitting || !evidenceText.trim()}>
                  {submitting ? 'Salvando...' : 'Salvar evidência'}
                </Button>
              )}
            </form>
          )}
        </div>

        {isCompleted && freeAction.completed_at && (
          <div style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#666' }}>
            Concluída em: {new Date(freeAction.completed_at).toLocaleString('pt-BR')}
          </div>
        )}
      </Card>
    </AppShell>
  );
}
