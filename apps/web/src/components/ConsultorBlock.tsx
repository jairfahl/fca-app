'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';

/**
 * Bloqueio defensivo: se me.role === CONSULTOR, mostra mensagem e botão para /consultor.
 * Usar em páginas de diagnóstico (LIGHT/FULL) como fallback caso RoleGate falhe.
 */
export default function ConsultorBlock({ children }: { children: React.ReactNode }) {
  const { me } = useAuth();

  if (me?.role !== 'CONSULTOR') {
    return <>{children}</>;
  }

  return (
    <div
      style={{
        padding: '2rem',
        maxWidth: '500px',
        margin: '2rem auto',
        textAlign: 'center',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        backgroundColor: '#f9fafb',
      }}
    >
      <p style={{ marginBottom: '1rem', color: '#374151', fontSize: '1rem' }}>
        Acesso de consultor é pelo painel do consultor.
      </p>
      <Link
        href="/consultor"
        style={{
          display: 'inline-block',
          backgroundColor: '#0070f3',
          color: '#fff',
          padding: '0.75rem 1.5rem',
          borderRadius: '6px',
          textDecoration: 'none',
          fontWeight: 'bold',
          fontSize: '1rem',
        }}
      >
        Ir para painel
      </Link>
    </div>
  );
}
