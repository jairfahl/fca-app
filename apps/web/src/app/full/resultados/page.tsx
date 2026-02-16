'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import SolicitarAjudaButton from '@/components/SolicitarAjudaButton';
import {
  humanizeAnswerValue,
  humanizeBand,
  humanizeBandInText,
  labels,
} from '@/lib/uiCopy';

type Finding = {
  id: string;
  type: 'VAZAMENTO' | 'ALAVANCA';
  position: number;
  processo: string;
  maturity_band: 'LOW' | 'MEDIUM' | 'HIGH';
  o_que_esta_acontecendo: string;
  custo_de_nao_agir: string;
  o_que_muda_em_30_dias: string;
  primeiro_passo?: { action_key: string; action_title?: string } | null;
  trace?: {
    process_keys?: string[];
    como_puxou_nivel?: string | null;
    question_refs?: Array<{
      process_key: string;
      question_key: string;
      question_text?: string;
      answer_value: number;
      answer_text?: string | null;
    }>;
  };
  is_fallback?: boolean;
  gap_reason?: string | null;
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

type ResultsPayload = {
  findings: Finding[];
  six_pack?: { vazamentos: SixPackItem[]; alavancas: SixPackItem[] };
};

const PROCESS_LABELS: Record<string, string> = {
  COMERCIAL: 'Comercial',
  OPERACOES: 'Operações',
  ADM_FIN: 'Adm/Fin',
  GESTAO: 'Gestão',
};

export default function FullResultadosPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
        <FullResultadosContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function FullResultadosContent() {
  const { user, session } = useAuth();
  const searchParams = useSearchParams();
  const companyId = searchParams.get('company_id');
  const assessmentId = searchParams.get('assessment_id');

  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'missing'>('loading');
  const [error, setError] = useState('');
  const [payload, setPayload] = useState<ResultsPayload | null>(null);
  const [selected, setSelected] = useState<Finding | SixPackItem | null>(null);
  const [planStatus, setPlanStatus] = useState<{ exists: boolean; progress: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!session?.access_token) return;
      if (!companyId || !assessmentId) {
        setState('missing');
        return;
      }
      try {
        setState('loading');
        setError('');
        const data = await apiFetch(`/full/results?assessment_id=${assessmentId}&company_id=${companyId}`, {}, session.access_token);
        setPayload({
          findings: data?.findings || [],
          six_pack: data?.six_pack || { vazamentos: [], alavancas: [] },
        });
        try {
          const statusRes = await apiFetch(`/full/plan/status?assessment_id=${assessmentId}&company_id=${companyId}`, {}, session.access_token);
          setPlanStatus(statusRes ? { exists: !!statusRes.exists, progress: statusRes.progress || '0/3' } : null);
        } catch {
          setPlanStatus(null);
        }
        setState('ready');
      } catch (err: any) {
        setError(err?.message || 'Falha ao carregar resultados FULL');
        setState('error');
      }
    };
    load();
  }, [companyId, assessmentId, session?.access_token]);

  const findings = payload?.findings || [];
  const sixPack = payload?.six_pack;
  const vazamentos = sixPack?.vazamentos?.length ? sixPack.vazamentos : findings.filter((f) => f.type === 'VAZAMENTO').slice(0, 3);
  const alavancas = sixPack?.alavancas?.length ? sixPack.alavancas : findings.filter((f) => f.type === 'ALAVANCA').slice(0, 3);

  if (state === 'missing') {
    return (
      <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ padding: '1rem', borderRadius: '8px', backgroundColor: '#f8d7da', color: '#721c24' }}>
          {labels.missingParams}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '980px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1rem', color: '#666', fontSize: '0.9rem' }}>Logado como: {user?.email}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Resultados FULL</h1>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {companyId && <SolicitarAjudaButton companyId={companyId} />}
          <Link
            href={state === 'error' && companyId ? `/full?company_id=${companyId}` : (companyId ? `/full/wizard?company_id=${companyId}&assessment_id=${assessmentId || ''}` : '/full')}
            style={{ background: '#6c757d', color: '#fff', padding: '0.5rem 1rem', borderRadius: '6px', textDecoration: 'none' }}
          >
            {state === 'error' ? 'Voltar ao FULL' : 'Voltar ao diagnóstico'}
          </Link>
          {state === 'error' ? (
            <Link
              href={companyId ? `/full/dashboard?company_id=${companyId}` : '/full/dashboard'}
              style={{ background: '#198754', color: '#fff', padding: '0.5rem 1rem', borderRadius: '6px', textDecoration: 'none', fontWeight: 600 }}
            >
              {labels.followExecution}
            </Link>
          ) : planStatus?.exists ? (
            <Link
              href={companyId && assessmentId ? `/full/dashboard?company_id=${companyId}&assessment_id=${assessmentId}` : '/full/dashboard'}
              style={{ background: '#198754', color: '#fff', padding: '0.5rem 1rem', borderRadius: '6px', textDecoration: 'none', fontWeight: 600 }}
            >
              {labels.followExecution}
            </Link>
          ) : (
            <Link
              href={companyId && assessmentId ? `/full/acoes?company_id=${companyId}&assessment_id=${assessmentId}` : '/full/acoes'}
              style={{ background: '#0d6efd', color: '#fff', padding: '0.5rem 1rem', borderRadius: '6px', textDecoration: 'none', fontWeight: 600 }}
            >
              {labels.planMinimalCta}
            </Link>
          )}
        </div>
      </div>

      {state === 'loading' && <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando resultados...</div>}
      {state === 'error' && (
        <div style={{ padding: '1rem', borderRadius: '8px', backgroundColor: '#f8d7da', color: '#721c24', marginBottom: '1rem' }}>
          {error}
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Link
              href={companyId ? `/full?company_id=${companyId}` : '/full'}
              style={{ background: '#0d6efd', color: '#fff', padding: '0.5rem 1rem', borderRadius: '6px', textDecoration: 'none', fontWeight: 600 }}
            >
              Voltar ao FULL
            </Link>
            <Link
              href={companyId ? `/full/dashboard?company_id=${companyId}` : '/full/dashboard'}
              style={{ background: '#198754', color: '#fff', padding: '0.5rem 1rem', borderRadius: '6px', textDecoration: 'none', fontWeight: 600 }}
            >
              {labels.followExecution}
            </Link>
          </div>
        </div>
      )}

      {state === 'ready' && (
        <>
          <Section
            title="3 Vazamentos"
            cards={vazamentos}
            onOpenDetail={setSelected}
            companyId={companyId}
            assessmentId={assessmentId}
            planExists={planStatus?.exists ?? false}
          />
          <Section
            title="3 Alavancas"
            cards={alavancas}
            onOpenDetail={setSelected}
            companyId={companyId}
            assessmentId={assessmentId}
            planExists={planStatus?.exists ?? false}
          />
        </>
      )}

      {selected && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setSelected(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') setSelected(null); }}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.45)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '8px', padding: '1.25rem', width: '100%', maxWidth: '680px' }}
          >
            <h3 style={{ marginTop: 0 }}>{labels.raioXWhyTitle}</h3>
            <p style={{ marginTop: '0.5rem', color: '#555' }}>
              <strong>{labels.raioXWhatWeSaw}:</strong>{' '}
              {isSixPackItem(selected) ? selected.o_que_acontece : selected.o_que_esta_acontecendo}
            </p>
            <p style={{ marginTop: '0.25rem', fontSize: '0.9rem', color: '#6c757d' }}>
              <strong>{labels.raioXCusto}:</strong> {isSixPackItem(selected) ? selected.custo_nao_agir : selected.custo_de_nao_agir}
            </p>
            <p style={{ marginTop: '0.25rem', fontSize: '0.9rem', color: '#6c757d' }}>
              <strong>{labels.raioX30Dias}:</strong> {isSixPackItem(selected) ? selected.muda_em_30_dias : selected.o_que_muda_em_30_dias}
            </p>
            {(isSixPackItem(selected) ? selected.supporting?.como_puxou_nivel : (selected as Finding).trace?.como_puxou_nivel) && (
              <div style={{ marginTop: '1rem', marginBottom: '0.5rem', padding: '0.75rem', backgroundColor: '#f8f9fa', borderRadius: '6px' }}>
                <strong style={{ fontSize: '0.9rem', color: '#495057' }}>{labels.raioXComoPuxou}:</strong>{' '}
                <span style={{ color: '#333' }}>{isSixPackItem(selected) ? selected.supporting?.como_puxou_nivel : (selected as Finding).trace?.como_puxou_nivel}</span>
              </div>
            )}
            <h4 style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>{labels.raioXSignals}</h4>
            {isSixPackItem(selected) ? (
              (selected.supporting?.questions?.length ?? 0) === 0 ? (
                <p style={{ color: '#777' }}>Sem sinais detalhados.</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                  {selected.supporting.questions.map((q, idx) => (
                    <li key={idx}>
                      {q.question_text || `${PROCESS_LABELS[q.process_key] || q.process_key} — ${q.question_key}`}: {q.answer_text ?? humanizeAnswerValue(q.answer_value)}
                    </li>
                  ))}
                </ul>
              )
            ) : (
              (selected.trace?.question_refs || []).length === 0 ? (
                <p style={{ color: '#777' }}>Sem sinais detalhados.</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                  {(selected.trace?.question_refs || []).map((q, idx) => (
                    <li key={idx}>
                      {q.question_text || `${PROCESS_LABELS[q.process_key] || q.process_key} — ${q.question_key}`}: {q.answer_text ?? humanizeAnswerValue(q.answer_value)}
                    </li>
                  ))}
                </ul>
              )
            )}
            <div style={{ marginTop: '1rem', textAlign: 'right' }}>
              <button
                onClick={() => setSelected(null)}
                style={{ border: 'none', borderRadius: '6px', padding: '0.5rem 1rem', background: '#0d6efd', color: '#fff', cursor: 'pointer' }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type CardItem = Finding | SixPackItem;

function isSixPackItem(item: CardItem): item is SixPackItem {
  return 'supporting' in item;
}

function getPrimeiroPasso(item: CardItem): string {
  if (isSixPackItem(item)) return (item as SixPackItem).primeiro_passo || labels.fallbackAction;
  const f = item as Finding;
  const t = f.primeiro_passo?.action_title || labels.fallbackAction;
  return t?.includes('Ação padrão') ? labels.fallbackAction : t;
}

function getCardLinkHref(
  item: CardItem,
  companyId: string | null,
  assessmentId: string | null,
  planExists: boolean
): string {
  const base = companyId && assessmentId ? `?company_id=${companyId}&assessment_id=${assessmentId}` : '';
  const isFallback = isSixPackItem(item)
    ? !!(item as SixPackItem).is_fallback
    : (item as Finding).primeiro_passo?.action_key?.startsWith('fallback-') ?? (item as Finding).is_fallback ?? false;
  const actionKey = isSixPackItem(item)
    ? (item as SixPackItem).primeiro_passo_action_id
    : (item as Finding).primeiro_passo?.action_key;
  if (isFallback || !actionKey) {
    return `/full/acoes${base}${base ? '&' : '?'}conteudo_definicao=1`;
  }
  const target = planExists ? '/full/dashboard' : '/full/acoes';
  return `${target}${base}${base ? '&' : '?'}action_key=${encodeURIComponent(actionKey)}`;
}

function getCardLinkLabel(item: CardItem): string {
  const isFallback = isSixPackItem(item)
    ? (item as SixPackItem).is_fallback
    : (item as Finding).primeiro_passo?.action_key?.startsWith('fallback-') ?? true;
  return isFallback ? labels.verProximoPasso : labels.verAcaoSugerida;
}

function Section({
  title,
  cards,
  onOpenDetail,
  companyId,
  assessmentId,
  planExists,
}: {
  title: string;
  cards: CardItem[];
  onOpenDetail: (f: CardItem) => void;
  companyId: string | null;
  assessmentId: string | null;
  planExists: boolean;
}) {
  return (
    <section style={{ marginBottom: '2rem' }}>
      <h2 style={{ marginBottom: '1rem' }}>{title}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
        {cards.map((item, idx) => {
          let tit = isSixPackItem(item)
            ? humanizeBandInText(item.title)
            : `${PROCESS_LABELS[(item as Finding).processo] || (item as Finding).processo} (${humanizeBand((item as Finding).maturity_band)})`;
          const oQue = isSixPackItem(item) ? item.o_que_acontece : (item as Finding).o_que_esta_acontecendo;
          const custo = isSixPackItem(item) ? item.custo_nao_agir : (item as Finding).custo_de_nao_agir;
          const muda = isSixPackItem(item) ? item.muda_em_30_dias : (item as Finding).o_que_muda_em_30_dias;
          const primeiroPasso = getPrimeiroPasso(item);
          const linkHref = getCardLinkHref(item, companyId, assessmentId, planExists);
          const linkLabel = getCardLinkLabel(item);
          return (
            <button
              key={isSixPackItem(item) ? `sp-${idx}` : (item as Finding).id}
              onClick={() => onOpenDetail(item)}
              style={{
                textAlign: 'left',
                border: '1px solid #dee2e6',
                borderRadius: '8px',
                background: '#fff',
                padding: '1rem',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{tit}</div>
              <div style={{ fontSize: '0.9rem', marginBottom: '0.35rem' }}><strong>{labels.raioXWhatHappening}:</strong> {oQue || '—'}</div>
              <div style={{ fontSize: '0.9rem', marginBottom: '0.35rem' }}><strong>{labels.raioXCusto}:</strong> {custo || '—'}</div>
              <div style={{ fontSize: '0.9rem', marginBottom: '0.35rem' }}><strong>{labels.raioX30Dias}:</strong> {muda || '—'}</div>
              <div style={{ fontSize: '0.9rem', marginBottom: '0.35rem' }}><strong>{labels.raioXPrimeiroPasso}:</strong> {primeiroPasso}</div>
              <div style={{ marginTop: '0.75rem' }} onClick={(e) => e.stopPropagation()}>
                <Link
                  href={linkHref}
                  style={{
                    fontSize: '0.85rem',
                    color: '#0d6efd',
                    textDecoration: 'none',
                    fontWeight: 500,
                  }}
                >
                  {linkLabel} →
                </Link>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

