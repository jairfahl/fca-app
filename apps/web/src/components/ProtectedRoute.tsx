'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import RoleGate from './RoleGate';

/** Apenas auth: sem user → /login. Role redirect delegado ao RoleGate. */
export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando...</div>;
  }

  if (!user) {
    return null;
  }

  return <RoleGate>{children}</RoleGate>;
}
