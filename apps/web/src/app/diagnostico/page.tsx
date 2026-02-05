'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import { apiFetchAuth } from '@/lib/apiAuth';
import { supabase } from '@/lib/supabaseClient';

type DiagnosticoState = 'loading' | 'full' | 'blocked' | 'error' | 'unauthorized';

export default function DiagnosticoPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
        <DiagnosticoContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function DiagnosticoContent() {
  const { user, session } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const companyId = searchParams.get('company_id');

  const [state, setState] = useState<DiagnosticoState>('loading');
  const [entitlement, setEntitlement] = useState<any>(null);
  const [fullData, setFullData] = useState<any>(null);
  const [error, setError] = useState('');
  const [unlockLoading, setUnlockLoading] = useState(false);
  const hasLoggedViewPaywall = useRef(false);

  useEffect(() => {
    if (!companyId || !session?.access_token) {
      if (!companyId) {
        setError('company_id é obrigatório');
        setState('error');
      }
      return;
    }

    const logViewPaywallOnce = () => {
      // Registrar VIEW_PAYWALL apenas uma vez (independente do motivo do bloqueio)
      if (hasLoggedViewPaywall.current) return;
      hasLoggedViewPaywall.current = true;

      apiFetch(
        '/paywall/events',
        {
          method: 'POST',
          body: {
            event: 'VIEW_PAYWALL',
            company_id: companyId,
            meta: { screen: 'diagnostico' }
          }
        },
        session.access_token
      ).catch((logErr) => {
        console.error('Erro ao registrar VIEW_PAYWALL:', logErr);
      });

      if (process.env.NODE_ENV === 'development') {
        console.log('PAYWALL view_paywall');
      }
    };

    const checkFullAccess = async () => {
      try {
        setState('loading');
        setError('');
        setEntitlement(null);
        setFullData(null);

        // 1) Verificar entitlement
        const entitlementResp = await apiFetch(
          `/entitlements?company_id=${companyId}`,
          {},
          session.access_token
        );

        setEntitlement(entitlementResp);

        if (entitlementResp.plan !== 'FULL' || entitlementResp.status !== 'ACTIVE') {
          setState('blocked');
          logViewPaywallOnce();
          return;
        }

        // 2) Com entitlement FULL ativo, buscar diagnóstico completo
        const data = await apiFetch(
          `/full/diagnostic?company_id=${companyId}`,
          {},
          session.access_token
        );

        setFullData(data);
        setState('full');

        if (process.env.NODE_ENV === 'development') {
          console.log('PAYWALL full_gate status=200');
        }
      } catch (err: any) {
        if (err instanceof ApiError) {
          if (err.status === 401) {
            setState('unauthorized');
            return;
          }
          if (err.status === 403) {
            // 403: sem acesso FULL, mostrar paywall
            setState('blocked');
            logViewPaywallOnce();
            return;
          }
        }
        setError(err.message || 'Erro ao verificar acesso');
        setState('error');
      }
    };

    checkFullAccess();
  }, [companyId, session?.access_token]);

  const handleUnlock = async () => {
    if (!companyId) {
      setError('company_id é obrigatório');
      return;
    }

    try {
      setUnlockLoading(true);
      setError('');

      // 1) Registrar evento CLICK_UPGRADE
      await apiFetchAuth('/paywall/events', {
        method: 'POST',
        body: {
          event: 'CLICK_UPGRADE',
          company_id: companyId,
          meta: { screen: 'diagnostico' }
        }
      });

      if (process.env.NODE_ENV === 'development') {
        console.log('PAYWALL click_upgrade');
      }

      // 2) (Somente dev/manual) Executar unlock FULL
      if (process.env.NODE_ENV !== 'production') {
        try {
          await apiFetchAuth('/entitlements/manual-unlock', {
            method: 'POST',
            body: {
              company_id: companyId
            }
          });

          if (process.env.NODE_ENV === 'development') {
            console.log('ENTITLEMENT manual-unlock OK');
          }

          // 3) Registrar evento UNLOCK_FULL após sucesso do unlock
          await apiFetchAuth('/paywall/events', {
            method: 'POST',
            body: {
              event: 'UNLOCK_FULL',
              company_id: companyId,
              meta: { screen: 'diagnostico', source: 'manual' }
            }
          });

          if (process.env.NODE_ENV === 'development') {
            console.log('PAYWALL unlock_full');
          }

          // 4) Forçar atualização de sessão/token no frontend (obrigatório)
          // Recarregar session do Supabase para garantir token atualizado
          const { data: { session: newSession }, error: sessionError } = await supabase.auth.getSession();
          
          if (sessionError) {
            console.error('Erro ao atualizar sessão:', sessionError);
          } else if (newSession) {
            if (process.env.NODE_ENV === 'development') {
              console.log('SESSION refreshed after unlock');
            }
          }

          // 5) Navegar para /full?company_id=...
          router.push(`/full?company_id=${companyId}`);
          return;
        } catch (unlockErr: any) {
          // Se falhar o unlock manual, continuar para /paywall
          console.error('Erro no unlock manual (continuando para paywall):', unlockErr);
        }
      }

      // Se não for dev ou se unlock manual falhar, navegar para /paywall
      router.push(`/paywall?company_id=${companyId}&from=diagnostico`);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 401) {
        router.push('/login');
        return;
      }
      setError(err.message || 'Erro ao processar desbloqueio');
    } finally {
      setUnlockLoading(false);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
        Logado como: {user?.email}
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <Link href="/logout" style={{ color: '#0070f3' }}>Sair</Link>
        {' | '}
        <Link href="/diagnostico" style={{ color: '#0070f3' }}>Voltar</Link>
      </div>

      <h1 style={{ marginBottom: '1rem' }}>Diagnóstico</h1>

      {state === 'loading' && (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          Carregando...
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
          <p>Erro: {error || 'Erro ao carregar diagnóstico'}</p>
        </div>
      )}

      {state === 'full' && (
        <div>
          <div style={{
            border: '1px solid #28a745',
            borderRadius: '8px',
            padding: '1rem',
            backgroundColor: '#d4edda',
            color: '#155724',
            marginBottom: '1.5rem'
          }}>
            <strong>✓ Diagnóstico completo carregado com sucesso</strong>
            <div style={{ marginTop: '0.5rem', fontSize: '0.95rem' }}>
              Plano: <strong>{entitlement?.plan || '—'}</strong> | Status: <strong>{entitlement?.status || '—'}</strong>
            </div>
          </div>

          <div style={{
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '2rem',
            backgroundColor: '#fff'
          }}>
            <h2 style={{ marginBottom: '1rem' }}>Conteúdo do Diagnóstico Completo</h2>
            <div style={{ marginBottom: '0.75rem', color: '#555', fontSize: '0.9rem' }}>
              Dados retornados pelo endpoint <code>/full/diagnostic</code>:
            </div>
            <pre style={{
              backgroundColor: '#f8f9fa',
              padding: '1rem',
              borderRadius: '4px',
              overflow: 'auto',
              fontSize: '0.875rem'
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
            Diagnóstico completo disponível no plano FULL
          </h2>
          <p style={{ marginBottom: '1.5rem', color: '#856404', lineHeight: '1.6' }}>
            {entitlement?.plan ? (
              <>
                Plano atual: <strong>{entitlement.plan}</strong> | Status: <strong>{entitlement.status}</strong>.
                <br />
              </>
            ) : null}
            No plano LIGHT você vê apenas o resumo dos resultados.
            Desbloqueie o plano completo para acessar o diagnóstico detalhado com análises aprofundadas e recomendações personalizadas.
          </p>
          
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={handleUnlock}
              disabled={unlockLoading}
              style={{
                backgroundColor: unlockLoading ? '#6c757d' : '#0070f3',
                color: '#fff',
                border: 'none',
                padding: '1rem 2rem',
                borderRadius: '8px',
                fontSize: '1.125rem',
                fontWeight: 'bold',
                cursor: unlockLoading ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => {
                if (!unlockLoading) {
                  e.currentTarget.style.backgroundColor = '#0051cc';
                }
              }}
              onMouseLeave={(e) => {
                if (!unlockLoading) {
                  e.currentTarget.style.backgroundColor = '#0070f3';
                }
              }}
            >
              {unlockLoading ? 'Processando...' : 'Desbloquear diagnóstico completo'}
            </button>
            <Link
              href={companyId ? `/paywall?company_id=${companyId}&from=diagnostico` : '/paywall'}
              style={{
                display: 'inline-block',
                color: '#0070f3',
                padding: '1rem 2rem',
                fontSize: '1rem',
                textDecoration: 'none'
              }}
            >
              Ver planos
            </Link>
          </div>

          {error && (
            <div style={{
              marginTop: '1rem',
              padding: '0.75rem',
              backgroundColor: '#f8d7da',
              color: '#721c24',
              borderRadius: '4px',
              fontSize: '0.875rem'
            }}>
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
