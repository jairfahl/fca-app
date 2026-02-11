'use client';

import { Suspense, useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import { auditLog } from '@/lib/auditLog';
import { labels } from '@/lib/uiCopy';
import { getEntitlement } from '@/lib/entitlement';
import { assertFullAccess } from '@/lib/fullGuard';

type FullDiagnosticState = 'loading' | 'success' | 'blocked' | 'error' | 'unauthorized' | 'missing_company';

export default function FullDiagnosticPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
        <FullDiagnosticContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function FullDiagnosticContent() {
  const { user, session } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const companyId = searchParams.get('company_id');

  const [state, setState] = useState<FullDiagnosticState>('loading');
  const [fullData, setFullData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    // Validar company_id
    if (!companyId) {
      setState('missing_company');
      return;
    }

    // Validar sessão
    if (!session?.access_token) {
      setState('unauthorized');
      return;
    }

    const fetchFullDiagnostic = async () => {
      try {
        setState('loading');
        setError('');

        const entitlement = await getEntitlement(companyId, session.access_token);
        if (!assertFullAccess(entitlement)) {
          setState('blocked');
          auditLog('full_diagnostic_blocked', {
            company_id: companyId,
            plan: entitlement.plan,
            status: entitlement.status,
            reason: 'entitlement',
          });
          return;
        }

        const data = await apiFetch(
          `/full/diagnostic?company_id=${companyId}`,
          {},
          session.access_token
        );

        // 200: sucesso, mostrar dados
        setFullData(data);
        setState('success');

        if (process.env.NODE_ENV === 'development') {
          console.log('FULL_DIAGNOSTIC status=200', data);
        }
      } catch (err: any) {
        if (err instanceof ApiError) {
          if (err.status === 401) {
            setState('unauthorized');
            return;
          }
          if (err.status === 403) {
            setState('blocked');
            auditLog('full_diagnostic_blocked', {
              company_id: companyId,
              reason: '403',
            });
            return;
          }
        }
        const status = err instanceof ApiError ? err.status : 0;
        setError((status === 404 || status === 500) ? 'Falha ao carregar diagnóstico FULL' : (err.message || 'Falha ao carregar diagnóstico FULL'));
        setState('error');
      }
    };

    fetchFullDiagnostic();
  }, [companyId, session?.access_token]);

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1rem', color: '#666' }}>
        Logado como: {user?.email}
      </div>

      <h1 style={{ marginBottom: '0.25rem' }}>Diagnóstico Completo (FULL)</h1>
      <p style={{ marginBottom: '1.5rem', color: '#666' }}>
        Relatório detalhado com os dados completos do diagnóstico.
      </p>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <Link
          href={companyId ? `/full?company_id=${companyId}` : '/full'}
          style={{
            display: 'inline-block',
            backgroundColor: '#0070f3',
            color: '#fff',
            padding: '0.75rem 1.25rem',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: 'bold'
          }}
        >
          Voltar ao FULL
        </Link>
        <Link
          href={companyId ? `/diagnostico?company_id=${companyId}` : '/diagnostico'}
          style={{
            display: 'inline-block',
            backgroundColor: '#e9ecef',
            color: '#333',
            padding: '0.75rem 1.25rem',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: 'bold'
          }}
        >
          Voltar ao diagnóstico
        </Link>
      </div>

      {state === 'loading' && (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          Carregando diagnóstico completo...
        </div>
      )}

      {state === 'missing_company' && (
        <div style={{
          border: '1px solid #dc3545',
          borderRadius: '8px',
          padding: '2rem',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          textAlign: 'center'
        }}>
          <p>{labels.missingCompany}</p>
        </div>
      )}

      {state === 'unauthorized' && (
        <div style={{
          border: '1px solid #dc3545',
          borderRadius: '8px',
          padding: '2rem',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          textAlign: 'center'
        }}>
          <p style={{ marginBottom: '1rem' }}>Sessão expirada</p>
          <Link href="/login" style={{ color: '#0070f3' }}>Login</Link>
        </div>
      )}

      {state === 'error' && (
        <div style={{
          border: '1px solid #dc3545',
          borderRadius: '8px',
          padding: '2rem',
          backgroundColor: '#f8d7da',
          color: '#721c24'
        }}>
          <p><strong>Erro:</strong> {error || 'Falha ao carregar diagnóstico FULL'}</p>
        </div>
      )}

      {state === 'success' && fullData && (
        <div>
          <div style={{
            border: '1px solid #28a745',
            borderRadius: '8px',
            padding: '1rem',
            backgroundColor: '#d4edda',
            color: '#155724',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <span style={{ fontSize: '1.25rem' }}>✓</span>
            <div>
              <strong>Diagnóstico completo carregado com sucesso</strong>
              <div style={{ fontSize: '0.875rem', marginTop: '0.25rem', opacity: 0.8 }}>
                Tipo: Diagnóstico FULL
              </div>
            </div>
          </div>

          <div style={{
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '2rem',
            backgroundColor: '#fff'
          }}>
            <h2 style={{ marginBottom: '1rem' }}>Payload do Backend</h2>
            <pre style={{
              backgroundColor: '#f8f9fa',
              padding: '1rem',
              borderRadius: '4px',
              overflow: 'auto',
              fontSize: '0.875rem',
              lineHeight: '1.5',
              border: '1px solid #dee2e6'
            }}>
              {JSON.stringify(fullData, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {state === 'blocked' && (
        <div style={{
          border: '2px solid #ffc107',
          borderRadius: '8px',
          padding: '2rem',
          backgroundColor: '#fff3cd',
          textAlign: 'center'
        }}>
          <h2 style={{ marginBottom: '1rem', color: '#856404' }}>
            Conteúdo disponível apenas no FULL
          </h2>
          <p style={{ marginBottom: '1.5rem', color: '#856404', lineHeight: '1.6' }}>
            Este diagnóstico completo requer um plano FULL ativo.
          </p>
          
          <Link
            href={`/paywall?company_id=${companyId}`}
            style={{
              display: 'inline-block',
              backgroundColor: '#0070f3',
              color: '#fff',
              padding: '1rem 2rem',
              borderRadius: '8px',
              fontSize: '1.125rem',
              fontWeight: 'bold',
              textDecoration: 'none',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#0051cc';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#0070f3';
            }}
          >
            Ver plano FULL
          </Link>
        </div>
      )}
    </div>
  );
}
