'use client';

import { Suspense, useEffect, useState, type CSSProperties } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import ConsultorBlock from '@/components/ConsultorBlock';
import { useAuth } from '@/lib/auth';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import { getEntitlement } from '@/lib/entitlement';
import { assertFullAccess } from '@/lib/fullGuard';
import {
  humanizeAnswerValue,
  humanizeBandInText,
  humanizeStatus,
  labels,
} from '@/lib/uiCopy';

type FullPageState = 'loading' | 'ready' | 'blocked' | 'error' | 'missing_company';

type CurrentAssessment = {
  id: string;
  status: string;
  type: 'FULL';
  answers?: Array<{ process_key: string; question_key: string }>;
};

type SixPackItem = {
  title: string;
  o_que_acontece: string;
  custo_nao_agir: string;
  muda_em_30_dias: string;
  primeiro_passo_action_id: string | null;
  primeiro_passo?: string | null;
  is_fallback?: boolean;
  supporting: {
    processes: string[];
    como_puxou_nivel?: string | null;
    questions: Array<{
      process_key: string;
      question_key: string;
      question_text: string;
      answer_value: number;
      answer_text?: string | null;
    }>;
  };
};

type SixPack = { vazamentos: SixPackItem[]; alavancas: SixPackItem[] };

const PROCESS_LABELS: Record<string, string> = {
  COMERCIAL: 'Comercial',
  OPERACOES: 'Operações',
  ADM_FIN: 'Adm/Fin',
  GESTAO: 'Gestão',
};

export default function FullPage() {
  return (
    <ProtectedRoute>
      <ConsultorBlock>
        <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
          <FullContent />
        </Suspense>
      </ConsultorBlock>
    </ProtectedRoute>
  );
}

function FullContent() {
  const { user, session } = useAuth();
  const searchParams = useSearchParams();
  const companyId = searchParams.get('company_id');

  const [state, setState] = useState<FullPageState>('loading');
  const [error, setError] = useState('');
  const [current, setCurrent] = useState<CurrentAssessment | null>(null);
  const [showSixPack, setShowSixPack] = useState(false);
  const [sixPack, setSixPack] = useState<SixPack | null>(null);
  const [sixPackLoading, setSixPackLoading] = useState(false);

  useEffect(() => {
    if (!companyId) {
      setState('missing_company');
      return;
    }
    const load = async () => {
      try {
        setState('loading');
        setError('');
        if (!session?.access_token) {
          setError('Sessão expirada');
          setState('error');
          return;
        }
        const ent = await getEntitlement(companyId, session.access_token);
        if (!assertFullAccess(ent, user?.email)) {
          setState('blocked');
          return;
        }
        const data = await apiFetch(`/full/assessments/current?company_id=${companyId}`, {}, session.access_token);
        setCurrent(data);
        setState('ready');
      } catch (err: any) {
        const status = err instanceof ApiError ? err.status : 0;
        setError((status === 404 || status === 500) ? 'Falha ao carregar diagnóstico FULL' : (err?.message || 'Falha ao carregar diagnóstico FULL'));
        setState('error');
      }
    };
    if (session?.access_token) load();
  }, [companyId, session?.access_token]);

  const loadSixPack = async () => {
    if (!companyId || !current?.id || !session?.access_token) return;
    setSixPackLoading(true);
    setError('');
    try {
      const data = await apiFetch(
        `/full/results?company_id=${companyId}&assessment_id=${current.id}`,
        {},
        session.access_token
      );
      setSixPack(data?.six_pack || { vazamentos: [], alavancas: [] });
      setShowSixPack(true);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar diagnóstico completo');
    } finally {
      setSixPackLoading(false);
    }
  };

  const answered = current?.answers?.length || 0;
  const isSubmitted = current?.status === 'SUBMITTED' || current?.status === 'CLOSED';

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1rem', color: '#666' }}>Logado como: {user?.email}</div>
      <h1 style={{ marginBottom: '0.25rem' }}>Diagnóstico FULL</h1>
      <p style={{ marginBottom: '1.5rem', color: '#666' }}>
        Fluxo completo do diagnóstico FULL (independente do LIGHT), com salvar e retomar.
      </p>

      {state === 'loading' && <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando...</div>}
      {state === 'missing_company' && <div>{labels.missingCompany}</div>}
      {state === 'error' && <div style={{ color: '#721c24', background: '#f8d7da', padding: '1rem', borderRadius: '8px' }}>{error}</div>}
      {state === 'blocked' && <div style={{ color: '#856404', background: '#fff3cd', padding: '1rem', borderRadius: '8px' }}>Conteúdo disponível apenas no FULL.</div>}

      {state === 'ready' && current && (
        <div style={{ border: '1px solid #dee2e6', borderRadius: '8px', background: '#fff', padding: '1.25rem' }}>
          <div style={{ marginBottom: '0.75rem' }}><strong>Status:</strong> {humanizeStatus(current.status)}</div>
          <div style={{ marginBottom: '1rem' }}><strong>Respostas salvas:</strong> {answered}</div>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            {!isSubmitted && (
              <Link href={`/full/wizard?company_id=${companyId}&assessment_id=${current.id}`} style={cta('#0d6efd')}>
                Fazer diagnóstico FULL
              </Link>
            )}
            {isSubmitted && (
              <button
                onClick={loadSixPack}
                disabled={sixPackLoading}
                style={{ ...cta('#6f42c1'), border: 'none', cursor: sixPackLoading ? 'not-allowed' : 'pointer' }}
              >
                {sixPackLoading ? 'Carregando...' : 'Ver diagnóstico completo'}
              </button>
            )}
            <Link href={`/full/resultados?company_id=${companyId}&assessment_id=${current.id}`} style={cta('#6f42c1')}>
              Ver resultados
            </Link>
            <Link href={`/full/dashboard?company_id=${companyId}&assessment_id=${current.id}`} style={cta('#198754')}>
              Dashboard FULL
            </Link>
            <Link href={`/full/relatorio?company_id=${companyId}`} style={cta('#6c757d')}>
              Relatório PDF
            </Link>
            <Link href={`/full/historico?company_id=${companyId}`} style={cta('#6c757d')}>
              Histórico de versões
            </Link>
          </div>
        </div>
      )}

      {showSixPack && sixPack && (
        <SixPackSection
          sixPack={sixPack}
          onClose={() => setShowSixPack(false)}
          companyId={companyId}
          assessmentId={current?.id ?? null}
        />
      )}
    </div>
  );
}

function SixPackSection({
  sixPack,
  onClose,
  companyId,
  assessmentId,
}: {
  sixPack: SixPack;
  onClose: () => void;
  companyId: string | null;
  assessmentId: string | null;
}) {
  const [selected, setSelected] = useState<SixPackItem | null>(null);
  const hasVazamentos = (sixPack.vazamentos?.length ?? 0) > 0;
  const hasAlavancas = (sixPack.alavancas?.length ?? 0) > 0;
  const isEmpty = !hasVazamentos && !hasAlavancas;

  return (
    <div style={{ marginTop: '2rem', border: '1px solid #dee2e6', borderRadius: '8px', padding: '1.25rem', background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>Raio-X do dono</h2>
        <button onClick={onClose} style={{ border: '1px solid #dee2e6', borderRadius: '6px', padding: '0.35rem 0.75rem', background: '#fff', cursor: 'pointer' }}>
          Fechar
        </button>
      </div>
      {isEmpty ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#6c757d', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
          <p style={{ marginBottom: '1rem' }}>Não foi possível carregar o diagnóstico completo.</p>
          {companyId && assessmentId && (
            <Link
              href={`/full/resultados?company_id=${companyId}&assessment_id=${assessmentId}`}
              style={{ ...cta('#6f42c1'), display: 'inline-block' }}
            >
              Ver resultados completos
            </Link>
          )}
        </div>
      ) : (
        <>
      <div style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '0.75rem' }}>3 Vazamentos</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
          {sixPack.vazamentos.map((item, i) => (
            <button
              key={`v-${i}`}
              onClick={() => setSelected(item)}
              style={{ textAlign: 'left', border: '1px solid #dee2e6', borderRadius: '8px', background: '#fff', padding: '1rem', cursor: 'pointer' }}
            >
              <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{humanizeBandInText(item.title)}</div>
              <div style={{ fontSize: '0.9rem', marginBottom: '0.35rem' }}><strong>{labels.raioXWhatHappening}:</strong> {item.o_que_acontece || '—'}</div>
              <div style={{ fontSize: '0.85rem', color: '#6c757d', marginBottom: '0.35rem' }}><strong>{labels.raioXCusto}:</strong> {item.custo_nao_agir || '—'}</div>
              <div style={{ fontSize: '0.85rem', color: '#6c757d', marginBottom: '0.35rem' }}><strong>{labels.raioX30Dias}:</strong> {item.muda_em_30_dias || '—'}</div>
              <div style={{ fontSize: '0.85rem', color: '#6c757d' }}><strong>{labels.raioXPrimeiroPasso}:</strong> {item.primeiro_passo || labels.fallbackAction}</div>
            </button>
          ))}
        </div>
      </div>
      <div>
        <h3 style={{ marginBottom: '0.75rem' }}>3 Alavancas</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
          {sixPack.alavancas.map((item, i) => (
            <button
              key={`a-${i}`}
              onClick={() => setSelected(item)}
              style={{ textAlign: 'left', border: '1px solid #dee2e6', borderRadius: '8px', background: '#fff', padding: '1rem', cursor: 'pointer' }}
            >
              <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{humanizeBandInText(item.title)}</div>
              <div style={{ fontSize: '0.9rem', marginBottom: '0.35rem' }}><strong>{labels.raioXWhatHappening}:</strong> {item.o_que_acontece || '—'}</div>
              <div style={{ fontSize: '0.85rem', color: '#6c757d', marginBottom: '0.35rem' }}><strong>{labels.raioXCusto}:</strong> {item.custo_nao_agir || '—'}</div>
              <div style={{ fontSize: '0.85rem', color: '#6c757d', marginBottom: '0.35rem' }}><strong>{labels.raioX30Dias}:</strong> {item.muda_em_30_dias || '—'}</div>
              <div style={{ fontSize: '0.85rem', color: '#6c757d' }}><strong>{labels.raioXPrimeiroPasso}:</strong> {item.primeiro_passo || labels.fallbackAction}</div>
            </button>
          ))}
        </div>
      </div>
        </>
      )}

      {selected && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setSelected(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') setSelected(null); }}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1rem' }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: '8px', padding: '1.25rem', width: '100%', maxWidth: '640px' }}>
            <h3 style={{ marginTop: 0 }}>{labels.raioXWhyTitle}</h3>
            <p><strong>{labels.raioXWhatWeSaw}:</strong> {selected.o_que_acontece}</p>
            <p><strong>{labels.raioXCusto}:</strong> {selected.custo_nao_agir}</p>
            <p><strong>{labels.raioX30Dias}:</strong> {selected.muda_em_30_dias}</p>
            {selected.supporting?.como_puxou_nivel && (
              <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#f8f9fa', borderRadius: '6px' }}>
                <strong style={{ fontSize: '0.9rem', color: '#495057' }}>{labels.raioXComoPuxou}:</strong>{' '}
                <span style={{ color: '#333' }}>{selected.supporting.como_puxou_nivel}</span>
              </div>
            )}
            <h4 style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>{labels.raioXSignals}</h4>
            {(selected.supporting?.questions?.length ?? 0) === 0 ? (
              <p style={{ color: '#777' }}>Sem sinais detalhados.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                {selected.supporting.questions.map((q, idx) => (
                  <li key={idx}>{q.question_text || `${PROCESS_LABELS[q.process_key] || q.process_key} — ${q.question_key}`}: {q.answer_text ?? humanizeAnswerValue(q.answer_value)}</li>
                ))}
              </ul>
            )}
            <div style={{ marginTop: '1rem', textAlign: 'right' }}>
              <button onClick={() => setSelected(null)} style={{ border: 'none', borderRadius: '6px', padding: '0.5rem 1rem', background: '#0d6efd', color: '#fff', cursor: 'pointer' }}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function cta(bg: string): CSSProperties {
  return {
    display: 'inline-block',
    backgroundColor: bg,
    color: '#fff',
    padding: '0.65rem 1rem',
    borderRadius: '8px',
    textDecoration: 'none',
    fontWeight: 'bold',
  };
}
