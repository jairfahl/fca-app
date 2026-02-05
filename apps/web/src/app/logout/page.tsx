'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/ui/PageHeader';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

export default function LogoutPage() {
  const [done, setDone] = useState(false);

  useEffect(() => {
    const handleLogout = async () => {
      await supabase.auth.signOut();
      setDone(true);
    };

    handleLogout();
  }, []);

  return (
    <AppShell>
      <PageHeader title="Sair" subtitle="Encerrando sessão." breadcrumbs={<Breadcrumbs />} />
      <Card>
        <div style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: '1rem' }}>
            {done ? 'Sessão encerrada.' : 'Saindo...'}
          </div>
          <Button href="/login">Entrar novamente</Button>
        </div>
      </Card>
    </AppShell>
  );
}
