'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { consultantSupportThreads, consultantCompanies, type SupportThread, type CompanyItem } from '@/lib/api/consultor';
import { ApiError } from '@/lib/api';
import { consultantHome, consultantMessageThread, resolveCompanyId } from '@/lib/consultorRoutes';

export default function ConsultorMessagesPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
        <ConsultorMessagesContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function ConsultorMessagesContent() {
  const { user, session } = useAuth();
  const router = useRouter();
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<'OPEN' | 'CLOSED'>('OPEN');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setError('');
    try {
      const [threadsRes, companiesRes] = await Promise.all([
        consultantSupportThreads(statusFilter, session.access_token),
        consultantCompanies(session.access_token),
      ]);
      setThreads(threadsRes?.threads || []);
      setCompanies(companiesRes?.companies || []);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        router.replace('/diagnostico');
        return;
      }
      setError((err as Error).message || 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, statusFilter, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const companyMap = Object.fromEntries(
    companies
      .map((c) => {
        const cid = resolveCompanyId(c);
        return cid ? [cid, c.company_name ?? c.name ?? cid] : null;
      })
      .filter(Boolean) as [string, string][]
  );

  if (loading) {
    return (
      <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
        Carregando threads...
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <Link href={consultantHome()} style={{ color: '#0d6efd', textDecoration: 'none' }}>
          ← Painel
        </Link>
      </div>

      <h1 style={{ marginBottom: '1rem' }}>Mensagens</h1>
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
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {(['OPEN', 'CLOSED'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: statusFilter === s ? '2px solid #0d6efd' : '1px solid #dee2e6',
              background: statusFilter === s ? '#e7f3ff' : '#fff',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            {s === 'OPEN' ? 'Abertos' : 'Encerrados'}
          </button>
        ))}
      </div>

      {threads.length === 0 ? (
        <p style={{ color: '#6c757d' }}>
          Nenhum thread {statusFilter === 'OPEN' ? 'aberto' : 'encerrado'}.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {threads.map((t) => (
            <li
              key={t.id}
              style={{
                marginBottom: '1rem',
                padding: '1rem 1.25rem',
                border: '1px solid #dee2e6',
                borderRadius: '8px',
                backgroundColor: '#fff',
              }}
            >
              <div style={{ fontSize: '0.85rem', color: '#6c757d', marginBottom: '0.5rem' }}>
                {companyMap[t.company_id] || t.company_id} · {new Date(t.created_at).toLocaleString('pt-BR')}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.9rem' }}>Thread {t.status}</span>
                <Link
                  href={consultantMessageThread(t.id)}
                  style={{
                    color: '#0d6efd',
                    textDecoration: 'none',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                  }}
                >
                  Abrir conversa →
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
