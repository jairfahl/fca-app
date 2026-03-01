'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { consultantCompanies, type CompanyItem } from '@/lib/api/consultor';
import { ApiError } from '@/lib/api';
import { consultantHome, consultantCompanyOverview, resolveCompanyId, isCompanyIdValid } from '@/lib/consultorRoutes';
import { humanizeStatus } from '@/lib/uiCopy';

export default function ConsultorCompaniesPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
        <ConsultorCompaniesContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function ConsultorCompaniesContent() {
  const { user, session } = useAuth();
  const router = useRouter();
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setError('');
    try {
      const res = await consultantCompanies(session.access_token);
      setCompanies(res?.companies || []);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        router.replace('/diagnostico');
        return;
      }
      setError((err as Error).message || 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = companies.filter(
    (c) =>
      !search ||
      ((c.company_name ?? c.name) || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.trade_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (resolveCompanyId(c) || '').toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto', textAlign: 'center' }}>
        Carregando empresas...
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <Link href={consultantHome()} style={{ color: '#0d6efd', textDecoration: 'none' }}>
          ← Painel
        </Link>
      </div>

      <h1 style={{ marginBottom: '1rem' }}>Empresas</h1>
      <div style={{ marginBottom: '0.5rem', color: '#6c757d', fontSize: '0.9rem' }}>{user?.email}</div>

      {error && (
        <div
          style={{
            padding: '1rem',
            backgroundColor: '#f8d7da',
            color: '#721c24',
            borderRadius: '8px',
            marginBottom: '1rem',
          }}
        >
          {error}
          <button onClick={loadData} style={{ marginLeft: '1rem' }}>
            Recarregar
          </button>
        </div>
      )}

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
              {filtered.map((c) => {
                const cid = resolveCompanyId(c);
                const detailHref = consultantCompanyOverview(cid);
                return (
                  <tr key={cid ?? 'row'} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <strong>{c.company_name ?? c.trade_name ?? c.name ?? cid ?? '—'}</strong>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>{c.entitlement}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>{humanizeStatus(c.full_status)}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>{c.plan_progress || '—'}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {isCompanyIdValid(cid) && detailHref !== '#' ? (
                        <Link
                          href={detailHref}
                          style={{ color: '#0d6efd', textDecoration: 'none', fontSize: '0.9rem' }}
                        >
                          Abrir →
                        </Link>
                      ) : (
                        <span style={{ color: '#6c757d', fontSize: '0.85rem' }} title="Empresa inválida (sem id)">
                          Empresa inválida
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
