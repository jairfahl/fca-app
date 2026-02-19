'use client';

import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';

/** Prefixos onde CONSULTOR/ADMIN pode ficar sem redirect */
const CONSULTOR_ALLOWED_PREFIXES = ['/consultor', '/full/consultor', '/logout'];

/** Fallback quando /me falha: emails tratados como consultor */
const CONSULTOR_EMAILS = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_CONSULTOR_EMAILS)
  ? process.env.NEXT_PUBLIC_CONSULTOR_EMAILS.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  : ['consultor@fca.com', 'admin@fca.com'];

function isConsultorByEmail(email: string | undefined): boolean {
  if (!email) return false;
  return CONSULTOR_EMAILS.includes(email.trim().toLowerCase());
}

/** Calcula target de redirect por role. null = não redirecionar. */
function computeRedirectTarget(
  pathname: string | null,
  role: 'USER' | 'CONSULTOR' | 'ADMIN'
): string | null {
  if (!pathname) return null;
  const isConsultorRoute = CONSULTOR_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p));

  if (role === 'CONSULTOR' || role === 'ADMIN') {
    if (!isConsultorRoute) return '/consultor';
    return null;
  }
  if (role === 'USER') {
    if (isConsultorRoute) return '/diagnostico';
    return null;
  }
  return null;
}

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
    } else if (!meLoading) {
      if (isConsultorByEmail(user.email)) role = 'CONSULTOR';
    } else {
      return;
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
