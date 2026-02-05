'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/ui/PageHeader';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Alert from '@/components/ui/Alert';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      router.push('/onboarding');
    } catch (err: any) {
      setError(err.message || 'Erro ao criar conta');
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <PageHeader title="Cadastro" subtitle="Crie sua conta para começar." breadcrumbs={<Breadcrumbs />} />
      <div style={{ maxWidth: '420px' }}>
        <Card>
          <form onSubmit={handleSignup}>
            <div style={{ marginBottom: '1rem' }}>
              <label htmlFor="email" style={{ display: 'block', marginBottom: '0.5rem' }}>
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ width: '100%', padding: '0.75rem', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label htmlFor="password" style={{ display: 'block', marginBottom: '0.5rem' }}>
                Senha
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ width: '100%', padding: '0.75rem', boxSizing: 'border-box' }}
              />
            </div>
            {error && (
              <div style={{ marginBottom: '1rem' }}>
                <Alert variant="error">{error}</Alert>
              </div>
            )}
            <Button type="submit" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Criando...' : 'Criar conta'}
            </Button>
          </form>
        </Card>
        <div style={{ marginTop: '1rem', textAlign: 'center' }}>
          Já tenho conta? <Link href="/login" style={{ color: '#0070f3' }}>Entrar</Link>
        </div>
      </div>
    </AppShell>
  );
}
