'use client';

import { Suspense } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function PaywallPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
        <PaywallContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function PaywallContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const companyId = searchParams.get('company_id');
  const from = searchParams.get('from');

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
        Logado como: {user?.email}
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <Link href="/logout" style={{ color: '#0070f3' }}>Sair</Link>
        {' | '}
        {from === 'diagnostico' ? (
          <Link href={`/diagnostico?company_id=${companyId || ''}`} style={{ color: '#0070f3' }}>Voltar</Link>
        ) : (
          <Link href="/diagnostico" style={{ color: '#0070f3' }}>Voltar ao Diagnóstico</Link>
        )}
      </div>

      <h1 style={{ marginBottom: '1rem' }}>Planos</h1>

      <div style={{
        border: '1px solid #ddd',
        borderRadius: '8px',
        padding: '2rem',
        backgroundColor: '#fff'
      }}>
        <h2 style={{ marginBottom: '1rem' }}>Plano FULL</h2>
        <p style={{ marginBottom: '1rem', color: '#666' }}>
          Acesso completo ao diagnóstico detalhado com análises aprofundadas e recomendações personalizadas.
        </p>
        <p style={{ color: '#666', fontSize: '0.875rem' }}>
          A integração de pagamento será implementada aqui.
        </p>
      </div>
    </div>
  );
}
