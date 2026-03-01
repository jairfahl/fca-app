'use client';

import { Suspense, useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import { consultantHome } from '@/lib/consultorRoutes';
import { useAuth } from '@/lib/auth';

export default function ConsultorFullPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
        <ConsultorFullContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function ConsultorFullContent() {
  const { session } = useAuth();
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const assessmentId = params.assessment_id as string;
  const companyId = searchParams.get('company_id') || '';

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!assessmentId || !session?.access_token) return;
    const qs = companyId ? `?company_id=${companyId}` : '';
    apiFetch(`/consultor/full/${assessmentId}${qs}`, {}, session.access_token)
      .then(setData)
      .catch((err: any) => {
        if (err instanceof ApiError && err.status === 403) router.replace(consultantHome());
        else setError(err.message || 'Erro ao carregar');
      })
      .finally(() => setLoading(false));
  }, [assessmentId, companyId, session?.access_token, router]);

  if (loading) return <div style={{ padding: '2rem' }}>Carregando...</div>;
  if (error || !data) {
    return (
      <div style={{ padding: '2rem' }}>
        {error && <div style={{ color: 'red', marginBottom: '1rem' }}>{error}</div>}
        <Link href={consultantHome()} style={{ color: '#0070f3' }}>Voltar</Link>
      </div>
    );
  }

  const answers = data.answers || [];
  const plan = data.plan || [];
  const scores = data.scores || [];

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <Link href={consultantHome()} style={{ color: '#0070f3' }}>
          ← Voltar
        </Link>
      </div>
      <h1 style={{ marginBottom: '1rem' }}>Diagnóstico FULL (somente leitura)</h1>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>
        {data.assessment?.company_name} — Status: {data.assessment?.status || '—'}
      </p>

      {scores.length > 0 && (
        <div style={{ padding: '1rem', backgroundColor: '#e7f3ff', borderRadius: '8px', marginBottom: '1.5rem' }}>
          <strong>Scores por processo:</strong>
          <ul style={{ margin: '0.5rem 0 0 1.25rem', padding: 0 }}>
            {scores.map((s: any, i: number) => (
              <li key={i}>{s.process_key}: {s.band} ({s.score_numeric})</li>
            ))}
          </ul>
        </div>
      )}

      {answers.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Respostas</h2>
          {answers.map((a: any, i: number) => (
            <div key={i} style={{ padding: '0.5rem', fontSize: '0.9rem' }}>
              {a.process_key} / {a.question_key}: {a.answer_value}
            </div>
          ))}
        </div>
      )}

      {plan.length > 0 && (
        <div>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Plano (ações)</h2>
          {plan.map((p: any, i: number) => (
            <div key={i} style={{ padding: '0.75rem', backgroundColor: '#f8f9fa', borderRadius: '6px', marginBottom: '0.5rem' }}>
              {p.position}. {p.action_key} — {p.status}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
