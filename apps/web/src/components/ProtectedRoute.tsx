'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';

/** Rotas em que CONSULTOR/ADMIN pode acessar (área do consultor). */
const CONSULTOR_ALLOWED_PREFIXES = ['/consultor', '/full/consultor', '/logout'];

/** Emails de consultor (fallback quando JWT não tem role). Ex: consultor@fca.com,admin@fca.com */
const CONSULTOR_EMAILS = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_CONSULTOR_EMAILS)
  ? process.env.NEXT_PUBLIC_CONSULTOR_EMAILS.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  : ['consultor@fca.com', 'admin@fca.com'];

function isConsultorByEmail(email: string | undefined): boolean {
  if (!email) return false;
  return CONSULTOR_EMAILS.includes(email.trim().toLowerCase());
}

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, session, loading, me, meLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [roleChecked, setRoleChecked] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (loading || !user || !session?.access_token) return;

    const isConsultorRoute = CONSULTOR_ALLOWED_PREFIXES.some((p) => pathname?.startsWith(p));
    if (isConsultorRoute) {
      setRoleChecked(true);
      return;
    }

    if (isConsultorByEmail(user.email)) {
      window.location.replace('/consultor?msg=' + encodeURIComponent('Acesso de consultor é pelo painel.'));
      return;
    }

    if (meLoading) return;
    if (!me) {
      if (isConsultorByEmail(user?.email)) {
        window.location.replace('/consultor?msg=' + encodeURIComponent('Não foi possível verificar seu perfil.'));
      } else {
        setRoleChecked(true);
      }
      return;
    }
    const role = me.role || 'USER';
    if (role === 'CONSULTOR' || role === 'ADMIN') {
      window.location.replace('/consultor?msg=' + encodeURIComponent('Acesso de consultor é pelo painel.'));
      return;
    }
    setRoleChecked(true);
  }, [user, session?.access_token, pathname, loading, meLoading, me, router]);

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando...</div>;
  }

  if (!user) {
    return null;
  }

  const isConsultorRoute = CONSULTOR_ALLOWED_PREFIXES.some((p) => pathname?.startsWith(p));
  if (!isConsultorRoute && !roleChecked) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando...</div>;
  }

  return <>{children}</>;
}
