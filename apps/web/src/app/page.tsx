'use client';

import { useAuth } from '@/lib/auth';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/ui/PageHeader';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import Button from '@/components/ui/Button';

export default function Home() {
  const { user } = useAuth();

  return (
    <AppShell showLogout={Boolean(user)}>
      <PageHeader
        title="Diagnóstico rápido de gestão em 3 minutos"
        subtitle="Notas objetivas por área e recomendações imediatas."
        breadcrumbs={<Breadcrumbs />}
      />
      <ul style={{ margin: '0 0 1.5rem 1.25rem', color: '#374151' }}>
        <li>Notas 0–10</li>
        <li>Resumo por área</li>
        <li>Recomendações imediatas</li>
      </ul>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        {user ? (
          <>
            <Button href="/onboarding">Começar agora</Button>
            <Button variant="ghost" href="/logout">Sair</Button>
          </>
        ) : (
          <>
            <Button href="/signup">Começar agora</Button>
            <Button variant="ghost" href="/login">Já tenho conta</Button>
          </>
        )}
      </div>
    </AppShell>
  );
}
