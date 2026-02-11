'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';

interface LightActionPlan {
  id: string;
  assessment_id: string;
  company_id: string;
  process: string;
  free_action_id: string;
  step_1: string;
  step_2: string;
  step_3: string;
  owner_name: string;
  metric: string;
  checkpoint_date: string;
  locked?: boolean;
  created_at: string;
  updated_at: string;
}

const PROCESS_LABELS: Record<string, string> = {
  COMERCIAL: 'Comercial',
  OPERACOES: 'Operações',
  ADM_FIN: 'Adm/Fin',
  GESTAO: 'Gestão',
};

const PROCESS_ORDER = ['COMERCIAL', 'OPERACOES', 'ADM_FIN', 'GESTAO'];

export default function Plano30DiasPage() {
  return (
    <ProtectedRoute>
      <Plano30DiasContent />
    </ProtectedRoute>
  );
}

function Plano30DiasContent() {
  const { session } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const assessmentId = searchParams.get('assessment_id');
  const companyId = searchParams.get('company_id');

  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<LightActionPlan[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!assessmentId || !companyId || !session?.access_token) {
      setLoading(false);
      if (!assessmentId || !companyId) {
        setError('assessment_id e company_id são obrigatórios.');
      }
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const data = await apiFetch(
          `/light/plans?assessment_id=${assessmentId}&company_id=${companyId}`,
          {},
          session.access_token
        );
        const ordered = (Array.isArray(data) ? data : []).sort(
          (a: LightActionPlan, b: LightActionPlan) =>
            PROCESS_ORDER.indexOf(a.process) - PROCESS_ORDER.indexOf(b.process)
        );
        setPlans(ordered);
      } catch (err: any) {
        if (err instanceof ApiError && err.status === 401) {
          router.push('/login');
          return;
        }
        setError('Falha ao carregar plano. Tente novamente.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [assessmentId, companyId, session?.access_token, router]);

  if (loading) {
    return (
      <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center' }}>Carregando plano de 30 dias...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 style={{ margin: 0 }}>Plano de 30 dias</h1>
        <Link
          href={`/recommendations?assessment_id=${assessmentId}&company_id=${companyId}`}
          style={{
            display: 'inline-block',
            backgroundColor: '#0070f3',
            color: '#fff',
            padding: '0.6rem 1rem',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: 'bold',
            fontSize: '0.9rem',
          }}
        >
          Voltar para Recomendações
        </Link>
      </div>

      {error && (
        <div style={{
          padding: '1rem',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          borderRadius: '6px',
          marginBottom: '1rem',
        }}>
          {error}
        </div>
      )}

      {plans.length === 0 && !error && (
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          color: '#666',
        }}>
          Nenhum plano salvo ainda. Volte às recomendações e monte os 4 planos por processo.
        </div>
      )}

      {plans.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {plans.map((plan) => (
            <div
              key={plan.id}
              style={{
                border: '1px solid #e9ecef',
                borderRadius: '8px',
                padding: '1.25rem',
                backgroundColor: '#fff',
              }}
            >
              <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', color: '#333' }}>
                {PROCESS_LABELS[plan.process] || plan.process}
              </h2>
              <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <div><strong>Passo 1:</strong> {plan.step_1 || '—'}</div>
                <div><strong>Passo 2:</strong> {plan.step_2 || '—'}</div>
                <div><strong>Passo 3:</strong> {plan.step_3 || '—'}</div>
                <div><strong>Responsável:</strong> {plan.owner_name || '—'}</div>
                <div><strong>Métrica:</strong> {plan.metric || '—'}</div>
                <div><strong>Checkpoint:</strong> {plan.checkpoint_date || '—'}</div>
              </div>
              <Link
                href={`/free-action/${plan.free_action_id}?assessment_id=${assessmentId}&company_id=${companyId}`}
                style={{
                  display: 'inline-block',
                  color: '#0070f3',
                  fontSize: '0.875rem',
                  fontWeight: 'bold',
                }}
              >
                Ver detalhes e evidência →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
