'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

/** Redireciona USER para home; permite CONSULTOR/ADMIN. Deve ser usado dentro de ProtectedRoute. */
export default function ConsultorGuard({ children }: { children: React.ReactNode }) {
  const { user, session, loading: authLoading, me, meLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (authLoading || meLoading || !user || !session?.access_token) return;
    if (!me) return;
    const role = me.role || 'USER';
    if (role !== 'CONSULTOR' && role !== 'ADMIN') {
      router.replace('/full');
    }
  }, [authLoading, meLoading, user, session?.access_token, me, router]);

  if (authLoading || meLoading || !user) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando...</div>;
  }

  if (!me) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando...</div>;
  }

  const role = me.role || 'USER';
  if (role !== 'CONSULTOR' && role !== 'ADMIN') {
    return null;
  }

  return <>{children}</>;
}
