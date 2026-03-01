'use client';

import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { computeRedirectTarget, getConsultorRedirectMsg } from '@/lib/roleGateLogic';

/**
 * Guard de rotas por role.
 * - CONSULTOR/ADMIN fora de /consultor => /consultor
 * - USER em /consultor => /diagnostico
 * /me é carregado pelo AuthProvider (cache em me.ts). Redirect uma vez (didRedirectRef).
 */
export default function RoleGate({ children }: { children: React.ReactNode }) {
  const { user, loading, me, meLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const didRedirectRef = useRef(false);

  const role = me ? ((me.role || 'USER') as 'USER' | 'CONSULTOR' | 'ADMIN') : null;
  const target = role && pathname ? computeRedirectTarget(pathname, role) : null;
  const shouldRedirect = !!target && target !== pathname;

  useEffect(() => {
    if (loading || !user) return;
    if (meLoading || !me) return;
    if (didRedirectRef.current) return;
    if (!shouldRedirect) return;

    didRedirectRef.current = true;
    const url = target === '/consultor'
      ? '/consultor?msg=acesso_consultor_painel'
      : target!;

    if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
      console.log(`[ROLE_REDIRECT once] from=${pathname} to=${url} role=${role}`);
    }
    router.replace(url);
  }, [loading, meLoading, user, me, pathname, router, shouldRedirect, target, role]);

  if (loading || !user) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando...</div>;
  }

  if (meLoading || !me) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando...</div>;
  }

  if (shouldRedirect) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Redirecionando...</div>;
  }

  return <>{children}</>;
}
