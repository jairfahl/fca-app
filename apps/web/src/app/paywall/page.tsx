'use client';

import { Suspense } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/auth';
import { useSearchParams } from 'next/navigation';
import PageHeader from '@/components/ui/PageHeader';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import PaywallCard from '@/components/PaywallCard';

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
    <AppShell showLogout userEmail={user?.email}>
      <PageHeader
        title="Planos"
        subtitle="Compare opções de acesso ao FULL."
        breadcrumbs={<Breadcrumbs />}
      />

      <div style={{ maxWidth: '700px' }}>
        <PaywallCard
          title="Conteúdo do plano FULL"
          description="Relatório executivo completo, iniciativas priorizadas e próximos passos para execução."
          primaryLabel="Liberar FULL (teste)"
          primaryHref={companyId ? `/full?company_id=${companyId}` : '/full'}
          secondaryLabel="Voltar"
          secondaryHref={from === 'diagnostico'
            ? `/diagnostico?company_id=${companyId || ''}`
            : (companyId ? `/diagnostico?company_id=${companyId}` : '/diagnostico')}
        />
      </div>
    </AppShell>
  );
}
