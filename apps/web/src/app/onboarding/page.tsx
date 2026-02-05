'use client';

import { useEffect, useState, useRef } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Alert from '@/components/ui/Alert';

export default function OnboardingPage() {
  return (
    <ProtectedRoute>
      <OnboardingContent />
    </ProtectedRoute>
  );
}

function OnboardingContent() {
  const { user, session, loading: authLoading } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(true);
  const [name, setName] = useState('');
  const [segment, setSegment] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);
  // Trava anti-loop: useRef não causa re-render, então não dispara novo effect
  const hasCheckedRef = useRef(false);

  // Verificar se já existe company ao carregar (UMA VEZ APENAS)
  // Trava anti-loop: usar apenas primitivos nas dependências e useRef para flag
  useEffect(() => {
    // Não executar se ainda está carregando auth ou não tem token
    if (authLoading || !session?.access_token) {
      return;
    }

    // Trava anti-loop: garantir que roda apenas 1 vez (useRef não causa re-render)
    if (hasCheckedRef.current) {
      return;
    }

    const checkCompanies = async () => {
      // Marcar como verificado ANTES do fetch para evitar re-execução
      hasCheckedRef.current = true;

      try {
        const companies = await apiFetch('/companies', {}, session.access_token);
        
        if (companies && companies.length > 0) {
          // Já existe company, redirecionar para diagnóstico
          router.push(`/diagnostico?company_id=${companies[0].id}`);
          return;
        }
        
        // Não existe company, mostrar form
        setChecking(false);
        setLoading(false);
      } catch (err: any) {
        setError(err.message || 'Erro ao verificar empresas');
        setChecking(false);
        setLoading(false);
      }
    };

    checkCompanies();
    // Dependências: apenas primitivos (authLoading e access_token)
    // router não está nas deps para evitar loop (usado apenas dentro do effect)
    // hasCheckedRef não precisa estar nas deps (refs são estáveis)
  }, [authLoading, session?.access_token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!name.trim()) {
      setError('Nome da empresa é obrigatório');
      return;
    }
    
    if (!segment) {
      setError('Segmento é obrigatório');
      return;
    }

    if (!session?.access_token) {
      router.push('/login');
      return;
    }

    setSaving(true);

    try {
      const company = await apiFetch(
        '/companies',
        {
          method: 'POST',
          body: { name: name.trim(), segment },
        },
        session.access_token
      );

      // Redirecionar para diagnóstico com company_id
      router.push(`/diagnostico?company_id=${company.id}`);
    } catch (err: any) {
      setError(err.message || 'Erro ao criar empresa');
      setSaving(false);
    }
  };

  if (authLoading || checking || loading) {
    return (
      <AppShell showLogout>
        <PageHeader title="Cadastro da Empresa" subtitle="Configure sua empresa para iniciar o diagnóstico." breadcrumbs={<Breadcrumbs />} />
        <div style={{ textAlign: 'center' }}>Carregando...</div>
      </AppShell>
    );
  }

  return (
    <AppShell showLogout>
      <PageHeader title="Cadastro da Empresa" subtitle="Configure sua empresa para iniciar o diagnóstico." breadcrumbs={<Breadcrumbs />} />
      <div style={{ marginBottom: '1rem', color: '#6b7280', fontSize: '0.9rem' }}>
        Passo {step} de 2
      </div>
      
      <Card>
        <form onSubmit={handleSubmit}>
          {step === 1 && (
            <>
              <div style={{ marginBottom: '1.5rem' }}>
                <label htmlFor="name" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  Nome da empresa
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    boxSizing: 'border-box',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '1rem',
                  }}
                  placeholder="Digite o nome da empresa"
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label htmlFor="segment" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  Segmento
                </label>
                <select
                  id="segment"
                  value={segment}
                  onChange={(e) => setSegment(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    boxSizing: 'border-box',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '1rem',
                  }}
                >
                  <option value="">Selecione um segmento</option>
                  <option value="SERVICOS">Serviços</option>
                  <option value="COMERCIO">Comércio</option>
                  <option value="INDUSTRIA">Indústria</option>
                </select>
              </div>

              {error && (
                <div style={{ marginBottom: '1rem' }}>
                  <Alert variant="error">{error}</Alert>
                </div>
              )}

              <Button
                type="button"
                disabled={saving}
                onClick={() => {
                  if (!name.trim() || !segment) {
                    setError('Preencha nome e segmento para continuar');
                    return;
                  }
                  setError('');
                  setStep(2);
                }}
                style={{ width: '100%' }}
              >
                Continuar
              </Button>
            </>
          )}

          {step === 2 && (
            <>
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Confirmação</div>
                <div style={{ color: '#6b7280' }}>Empresa: {name}</div>
                <div style={{ color: '#6b7280' }}>Segmento: {segment}</div>
              </div>

              {error && (
                <div style={{ marginBottom: '1rem' }}>
                  <Alert variant="error">{error}</Alert>
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <Button type="button" variant="ghost" onClick={() => setStep(1)}>
                  Voltar
                </Button>
                <Button type="submit" disabled={saving} style={{ flex: 1 }}>
                  {saving ? 'Salvando...' : 'Continuar'}
                </Button>
              </div>
            </>
          )}
        </form>
      </Card>
    </AppShell>
  );
}
