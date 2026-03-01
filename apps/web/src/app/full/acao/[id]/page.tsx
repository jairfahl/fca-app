'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { humanizeActionStatus, labels } from '@/lib/uiCopy';
import PedirApoioButton from '@/components/PedirApoioButton';
import PedirAjudaConsultor from '@/components/PedirAjudaConsultor';

function displayActionTitle(title: string): string {
  return title?.includes('Ação padrão') ? labels.fallbackAction : title || labels.fallbackAction;
}

import { apiFetch } from '@/lib/api';

type DashboardAction = {
  action_key: string;
  title: string;
  status: string;
  owner_name: string;
  metric_text: string;
  checkpoint_date: string;
  dod_checklist: string[];
  dod_confirmed: boolean;
  evidence_exists: boolean;
  before_baseline: string | null;
  after_result: string | null;
  declared_gain: string | null;
  cause_label?: string | null;
};

export default function FullAcaoPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
        <FullAcaoContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function FullAcaoContent() {
  const { user, session } = useAuth();
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const actionId = decodeURIComponent((params?.id as string) || '');
  const companyId = searchParams.get('company_id');
  const assessmentId = searchParams.get('assessment_id');

  const [state, setState] = useState<'loading' | 'ready' | 'saving' | 'error' | 'missing'>('loading');
  const [error, setError] = useState('');
  const [action, setAction] = useState<DashboardAction | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [evidenceText, setEvidenceText] = useState('');
  const [beforeText, setBeforeText] = useState('');
  const [afterText, setAfterText] = useState('');

  const load = async () => {
    if (!session?.access_token || !companyId || !assessmentId) return;
    try {
      setState('loading');
      const data = await apiFetch(
        `/full/assessments/${assessmentId}/dashboard?company_id=${companyId}`,
        {},
        session.access_token
      );
      const found = (data?.actions || []).find((a: DashboardAction) => a.action_key === actionId);
      if (!found) {
        setError('Ação não encontrada neste ciclo.');
        setState('error');
        return;
      }
      setAction(found);
      if (found.dod_confirmed) setChecked(found.dod_checklist || []);
      setState('ready');
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar ação');
      setState('error');
    }
  };

  useEffect(() => {
    if (!companyId || !assessmentId || !actionId) {
      setState('missing');
      return;
    }
    if (!session?.access_token) return;
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, assessmentId, actionId, session?.access_token]);

  const canSaveEvidence = useMemo(
    () => !!evidenceText.trim() && !!beforeText.trim() && !!afterText.trim() && !action?.evidence_exists,
    [evidenceText, beforeText, afterText, action?.evidence_exists]
  );

  const toggleDod = (item: string) => {
    setChecked((prev) => prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]);
  };

  const confirmDod = async () => {
    if (!session?.access_token || !companyId || !assessmentId || !action) return;
    try {
      setState('saving');
      await apiFetch(
        `/full/assessments/${assessmentId}/plan/${encodeURIComponent(action.action_key)}/dod/confirm?company_id=${companyId}`,
        { method: 'POST', body: { confirmed_items: checked } },
        session.access_token
      );
      await load();
    } catch (err: any) {
      setError(err?.message || 'Falha ao confirmar requisitos');
      setState('ready');
    }
  };

  const saveEvidence = async () => {
    if (!session?.access_token || !companyId || !assessmentId || !action || !canSaveEvidence) return;
    try {
      setState('saving');
      await apiFetch(
        `/full/cycle/actions/${encodeURIComponent(action.action_key)}/evidence?company_id=${companyId}`,
        {
          method: 'POST',
          body: {
            assessment_id: assessmentId,
            evidence_text: evidenceText.trim(),
            before_text: beforeText.trim(),
            after_text: afterText.trim(),
          },
        },
        session.access_token
      );
      await load();
    } catch (err: any) {
      setError(err?.message || 'Falha ao salvar evidência');
      setState('ready');
    }
  };

  const markDone = async () => {
    if (!session?.access_token || !companyId || !assessmentId || !action) return;
    try {
      setState('saving');
      await apiFetch(
        `/full/cycle/actions/${encodeURIComponent(action.action_key)}/mark-done?company_id=${companyId}`,
        { method: 'POST', body: { assessment_id: assessmentId, confirmed_items: checked } },
        session.access_token
      );
      router.push(`/full/dashboard?company_id=${companyId}&assessment_id=${assessmentId}`);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível marcar como concluído');
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
    <div style={{ padding: '2rem', maxWidth: '920px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1rem', color: '#666', fontSize: '0.9rem' }}>Logado como: {user?.email}</div>
      <div style={{ marginBottom: '1rem' }}>
        <Link
          href={companyId && assessmentId ? `/full/dashboard?company_id=${companyId}&assessment_id=${assessmentId}` : '/full/dashboard'}
          style={{ color: '#0d6efd', textDecoration: 'none' }}
        >
          ← Voltar ao dashboard
        </Link>
      </div>

      {state === 'loading' && <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando ação...</div>}
      {state === 'error' && <div style={{ padding: '1rem', borderRadius: '8px', background: '#f8d7da', color: '#721c24' }}>{error}</div>}

      {(state === 'ready' || state === 'saving') && action && (
        <>
          <h1 style={{ marginTop: 0 }}>{displayActionTitle(action.title)}</h1>
          {companyId && (
            <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <PedirAjudaConsultor companyId={companyId} />
              {assessmentId && (
                <PedirApoioButton
                  companyId={companyId}
                  assessmentId={assessmentId}
                  actionId={action.action_key}
                  actionTitle={displayActionTitle(action.title)}
                  label="Pedir apoio do consultor"
                />
              )}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
            <div><strong>Dono:</strong> {action.owner_name}</div>
            <div><strong>Métrica:</strong> {action.metric_text}</div>
            <div><strong>Checkpoint:</strong> {action.checkpoint_date}</div>
            <div><strong>Status:</strong> {humanizeActionStatus(action.status)}</div>
          </div>

          <section style={{ border: '1px solid #dee2e6', borderRadius: '8px', padding: '1rem', marginBottom: '1rem', background: '#fff' }}>
            <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>{labels.dod}</h2>
            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: '#6c757d' }}>{labels.doneRequiresChecklist}</p>
            {(action.dod_checklist || []).map((item) => (
              <label key={item} style={{ display: 'block', marginBottom: '0.4rem' }}>
                <input
                  type="checkbox"
                  checked={checked.includes(item)}
                  disabled={action.dod_confirmed}
                  onChange={() => toggleDod(item)}
                />{' '}
                {item}
              </label>
            ))}
            <button
              onClick={confirmDod}
              disabled={action.dod_confirmed || checked.length !== (action.dod_checklist || []).length}
              style={{
                border: 'none', borderRadius: '6px', padding: '0.5rem 0.9rem',
                background: action.dod_confirmed ? '#adb5bd' : '#0d6efd', color: '#fff'
              }}
            >
              {action.dod_confirmed ? labels.checklistConfirmed : labels.confirmDod}
            </button>
          </section>

          <section style={{ border: '1px solid #dee2e6', borderRadius: '8px', padding: '1rem', marginBottom: '1rem', background: '#fff' }}>
            <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Evidência Antes/Depois (write-once)</h2>
            {action.evidence_exists ? (
              <>
                <p><strong>Antes:</strong> {action.before_baseline}</p>
                <p><strong>Depois:</strong> {action.after_result}</p>
                <p><strong>Ganho declarado:</strong> {action.declared_gain || '-'}</p>
              </>
            ) : (
              <>
                {action.cause_label && (
                  <p style={{ marginBottom: '0.75rem', fontSize: '0.9rem', color: '#6c757d' }}>
                    Ação de mecanismo: use texto curto e métrica simples ({action.metric_text || 'métrica'}).
                  </p>
                )}
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>
                  Evidência
                  <textarea value={evidenceText} onChange={(e) => setEvidenceText(e.target.value)} rows={2} style={{ width: '100%', marginTop: '0.2rem' }} />
                </label>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>
                  Antes
                  <input
                    value={beforeText}
                    onChange={(e) => setBeforeText(e.target.value)}
                    placeholder={action.cause_label ? `Ex: 0 ${action.metric_text || 'métrica'}` : 'Ex: situação antes'}
                    style={{ width: '100%', marginTop: '0.2rem' }}
                  />
                </label>
                <label style={{ display: 'block', marginBottom: '0.7rem' }}>
                  Depois
                  <input
                    value={afterText}
                    onChange={(e) => setAfterText(e.target.value)}
                    placeholder={action.cause_label ? `Ex: 15 ${action.metric_text || 'métrica'}` : 'Ex: situação após'}
                    style={{ width: '100%', marginTop: '0.2rem' }}
                  />
                </label>
                <button
                  onClick={saveEvidence}
                  disabled={!canSaveEvidence}
                  style={{ border: 'none', borderRadius: '6px', padding: '0.5rem 0.9rem', background: canSaveEvidence ? '#198754' : '#adb5bd', color: '#fff' }}
                >
                  Salvar evidência
                </button>
              </>
            )}
          </section>

          <button
            onClick={markDone}
            disabled={!action.dod_confirmed || !action.evidence_exists || state === 'saving'}
            style={{
              border: 'none',
              borderRadius: '8px',
              padding: '0.75rem 1.1rem',
              background: (!action.dod_confirmed || !action.evidence_exists) ? '#adb5bd' : '#198754',
              color: '#fff',
              fontWeight: 700,
            }}
          >
            {labels.markDone}
          </button>
        </>
      )}
    </div>
  );
}

