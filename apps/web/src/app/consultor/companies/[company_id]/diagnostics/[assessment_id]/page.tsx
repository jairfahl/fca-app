'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { consultantDiagnosticDetail, type DiagnosticDetail } from '@/lib/api/consultor';
import { consultantCompanyOverview } from '@/lib/consultorRoutes';
import { ApiError } from '@/lib/api';
import { humanizeStatus } from '@/lib/uiCopy';

export default function ConsultorDiagnosticDetailPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
        <ConsultorDiagnosticDetailContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function ConsultorDiagnosticDetailContent() {
  const { session } = useAuth();
  const params = useParams();
  const router = useRouter();
  const companyId = params.company_id as string;
  const assessmentId = params.assessment_id as string;

  const [data, setData] = useState<DiagnosticDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    if (!companyId || !assessmentId || !session?.access_token) return;
    setLoading(true);
    setError('');
    try {
      const res = await consultantDiagnosticDetail(companyId, assessmentId, session.access_token);
      setData(res);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        router.replace('/diagnostico');
        return;
      }
      setError((err as Error).message || 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, [companyId, assessmentId, session?.access_token, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
        <div style={{ padding: '1rem', backgroundColor: '#f8d7da', color: '#721c24', borderRadius: '8px', marginBottom: '1rem' }}>
          {error || 'Diagnóstico não encontrado'}
        </div>
        <Link href={consultantCompanyOverview(companyId)} style={{ color: '#0d6efd' }}>
          ← Voltar à empresa
        </Link>
      </div>
    );
  }

  const assessment = data.assessment as Record<string, unknown>;
  const status = (assessment?.status as string) || '—';
  const createdAt = assessment?.created_at as string | undefined;
  const submittedAt = assessment?.submitted_at as string | undefined;

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <Link href={consultantCompanyOverview(companyId)} style={{ color: '#0d6efd', textDecoration: 'none' }}>
          ← Empresa
        </Link>
      </div>

      <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#fff3cd', borderRadius: '6px', fontSize: '0.9rem' }}>
        Somente leitura — consultor não edita diagnóstico
      </div>

      <h1 style={{ marginBottom: '1rem' }}>
        Diagnóstico {data.type} — {humanizeStatus(status)}
      </h1>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Status e datas</h2>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <span>Status: {humanizeStatus(status)}</span>
          {createdAt && <span>Criado: {new Date(createdAt).toLocaleString('pt-BR')}</span>}
          {submittedAt && <span>Submetido: {new Date(submittedAt).toLocaleString('pt-BR')}</span>}
        </div>
      </section>

      {data.scores && data.scores.length > 0 && (
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Scores</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {(data.scores as Array<Record<string, unknown>>).map((s, i) => (
              <span
                key={i}
                style={{
                  padding: '0.25rem 0.5rem',
                  backgroundColor: '#e7f3ff',
                  borderRadius: '4px',
                  fontSize: '0.9rem',
                }}
              >
                {(s.process_key as string) || (s.category as string)}: {String(s.score_numeric ?? s.score ?? '—')}
              </span>
            ))}
          </div>
        </section>
      )}

      {data.findings && (data.findings as unknown[]).length > 0 && (
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Resultados (vazamentos/alavancas)</h2>
          <ul style={{ paddingLeft: '1.25rem' }}>
            {(data.findings as Array<Record<string, unknown>>).map((f, i) => (
              <li key={i} style={{ marginBottom: '0.25rem' }}>
                {(f.title as string) || (f.process_key as string) || JSON.stringify(f)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.plan && (data.plan as unknown[]).length > 0 && (
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Plano 30 dias</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {(data.plan as Array<Record<string, unknown>>).map((a, i) => (
              <li
                key={i}
                style={{
                  padding: '0.75rem 1rem',
                  marginBottom: '0.5rem',
                  border: '1px solid #dee2e6',
                  borderRadius: '6px',
                  backgroundColor: '#fff',
                }}
              >
                <strong>{(a.title as string) || (a.action_key as string) || 'Ação'}</strong>
                {a.owner_name != null && a.owner_name !== '' && (
                  <span style={{ marginLeft: '0.5rem', fontSize: '0.9rem', color: '#6c757d' }}>
                    — {String(a.owner_name)}
                  </span>
                )}
                {a.status != null && a.status !== '' && (
                  <span style={{ marginLeft: '0.5rem', fontSize: '0.85rem' }}>
                    ({humanizeStatus(String(a.status))})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.evidence && (data.evidence as unknown[]).length > 0 && (
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Evidências e ganhos</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {(data.evidence as Array<Record<string, unknown>>).map((e, i) => (
              <li
                key={i}
                style={{
                  padding: '0.75rem 1rem',
                  marginBottom: '0.5rem',
                  border: '1px solid #dee2e6',
                  borderRadius: '6px',
                  backgroundColor: '#f8f9fa',
                }}
              >
                <div style={{ fontWeight: 600 }}>{(e.action_key as string) || 'Ação'}</div>
                {e.before_baseline != null && e.before_baseline !== '' ? <div style={{ fontSize: '0.9rem', marginTop: '0.25rem' }}>Antes: {String(e.before_baseline)}</div> : null}
                {e.after_result != null && e.after_result !== '' ? <div style={{ fontSize: '0.9rem', marginTop: '0.25rem' }}>Depois: {String(e.after_result)}</div> : null}
                {e.declared_gain != null && e.declared_gain !== '' ? <div style={{ fontSize: '0.9rem', marginTop: '0.25rem', color: '#198754' }}>Ganho: {String(e.declared_gain)}</div> : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.type === 'LIGHT' && data.items && (data.items as unknown[]).length > 0 && (
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Respostas LIGHT</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {(data.items as Array<Record<string, unknown>>).map((item, i) => (
              <li
                key={i}
                style={{
                  padding: '0.5rem 1rem',
                  marginBottom: '0.25rem',
                  border: '1px solid #eee',
                  borderRadius: '4px',
                  fontSize: '0.9rem',
                }}
              >
                {String(item.process ?? '')} / {String(item.activity ?? '')}: {String(item.score_int ?? '—')}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
