'use client';

import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';

import { computeRedirectTarget } from '@/lib/roleGateLogic';

/** Role vem somente de /me (backend). Sem inferência por email. */
/**
 * Redireciona por role de forma idempotente.
 * - CONSULTOR/ADMIN fora de /consultor|/full/consultor => /consultor
 * - USER em /consultor|/full/consultor => /diagnostico
 * Usa didRedirectRef para garantir no máximo 1 redirect.
 */
export default function RoleGate({ children }: { children: React.ReactNode }) {
  const { user, loading, me, meLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const didRedirectRef = useRef(false);

  useEffect(() => {
    if (loading || !user) return;
    if (didRedirectRef.current) return;

    let role: 'USER' | 'CONSULTOR' | 'ADMIN' = 'USER';
    if (me) {
      role = (me.role || 'USER') as 'USER' | 'CONSULTOR' | 'ADMIN';
    } else if (meLoading) {
      return;
    } else {
      role = 'USER';
    }

    const target = computeRedirectTarget(pathname, role);
    if (!target || target === pathname) return;

    didRedirectRef.current = true;
    const url = target === '/consultor'
      ? '/consultor?msg=' + encodeURIComponent('Acesso de consultor é pelo painel.')
      : target;
    if (typeof window !== 'undefined') {
      const n = ((window as any).__dbgRoleRedirectCount = ((window as any).__dbgRoleRedirectCount || 0) + 1);
      console.log(`[ROLE_REDIRECT] pathname=${pathname} role=${role} target=${url} count=${n}`);
    }
    router.replace(url);
  }, [loading, meLoading, user, me, pathname, router]);

  if (loading || meLoading || !user) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando...</div>;
  }

  if (!me) {
    if (meLoading) {
      return <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando...</div>;
    }
    return <>{children}</>;
  }

  return <>{children}</>;
}
