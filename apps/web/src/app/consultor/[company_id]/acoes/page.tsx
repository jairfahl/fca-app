'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';

interface Action {
  action_key: string;
  position?: number;
  status: string;
}

interface Evidence {
  action_key: string;
  evidence_text?: string;
  before_baseline?: string;
  after_result?: string;
}

interface ActionsData {
  assessment_id: string;
  actions: Action[];
  evidence: Evidence[];
  cycle_history?: unknown[];
}

export default function ConsultorAcoesPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
        <ConsultorAcoesContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function ConsultorAcoesContent() {
  const { session } = useAuth();
  const params = useParams();
  const router = useRouter();
  const companyId = params.company_id as string;

  const [data, setData] = useState<ActionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadActions = useCallback(async () => {
    if (!companyId || !session?.access_token) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`/consultor/company/${companyId}/actions`, {}, session.access_token);
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
    loadActions();
  }, [loadActions]);

  if (loading) {
    return (
      <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
        Carregando...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
        {error && (
          <div style={{ padding: '1rem', backgroundColor: '#f8d7da', color: '#721c24', borderRadius: '8px', marginBottom: '1rem' }}>
            {error}
          </div>
        )}
        <Link href={`/consultor/${companyId}`} style={{ color: '#0070f3' }}>Voltar ao overview</Link>
      </div>
    );
  }

  const evidenceByAction = (data.evidence || []).reduce<Record<string, Evidence>>((acc, e) => {
    acc[e.action_key] = e;
    return acc;
  }, {});

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <Link href={`/consultor/${companyId}`} style={{ color: '#0070f3' }}>← Overview</Link>
        <span style={{ margin: '0 0.5rem' }}>|</span>
        <Link href="/consultor" style={{ color: '#0070f3' }}>Empresas</Link>
      </div>

      <h1 style={{ marginBottom: '1.5rem' }}>Ações e evidências</h1>

      {(!data.actions || data.actions.length === 0) ? (
        <p style={{ color: '#666' }}>Nenhuma ação no plano.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {data.actions.map((a, i) => {
            const ev = evidenceByAction[a.action_key];
            return (
              <div
                key={a.action_key}
                style={{
                  border: '1px solid #dee2e6',
                  borderRadius: '8px',
                  padding: '1.25rem',
                  backgroundColor: '#fff',
                }}
              >
                <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.1rem' }}>
                  Ação {a.position ?? i + 1}: {a.action_key}
                </h3>
                <div style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                  <strong>Status:</strong> {a.status}
                </div>
                {ev && (
                  <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #eee', fontSize: '0.9rem' }}>
                    <strong>Evidência:</strong>
                    {ev.evidence_text && <div style={{ marginTop: '0.25rem' }}>{ev.evidence_text}</div>}
                    {ev.before_baseline && (
                      <div style={{ marginTop: '0.5rem' }}>
                        <strong>Antes:</strong> {ev.before_baseline}
                      </div>
                    )}
                    {ev.after_result && (
                      <div style={{ marginTop: '0.25rem' }}>
                        <strong>Depois:</strong> {ev.after_result}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
