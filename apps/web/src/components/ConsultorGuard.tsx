'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { fetchMe, MeResponse } from '@/lib/api';

/** Redireciona USER para home; permite CONSULTOR/ADMIN. Deve ser usado dentro de ProtectedRoute. */
export default function ConsultorGuard({ children }: { children: React.ReactNode }) {
  const { user, session, loading: authLoading } = useAuth();
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (authLoading || !user || !session?.access_token) {
      if (!authLoading && !user) {
        setChecking(false);
      }
      return;
    }

    let cancelled = false;
    fetchMe(session.access_token)
      .then((data) => {
        if (!cancelled) {
          setMe(data);
          const role = data.role || 'USER';
          if (role !== 'CONSULTOR' && role !== 'ADMIN') {
            router.replace('/diagnostico');
          }
        }
      })
      .catch(() => {
        if (!cancelled) router.replace('/diagnostico');
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => { cancelled = true; };
  }, [authLoading, user, session?.access_token, router]);

  if (authLoading || checking || !user) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando...</div>;
  }

  const role = me?.role || 'USER';
  if (role !== 'CONSULTOR' && role !== 'ADMIN') {
    return null;
  }

  return <>{children}</>;
}
