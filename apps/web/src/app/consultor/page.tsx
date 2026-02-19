'use client';

import React, { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';

interface UserItem {
  user_id: string;
  email: string | null;
  company_id: string;
  company_name: string | null;
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
      <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
        <ConsultorContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function ConsultorContent() {
  const { user, session } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const msg = searchParams.get('msg');
  const didClearMsgRef = useRef(false);

  useEffect(() => {
    if (!msg || didClearMsgRef.current) return;
    didClearMsgRef.current = true;
    const t = setTimeout(() => router.replace('/consultor', { scroll: false }), 3000);
    return () => clearTimeout(t);
  }, [msg, router]);

  const [users, setUsers] = useState<UserItem[]>([]);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [helpRequests, setHelpRequests] = useState<HelpRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [closingId, setClosingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setError('');
    try {
      const [usersRes, companiesRes, helpRes] = await Promise.all([
        apiFetch('/consultor/users', {}, session.access_token),
        apiFetch('/consultor/companies', {}, session.access_token),
        apiFetch('/consultor/help-requests?status=OPEN', {}, session.access_token),
      ]);
      setUsers(Array.isArray(usersRes) ? usersRes : []);
      setCompanies(companiesRes?.companies || []);
      setHelpRequests(helpRes?.help_requests || []);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 403) {
        router.replace('/onboarding');
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
  const filtered = users.filter(
    (u) =>
      !search ||
      (u.email || '').toLowerCase().includes(search.toLowerCase()) ||
      (u.company_name || '').toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
        Carregando...
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1rem', color: '#666', fontSize: '0.9rem' }}>
        Área do consultor — {user?.email}
      </div>
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <Link href="/logout" style={{ color: '#0070f3' }}>Sair</Link>
        <span style={{ color: '#dee2e6' }}>|</span>
        <Link href="/full/consultor" style={{ color: '#0070f3' }}>Diagnóstico FULL (empresas)</Link>
      </div>

      {msg && (
        <div style={{ padding: '1rem', backgroundColor: '#d1ecf1', color: '#0c5460', borderRadius: '8px', marginBottom: '1rem' }}>
          {decodeURIComponent(msg)}
        </div>
      )}

      <h1 style={{ marginBottom: '1.5rem' }}>Usuários e empresas</h1>
      <input
        type="text"
        placeholder="Buscar por email ou empresa..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ width: '100%', maxWidth: '400px', padding: '0.5rem', marginBottom: '1rem', borderRadius: '6px', border: '1px solid #ced4da' }}
      />
      {error && (
        <div style={{ padding: '1rem', backgroundColor: '#f8d7da', color: '#721c24', borderRadius: '8px', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {filtered.length === 0 ? (
        <p style={{ color: '#666' }}>Nenhum usuário encontrado.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {filtered.map((u) => (
            <li key={`${u.user_id}-${u.company_id}`} style={{ marginBottom: '0.5rem' }}>
              <Link
                href={`/consultor/user/${u.user_id}?company_id=${u.company_id}`}
                style={{
                  display: 'block',
                  padding: '1rem 1.25rem',
                  backgroundColor: '#fff',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  color: '#212529',
                  border: '1px solid #dee2e6',
                }}
              >
                <span style={{ fontWeight: 600 }}>{u.email || u.user_id}</span>
                <span style={{ marginLeft: '0.5rem', fontSize: '0.9rem', color: '#6c757d' }}>
                  — {u.company_name || u.company_id}
                </span>
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
              <Link
                href={`/consultor/user/${r.user_id}?company_id=${r.company_id}`}
                style={{ marginRight: '0.5rem', color: '#0070f3', fontSize: '0.9rem' }}
              >
                Ver usuário
              </Link>
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
