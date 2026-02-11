'use client';

import { useCallback, useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';

interface FreeAction {
  id: string;
  assessment_id: string;
  recommendation_id: string;
  process: string;
  status: 'ACTIVE' | 'COMPLETED';
  created_at: string;
  completed_at: string | null;
  recommendation: {
    title: string;
    checklist: string[];
  };
  evidence: {
    evidence_text: string;
    created_at: string;
    declared_gain_type?: string | null;
    declared_gain_note?: string | null;
    done_criteria_json?: string[] | null;
  } | null;
}

interface LightActionPlan {
  id: string;
  assessment_id: string;
  company_id: string;
  process: string;
  assessment_free_action_id?: string | null;
  free_action_id: string;
  step_1: string;
  step_2: string;
  step_3: string;
  owner_name: string;
  metric: string;
  checkpoint_date: string;
  locked?: boolean;
  created_at: string;
  updated_at: string;
}

export default function FreeActionPage() {
  return (
    <ProtectedRoute>
      <FreeActionContent />
    </ProtectedRoute>
  );
}

function FreeActionContent() {
  const { user, session } = useAuth();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const freeActionId = params.id as string;
  const companyId = searchParams.get('company_id');
  const assessmentId = searchParams.get('assessment_id');

  const [loading, setLoading] = useState(true);
  const [freeAction, setFreeAction] = useState<FreeAction | null>(null);
  const [resolvedCompanyId, setResolvedCompanyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [evidenceText, setEvidenceText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [plan, setPlan] = useState<LightActionPlan | null>(null);
  const [planForm, setPlanForm] = useState({
    step_1: '',
    step_2: '',
    step_3: '',
    owner_name: '',
    metric: '',
    checkpoint_date: '',
  });
  const [planError, setPlanError] = useState('');
  const [planSubmitting, setPlanSubmitting] = useState(false);
  const [planSavedMessage, setPlanSavedMessage] = useState('');
  const [progressForm, setProgressForm] = useState({
    criteria: [
      { text: '', done: false },
      { text: '', done: false },
      { text: '', done: false },
    ],
    declared_gain_type: '',
    declared_gain_note: '',
  });
  const [progressError, setProgressError] = useState('');

  const loadFreeAction = useCallback(async () => {
    if (!freeActionId || !session?.access_token) {
      return;
    }

    try {
      setLoading(true);
      setLoadError('');
      setError('');
      const data = await apiFetch(
        `/free-actions/${freeActionId}`,
        {},
        session.access_token
      );
      setFreeAction(data);
      if (data.evidence) {
        setEvidenceText(data.evidence.evidence_text);
      }
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 401) {
        router.push('/login');
        return;
      }
      setLoadError(err.message || 'Erro ao carregar evidência');
    } finally {
      setLoading(false);
    }
  }, [freeActionId, session?.access_token, router]);

  useEffect(() => {
    loadFreeAction();
  }, [loadFreeAction]);

  // Refresh-safe: obter company_id do assessment quando não vem na URL
  useEffect(() => {
    const aid = assessmentId || freeAction?.assessment_id;
    if (!aid || !session?.access_token || companyId) {
      return;
    }
    let cancelled = false;
    apiFetch(`/assessments/${aid}`, {}, session.access_token)
      .then((data: any) => {
        if (cancelled) return;
        const cid = data?.assessment?.company_id;
        if (cid) setResolvedCompanyId(cid);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [assessmentId, freeAction?.assessment_id, session?.access_token, companyId]);

  const effectiveCompanyId = companyId || resolvedCompanyId;
  const loadLightPlan = useCallback(async () => {
    if (!session?.access_token || !effectiveCompanyId) {
      return;
    }
    const effectiveAssessmentId = assessmentId || freeAction?.assessment_id;
    if (!effectiveAssessmentId) return;

    try {
      const data = await apiFetch(
        `/light/plans?assessment_id=${effectiveAssessmentId}&company_id=${effectiveCompanyId}`,
        {},
        session.access_token
      );
      const plans = Array.isArray(data) ? data : (data?.plans || []);
      const planFound = plans.find((item: LightActionPlan) => item.free_action_id === freeActionId) || null;
      setPlan(planFound);
      if (planFound) {
        setPlanForm({
          step_1: planFound.step_1 || '',
          step_2: planFound.step_2 || '',
          step_3: planFound.step_3 || '',
          owner_name: planFound.owner_name || '',
          metric: planFound.metric || '',
          checkpoint_date: planFound.checkpoint_date || '',
        });
      }
    } catch {
      // ignore: plano não é crítico para render
    }
  }, [assessmentId, effectiveCompanyId, freeAction?.assessment_id, freeActionId, session?.access_token]);

  useEffect(() => {
    loadLightPlan();
  }, [loadLightPlan]);

  useEffect(() => {
    if (!freeAction?.evidence) return;
    const evidence = freeAction.evidence;
    const doneList = Array.isArray(evidence.done_criteria_json) ? evidence.done_criteria_json : [];
    setProgressForm({
      criteria: [
        { text: doneList[0] || '', done: !!doneList[0] },
        { text: doneList[1] || '', done: !!doneList[1] },
        { text: doneList[2] || '', done: !!doneList[2] },
      ],
      declared_gain_type: evidence.declared_gain_type || '',
      declared_gain_note: evidence.declared_gain_note || '',
    });
  }, [freeAction?.evidence]);

  const handlePlanChange = (field: keyof typeof planForm, value: string) => {
    setPlanForm((prev) => ({
      ...prev,
      [field]: value,
    }));
    setPlanError('');
    setPlanSavedMessage('');
  };

  const handleProgressChange = (index: number, field: 'text' | 'done', value: string | boolean) => {
    setProgressForm((prev) => {
      const next = [...prev.criteria];
      next[index] = { ...next[index], [field]: value };
      return { ...prev, criteria: next };
    });
    setProgressError('');
  };

  const handleSavePlan = async () => {
    if (!session?.access_token || !effectiveCompanyId || !freeAction) return;
    const requiredFields = Object.values(planForm).every((value) => value.trim().length > 0);
    if (!requiredFields) {
      setPlanError('Preencha todos os campos do plano.');
      return;
    }

    try {
      setPlanSubmitting(true);
      setPlanError('');
      setPlanSavedMessage('');
      const payload = {
        assessment_id: freeAction.assessment_id,
        company_id: effectiveCompanyId,
        process: freeAction.process,
        free_action_id: freeAction.id,
        step_1: planForm.step_1.trim(),
        step_2: planForm.step_2.trim(),
        step_3: planForm.step_3.trim(),
        owner_name: planForm.owner_name.trim(),
        metric: planForm.metric.trim(),
        checkpoint_date: planForm.checkpoint_date,
      };
      // AUDIT(LITE): plan must be saved before evidence can be submitted.
      const saved = await apiFetch('/light/plans', { method: 'POST', body: payload }, session.access_token);
      if (saved?.step_1 !== undefined) {
        setPlan(saved);
      }
      setPlanSavedMessage(saved?.already_exists ? 'Plano já existente.' : 'Plano 30d salvo.');
    } catch (err: any) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setPlanError('Evidência já registrada. Plano bloqueado.');
        } else {
          setPlanError(err.message || 'Erro ao salvar plano.');
        }
      } else {
        setPlanError(err.message || 'Erro ao salvar plano.');
      }
    } finally {
      setPlanSubmitting(false);
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setProgressError('');
    if (!evidenceText.trim() || !session?.access_token) {
      setError('Evidência é obrigatória');
      return;
    }
    if (!plan) {
      setError('Salve o plano 30d antes de registrar evidência.');
      return;
    }

    const doneCriteria = progressForm.criteria
      .filter((item) => item.done && item.text.trim().length > 0)
      .map((item) => item.text.trim());

    if (doneCriteria.length < 2) {
      setProgressError('Marque pelo menos 2 itens de progresso.');
      return;
    }
    if (!progressForm.declared_gain_type.trim() || !progressForm.declared_gain_note.trim()) {
      setProgressError('Informe o ganho declarado e a descrição.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      setSuccessMessage('');

      // AUDIT(LITE): evidence is write-once and includes declared gain + criteria.
      await apiFetch(
        `/free-actions/${freeActionId}/evidence`,
        {
          method: 'POST',
          body: {
            evidence_text: evidenceText.trim(),
            declared_gain_type: progressForm.declared_gain_type.trim(),
            declared_gain_note: progressForm.declared_gain_note.trim(),
            done_criteria_json: doneCriteria,
          },
        },
        session.access_token
      );

      setSuccessMessage('Evidência registrada com sucesso!');
      
      // Recarregar dados para mostrar status COMPLETED
      const data = await apiFetch(
        `/free-actions/${freeActionId}`,
        {},
        session.access_token
      );
      setFreeAction(data);
      if (data.evidence) {
        setEvidenceText(data.evidence.evidence_text);
      }
      setPlan((prev) => (prev ? { ...prev, locked: true } : prev));
    } catch (err: any) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          router.push('/login');
          return;
        }
        if (err.status === 409) {
          setError('Evidência já registrada.');
        } else {
          setError(err.message || 'Erro ao registrar evidência');
        }
      } else {
        setError(err.message || 'Erro ao registrar evidência');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center' }}>Carregando ação gratuita...</div>
      </div>
    );
  }

  const effectiveAssessmentId = assessmentId || freeAction?.assessment_id;
  const backToRecommendations = effectiveAssessmentId
    ? `/recommendations?assessment_id=${effectiveAssessmentId}${effectiveCompanyId ? `&company_id=${effectiveCompanyId}` : ''}`
    : '/recommendations';
  const backToResults = effectiveAssessmentId
    ? `/results?assessment_id=${effectiveAssessmentId}${effectiveCompanyId ? `&company_id=${effectiveCompanyId}` : ''}`
    : '/results';

  if (!freeAction) {
    if (loadError) {
      return (
        <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
          <h1 style={{ marginBottom: '0.25rem' }}>Evidência</h1>
          <p style={{ marginBottom: '0.5rem', color: '#666' }}>
            Registre o que foi feito e como você comprova.
          </p>
          <div style={{
            padding: '0.75rem',
            backgroundColor: '#fff3cd',
            color: '#856404',
            borderRadius: '6px',
            marginBottom: '1rem',
            fontSize: '0.9rem'
          }}>
            Não foi possível carregar evidência anterior. Você pode salvar uma nova evidência.
          </div>
          <form id="evidence-form-fallback" onSubmit={handleSubmit}>
            <textarea
              value={evidenceText}
              onChange={(e) => setEvidenceText(e.target.value)}
              placeholder="Ex.: criei planilha X, defini rotina Y, anexei print Z..."
              rows={6}
              disabled={submitting}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '0.875rem',
                fontFamily: 'inherit',
                resize: 'vertical',
                marginBottom: '1rem'
              }}
            />
            {error && (
              <div style={{
                padding: '0.5rem 0.75rem',
                backgroundColor: '#f8d7da',
                color: '#721c24',
                borderRadius: '4px',
                marginBottom: '1rem',
                fontSize: '0.875rem'
              }}>
                {error}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                type="submit"
                disabled={submitting || !evidenceText.trim()}
                style={{
                  backgroundColor: submitting || !evidenceText.trim() ? '#9ca3af' : '#0070f3',
                  color: '#fff',
                  border: 'none',
                  padding: '0.75rem 1.25rem',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  cursor: submitting || !evidenceText.trim() ? 'not-allowed' : 'pointer'
                }}
              >
                {submitting ? 'Salvando...' : 'Salvar evidência'}
              </button>
              <Link
                href={backToRecommendations}
                style={{
                  display: 'inline-block',
                  backgroundColor: '#e9ecef',
                  color: '#333',
                  padding: '0.75rem 1.25rem',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  fontWeight: 'bold'
                }}
              >
                Voltar para Recomendações
              </Link>
              <Link
                href={backToResults}
                style={{
                  display: 'inline-block',
                  backgroundColor: '#e9ecef',
                  color: '#333',
                  padding: '0.75rem 1.25rem',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  fontWeight: 'bold'
                }}
              >
                Voltar para Resultados
              </Link>
            </div>
          </form>
        </div>
      );
    }

    return (
      <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ color: '#dc3545' }}>Ação gratuita não encontrada.</div>
        <Link href="/diagnostico" style={{ color: '#0070f3' }}>Voltar ao Diagnóstico</Link>
      </div>
    );
  }

  const isCompleted = freeAction.status === 'COMPLETED';
  const hasEvidence = freeAction.evidence !== null;
  const hasPlan = !!plan;
  const lockPlanAndProgress = hasEvidence || isCompleted || !!plan?.locked;
  const lockProgress = lockPlanAndProgress;
  const doneCriteriaCount = progressForm.criteria.filter((item) => item.done && item.text.trim().length > 0).length;
  const progressReady = doneCriteriaCount >= 2 && progressForm.declared_gain_type.trim() && progressForm.declared_gain_note.trim();
  const canSubmitEvidence = hasPlan && progressReady && !lockPlanAndProgress;
  const evidenceHasGain = hasEvidence && !!freeAction.evidence?.declared_gain_type && !!freeAction.evidence?.declared_gain_note;
  const evidenceHasCriteria = hasEvidence && Array.isArray(freeAction.evidence?.done_criteria_json) && freeAction.evidence!.done_criteria_json!.length > 0;

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1rem', color: '#666' }}>
        Logado como: {user?.email}
      </div>

      <h1 style={{ marginBottom: '0.25rem' }}>Evidência</h1>
      <p style={{ marginBottom: '1.5rem', color: '#666' }}>
        Registre o que foi feito e como você comprova.
      </p>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        {!isCompleted && (
          <button
            type="submit"
            form="evidence-form"
            disabled={submitting || !evidenceText.trim() || !canSubmitEvidence}
            style={{
              backgroundColor: submitting || !evidenceText.trim() || !canSubmitEvidence ? '#9ca3af' : '#0070f3',
              color: '#fff',
              border: 'none',
              padding: '0.75rem 1.25rem',
              borderRadius: '8px',
              fontWeight: 'bold',
              cursor: submitting || !evidenceText.trim() || !canSubmitEvidence ? 'not-allowed' : 'pointer'
            }}
          >
            {submitting ? 'Salvando...' : 'Salvar evidência'}
          </button>
        )}
        <Link
          href={backToRecommendations}
          style={{
            display: 'inline-block',
            backgroundColor: '#e9ecef',
            color: '#333',
            padding: '0.75rem 1.25rem',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: 'bold'
          }}
        >
          Voltar para Recomendações
        </Link>
        <Link
          href={backToResults}
          style={{
            display: 'inline-block',
            backgroundColor: '#e9ecef',
            color: '#333',
            padding: '0.75rem 1.25rem',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: 'bold'
          }}
        >
          Voltar para Resultados
        </Link>
      </div>

      {error && (
        <div style={{
          padding: '1rem',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          borderRadius: '4px',
          marginBottom: '1rem'
        }}>
          {error}
        </div>
      )}

      {successMessage && (
        <div style={{
          padding: '1rem',
          backgroundColor: '#d4edda',
          color: '#155724',
          borderRadius: '4px',
          marginBottom: '1rem'
        }}>
          {successMessage}
        </div>
      )}

      <div style={{
        border: '1px solid #ddd',
        borderRadius: '8px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
        backgroundColor: '#fff'
      }}>
        <div style={{ marginBottom: '1rem' }}>
          <span style={{
            backgroundColor: '#e9ecef',
            padding: '0.25rem 0.5rem',
            borderRadius: '4px',
            fontSize: '0.875rem',
            marginRight: '0.5rem'
          }}>
            {freeAction.process}
          </span>
          {isCompleted && (
            <span style={{
              backgroundColor: '#28a745',
              color: '#fff',
              padding: '0.25rem 0.5rem',
              borderRadius: '4px',
              fontSize: '0.875rem',
              fontWeight: 'bold'
            }}>
              ✓ Concluída
            </span>
          )}
        </div>

        <h2 style={{ marginBottom: '1rem' }}>{freeAction.recommendation.title}</h2>

        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>Checklist:</h3>
          <ul style={{ marginLeft: '1.5rem', color: '#666' }}>
            {freeAction.recommendation.checklist.map((item, idx) => (
              <li key={idx} style={{ marginBottom: '0.25rem' }}>{item}</li>
            ))}
          </ul>
        </div>

        <div style={{
          display: 'flex',
          gap: '0.75rem',
          flexWrap: 'wrap',
          marginBottom: '1.5rem'
        }}>
          <div style={{
            padding: '0.5rem 0.75rem',
            borderRadius: '999px',
            backgroundColor: hasPlan ? '#d4edda' : '#f8d7da',
            color: hasPlan ? '#155724' : '#721c24',
            fontSize: '0.85rem',
            fontWeight: 'bold'
          }}>
            Plano {hasPlan ? 'OK' : 'pendente'}
          </div>
          <div style={{
            padding: '0.5rem 0.75rem',
            borderRadius: '999px',
            backgroundColor: evidenceHasGain && evidenceHasCriteria ? '#d4edda' : '#f8d7da',
            color: evidenceHasGain && evidenceHasCriteria ? '#155724' : '#721c24',
            fontSize: '0.85rem',
            fontWeight: 'bold'
          }}>
            Ganho {evidenceHasGain && evidenceHasCriteria ? 'OK' : 'pendente'}
          </div>
          <div style={{
            padding: '0.5rem 0.75rem',
            borderRadius: '999px',
            backgroundColor: hasEvidence ? '#d4edda' : '#f8d7da',
            color: hasEvidence ? '#155724' : '#721c24',
            fontSize: '0.85rem',
            fontWeight: 'bold'
          }}>
            Evidência {hasEvidence ? 'OK' : 'pendente'}
          </div>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>
            Plano 30 dias {hasPlan && '(já criado)'}
          </h3>
          <p style={{ marginBottom: '1rem', color: '#666' }}>
            Defina 3 passos, responsável, métrica e data de checkpoint.
          </p>
          {planError && (
            <div style={{
              padding: '0.5rem 0.75rem',
              backgroundColor: '#f8d7da',
              color: '#721c24',
              borderRadius: '4px',
              marginBottom: '0.75rem',
              fontSize: '0.875rem'
            }}>
              {planError}
            </div>
          )}
          {planSavedMessage && (
            <div style={{
              padding: '0.5rem 0.75rem',
              backgroundColor: '#d4edda',
              color: '#155724',
              borderRadius: '4px',
              marginBottom: '0.75rem',
              fontSize: '0.875rem'
            }}>
              {planSavedMessage}
            </div>
          )}
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <input
              type="text"
              placeholder="Passo 1"
              value={planForm.step_1}
              onChange={(e) => handlePlanChange('step_1', e.target.value)}
              disabled={lockPlanAndProgress}
              style={{
                padding: '0.6rem',
                borderRadius: '6px',
                border: '1px solid #ddd',
                fontSize: '0.9rem'
              }}
            />
            <input
              type="text"
              placeholder="Passo 2"
              value={planForm.step_2}
              onChange={(e) => handlePlanChange('step_2', e.target.value)}
              disabled={lockPlanAndProgress}
              style={{
                padding: '0.6rem',
                borderRadius: '6px',
                border: '1px solid #ddd',
                fontSize: '0.9rem'
              }}
            />
            <input
              type="text"
              placeholder="Passo 3"
              value={planForm.step_3}
              onChange={(e) => handlePlanChange('step_3', e.target.value)}
              disabled={lockPlanAndProgress}
              style={{
                padding: '0.6rem',
                borderRadius: '6px',
                border: '1px solid #ddd',
                fontSize: '0.9rem'
              }}
            />
            <input
              type="text"
              placeholder="Responsável"
              value={planForm.owner_name}
              onChange={(e) => handlePlanChange('owner_name', e.target.value)}
              disabled={lockPlanAndProgress}
              style={{
                padding: '0.6rem',
                borderRadius: '6px',
                border: '1px solid #ddd',
                fontSize: '0.9rem'
              }}
            />
            <input
              type="text"
              placeholder="Métrica de sucesso"
              value={planForm.metric}
              onChange={(e) => handlePlanChange('metric', e.target.value)}
              disabled={lockPlanAndProgress}
              style={{
                padding: '0.6rem',
                borderRadius: '6px',
                border: '1px solid #ddd',
                fontSize: '0.9rem'
              }}
            />
            <input
              type="date"
              value={planForm.checkpoint_date}
              onChange={(e) => handlePlanChange('checkpoint_date', e.target.value)}
              disabled={lockPlanAndProgress}
              style={{
                padding: '0.6rem',
                borderRadius: '6px',
                border: '1px solid #ddd',
                fontSize: '0.9rem'
              }}
            />
          </div>
          <div style={{ marginTop: '0.75rem' }}>
            <button
              type="button"
              onClick={handleSavePlan}
              disabled={planSubmitting || lockPlanAndProgress}
              style={{
                backgroundColor: planSubmitting || lockPlanAndProgress ? '#9ca3af' : '#0070f3',
                color: '#fff',
                border: 'none',
                padding: '0.6rem 1rem',
                borderRadius: '6px',
                fontWeight: 'bold',
                cursor: planSubmitting || lockPlanAndProgress ? 'not-allowed' : 'pointer'
              }}
            >
              {planSubmitting ? 'Salvando...' : hasPlan ? 'Atualizar plano' : 'Salvar plano 30d'}
            </button>
          </div>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>
            Progresso declarado {hasEvidence && '(registrado)'}
          </h3>
          <p style={{ marginBottom: '1rem', color: '#666' }}>
            Marque 2 a 3 itens concluídos e declare o ganho.
          </p>
          {progressError && (
            <div style={{
              padding: '0.5rem 0.75rem',
              backgroundColor: '#f8d7da',
              color: '#721c24',
              borderRadius: '4px',
              marginBottom: '0.75rem',
              fontSize: '0.875rem'
            }}>
              {progressError}
            </div>
          )}
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {progressForm.criteria.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={(e) => handleProgressChange(idx, 'done', e.target.checked)}
                disabled={lockProgress}
                />
                <input
                  type="text"
                  placeholder={`Item ${idx + 1}`}
                  value={item.text}
                  onChange={(e) => handleProgressChange(idx, 'text', e.target.value)}
                  disabled={lockProgress}
                  style={{
                    flex: 1,
                    padding: '0.6rem',
                    borderRadius: '6px',
                    border: '1px solid #ddd',
                    fontSize: '0.9rem'
                  }}
                />
              </div>
            ))}
            <select
              value={progressForm.declared_gain_type}
              onChange={(e) => setProgressForm((prev) => ({ ...prev, declared_gain_type: e.target.value }))}
              disabled={lockProgress}
              style={{
                padding: '0.6rem',
                borderRadius: '6px',
                border: '1px solid #ddd',
                fontSize: '0.9rem'
              }}
            >
              <option value="">Tipo de ganho</option>
              <option value="RECEITA">Receita</option>
              <option value="CUSTO">Custo</option>
              <option value="TEMPO">Tempo</option>
              <option value="RISCO">Risco</option>
            </select>
            <textarea
              value={progressForm.declared_gain_note}
              onChange={(e) => setProgressForm((prev) => ({ ...prev, declared_gain_note: e.target.value }))}
              placeholder="Descreva o ganho percebido ou esperado."
              rows={3}
              disabled={lockProgress}
              style={{
                width: '100%',
                padding: '0.6rem',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '0.9rem',
                fontFamily: 'inherit',
              }}
            />
          </div>
        </div>

        {!canSubmitEvidence && !lockPlanAndProgress && (
          <div style={{
            padding: '0.75rem',
            backgroundColor: '#fff3cd',
            color: '#856404',
            borderRadius: '6px',
            marginBottom: '1rem',
            fontSize: '0.9rem'
          }}>
            Para registrar evidência, salve o plano 30d e o progresso declarado.
          </div>
        )}

        <div>
          <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>
            Evidência {hasEvidence && '(já registrada)'}:
          </h3>
          {isCompleted && hasEvidence ? (
            <div style={{
              padding: '1rem',
              backgroundColor: '#f8f9fa',
              borderRadius: '4px',
              border: '1px solid #ddd',
              whiteSpace: 'pre-wrap',
              color: '#333'
            }}>
              {freeAction.evidence!.evidence_text}
            </div>
          ) : (
            <form id="evidence-form" onSubmit={handleSubmit}>
              <textarea
                value={evidenceText}
                onChange={(e) => setEvidenceText(e.target.value)}
                placeholder="Ex.: criei planilha X, defini rotina Y, anexei print Z..."
                rows={6}
                disabled={submitting || isCompleted || !canSubmitEvidence}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  marginBottom: '1rem'
                }}
              />
            </form>
          )}
        </div>

        {isCompleted && freeAction.completed_at && (
          <div style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#666' }}>
            Concluída em: {new Date(freeAction.completed_at).toLocaleString('pt-BR')}
          </div>
        )}
      </div>
    </div>
  );
}
