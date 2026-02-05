'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetchAuth } from '@/lib/apiAuth';

type FullPageState = 'loading' | 'success' | 'blocked' | 'error' | 'missing_company';

export default function FullPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
        <FullContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function FullContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const companyId = searchParams.get('company_id');

  const [state, setState] = useState<FullPageState>('loading');
  const [fullData, setFullData] = useState<any>(null);
  const [error, setError] = useState('');
  
  // Refs para evitar loops e múltiplas chamadas
  const hasLoadedRef = useRef(false);
  const hasLoggedViewPaywallRef = useRef(false);

  useEffect(() => {
    // Passo 1: Validar company_id
    if (!companyId) {
      setState('missing_company');
      return;
    }

    // Evitar múltiplas execuções do mesmo companyId
    if (hasLoadedRef.current) {
      return;
    }

    const loadFullPage = async () => {
      // Marcar como carregando para evitar execuções paralelas
      hasLoadedRef.current = true;

      try {
        setState('loading');
        setError('');

        // Passo 2: Gate - Verificar entitlement primeiro
        let entitlementData;
        try {
          entitlementData = await apiFetchAuth(
            `/entitlements?company_id=${companyId}`
          );
        } catch (entErr: any) {
          // Tratar erro de entitlement sem usar instanceof
          const status = (entErr && typeof entErr === 'object' && 'status' in entErr) 
            ? (entErr as { status: number }).status 
            : null;
          
          if (status === 401) {
            // Redirecionamento já é feito pelo apiFetchAuth
            hasLoadedRef.current = false; // Reset para permitir retry após login
            return;
          }
          
          setError('Erro ao verificar entitlement');
          setState('error');
          hasLoadedRef.current = false; // Reset para permitir retry
          if (process.env.NODE_ENV === 'development') {
            console.error('Erro ao buscar entitlement:', entErr);
          }
          return;
        }

        // Passo 3: Normalizar entitlement (pode ser objeto único ou array)
        const entList = Array.isArray(entitlementData) 
          ? entitlementData.filter(Boolean)
          : entitlementData 
            ? [entitlementData].filter(Boolean)
            : [];

        // Determinar FULL ativo (dar prioridade para FULL sobre LIGHT)
        const hasFullActive = entList.some(
          (e: any) => e?.plan === 'FULL' && e?.status === 'ACTIVE'
        );

        if (!hasFullActive) {
          // Gate falhou: não chamar /full/diagnostic, mostrar paywall
          setState('blocked');
          
          // Registrar VIEW_PAYWALL apenas uma vez
          if (!hasLoggedViewPaywallRef.current) {
            hasLoggedViewPaywallRef.current = true;
            
            apiFetchAuth('/paywall/events', {
              method: 'POST',
              body: {
                event: 'VIEW_PAYWALL',
                company_id: companyId,
                meta: { screen: 'full' }
              }
            }).catch((logErr) => {
              console.error('Erro ao registrar VIEW_PAYWALL:', logErr);
            });

            if (process.env.NODE_ENV === 'development') {
              console.log('PAYWALL view_paywall (full page)');
            }
          }
          
          if (process.env.NODE_ENV === 'development') {
            console.log('FULL gate blocked - entitlement:', entList);
          }
          
          hasLoadedRef.current = false; // Reset para permitir retry após unlock
          return;
        }

        // Passo 4: Gate passou - chamar /full/diagnostic
        try {
          const data = await apiFetchAuth(
            `/full/diagnostic?company_id=${companyId}`
          );

          // 200: sucesso, mostrar dados
          setFullData(data);
          setState('success');

          if (process.env.NODE_ENV === 'development') {
            console.log('FULL fetch 200', data);
          }
        } catch (fullErr: any) {
          // Tratar erro do /full/diagnostic (fallback) sem usar instanceof
          const status = (fullErr && typeof fullErr === 'object' && 'status' in fullErr) 
            ? (fullErr as { status: number }).status 
            : null;
          
          if (status === 401) {
            // Redirecionamento já é feito pelo apiFetchAuth
            hasLoadedRef.current = false; // Reset para permitir retry após login
            return;
          }
          
          if (status === 403) {
            // 403: sem acesso FULL (fallback - não deveria acontecer se gate estiver correto)
            setState('blocked');
            
            // Registrar VIEW_PAYWALL apenas uma vez
            if (!hasLoggedViewPaywallRef.current) {
              hasLoggedViewPaywallRef.current = true;
              
              apiFetchAuth('/paywall/events', {
                method: 'POST',
                body: {
                  event: 'VIEW_PAYWALL',
                  company_id: companyId,
                  meta: { screen: 'full' }
                }
              }).catch((logErr) => {
                console.error('Erro ao registrar VIEW_PAYWALL:', logErr);
              });
            }
            
            if (process.env.NODE_ENV === 'development') {
              console.log('FULL fetch 403 - fallback (gate deveria ter bloqueado)');
            }
            
            hasLoadedRef.current = false; // Reset para permitir retry
            return;
          }
          
          const errorMessage = (fullErr && typeof fullErr === 'object' && 'message' in fullErr)
            ? String(fullErr.message)
            : 'Erro ao carregar diagnóstico completo';
          
          setError(errorMessage);
          setState('error');
          hasLoadedRef.current = false; // Reset para permitir retry
          if (process.env.NODE_ENV === 'development') {
            console.error('FULL fetch error:', fullErr);
          }
        }
      } catch (err: any) {
        // Erro geral não tratado (sem usar instanceof)
        const errorMessage = (err && typeof err === 'object' && 'message' in err)
          ? String(err.message)
          : 'Erro inesperado';
        
        setError(errorMessage);
        setState('error');
        hasLoadedRef.current = false; // Reset para permitir retry
        if (process.env.NODE_ENV === 'development') {
          console.error('Erro geral:', err);
        }
      }
    };

    loadFullPage();

    // Reset ref quando companyId mudar
    return () => {
      hasLoadedRef.current = false;
      hasLoggedViewPaywallRef.current = false;
    };
  }, [companyId]); // Dependência apenas em companyId

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
        Logado como: {user?.email}
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <Link href="/logout" style={{ color: '#0070f3' }}>Sair</Link>
        {' | '}
        <Link href="/diagnostico" style={{ color: '#0070f3' }}>Voltar ao Diagnóstico</Link>
      </div>

      <h1 style={{ marginBottom: '1rem' }}>Diagnóstico Completo (FULL)</h1>

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
          <p>company_id ausente</p>
          <p style={{ marginTop: '1rem', fontSize: '0.875rem' }}>
            Acesse esta página com o parâmetro: <code>?company_id=&lt;uuid&gt;</code>
          </p>
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
          <p><strong>Erro:</strong> {error || 'Erro ao carregar diagnóstico completo'}</p>
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
                Plano FULL ativo
              </div>
            </div>
          </div>

          <div style={{
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '2rem',
            backgroundColor: '#fff',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <h2 style={{ marginBottom: '1rem', color: '#333' }}>
              Conteúdo do Diagnóstico Completo
            </h2>
            <p style={{ marginBottom: '1rem', color: '#666', fontSize: '0.875rem' }}>
              Dados retornados pelo endpoint /full/diagnostic:
            </p>
            <pre style={{
              backgroundColor: '#f8f9fa',
              padding: '1rem',
              borderRadius: '4px',
              overflow: 'auto',
              fontSize: '0.875rem',
              lineHeight: '1.5',
              border: '1px solid #dee2e6',
              maxHeight: '500px'
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
            No plano LIGHT você tem acesso apenas ao resumo dos resultados.
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
            Ver planos
          </Link>
        </div>
      )}
    </div>
  );
}
