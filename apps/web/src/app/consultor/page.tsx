'use client';

import React, { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import { humanizeStatus } from '@/lib/uiCopy';

interface CompanyItem {
  company_id: string;
  name: string | null;
  owner_user_id: string | null;
  created_at: string | null;
  entitlement: string;
  full_status: string | null;
  full_version: number | null;
  full_assessment_id: string | null;
  plan_progress: string | null;
}

interface HelpRequest {
  id: string;
  company_id: string;
  user_id: string;
  context: string;
  status: string;
  created_at: string;
}

interface ConsultingRequest {
  id: string;
  company_id: string;
  assessment_id: string | null;
  action_id: string | null;
  created_by_user_id: string;
  text: string;
  status: string;
  created_at: string;
  updated_at: string;
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

  const [tab, setTab] = useState<'empresas' | 'apoio'>('empresas');
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [helpRequests, setHelpRequests] = useState<HelpRequest[]>([]);
  const [supportRequests, setSupportRequests] = useState<ConsultingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [closingId, setClosingId] = useState<string | null>(null);
  const [patchingId, setPatchingId] = useState<string | null>(null);
  const [supportStatusFilter, setSupportStatusFilter] = useState<'OPEN' | 'IN_PROGRESS' | 'CLOSED'>('OPEN');

  const mountedRef = useRef(true);

  const loadData = useCallback(async () => {
    const token = session?.access_token;
    if (!token) {
      setLoading(false);
      setError('Sessão não disponível. Faça login novamente.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [companiesRes, helpRes, supportRes] = await Promise.all([
        apiFetch('/consultor/companies', {}, token),
        apiFetch('/consultor/help-requests?status=OPEN', {}, token),
        apiFetch('/consultor/support/requests?status=OPEN', {}, token),
      ]);
      if (!mountedRef.current) return;
      setCompanies(companiesRes?.companies || []);
      setHelpRequests(helpRes?.help_requests || []);
      setSupportRequests(supportRes?.requests || []);
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      if (err instanceof ApiError && err.status === 403) {
        router.replace('/diagnostico');
        return;
      }
      setError((err as Error).message || 'Erro ao carregar');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [session?.access_token, router]);

  useEffect(() => {
    mountedRef.current = true;
    loadData();
    return () => {
      mountedRef.current = false;
    };
  }, [loadData]);

  const loadSupportRequests = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const res = await apiFetch(`/consultor/support/requests?status=${supportStatusFilter}`, {}, session.access_token);
      setSupportRequests(res?.requests || []);
    } catch {
      setSupportRequests([]);
    }
  }, [session?.access_token, supportStatusFilter]);

  useEffect(() => {
    if (tab === 'apoio' && session?.access_token) {
      loadSupportRequests();
    }
  }, [tab, supportStatusFilter, session?.access_token, loadSupportRequests]);

  const handlePatchStatus = async (id: string, status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED') => {
    if (!session?.access_token) return;
    setPatchingId(id);
    try {
      await apiFetch(`/consultor/support/requests/${id}`, { method: 'PATCH', body: { status } }, session.access_token);
      await loadSupportRequests();
    } catch (err: unknown) {
      alert((err as Error).message || 'Erro ao atualizar');
    } finally {
      setPatchingId(null);
    }
  };

  const handleCloseRequest = async (id: string) => {
    if (!session?.access_token) return;
    setClosingId(id);
    try {
      await apiFetch(`/consultor/help-requests/${id}/close`, { method: 'POST' }, session.access_token);
      setHelpRequests((prev) => prev.filter((r) => r.id !== id));
    } catch (err: unknown) {
      alert((err as Error).message || 'Erro ao fechar');
    } finally {
      setClosingId(null);
    }
  };

  const companyMap = Object.fromEntries(companies.map((c) => [c.company_id, c.name]));
  const filtered = companies.filter(
    (c) =>
      !search ||
      (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.company_id || '').toLowerCase().includes(search.toLowerCase())
  );

  const kpis = {
    total: companies.length,
    draft: companies.filter((c) => c.full_status === 'DRAFT').length,
    submitted: companies.filter((c) => c.full_status === 'SUBMITTED').length,
    closed: companies.filter((c) => c.full_status === 'CLOSED').length,
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto', textAlign: 'center' }}>
        <div style={{ marginBottom: '0.5rem' }}>Carregando empresas...</div>
        <div style={{ fontSize: '0.85rem', color: '#6c757d' }}>Aguarde.</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
      <header style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Painel do consultor</h1>
          <div style={{ marginTop: '0.25rem', color: '#6c757d', fontSize: '0.9rem' }}>
            {user?.email}
            <span style={{ marginLeft: '0.5rem', padding: '0.2rem 0.5rem', backgroundColor: '#e7f3ff', borderRadius: '4px', fontSize: '0.8rem' }}>
              Você está logado como CONSULTOR
            </span>
          </div>
        </div>
        <Link href="/logout" style={{ color: '#0d6efd', textDecoration: 'none', fontSize: '0.9rem' }}>
          Sair
        </Link>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <Link
          href="/consultor/companies"
          style={{
            padding: '1.5rem',
            backgroundColor: '#e7f3ff',
            borderRadius: '8px',
            border: '1px solid #b6d4fe',
            textDecoration: 'none',
            color: '#000',
          }}
        >
          <div style={{ fontSize: '0.85rem', color: '#0c5460', marginBottom: '0.25rem' }}>Empresas</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{kpis.total}</div>
          <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#0d6efd' }}>Ver empresa →</div>
        </Link>
        <Link
          href="/consultor/messages"
          style={{
            padding: '1.5rem',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            border: '1px solid #dee2e6',
            textDecoration: 'none',
            color: '#000',
          }}
        >
          <div style={{ fontSize: '0.85rem', color: '#6c757d', marginBottom: '0.25rem' }}>Mensagens</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>Threads</div>
          <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#0d6efd' }}>Ver mensagens →</div>
        </Link>
      </section>

      {error && (
        <div
          style={{
            padding: '1rem',
            backgroundColor: '#f8d7da',
            color: '#721c24',
            borderRadius: '8px',
            marginBottom: '1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <span>{error}</span>
          <button
            onClick={loadData}
            style={{
              padding: '0.4rem 0.8rem',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: '#721c24',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            Recarregar
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', borderBottom: '1px solid #dee2e6' }}>
        <button
          onClick={() => setTab('empresas')}
          style={{
            padding: '0.5rem 1rem',
            border: 'none',
            background: tab === 'empresas' ? '#0d6efd' : 'transparent',
            color: tab === 'empresas' ? '#fff' : '#212529',
            cursor: 'pointer',
            borderRadius: '6px 6px 0 0',
            fontSize: '0.9rem',
          }}
        >
          Empresas
        </button>
        <button
          onClick={() => setTab('apoio')}
          style={{
            padding: '0.5rem 1rem',
            border: 'none',
            background: tab === 'apoio' ? '#0d6efd' : 'transparent',
            color: tab === 'apoio' ? '#fff' : '#212529',
            cursor: 'pointer',
            borderRadius: '6px 6px 0 0',
            fontSize: '0.9rem',
          }}
        >
          Pedidos de apoio
        </button>
      </div>

      {tab === 'empresas' && (
      <>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ padding: '1rem', backgroundColor: '#e7f3ff', borderRadius: '8px', border: '1px solid #b6d4fe' }}>
          <div style={{ fontSize: '0.85rem', color: '#0c5460', marginBottom: '0.25rem' }}>Empresas</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{kpis.total}</div>
        </div>
        <div style={{ padding: '1rem', backgroundColor: '#fff3cd', borderRadius: '8px', border: '1px solid #ffc107' }}>
          <div style={{ fontSize: '0.85rem', color: '#856404', marginBottom: '0.25rem' }}>Em andamento</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{kpis.draft}</div>
        </div>
        <div style={{ padding: '1rem', backgroundColor: '#cce5ff', borderRadius: '8px', border: '1px solid #0d6efd' }}>
          <div style={{ fontSize: '0.85rem', color: '#004085', marginBottom: '0.25rem' }}>Concluídos</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{kpis.submitted}</div>
        </div>
        <div style={{ padding: '1rem', backgroundColor: '#d4edda', borderRadius: '8px', border: '1px solid #28a745' }}>
          <div style={{ fontSize: '0.85rem', color: '#155724', marginBottom: '0.25rem' }}>Ciclos fechados</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{kpis.closed}</div>
        </div>
      </section>

      <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Empresas</h2>
      <input
        type="text"
        placeholder="Buscar por nome ou ID..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          width: '100%',
          maxWidth: '400px',
          padding: '0.5rem 0.75rem',
          marginBottom: '1rem',
          borderRadius: '6px',
          border: '1px solid #ced4da',
        }}
      />

      {filtered.length === 0 ? (
        <p style={{ color: '#6c757d' }}>Nenhuma empresa encontrada.</p>
      ) : (
        <div style={{ border: '1px solid #dee2e6', borderRadius: '8px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Empresa</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Entitlement</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Status FULL</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Plano</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.company_id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <strong>{c.name || c.company_id}</strong>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>{c.entitlement}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>{humanizeStatus(c.full_status)}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>{c.plan_progress || '—'}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <Link
                      href={`/consultor/company/${c.company_id}`}
                      style={{ color: '#0d6efd', textDecoration: 'none', fontSize: '0.9rem' }}
                    >
                      Ver detalhes →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {helpRequests.length > 0 && (
        <>
          <h2 style={{ marginTop: '2.5rem', marginBottom: '1rem', fontSize: '1.1rem' }}>Pedidos de ajuda abertos</h2>
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
                <div style={{ fontSize: '0.9rem', color: '#6c757d', marginBottom: '0.5rem' }}>
                  {companyMap[r.company_id] || r.company_id} — {new Date(r.created_at).toLocaleString('pt-BR')}
                </div>
                <div style={{ marginBottom: '0.75rem' }}>{r.context}</div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <Link
                    href={`/consultor/company/${r.company_id}`}
                    style={{ color: '#0d6efd', fontSize: '0.9rem' }}
                  >
                    Ver empresa
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
                    {closingId === r.id ? 'Fechando...' : 'Fechar'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      </>
      )}

      {tab === 'apoio' && (
        <>
          <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Pedidos de apoio</h2>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            {(['OPEN', 'IN_PROGRESS', 'CLOSED'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSupportStatusFilter(s)}
                style={{
                  padding: '0.4rem 0.8rem',
                  borderRadius: '6px',
                  border: supportStatusFilter === s ? '2px solid #0d6efd' : '1px solid #dee2e6',
                  background: supportStatusFilter === s ? '#e7f3ff' : '#fff',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                }}
              >
                {s === 'OPEN' ? 'Abertos' : s === 'IN_PROGRESS' ? 'Em atendimento' : 'Encerrados'}
              </button>
            ))}
          </div>
          {supportRequests.length === 0 ? (
            <p style={{ color: '#6c757d' }}>Nenhum pedido de apoio {supportStatusFilter === 'OPEN' ? 'aberto' : supportStatusFilter === 'IN_PROGRESS' ? 'em atendimento' : 'encerrado'}.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {supportRequests.map((r) => (
                <li
                  key={r.id}
                  style={{
                    marginBottom: '1rem',
                    padding: '1.25rem',
                    border: '1px solid #dee2e6',
                    borderRadius: '8px',
                    backgroundColor: '#fff',
                  }}
                >
                  <div style={{ fontSize: '0.85rem', color: '#6c757d', marginBottom: '0.5rem' }}>
                    {companyMap[r.company_id] || r.company_id}
                    {r.action_id && ` · Ação: ${r.action_id}`}
                    {' · '}
                    {new Date(r.created_at).toLocaleString('pt-BR')}
                  </div>
                  <div style={{ marginBottom: '1rem', whiteSpace: 'pre-wrap' }}>{r.text}</div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <Link
                      href={`/consultor/company/${r.company_id}`}
                      style={{ color: '#0d6efd', fontSize: '0.9rem' }}
                    >
                      Ver empresa
                    </Link>
                    {supportStatusFilter === 'OPEN' && (
                      <button
                        onClick={() => handlePatchStatus(r.id, 'IN_PROGRESS')}
                        disabled={patchingId === r.id}
                        style={{
                          padding: '0.4rem 0.8rem',
                          borderRadius: '6px',
                          border: 'none',
                          backgroundColor: '#0d6efd',
                          color: '#fff',
                          cursor: patchingId === r.id ? 'not-allowed' : 'pointer',
                          fontSize: '0.9rem',
                        }}
                      >
                        {patchingId === r.id ? '...' : 'Em atendimento'}
                      </button>
                    )}
                    {(supportStatusFilter === 'OPEN' || supportStatusFilter === 'IN_PROGRESS') && (
                      <button
                        onClick={() => handlePatchStatus(r.id, 'CLOSED')}
                        disabled={patchingId === r.id}
                        style={{
                          padding: '0.4rem 0.8rem',
                          borderRadius: '6px',
                          border: 'none',
                          backgroundColor: '#198754',
                          color: '#fff',
                          cursor: patchingId === r.id ? 'not-allowed' : 'pointer',
                          fontSize: '0.9rem',
                        }}
                      >
                        {patchingId === r.id ? '...' : 'Encerrar'}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
