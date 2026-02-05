'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/auth';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetchAuth } from '@/lib/apiAuth';
import PageHeader from '@/components/ui/PageHeader';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import PaywallCard from '@/components/PaywallCard';

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
  const diagnosticoHref = companyId ? `/diagnostico?company_id=${companyId}` : '/diagnostico';

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
    <AppShell showLogout userEmail={user?.email}>
      <PageHeader title="Diagnóstico Completo (FULL)" subtitle="Acesso ao conteúdo completo do diagnóstico." breadcrumbs={<Breadcrumbs />} />

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
        <div style={{ display: 'grid', gap: '1rem' }}>
          <Card>
            <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Relatório Executivo FULL</div>
            <div style={{ color: '#6b7280', marginBottom: '1rem' }}>
              Acesse as seções do relatório para navegar rapidamente.
            </div>
            {(() => {
              const assessmentId = fullData?.assessment?.id || fullData?.assessment_id || null;
              const diagHref = assessmentId ? `/full/diagnostic?assessment_id=${assessmentId}` : '/full/diagnostic';
              const initHref = assessmentId ? `/full/initiatives?assessment_id=${assessmentId}` : '/full/initiatives';
              const summaryHref = assessmentId ? `/full/summary?assessment_id=${assessmentId}` : '/full/summary';
              return (
                <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                  <Card>
                    <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Diagnóstico FULL</div>
                    <div style={{ color: '#6b7280', marginBottom: '0.75rem' }}>
                      Resumo executivo e próximos passos.
                    </div>
                    <Button href={diagHref}>Abrir</Button>
                  </Card>
                  <Card>
                    <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Iniciativas (Top‑12)</div>
                    <div style={{ color: '#6b7280', marginBottom: '0.75rem' }}>
                      Lista priorizada de iniciativas.
                    </div>
                    <Button href={initHref}>Abrir</Button>
                  </Card>
                  <Card>
                    <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Resumo Executivo</div>
                    <div style={{ color: '#6b7280', marginBottom: '0.75rem' }}>
                      Scores e principais gaps.
                    </div>
                    <Button href={summaryHref}>Abrir</Button>
                  </Card>
                </div>
              );
            })()}
          </Card>
        </div>
      )}

      {state === 'blocked' && (
        <PaywallCard
          primaryLabel="Ver planos"
          primaryHref={companyId ? `/paywall?company_id=${companyId}` : '/paywall'}
          secondaryLabel="Voltar"
          secondaryHref={diagnosticoHref}
          note={process.env.NODE_ENV === 'development'
            ? 'Ambiente de testes: acesso FULL depende de entitlement/configuração do servidor.'
            : undefined}
        />
      )}
    </AppShell>
  );
}
