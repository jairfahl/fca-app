'use client';

import { Suspense, useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/auth';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import PageHeader from '@/components/ui/PageHeader';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import PaywallCard from '@/components/PaywallCard';

type FullDiagnosticState = 'loading' | 'success' | 'blocked' | 'error' | 'unauthorized' | 'missing_assessment';

export default function FullDiagnosticPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
        <FullDiagnosticContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function FullDiagnosticContent() {
  const { user, session } = useAuth();
  const searchParams = useSearchParams();
  const assessmentId = searchParams.get('assessment_id');
  const resultsHref = assessmentId ? `/results?assessment_id=${assessmentId}` : '/results';
  const [state, setState] = useState<FullDiagnosticState>('loading');
  const [summaryData, setSummaryData] = useState<any>(null);
  const [initiativesData, setInitiativesData] = useState<any>(null);
  const [nextBestData, setNextBestData] = useState<any>(null);
  const [error, setError] = useState('');
  const [initiativesError, setInitiativesError] = useState('');
  const [nextBestError, setNextBestError] = useState('');
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.access_token) {
      setState('unauthorized');
      return;
    }

    const fetchFullDiagnostic = async () => {
      try {
        setState('loading');
        setError('');

        if (!assessmentId) {
          setState('missing_assessment');
          return;
        }

        const assessment = await apiFetch(
          `/assessments/${assessmentId}`,
          {},
          session.access_token
        );
        const resolvedCompanyId = assessment?.assessment?.company_id || null;
        if (!resolvedCompanyId) {
          setState('missing_assessment');
          return;
        }
        setCompanyId(resolvedCompanyId);

        const summary = await apiFetch(
          `/full/assessments/${assessmentId}/summary?company_id=${resolvedCompanyId}`,
          {},
          session.access_token
        );
        setSummaryData(summary);

        try {
          const initiatives = await apiFetch(
            `/full/assessments/${assessmentId}/initiatives?company_id=${resolvedCompanyId}`,
            {},
            session.access_token
          );
          setInitiativesData(initiatives);
          setInitiativesError('');
        } catch (initErr: any) {
          setInitiativesData(null);
          setInitiativesError(initErr?.message || 'Iniciativas indisponíveis no momento');
        }

        try {
          const nextBest = await apiFetch(
            `/full/assessments/${assessmentId}/next-best-actions?company_id=${resolvedCompanyId}`,
            {},
            session.access_token
          );
          setNextBestData(nextBest);
          setNextBestError('');
        } catch (nbaErr: any) {
          setNextBestData(null);
          setNextBestError(nbaErr?.message || 'Next Best Actions indisponível no momento');
        }
        setState('success');

        if (process.env.NODE_ENV === 'development') {
          console.log('FULL_REPORT status=200');
        }
      } catch (err: any) {
        if (err instanceof ApiError) {
          if (err.status === 401) {
            setState('unauthorized');
            return;
          }
          if (err.status === 403) {
            // 403: sem acesso FULL
            setState('blocked');
            return;
          }
        }
        setError(err.message || 'Erro ao carregar relatório completo');
        setState('error');
      }
    };

    fetchFullDiagnostic();
  }, [assessmentId, session?.access_token]);

  const getScoreColor = (score: number) => {
    if (score >= 7) return '#28a745';
    if (score >= 4) return '#ffc107';
    return '#dc3545';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 9) return 'Forte';
    if (score >= 7) return 'Organizado';
    if (score >= 4) return 'Frágil';
    return 'Crítico';
  };

  const buildHighlights = (scores: any) => {
    const entries = [
      { label: 'Comercial', value: Number(scores?.commercial || 0) },
      { label: 'Operações', value: Number(scores?.operations || 0) },
      { label: 'Adm/Fin', value: Number(scores?.admin_fin || 0) },
      { label: 'Gestão', value: Number(scores?.management || 0) }
    ];
    const worst = entries.reduce((min, cur) => (cur.value < min.value ? cur : min), entries[0]);
    const best = entries.reduce((max, cur) => (cur.value > max.value ? cur : max), entries[0]);

    return [
      `Principal gargalo agora: ${worst.label} (${worst.value.toFixed(1)})`,
      `Melhor processo: ${best.label} (${best.value.toFixed(1)})`,
      'Priorize disciplina semanal e rotina de execução para manter consistência.'
    ];
  };

  const initiativesList = (() => {
    if (initiativesData && Array.isArray(initiativesData.initiatives)) {
      return initiativesData.initiatives;
    }
    if (initiativesData && Array.isArray(initiativesData.items)) {
      return initiativesData.items;
    }
    if (Array.isArray(initiativesData)) {
      return initiativesData;
    }
    return [];
  })();

  return (
    <AppShell showLogout userEmail={user?.email}>
      <PageHeader
        title="Relatório Executivo Completo (FULL)"
        subtitle="12 iniciativas e próximos passos para organizar sua gestão."
        breadcrumbs={<Breadcrumbs />}
      />

      {state === 'loading' && (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          Carregando diagnóstico completo...
        </div>
      )}

      {state === 'missing_assessment' && (
        <div style={{
          border: '1px solid #dc3545',
          borderRadius: '8px',
          padding: '2rem',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          textAlign: 'center'
        }}>
          <p>assessment_id ausente</p>
          <div style={{ marginTop: '1rem' }}>
            <Link href={resultsHref} style={{ color: '#0070f3' }}>Voltar para Resultados</Link>
          </div>
        </div>
      )}

      {state === 'unauthorized' && (
        <div style={{
          border: '1px solid #dc3545',
          borderRadius: '8px',
          padding: '2rem',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          textAlign: 'center'
        }}>
          <p style={{ marginBottom: '1rem' }}>Sessão expirada</p>
          <Link href="/login" style={{ color: '#0070f3' }}>Login</Link>
        </div>
      )}

      {state === 'error' && (
        <div style={{
          border: '1px solid #dc3545',
          borderRadius: '8px',
          padding: '2rem',
          backgroundColor: '#f8d7da',
          color: '#721c24'
        }}>
          <p><strong>Erro:</strong> {error || 'Erro ao carregar relatório completo'}</p>
          <div style={{ marginTop: '0.75rem' }}>
            <Link href={resultsHref} style={{ color: '#0070f3' }}>Voltar para Resultados</Link>
          </div>
        </div>
      )}

      {state === 'success' && (
        <div>
          <div style={{
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '1.5rem',
            backgroundColor: '#fff',
            marginBottom: '1.5rem'
          }}>
            <h2 style={{ marginBottom: '1rem' }}>Resumo Executivo</h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '1rem',
              marginBottom: '1rem'
            }}>
              {[
                { label: 'Comercial', value: summaryData?.scores?.commercial },
                { label: 'Operações', value: summaryData?.scores?.operations },
                { label: 'Adm/Fin', value: summaryData?.scores?.admin_fin },
                { label: 'Gestão', value: summaryData?.scores?.management },
                { label: 'Geral', value: summaryData?.scores?.overall }
              ].map((item) => (
                <div key={item.label} style={{ border: '1px solid #eee', borderRadius: '8px', padding: '1rem' }}>
                  <div style={{ fontSize: '0.875rem', color: '#666' }}>{item.label}</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: getScoreColor(Number(item.value || 0)) }}>
                    {Number(item.value || 0).toFixed(1)}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#666' }}>
                    {getScoreLabel(Number(item.value || 0))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: '1rem' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Destaques</div>
              <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                {(summaryData?.highlights && Array.isArray(summaryData.highlights) && summaryData.highlights.length > 0
                  ? summaryData.highlights.slice(0, 3)
                  : buildHighlights(summaryData?.scores || {})).map((item: string, idx: number) => (
                  <li key={idx} style={{ marginBottom: '0.25rem' }}>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          <div style={{
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '1.5rem',
            backgroundColor: '#fff',
            marginBottom: '1.5rem'
          }}>
            <h2 style={{ marginBottom: '1rem' }}>Prioridades (Top‑12 iniciativas)</h2>
            {initiativesError && (
              <div style={{ color: '#856404', backgroundColor: '#fff3cd', padding: '0.75rem', borderRadius: '6px', marginBottom: '0.75rem' }}>
                {initiativesError}
              </div>
            )}
            {initiativesList.length === 0 && (
              <div style={{ color: '#666', padding: '0.75rem 0' }}>
                Nenhuma iniciativa disponível para este diagnóstico.
              </div>
            )}
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {initiativesList.map((item: any, idx: number) => (
                <div key={`${item.id || item.initiative_id || idx}`} style={{ border: '1px solid #eee', borderRadius: '6px', padding: '0.75rem' }}>
                  <div style={{ fontWeight: 'bold' }}>#{item.rank || idx + 1} — {item.title || item.name || 'Iniciativa'}</div>
                  <div style={{ fontSize: '0.875rem', color: '#666' }}>
                    Processo: {item.process || '—'} | Impacto: {item.impact || item.risk || '—'} | Horizonte: {item.horizon || '—'}
                  </div>
                  {item.dependencies_json && Array.isArray(item.dependencies_json) && item.dependencies_json.length > 0 && (
                    <div style={{ fontSize: '0.875rem', color: '#666' }}>
                      Dependências: {item.dependencies_json.length}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div style={{
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '1.5rem',
            backgroundColor: '#fff',
            marginBottom: '1.5rem'
          }}>
            <h2 style={{ marginBottom: '1rem' }}>Prontas agora vs Bloqueadas</h2>
            {nextBestError && (
              <div style={{ color: '#856404', backgroundColor: '#fff3cd', padding: '0.75rem', borderRadius: '6px', marginBottom: '0.75rem' }}>
                {nextBestError}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Prontas agora</div>
                {(nextBestData?.ready_now || []).length === 0 && (
                  <div style={{ color: '#666', fontSize: '0.875rem' }}>Nenhuma pronta agora.</div>
                )}
                <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                  {(nextBestData?.ready_now || []).map((item: any, idx: number) => (
                    <li key={`ready-${idx}`}>
                      <div style={{ fontWeight: 'bold' }}>{item.title || 'Iniciativa'}</div>
                      <div style={{ fontSize: '0.875rem', color: '#666' }}>
                        Processo: {item.process || '—'} | Motivo: {item.ready_reason === 'NO_DEPENDENCIES' ? 'Sem dependências' : (item.ready_reason || 'Pronta')}
                      </div>
                      {Array.isArray(item.prerequisites) && item.prerequisites.length > 0 && (
                        <div style={{ fontSize: '0.875rem', color: '#666' }}>
                          Pré‑requisitos: {item.prerequisites.length}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Bloqueadas</div>
                {(nextBestData?.blocked_by || []).length === 0 && (
                  <div style={{ color: '#666', fontSize: '0.875rem' }}>Nenhuma bloqueada.</div>
                )}
                <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                  {(nextBestData?.blocked_by || []).map((item: any, idx: number) => (
                    <li key={`blocked-${idx}`}>
                      <div style={{ fontWeight: 'bold' }}>{item.title || 'Iniciativa'}</div>
                      <div style={{ fontSize: '0.875rem', color: '#666' }}>
                        Processo: {item.process || '—'} | Motivo: {item.blocked_reason === 'DEPENDS_ON' ? 'Dependências pendentes' : (item.blocked_reason || 'Bloqueada')}
                      </div>
                      {Array.isArray(item.depends_on) && item.depends_on.length > 0 && (
                        <div style={{ fontSize: '0.875rem', color: '#666' }}>
                          Dependências: {item.depends_on.map((dep: any) => dep.title || dep.initiative_id).filter(Boolean).join(', ')}
                        </div>
                      )}
                      {Array.isArray(item.prerequisites) && item.prerequisites.length > 0 && (
                        <div style={{ fontSize: '0.875rem', color: '#666' }}>
                          Pré‑requisitos: {item.prerequisites.length}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div style={{
            border: '1px solid #0070f3',
            borderRadius: '8px',
            padding: '1rem',
            backgroundColor: '#f0f7ff'
          }}>
            Quer ajuda para executar com acompanhamento? Migre para o plano completo e tenha suporte para implementar com consistência.
          </div>

        </div>
      )}

      {state === 'blocked' && (
        <PaywallCard
          primaryLabel="Ver planos"
          primaryHref={companyId ? `/paywall?company_id=${companyId}` : '/paywall'}
          secondaryLabel="Voltar"
          secondaryHref={resultsHref}
          note={process.env.NODE_ENV === 'development'
            ? 'Ambiente de testes: acesso FULL depende de entitlement/configuração do servidor.'
            : undefined}
        />
      )}
    </AppShell>
  );
}
