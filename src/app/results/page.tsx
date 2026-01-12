'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { ErrorBanner } from '@/components/ErrorBanner';
import { useCycle } from '@/contexts/CycleContext';

type Score = {
    key: string;
    value: number | string;
    label?: string;
    order: number;
};

type Suggestion = {
    action_id: string;
    title: string;
    description?: string;
    order: number;
};

export default function ResultsPage() {
    const router = useRouter();
    const supabase = createClient();
    const { cycleId } = useCycle();

    const [scores, setScores] = useState<Score[]>([]);
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [selectedActions, setSelectedActions] = useState<string[]>([]);
    const [currentBlockIndex, setCurrentBlockIndex] = useState(0);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [refreshDetected, setRefreshDetected] = useState(false);

    // Detect refresh via Performance API
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const navTiming = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;

        if (navTiming && navTiming.type === 'reload') {
            setRefreshDetected(true);
            setTimeout(() => {
                router.push('/login');
            }, 3000);
        }
    }, [router]);

    // Load results and suggestions
    useEffect(() => {
        const loadData = async () => {
            if (!cycleId) {
                setLoading(false);
                return;
            }

            try {
                const { data: { session } } = await supabase.auth.getSession();

                if (!session) {
                    router.push('/login');
                    return;
                }

                // Get results
                const resultsResponse = await fetch(
                    `/api/results?cycle_id=${cycleId}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${session.access_token}`
                        }
                    }
                );

                if (!resultsResponse.ok) {
                    setError('Erro ao carregar resultados');
                    setLoading(false);
                    return;
                }

                const resultsData = await resultsResponse.json();
                setScores(resultsData.scores || []);

                // Get action suggestions
                const suggestionsResponse = await fetch(
                    `/api/actions/suggestions?cycle_id=${cycleId}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${session.access_token}`
                        }
                    }
                );

                if (!suggestionsResponse.ok) {
                    setError('Erro ao carregar sugestões');
                    setLoading(false);
                    return;
                }

                const suggestionsData = await suggestionsResponse.json();

                setSuggestions(suggestionsData.suggestions);
                setLoading(false);
            } catch (err) {
                setError('Erro ao carregar dados');
                setLoading(false);
            }
        };

        if (!refreshDetected) {
            loadData();
        }
    }, [cycleId, router, supabase, refreshDetected]);

    const handleActionToggle = (actionId: string) => {
        if (selectedActions.includes(actionId)) {
            setSelectedActions(selectedActions.filter(id => id !== actionId));
        } else {
            if (selectedActions.length < 3) {
                setSelectedActions([...selectedActions, actionId]);
            }
        }
    };

    const handleSubmitBlock = async () => {
        if (selectedActions.length !== 3) {
            setError('Você deve selecionar exatamente 3 ações');
            return;
        }

        setError('');
        setSubmitting(true);

        try {
            const { data: { session } } = await supabase.auth.getSession();

            if (!session || !cycleId) {
                router.push('/login');
                return;
            }

            const response = await fetch('/api/actions/select', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    cycle_id: cycleId,
                    action_ids: selectedActions
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                setError(errorData.error || 'Erro ao selecionar ações');
                setSubmitting(false);
                return;
            }

            // Check if there are more blocks
            const totalBlocks = Math.ceil(suggestions.length / 3);

            if (currentBlockIndex < totalBlocks - 1) {
                // Next block
                setCurrentBlockIndex(currentBlockIndex + 1);
                setSelectedActions([]);
                setSubmitting(false);
            } else {
                // Last block - redirect to dashboard
                router.push('/dashboard');
            }
        } catch (err) {
            setError('Erro ao enviar seleção');
            setSubmitting(false);
        }
    };

    if (refreshDetected) {
        return (
            <div style={{ padding: '2rem', maxWidth: '800px', margin: '4rem auto' }}>
                <ErrorBanner message="Refresh não é suportado durante a seleção. O estado foi descartado. Redirecionando para login..." />
            </div>
        );
    }

    if (loading) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '100vh'
            }}>
                Carregando resultados...
            </div>
        );
    }

    if (error && !scores.length) {
        return (
            <div style={{ padding: '2rem', maxWidth: '800px', margin: '4rem auto' }}>
                <ErrorBanner message={error} />
            </div>
        );
    }

    const totalBlocks = Math.ceil(suggestions.length / 3);
    const currentBlockActions = suggestions.slice(currentBlockIndex * 3, (currentBlockIndex + 1) * 3);

    return (
        <div style={{
            padding: '2rem',
            maxWidth: '800px',
            margin: '2rem auto',
            background: 'white',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
            {/* Scores Section */}
            <div style={{ marginBottom: '3rem' }}>
                <h1 style={{ marginBottom: '1.5rem' }}>Resultados do Diagnóstico</h1>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {scores.map((score) => (
                        <div
                            key={score.key}
                            style={{
                                padding: '1rem',
                                background: '#f7fafc',
                                borderRadius: '4px',
                                border: '1px solid #e2e8f0'
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 600 }}>{score.label || score.key}</span>
                                <span style={{ fontSize: '1.25rem', color: '#667eea', fontWeight: 700 }}>
                                    {score.value}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div >

            {/* Action Selection Section */}
            < div >
                <h2 style={{ marginBottom: '0.5rem' }}>Seleção de Ações</h2>
                <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                    Bloco {currentBlockIndex + 1} de {totalBlocks} - Selecione exatamente 3 ações
                </p>

                {error && <ErrorBanner message={error} />}

                <div style={{ marginBottom: '2rem' }}>
                    {currentBlockActions.map((action) => {
                        const isSelected = selectedActions.includes(action.action_id);

                        return (
                            <div
                                key={action.action_id}
                                onClick={() => !submitting && handleActionToggle(action.action_id)}
                                style={{
                                    padding: '1.5rem',
                                    marginBottom: '1rem',
                                    border: '2px solid',
                                    borderColor: isSelected ? '#667eea' : '#e2e8f0',
                                    borderRadius: '8px',
                                    cursor: submitting ? 'not-allowed' : 'pointer',
                                    background: isSelected ? '#f0f4ff' : 'white',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'start', gap: '1rem' }}>
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => { }}
                                        disabled={submitting}
                                        style={{
                                            marginTop: '0.25rem',
                                            width: '20px',
                                            height: '20px',
                                            cursor: submitting ? 'not-allowed' : 'pointer'
                                        }}
                                    />
                                    <div style={{ flex: 1 }}>
                                        <h3 style={{ marginBottom: '0.5rem', fontWeight: 600 }}>{action.title}</h3>
                                        {action.description && (
                                            <p style={{ color: '#666', fontSize: '0.9rem' }}>{action.description}</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.9rem', color: '#666' }}>
                        {selectedActions.length} de 3 ações selecionadas
                    </span>

                    <button
                        onClick={handleSubmitBlock}
                        disabled={submitting || selectedActions.length !== 3}
                        style={{
                            padding: '0.75rem 2rem',
                            background: (submitting || selectedActions.length !== 3) ? '#ccc' : '#667eea',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '1rem',
                            fontWeight: 600,
                            cursor: (submitting || selectedActions.length !== 3) ? 'not-allowed' : 'pointer'
                        }}
                    >
                        {submitting ? 'Enviando...' : (currentBlockIndex < totalBlocks - 1 ? 'Próximo Bloco' : 'Finalizar')}
                    </button>
                </div>
            </div >
        </div >
    );
}
