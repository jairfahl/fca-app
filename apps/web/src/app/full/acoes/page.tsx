'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { humanizeBand, labels } from '@/lib/uiCopy';

type Suggestion = {
  process_key: string;
  band: string;
  action_key: string;
  title: string;
  benefit_text?: string;
  metric_hint?: string;
  dod_checklist?: string[];
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
      <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
        <FullAcoesContent />
      </Suspense>
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
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<DraftSelection[]>([]);
  const [conteudoDefinicaoToast, setConteudoDefinicaoToast] = useState(false);
  const actionKeyRef = useRef<Record<string, HTMLButtonElement | null>>({});

  const focusActionKey = searchParams.get('action_key');
  const showConteudoDefinicao = searchParams.get('conteudo_definicao') === '1';

  useEffect(() => {
    if (showConteudoDefinicao) setConteudoDefinicaoToast(true);
  }, [showConteudoDefinicao]);

  useEffect(() => {
    const load = async () => {
      if (!session?.access_token) return;
      if (!companyId || !assessmentId) {
        setState('missing');
        return;
      }
      try {
        setState('loading');
        const data = await apiFetch(
          `/full/actions?assessment_id=${assessmentId}&company_id=${companyId}`,
          {},
          session.access_token
        );
        setSuggestions(data?.suggestions || []);
        setState('ready');
      } catch (err: any) {
        setError(err?.message || 'Falha ao carregar ações');
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

  const toggleSelect = (s: Suggestion) => {
    setError('');
    setSelected((prev) => {
      const exists = prev.find((p) => p.action_key === s.action_key);
      if (exists) return prev.filter((p) => p.action_key !== s.action_key);
      if (prev.length >= 3) {
        setError('Selecione exatamente 3 ações.');
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

  const canSubmit = selected.length === 3 && selected.every((s) =>
    s.owner_name.trim() &&
    s.metric_text.trim() &&
    s.checkpoint_date &&
    s.position !== '' &&
    Number(s.position) >= 1 &&
    Number(s.position) <= 3
  ) && new Set(selected.map((s) => Number(s.position))).size === 3;

  const handleSave = async () => {
    if (!session?.access_token || !companyId || !assessmentId || !canSubmit) return;
    try {
      setState('saving');
      setError('');
      await apiFetch(
        `/full/plan?company_id=${companyId}`,
        {
          method: 'POST',
          body: {
            assessment_id: assessmentId,
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
      router.push(`/full/dashboard?company_id=${companyId}&assessment_id=${assessmentId}`);
    } catch (err: any) {
      setError(err?.message || 'Falha ao salvar plano de 3 ações');
      setState('ready');
    }
  };

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
        <h1 style={{ margin: 0 }}>{labels.planMinimal}</h1>
        <Link
          href={companyId && assessmentId ? `/full/resultados?company_id=${companyId}&assessment_id=${assessmentId}` : '/full/resultados'}
          style={{ background: '#6c757d', color: '#fff', padding: '0.5rem 1rem', borderRadius: '6px', textDecoration: 'none' }}
        >
          Voltar aos resultados
        </Link>
      </div>

      {state === 'loading' && <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando sugestões...</div>}
      {state === 'error' && <div style={{ padding: '1rem', borderRadius: '8px', background: '#f8d7da', color: '#721c24' }}>{error}</div>}
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
          {error && <div style={{ padding: '1rem', borderRadius: '8px', background: '#f8d7da', color: '#721c24', marginBottom: '1rem' }}>{error}</div>}
          <div style={{ padding: '1rem', border: '1px solid #b6d4fe', borderRadius: '8px', background: '#e7f3ff', marginBottom: '1.25rem' }}>
            Selecione exatamente 3 ações e preencha Dono, Métrica, Checkpoint e Ordem (1 a 3).
          </div>

          <h2 style={{ marginBottom: '0.75rem' }}>Sugestões determinísticas</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
            {suggestions.map((s) => {
              const checked = selectedSet.has(s.action_key);
              const isFocused = s.action_key === focusActionKey;
              return (
                <button
                  key={s.action_key}
                  ref={(el) => { actionKeyRef.current[s.action_key] = el; }}
                  onClick={() => toggleSelect(s)}
                  style={{
                    border: checked ? '2px solid #0d6efd' : isFocused ? '2px solid #198754' : '1px solid #dee2e6',
                    background: isFocused ? '#e7f5ec' : '#fff',
                    borderRadius: '8px',
                    padding: '0.9rem',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: '0.8rem', color: '#6c757d' }}>
                    {(PROCESS_LABELS[s.process_key] || s.process_key)} · {humanizeBand(s.band)}
                  </div>
                  <div style={{ fontWeight: 600 }}>{s.title}</div>
                  {s.benefit_text && <div style={{ marginTop: '0.35rem', color: '#555', fontSize: '0.9rem' }}>{s.benefit_text}</div>}
                </button>
              );
            })}
          </div>

          <h2 style={{ marginBottom: '0.75rem' }}>Ações selecionadas ({selected.length}/3)</h2>
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
                    Ordem (1..3)
                    <input
                      type="number"
                      min={1}
                      max={3}
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
              {state === 'saving' ? 'Assinando...' : 'Assinar plano mínimo'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

