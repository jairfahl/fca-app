'use client';

import { Suspense, useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { getEntitlement } from '@/lib/entitlement';
import { assertFullAccess } from '@/lib/fullGuard';
import { humanizeBand, labels } from '@/lib/uiCopy';

const PROCESS_LABELS: Record<string, string> = {
  COMERCIAL: 'Comercial',
  OPERACOES: 'Operações',
  ADM_FIN: 'Adm/Fin',
  GESTAO: 'Gestão',
};

type ComparePayload = {
  from_version: number;
  to_version: number;
  evolution_by_process: Array<{
    process_key: string;
    from: { band: string; score_numeric: number } | null;
    to: { band: string; score_numeric: number } | null;
  }>;
  raio_x_entered: string[];
  raio_x_left: string[];
  actions_completed_previous: number;
  gains_declared_previous: Array<{ action_key: string; title: string; declared_gain: string }>;
};

function cta(bg: string): React.CSSProperties {
  return {
    display: 'inline-block',
    backgroundColor: bg,
    color: '#fff',
    padding: '0.65rem 1rem',
    borderRadius: '8px',
    textDecoration: 'none',
    fontWeight: 'bold',
    fontSize: '0.9rem',
  };
}

export default function FullCompararPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
        <FullCompararContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function FullCompararContent() {
  const { user, session } = useAuth();
  const searchParams = useSearchParams();
  const companyId = searchParams.get('company_id');
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');
  const fromVer = fromParam ? parseInt(fromParam, 10) : null;
  const toVer = toParam ? parseInt(toParam, 10) : null;

  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'missing'>('loading');
  const [error, setError] = useState('');
  const [data, setData] = useState<ComparePayload | null>(null);

  useEffect(() => {
    if (!companyId || !session?.access_token || !fromVer || !toVer || fromVer < 1 || toVer < 1) {
      if (!companyId) setState('missing');
      else if (!fromVer || !toVer) setState('missing');
      return;
    }
    const load = async () => {
      try {
        setState('loading');
        setError('');
        const ent = await getEntitlement(companyId, session.access_token);
        if (!assertFullAccess(ent, user?.email)) {
          setError('Conteúdo disponível apenas no FULL.');
          setState('error');
          return;
        }
        const res = await apiFetch(
          `/full/compare?company_id=${companyId}&from=${fromVer}&to=${toVer}`,
          {},
          session.access_token
        );
        setData(res);
        setState('ready');
      } catch (err: any) {
        setError(err?.message || 'Falha ao carregar comparação.');
        setState('error');
      }
    };
    load();
  }, [companyId, fromVer, toVer, session?.access_token, user?.email]);

  if (state === 'missing') {
    return (
      <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ padding: '1rem', borderRadius: '8px', backgroundColor: '#f8d7da', color: '#721c24' }}>
          Informe company_id, from e to na URL. Ex.: /full/comparar?company_id=...&from=1&to=2
        </div>
        <Link href={companyId ? `/full/historico?company_id=${companyId}` : '/full'} style={{ ...cta('#6c757d'), marginTop: '1rem', display: 'inline-block' }}>
          Ver histórico
        </Link>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1rem', color: '#666', fontSize: '0.9rem' }}>Logado como: {user?.email}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Comparação v{fromVer} → v{toVer}</h1>
        <Link
          href={companyId ? `/full/historico?company_id=${companyId}` : '/full'}
          style={{ ...cta('#6c757d'), display: 'inline-block' }}
        >
          Ver histórico
        </Link>
      </div>

      {error && (
        <div style={{ padding: '1rem', marginBottom: '1rem', borderRadius: '8px', backgroundColor: '#f8d7da', color: '#721c24' }}>
          {error}
        </div>
      )}

      {state === 'loading' && <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando...</div>}

      {state === 'ready' && data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <section style={{ border: '1px solid #dee2e6', borderRadius: '8px', padding: '1.25rem', backgroundColor: '#fff' }}>
            <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem' }}>Evolução por processo</h2>
            <p style={{ margin: '0 0 1rem 0', color: '#6c757d', fontSize: '0.9rem' }}>
              O que melhorou ou piorou em cada área.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {data.evolution_by_process.map((e) => {
                const label = PROCESS_LABELS[e.process_key] || e.process_key;
                const fromBand = e.from ? humanizeBand(e.from.band) : '—';
                const toBand = e.to ? humanizeBand(e.to.band) : '—';
                const improved = e.from && e.to && bandOrder(e.to.band) > bandOrder(e.from.band);
                const worsened = e.from && e.to && bandOrder(e.to.band) < bandOrder(e.from.band);
                return (
                  <div
                    key={e.process_key}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.75rem',
                      backgroundColor: '#f8f9fa',
                      borderRadius: '6px',
                    }}
                  >
                    <span style={{ fontWeight: '600' }}>{label}</span>
                    <span style={{ color: '#6c757d' }}>
                      {fromBand} → {toBand}
                      {improved && <span style={{ marginLeft: '0.5rem', color: '#198754' }}>↑</span>}
                      {worsened && <span style={{ marginLeft: '0.5rem', color: '#dc3545' }}>↓</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {(data.raio_x_entered?.length > 0 || data.raio_x_left?.length > 0) && (
            <section style={{ border: '1px solid #dee2e6', borderRadius: '8px', padding: '1.25rem', backgroundColor: '#fff' }}>
              <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem' }}>O que mudou no raio-x</h2>
              {data.raio_x_entered?.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', color: '#198754' }}>Novos pontos de atenção</h3>
                  <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                    {data.raio_x_entered.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}
              {data.raio_x_left?.length > 0 && (
                <div>
                  <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', color: '#6c757d' }}>Saíram do raio-x</h3>
                  <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                    {data.raio_x_left.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {data.gains_declared_previous?.length > 0 && (
            <section style={{ border: '1px solid #dee2e6', borderRadius: '8px', padding: '1.25rem', backgroundColor: '#fff' }}>
              <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem' }}>Ganhos declarados no ciclo anterior</h2>
              <p style={{ margin: '0 0 1rem 0', color: '#6c757d', fontSize: '0.9rem' }}>
                Resultados que você registrou ao concluir as ações da versão {data.from_version}.
              </p>
              <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                {data.gains_declared_previous.map((g, i) => (
                  <li key={i} style={{ marginBottom: '0.5rem' }}>
                    <strong>{g.title || g.action_key}:</strong> {g.declared_gain}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.actions_completed_previous > 0 && (
            <div style={{ padding: '0.75rem', backgroundColor: '#d4edda', color: '#155724', borderRadius: '8px', fontSize: '0.9rem' }}>
              No ciclo anterior: {data.actions_completed_previous} ação(ões) concluída(s).
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function bandOrder(band: string): number {
  const o: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
  return o[band] ?? 0;
}
