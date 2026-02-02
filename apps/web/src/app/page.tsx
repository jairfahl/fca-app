'use client';

import { useAuth } from '@/lib/auth';
import Link from 'next/link';

export default function Home() {
  const { user } = useAuth();

  return (
    <main style={{ 
      padding: '2rem', 
      fontFamily: 'system-ui, -apple-system, sans-serif',
      maxWidth: '800px',
      margin: '0 auto'
    }}>
      <h1 style={{ marginBottom: '2rem', color: '#333' }}>
        Mentor Gerencial CNPJ
      </h1>

      {user && (
        <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
          Logado como: {user.email}
        </div>
      )}

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
        {user ? (
          <>
            <Link href="/onboarding" style={{ color: '#0070f3' }}>Onboarding</Link>
            <Link href="/logout" style={{ color: '#0070f3' }}>Sair</Link>
          </>
        ) : (
          <>
            <Link href="/login" style={{ color: '#0070f3' }}>Login</Link>
            <Link href="/signup" style={{ color: '#0070f3' }}>Criar Conta</Link>
          </>
        )}
      </div>
    </main>
  );
}
