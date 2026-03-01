'use client';

import { Suspense, useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import { consultantHome } from '@/lib/consultorRoutes';
import { useAuth } from '@/lib/auth';

export default function ConsultorLightPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
        <ConsultorLightContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function ConsultorLightContent() {
  const { session } = useAuth();
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const assessmentId = params.assessment_id as string;
  const companyId = searchParams.get('company_id') || '';

  const [data, setData] = useState<{ assessment: any; items: any[]; scores: any } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!assessmentId || !session?.access_token) return;
    const qs = companyId ? `?company_id=${companyId}` : '';
    apiFetch(`/consultor/light/${assessmentId}${qs}`, {}, session.access_token)
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

  const processOrder = ['COMERCIAL', 'OPERACOES', 'ADM_FIN', 'GESTAO'];
  const byProcess: Record<string, any[]> = {};
  (data.items || []).forEach((i) => {
    const p = i.process || 'OUTRO';
    if (!byProcess[p]) byProcess[p] = [];
    byProcess[p].push(i);
  });

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <Link href={consultantHome()} style={{ color: '#0070f3' }}>
          ← Voltar
        </Link>
      </div>
      <h1 style={{ marginBottom: '1rem' }}>Diagnóstico LIGHT (somente leitura)</h1>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>Status: {data.assessment?.status || '—'}</p>

      {data.scores && (
        <div style={{ padding: '1rem', backgroundColor: '#e7f3ff', borderRadius: '8px', marginBottom: '1.5rem' }}>
          <strong>Scores:</strong> Comercial {data.scores.commercial}, Operações {data.scores.operations}, Adm/Fin {data.scores.admin_fin}, Gestão {data.scores.management} — Overall: {data.scores.overall}
        </div>
      )}

      {processOrder.map((proc) => (
        <div key={proc} style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>{proc}</h2>
          {(byProcess[proc] || []).map((item, i) => (
            <div key={i} style={{ padding: '0.75rem', backgroundColor: '#f8f9fa', borderRadius: '6px', marginBottom: '0.5rem' }}>
              <div style={{ fontSize: '0.9rem', color: '#666' }}>{item.activity}</div>
              <div><strong>Nota:</strong> {item.score_int}/10</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
