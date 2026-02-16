'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import ConsultorGuard from '@/components/ConsultorGuard';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';

interface Company {
  id: string;
  name: string;
}

interface HelpRequest {
  id: string;
  company_id: string;
  user_id: string;
  context: string;
  status: string;
  created_at: string;
}

export default function ConsultorPage() {
  return (
    <ProtectedRoute>
      <ConsultorGuard>
        <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
          <ConsultorContent />
        </Suspense>
      </ConsultorGuard>
    </ProtectedRoute>
  );
}

function ConsultorContent() {
  const { user, session } = useAuth();
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [helpRequests, setHelpRequests] = useState<HelpRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [closingId, setClosingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setError('');
    try {
      const [companiesRes, helpRes] = await Promise.all([
        apiFetch('/consultor/companies', {}, session.access_token),
        apiFetch('/consultor/help-requests?status=OPEN', {}, session.access_token),
      ]);
      setCompanies(companiesRes?.companies || []);
      setHelpRequests(helpRes?.help_requests || []);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 403) {
        router.replace('/diagnostico');
        return;
      }
      setError(err.message || 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCloseRequest = async (id: string) => {
    if (!session?.access_token) return;
    setClosingId(id);
    try {
      await apiFetch(`/consultor/help-requests/${id}/close`, { method: 'POST' }, session.access_token);
      setHelpRequests((prev) => prev.filter((r) => r.id !== id));
    } catch (err: any) {
      alert(err.message || 'Erro ao fechar');
    } finally {
      setClosingId(null);
    }
  };

  const companyMap = Object.fromEntries(companies.map((c) => [c.id, c.name]));

  if (loading) {
    return (
      <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
        Carregando...
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1rem', color: '#666', fontSize: '0.9rem' }}>
        Área do consultor — {user?.email}
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <Link href="/logout" style={{ color: '#0070f3' }}>Sair</Link>
      </div>

      <h1 style={{ marginBottom: '1.5rem' }}>Empresas</h1>
      {error && (
        <div style={{ padding: '1rem', backgroundColor: '#f8d7da', color: '#721c24', borderRadius: '8px', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {companies.length === 0 ? (
        <p style={{ color: '#666' }}>Nenhuma empresa cadastrada.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {companies.map((c) => (
            <li key={c.id} style={{ marginBottom: '0.5rem' }}>
              <Link
                href={`/consultor/${c.id}`}
                style={{
                  display: 'inline-block',
                  padding: '0.75rem 1rem',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  color: '#212529',
                  border: '1px solid #dee2e6',
                }}
              >
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <h2 style={{ marginTop: '2.5rem', marginBottom: '1rem' }}>Pedidos de ajuda abertos</h2>
      {helpRequests.length === 0 ? (
        <p style={{ color: '#666' }}>Nenhum pedido aberto.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {helpRequests.map((r) => (
            <li
              key={r.id}
              style={{
                marginBottom: '1rem',
                padding: '1rem',
                border: '1px solid #dee2e6',
                borderRadius: '8px',
                backgroundColor: '#fff',
              }}
            >
              <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.5rem' }}>
                Empresa: {companyMap[r.company_id] || r.company_id} — {new Date(r.created_at).toLocaleString('pt-BR')}
              </div>
              <div style={{ marginBottom: '0.75rem' }}>{r.context}</div>
              <button
                onClick={() => handleCloseRequest(r.id)}
                disabled={closingId === r.id}
                style={{
                  padding: '0.4rem 0.8rem',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#198754',
                  color: '#fff',
                  cursor: closingId === r.id ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
                }}
              >
                {closingId === r.id ? 'Fechando...' : 'Fechar pedido'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
