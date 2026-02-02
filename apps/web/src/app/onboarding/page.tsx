'use client';

import { useEffect, useState, useRef } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        Carregando...
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
        Logado como: {user?.email}
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <Link href="/logout" style={{ color: '#0070f3' }}>
          Sair
        </Link>
      </div>
      
      <h1 style={{ marginBottom: '2rem' }}>Cadastro da Empresa</h1>
      
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '1.5rem' }}>
          <label htmlFor="name" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            Nome da empresa:
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
            Segmento:
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
          <div style={{
            color: '#d32f2f',
            marginBottom: '1rem',
            padding: '0.75rem',
            backgroundColor: '#ffebee',
            borderRadius: '4px',
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          style={{
            width: '100%',
            padding: '0.75rem',
            backgroundColor: saving ? '#ccc' : '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Salvando...' : 'Continuar'}
        </button>
      </form>
    </div>
  );
}
