'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import ConsultorBlock from '@/components/ConsultorBlock';
import { useAuth } from '@/lib/auth';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { humanizeLevelBand, labels } from '@/lib/uiCopy';
import SolicitarAjudaButton from '@/components/SolicitarAjudaButton';
import PedirAjudaConsultor from '@/components/PedirAjudaConsultor';

function displayActionTitle(title: string): string {
  return title?.includes('Ação padrão') ? labels.fallbackAction : title || labels.fallbackAction;
}

type WhyItem = { question_key: string; answer: number; label?: string };

type Suggestion = {
  process_key: string;
  band: string;
  nivel_ui?: string;
  action_key: string;
  title: string;
  benefit_text?: string;
  metric_hint?: string;
  dod_checklist?: string[];
  why?: WhyItem[];
  evidence_keys?: string[];
  is_gap_content?: boolean;
};

type DraftSelection = {
  action_key: string;
  title: string;
  process_key: string;
  owner_name: string;
  metric_text: string;
  checkpoint_date: string;
  position: number | '';
};

const PROCESS_LABELS: Record<string, string> = {
  COMERCIAL: 'Comercial',
  OPERACOES: 'Operações',
  ADM_FIN: 'Adm/Fin',
  GESTAO: 'Gestão',
};

export default function FullAcoesPage() {
  return (
    <ProtectedRoute>
      <ConsultorBlock>
        <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
          <FullAcoesContent />
        </Suspense>
      </ConsultorBlock>
    </ProtectedRoute>
  );
}

function FullAcoesContent() {
  const { user, session } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const companyId = searchParams.get('company_id');
  const assessmentId = searchParams.get('assessment_id');

  const [state, setState] = useState<'loading' | 'ready' | 'saving' | 'error' | 'missing'>('loading');
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState<string | undefined>();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [requiredCountFromApi, setRequiredCountFromApi] = useState<number>(3);
  const [remainingCountFromApi, setRemainingCountFromApi] = useState<number>(0);
  const [hasCauseCoverage, setHasCauseCoverage] = useState<boolean | null>(null);
  const [mechanismRequiredActionKeys, setMechanismRequiredActionKeys] = useState<string[]>([]);
  const [selected, setSelected] = useState<DraftSelection[]>([]);
  const [conteudoDefinicaoToast, setConteudoDefinicaoToast] = useState(false);
  const actionKeyRef = useRef<Record<string, HTMLButtonElement | null>>({});

  const focusActionKey = searchParams.get('action_key');
  const showConteudoDefinicao = searchParams.get('conteudo_definicao') === '1';

  useEffect(() => {
    if (showConteudoDefinicao) setConteudoDefinicaoToast(true);
  }, [showConteudoDefinicao]);

  const [resolvedAssessmentId, setResolvedAssessmentId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!session?.access_token || !companyId) {
        if (!companyId) setState('missing');
        return;
      }
      try {
        setState('loading');
        setError('');
        const qs = assessmentId
          ? `assessment_id=${assessmentId}&company_id=${companyId}`
          : `company_id=${companyId}`;
        const data = await apiFetch(
          `/full/actions?${qs}`,
          {},
          session.access_token
        );
        const aid = data?.assessment_id || assessmentId;
        if (aid && companyId) {
          try {
            const pendingRes = await apiFetch(
              `/full/causes/pending?assessment_id=${aid}&company_id=${companyId}`,
              {},
              session.access_token
            );
            const pendingList = pendingRes?.pending || [];
            if (pendingList.length > 0) {
              router.replace(`/full/resultados?company_id=${companyId}&assessment_id=${aid}&msg=cause_pending`);
              return;
            }
          } catch {
            // ignore - seguir para actions
          }
        }
        setSuggestions(data?.suggestions || []);
        const rc = typeof data?.required_count === 'number' ? data.required_count : Math.min(3, (data?.suggestions || []).length);
        const rem = typeof data?.remaining_count === 'number' ? data.remaining_count : (data?.suggestions || []).length;
        setRequiredCountFromApi(Math.max(1, Math.min(3, rc)));
        setRemainingCountFromApi(Math.max(0, rem));
        setHasCauseCoverage(typeof data?.has_cause_coverage === 'boolean' ? data.has_cause_coverage : null);
        setMechanismRequiredActionKeys(Array.isArray(data?.mechanism_required_action_keys) ? data.mechanism_required_action_keys : []);
        if (rem === 0 && companyId) {
          router.replace(aid ? `/full/dashboard?company_id=${companyId}&assessment_id=${aid}&msg=no_actions_left` : `/full/dashboard?company_id=${companyId}&msg=no_actions_left`);
          return;
        }
        if (aid && !assessmentId && typeof window !== 'undefined') {
          setResolvedAssessmentId(aid);
          const params = new URLSearchParams(window.location.search);
          params.set('assessment_id', aid);
          router.replace(`/full/acoes?${params.toString()}`, { scroll: false });
        } else {
          setResolvedAssessmentId(aid || assessmentId);
        }
        setState('ready');
      } catch (err: any) {
        if (err?.code === 'NO_ACTIONS_LEFT') {
          if (companyId) {
            router.replace(`/full/dashboard?company_id=${companyId}&assessment_id=${assessmentId || ''}&msg=no_actions_left`);
          }
          return;
        }
        if (err?.code === 'DIAG_NOT_READY') {
          const params = new URLSearchParams();
          if (companyId) params.set('company_id', companyId);
          if (assessmentId) params.set('assessment_id', assessmentId);
          params.set('msg', 'diag_incomplete');
          router.replace(`/full/wizard?${params.toString()}`);
          return;
        }
        setError(err?.message || 'Falha ao carregar ações');
        setErrorCode(err?.code);
        setState('error');
      }
    };
    load();
  }, [companyId, assessmentId, session?.access_token, focusActionKey]);

  useEffect(() => {
    if (state === 'ready' && focusActionKey && actionKeyRef.current[focusActionKey]) {
      actionKeyRef.current[focusActionKey]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [state, focusActionKey]);

  const selectedSet = useMemo(() => new Set(selected.map((s) => s.action_key)), [selected]);

  const requiredCount = requiredCountFromApi;
  const maxSelectable = requiredCount;
  const toggleSelect = (s: Suggestion) => {
    setError('');
    setSelected((prev) => {
      const exists = prev.find((p) => p.action_key === s.action_key);
      if (exists) return prev.filter((p) => p.action_key !== s.action_key);
      if (prev.length >= maxSelectable) {
        setError(requiredCount === 1 ? 'Esta ação já está selecionada.' : `Selecione exatamente ${maxSelectable} ação(ões).`);
        return prev;
      }
      return [
        ...prev,
        {
          action_key: s.action_key,
          title: s.title,
          process_key: s.process_key,
          owner_name: '',
          metric_text: s.metric_hint || '',
          checkpoint_date: '',
          position: (prev.length + 1) as number,
        },
      ];
    });
  };

  const updateField = (actionKey: string, field: keyof DraftSelection, value: string | number) => {
    setSelected((prev) => prev.map((item) => (
      item.action_key === actionKey ? { ...item, [field]: value } : item
    )));
  };

  const minSelectable = requiredCount;
  const canSubmit = selected.length === requiredCount && selected.every((s) =>
    s.owner_name.trim() &&
    s.metric_text.trim() &&
    s.checkpoint_date &&
    s.position !== '' &&
    Number(s.position) >= 1 &&
    Number(s.position) <= maxSelectable
  ) && new Set(selected.map((s) => Number(s.position))).size === selected.length;

  const handleSave = async () => {
    if (!session?.access_token || !companyId || !effectiveAssessmentId || !canSubmit) return;
    try {
      setState('saving');
      setError('');
      await apiFetch(
        `/full/plan?company_id=${companyId}`,
        {
          method: 'POST',
          body: {
            assessment_id: effectiveAssessmentId,
            company_id: companyId,
            actions: selected.map((s) => ({
              action_key: s.action_key,
              owner_name: s.owner_name.trim(),
              metric_text: s.metric_text.trim(),
              checkpoint_date: s.checkpoint_date,
              position: Number(s.position),
            })),
          },
        },
        session.access_token
      );
      router.push(`/full/dashboard?company_id=${companyId}&assessment_id=${effectiveAssessmentId}`);
    } catch (err: any) {
      if (err?.code === 'NO_ACTIONS_LEFT' && companyId && effectiveAssessmentId) {
        router.replace(`/full/dashboard?company_id=${companyId}&assessment_id=${effectiveAssessmentId}&msg=no_actions_left`);
        return;
      }
      if (err?.code === 'MECHANISM_ACTION_REQUIRED' && Array.isArray((err as any).mechanism_action_keys)) {
        setMechanismRequiredActionKeys((err as any).mechanism_action_keys);
      }
      setError(err?.message || 'Falha ao salvar plano');
      setErrorCode(err?.code);
      setState('ready');
    }
  };

  const effectiveAssessmentId = assessmentId || resolvedAssessmentId;
  const isDiagNotReady = state === 'error' && errorCode === 'DIAG_NOT_READY';

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
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem', alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>{labels.planMinimal}</h1>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {companyId && <PedirAjudaConsultor companyId={companyId} />}
          <Link
            href={state === 'error' && companyId ? `/full?company_id=${companyId}` : (companyId && effectiveAssessmentId ? `/full/resultados?company_id=${companyId}&assessment_id=${effectiveAssessmentId}` : '/full/resultados')}
            style={{ background: '#6c757d', color: '#fff', padding: '0.5rem 1rem', borderRadius: '6px', textDecoration: 'none' }}
          >
            {state === 'error' ? 'Voltar ao FULL' : 'Voltar aos resultados'}
          </Link>
        </div>
      </div>

      {state === 'loading' && <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando sugestões...</div>}
      {state === 'error' && (
        <div style={{ padding: '1rem', borderRadius: '8px', background: '#f8d7da', color: '#721c24', marginBottom: '1rem' }}>
          {isDiagNotReady ? labels.diagNotReadyMessage : error}
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Link
              href={companyId ? `/full/wizard?company_id=${companyId}` : '/full'}
              style={{ background: '#0d6efd', color: '#fff', padding: '0.5rem 1rem', borderRadius: '6px', textDecoration: 'none', fontWeight: 600 }}
              data-testid="cta-back-to-full-diagnostic"
            >
              Voltar ao diagnóstico
            </Link>
            {!isDiagNotReady && (
              <Link
                href={companyId ? `/full?company_id=${companyId}` : '/full'}
                style={{ background: '#6c757d', color: '#fff', padding: '0.5rem 1rem', borderRadius: '6px', textDecoration: 'none', fontWeight: 600 }}
              >
                Voltar
              </Link>
            )}
          </div>
        </div>
      )}
      {(state === 'ready' || state === 'saving') && (
        <>
          {conteudoDefinicaoToast && (
            <div
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                background: '#fff3cd',
                color: '#856404',
                marginBottom: '1rem',
                border: '1px solid #ffc107',
              }}
            >
              {labels.conteudoEmDefinicao}
              <button
                onClick={() => setConteudoDefinicaoToast(false)}
                style={{ marginLeft: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
          )}

          {hasCauseCoverage === false && (
            <div
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                background: '#e7f3ff',
                color: '#084298',
                marginBottom: '1rem',
                border: '1px solid #b6d4fe',
              }}
            >
              Cobertura parcial do método: nenhum gap priorizado teve causa classificada. As escolhas abaixo são válidas.
            </div>
          )}

          {mechanismRequiredActionKeys.length > 0 && (
            <div
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                background: '#fff3cd',
                color: '#856404',
                marginBottom: '1rem',
                border: '1px solid #ffc107',
              }}
            >
              <strong>Inclua pelo menos uma ação do mecanismo indicado:</strong>{' '}
              {mechanismRequiredActionKeys
                .map((key) => suggestions.find((s) => s.action_key === key)?.title || key)
                .filter(Boolean)
                .join(', ')}
              {mechanismRequiredActionKeys.some((k) => !suggestions.find((s) => s.action_key === k)) && (
                <span style={{ fontSize: '0.9rem' }}> (ações marcadas com "Obrigatório" abaixo)</span>
              )}
            </div>
          )}

          {suggestions.length > 0 && (
            <>
              {error && <div style={{ padding: '1rem', borderRadius: '8px', background: '#f8d7da', color: '#721c24', marginBottom: '1rem' }}>{error}</div>}
              {suggestions.length < 4 && (
                <div style={{ padding: '1rem', border: '1px solid #b6d4fe', borderRadius: '8px', background: '#e7f3ff', marginBottom: '1.25rem' }}>
                  {labels.fewerActionsExplain}
                </div>
              )}
              <div style={{ padding: '1rem', border: '1px solid #dee2e6', borderRadius: '8px', background: '#f8f9fa', marginBottom: '1.25rem' }}>
                Selecione exatamente {requiredCount} {requiredCount === 1 ? 'ação' : 'ações'} para os próximos 30 dias. Preencha Dono, Métrica, Checkpoint e Ordem para cada ação.
              </div>

              <h2 style={{ marginBottom: '0.75rem' }}>Recomendações com encaixe claro</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
                {suggestions.map((s) => {
                  const checked = selectedSet.has(s.action_key);
                  const isFocused = s.action_key === focusActionKey;
                  const isMechanismRequired = mechanismRequiredActionKeys.includes(s.action_key);
                  const whyText = s.why?.length ? `Por que apareceu: ${s.why.map((w) => `${w.label || w.question_key} (${w.answer}/10)`).join('; ')}` : null;
                  return (
                    <button
                      key={s.action_key}
                      ref={(el) => { actionKeyRef.current[s.action_key] = el; }}
                      onClick={() => toggleSelect(s)}
                      style={{
                        border: checked ? '2px solid #0d6efd' : isFocused ? '2px solid #198754' : isMechanismRequired ? '2px solid #ffc107' : '1px solid #dee2e6',
                        background: isFocused ? '#e7f5ec' : isMechanismRequired ? '#fffbf0' : '#fff',
                        borderRadius: '8px',
                        padding: '0.9rem',
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontSize: '0.8rem', color: '#6c757d', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {(PROCESS_LABELS[s.process_key] || s.process_key)} · {humanizeLevelBand(s.nivel_ui || s.band)}
                        {isMechanismRequired && (
                          <span style={{ background: '#ffc107', color: '#856404', padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600 }}>
                            Obrigatório
                          </span>
                        )}
                      </div>
                      <div style={{ fontWeight: 600 }}>{s.title}</div>
                      {s.benefit_text && <div style={{ marginTop: '0.35rem', color: '#555', fontSize: '0.9rem' }}>{s.benefit_text}</div>}
                      {whyText && <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#6c757d' }}>{whyText}</div>}
                    </button>
                  );
                })}
              </div>

              <h2 style={{ marginBottom: '0.75rem' }}>Ações selecionadas ({selected.length}/{maxSelectable})</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                {selected.map((s) => (
                  <div key={s.action_key} style={{ border: '1px solid #dee2e6', borderRadius: '8px', padding: '1rem', background: '#fff' }}>
                    <div style={{ fontWeight: 600, marginBottom: '0.65rem' }}>{s.title}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.65rem' }}>
                      <label style={{ fontSize: '0.9rem' }}>
                        Dono
                    <input
                      type="text"
                      value={s.owner_name}
                      onChange={(e) => updateField(s.action_key, 'owner_name', e.target.value)}
                          style={{ width: '100%', marginTop: '0.2rem', padding: '0.45rem', borderRadius: '6px', border: '1px solid #ced4da' }}
                      />
                      </label>
                      <label style={{ fontSize: '0.9rem' }}>
                        Métrica
                    <input
                      type="text"
                      value={s.metric_text}
                      onChange={(e) => updateField(s.action_key, 'metric_text', e.target.value)}
                      style={{ width: '100%', marginTop: '0.2rem', padding: '0.45rem', borderRadius: '6px', border: '1px solid #ced4da' }}
                    />
                  </label>
                  <label style={{ fontSize: '0.9rem' }}>
                    Checkpoint
                    <input
                      type="date"
                      value={s.checkpoint_date}
                      onChange={(e) => updateField(s.action_key, 'checkpoint_date', e.target.value)}
                      style={{ width: '100%', marginTop: '0.2rem', padding: '0.45rem', borderRadius: '6px', border: '1px solid #ced4da' }}
                    />
                  </label>
                  <label style={{ fontSize: '0.9rem' }}>
                    Ordem (1..{maxSelectable})
                    <input
                      type="number"
                      min={1}
                      max={maxSelectable}
                      value={s.position}
                      onChange={(e) => updateField(s.action_key, 'position', e.target.value ? Number(e.target.value) : '')}
                      style={{ width: '100%', marginTop: '0.2rem', padding: '0.45rem', borderRadius: '6px', border: '1px solid #ced4da' }}
                    />
                  </label>
                    </div>
                  </div>
                ))}
            </div>

            <div style={{ marginTop: '1.25rem' }}>
              <button
                onClick={handleSave}
                disabled={!canSubmit || state === 'saving'}
                style={{
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0.75rem 1.25rem',
                  background: canSubmit ? '#198754' : '#adb5bd',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                }}
              >
                {state === 'saving' ? 'Salvando...' : (requiredCount < 3 ? 'Iniciar execução' : 'Assinar plano mínimo')}
              </button>
            </div>
          </>
          )}
          {suggestions.length === 0 && (
            <p style={{ color: '#6c757d', marginTop: '1rem' }}>
              <Link
                href={companyId && effectiveAssessmentId ? `/full/resultados?company_id=${companyId}&assessment_id=${effectiveAssessmentId}` : '/full/resultados'}
                style={{ color: '#0d6efd', textDecoration: 'none' }}
              >
                Ver resultados
              </Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}

