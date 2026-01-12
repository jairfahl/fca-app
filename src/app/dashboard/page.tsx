'use client';

import { useEffect, useState } from 'react';
import { ErrorBanner } from '@/components/ErrorBanner';
import { useCycle } from '@/contexts/CycleContext';
import { useAuth } from '@/contexts/AuthContext';

type ActionStatus = 'not_started' | 'in_progress' | 'completed';

type Action = {
    selected_action_id: string;
    title: string;
    status: ActionStatus;
    evidence?: string;
};

export default function DashboardPage() {
    const { cycleId } = useCycle();
    const { accessToken } = useAuth();

    const [actions, setActions] = useState<Action[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [cycleStatus, setCycleStatus] = useState<'active' | 'closed' | null>(null);

    // Evidence form state
    const [evidenceActionId, setEvidenceActionId] = useState<string | null>(null);
    const [evidenceContent, setEvidenceContent] = useState('');
    const [submittingEvidence, setSubmittingEvidence] = useState(false);

    // Status change state
    const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

    // Cycle closure state
    const [closingCycle, setClosingCycle] = useState(false);

    // Load dashboard data
    useEffect(() => {
        const loadDashboard = async () => {
            // No cycle active
            if (cycleId === null) {
                setLoading(false);
                return;
            }

            try {
                const response = await fetch(
                    `/api/dashboard?cycle_id=${cycleId}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${accessToken}`
                        }
                    }
                );

                if (!response.ok) {
                    setError('Erro ao carregar dashboard');
                    setLoading(false);
                    return;
                }

                const data = await response.json();
                setActions(data.actions || []);
                setCycleStatus(data.cycle_status || 'active');
                setLoading(false);
            } catch (err) {
                setError('Erro ao carregar dashboard');
                setLoading(false);
            }
        };

        loadDashboard();
    }, [cycleId, accessToken]);

    const handleStatusChange = async (actionId: string, newStatus: ActionStatus) => {
        setError('');
        setUpdatingStatus(actionId);

        try {
            const response = await fetch('/api/dashboard/status', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({
                    selected_action_id: actionId,
                    status: newStatus
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                setError(errorData.error || 'Erro ao atualizar status');
                setUpdatingStatus(null);
                return;
            }

            // Update local state
            setActions(actions.map(action =>
                action.selected_action_id === actionId
                    ? { ...action, status: newStatus }
                    : action
            ));

            setUpdatingStatus(null);
        } catch (err) {
            setError('Erro ao atualizar status');
            setUpdatingStatus(null);
        }
    };

    const handleSubmitEvidence = async () => {
        if (!evidenceActionId || !evidenceContent.trim()) {
            setError('Evidência não pode estar vazia');
            return;
        }

        setError('');
        setSubmittingEvidence(true);

        try {
            const response = await fetch('/api/dashboard/evidence', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({
                    selected_action_id: evidenceActionId,
                    content: evidenceContent
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                setError(errorData.error || 'Erro ao enviar evidência');
                setSubmittingEvidence(false);
                return;
            }

            // Update local state
            setActions(actions.map(action =>
                action.selected_action_id === evidenceActionId
                    ? { ...action, evidence: evidenceContent }
                    : action
            ));

            // Reset form
            setEvidenceActionId(null);
            setEvidenceContent('');
            setSubmittingEvidence(false);
        } catch (err) {
            setError('Erro ao enviar evidência');
            setSubmittingEvidence(false);
        }
    };

    const handleCloseCycle = async () => {
        if (!cycleId) {
            setError('Nenhum ciclo ativo para encerrar');
            return;
        }

        setError('');
        setClosingCycle(true);

        try {
            const response = await fetch('/api/dashboard/cycles/close', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({
                    cycle_id: cycleId
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                setError(errorData.error || 'Erro ao encerrar ciclo');
                setClosingCycle(false);
                return;
            }

            setCycleStatus('closed');
            setClosingCycle(false);
        } catch (err) {
            setError('Erro ao encerrar ciclo');
            setClosingCycle(false);
        }
    };

    if (loading) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '100vh'
            }}>
                Carregando dashboard...
            </div>
        );
    }

    // No active cycle - show empty state
    if (cycleId === null) {
        return (
            <div style={{
                padding: '2rem',
                maxWidth: '1000px',
                margin: '2rem auto',
                background: 'white',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}>
                <h1 style={{ marginBottom: '1.5rem' }}>Dashboard - Acompanhamento de Ações</h1>

                <div style={{
                    padding: '3rem',
                    background: '#f7fafc',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    textAlign: 'center'
                }}>
                    <h2 style={{ marginBottom: '1rem', color: '#666' }}>Sem Ciclo Ativo</h2>
                    <p style={{ color: '#999' }}>
                        Não há ciclo de diagnóstico ativo no momento.
                    </p>
                </div>
            </div>
        );
    }

    const allCompleted = actions.every(action => action.status === 'completed');
    const isReadOnly = cycleStatus === 'closed';

    return (
        <div style={{
            padding: '2rem',
            maxWidth: '1000px',
            margin: '2rem auto',
            background: 'white',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
            <h1 style={{ marginBottom: '1.5rem' }}>Dashboard - Acompanhamento de Ações</h1>

            {error && <ErrorBanner message={error} />}

            {isReadOnly && (
                <div style={{
                    padding: '1rem',
                    background: '#d4edda',
                    border: '1px solid #c3e6cb',
                    borderRadius: '4px',
                    color: '#155724',
                    marginBottom: '1.5rem'
                }}>
                    Ciclo encerrado. Este dashboard está em modo somente leitura.
                </div>
            )}

            {actions.length === 0 ? (
                <p>Nenhuma ação encontrada para este ciclo.</p>
            ) : (
                <>
                    <div style={{ marginBottom: '2rem' }}>
                        {actions.map((action) => (
                            <div
                                key={action.selected_action_id}
                                style={{
                                    padding: '1.5rem',
                                    marginBottom: '1rem',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '8px',
                                    background: '#f7fafc'
                                }}
                            >
                                <h3 style={{ marginBottom: '1rem' }}>{action.title}</h3>

                                {/* Status selector */}
                                <div style={{ marginBottom: '1rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
                                        Status:
                                    </label>
                                    <select
                                        value={action.status}
                                        onChange={(e) => handleStatusChange(action.selected_action_id, e.target.value as ActionStatus)}
                                        disabled={isReadOnly || updatingStatus === action.selected_action_id}
                                        style={{
                                            padding: '0.5rem',
                                            borderRadius: '4px',
                                            border: '1px solid #cbd5e0',
                                            fontSize: '1rem',
                                            cursor: isReadOnly ? 'not-allowed' : 'pointer'
                                        }}
                                    >
                                        <option value="not_started">Não Iniciada</option>
                                        <option value="in_progress">Em Andamento</option>
                                        <option value="completed">Concluída</option>
                                    </select>
                                    {updatingStatus === action.selected_action_id && (
                                        <span style={{ marginLeft: '0.5rem', color: '#667eea' }}>Atualizando...</span>
                                    )}
                                </div>

                                {/* Evidence section */}
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
                                        Evidência:
                                    </label>

                                    {action.evidence ? (
                                        <div style={{
                                            padding: '1rem',
                                            background: 'white',
                                            border: '1px solid #cbd5e0',
                                            borderRadius: '4px'
                                        }}>
                                            <p style={{ marginBottom: '0.5rem', fontSize: '0.9rem', color: '#666' }}>
                                                (Evidência não editável)
                                            </p>
                                            <p>{action.evidence}</p>
                                        </div>
                                    ) : (
                                        <>
                                            {evidenceActionId === action.selected_action_id ? (
                                                <div>
                                                    <textarea
                                                        value={evidenceContent}
                                                        onChange={(e) => setEvidenceContent(e.target.value)}
                                                        disabled={submittingEvidence}
                                                        placeholder="Descreva a evidência da execução desta ação..."
                                                        rows={4}
                                                        style={{
                                                            width: '100%',
                                                            padding: '0.75rem',
                                                            borderRadius: '4px',
                                                            border: '1px solid #cbd5e0',
                                                            fontSize: '1rem',
                                                            marginBottom: '0.5rem',
                                                            fontFamily: 'inherit'
                                                        }}
                                                    />
                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                        <button
                                                            onClick={handleSubmitEvidence}
                                                            disabled={submittingEvidence || !evidenceContent.trim()}
                                                            style={{
                                                                padding: '0.5rem 1rem',
                                                                background: (submittingEvidence || !evidenceContent.trim()) ? '#ccc' : '#667eea',
                                                                color: 'white',
                                                                border: 'none',
                                                                borderRadius: '4px',
                                                                cursor: (submittingEvidence || !evidenceContent.trim()) ? 'not-allowed' : 'pointer'
                                                            }}
                                                        >
                                                            {submittingEvidence ? 'Enviando...' : 'Enviar Evidência'}
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setEvidenceActionId(null);
                                                                setEvidenceContent('');
                                                            }}
                                                            disabled={submittingEvidence}
                                                            style={{
                                                                padding: '0.5rem 1rem',
                                                                background: 'white',
                                                                color: '#666',
                                                                border: '1px solid #cbd5e0',
                                                                borderRadius: '4px',
                                                                cursor: submittingEvidence ? 'not-allowed' : 'pointer'
                                                            }}
                                                        >
                                                            Cancelar
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => setEvidenceActionId(action.selected_action_id)}
                                                    disabled={isReadOnly}
                                                    style={{
                                                        padding: '0.5rem 1rem',
                                                        background: isReadOnly ? '#ccc' : 'white',
                                                        color: isReadOnly ? '#999' : '#667eea',
                                                        border: '1px solid',
                                                        borderColor: isReadOnly ? '#ccc' : '#667eea',
                                                        borderRadius: '4px',
                                                        cursor: isReadOnly ? 'not-allowed' : 'pointer'
                                                    }}
                                                >
                                                    Adicionar Evidência
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Close cycle button */}
                    <div style={{
                        padding: '1.5rem',
                        background: '#f7fafc',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0'
                    }}>
                        <h3 style={{ marginBottom: '1rem' }}>Encerramento do Ciclo</h3>
                        <p style={{ marginBottom: '1rem', color: '#666' }}>
                            {isReadOnly
                                ? 'Este ciclo já foi encerrado.'
                                : allCompleted
                                    ? 'O backend validará se todas as ações estão concluídas antes de encerrar.'
                                    : 'Para encerrar o ciclo, todas as ações devem estar concluídas (validado pelo backend).'}
                        </p>
                        <button
                            onClick={handleCloseCycle}
                            disabled={closingCycle || isReadOnly}
                            style={{
                                padding: '0.75rem 2rem',
                                background: (closingCycle || isReadOnly) ? '#ccc' : '#dc3545',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '1rem',
                                fontWeight: 600,
                                cursor: (closingCycle || isReadOnly) ? 'not-allowed' : 'pointer'
                            }}
                        >
                            {closingCycle ? 'Encerrando...' : 'Encerrar Ciclo'}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
