'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { ErrorBanner } from '@/components/ErrorBanner';
import { useCycle } from '@/contexts/CycleContext';

type Question = {
    question_id: string;
    type: 'text' | 'number' | 'boolean';
    text: string;
    order: number;
};

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export default function DiagnosticPage() {
    const router = useRouter();
    const supabase = createClient();
    const { cycleId } = useCycle();

    const [questions, setQuestions] = useState<Question[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [answer, setAnswer] = useState<string | number | boolean>('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [refreshDetected, setRefreshDetected] = useState(false);
    const [timeoutDetected, setTimeoutDetected] = useState(false);

    // Timeout tracking
    const [lastActivity, setLastActivity] = useState(Date.now());

    const resetActivity = useCallback(() => {
        setLastActivity(Date.now());
    }, []);

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

    // Inactivity timeout
    useEffect(() => {
        const interval = setInterval(() => {
            const inactive = Date.now() - lastActivity > TIMEOUT_MS;
            if (inactive && !timeoutDetected) {
                setTimeoutDetected(true);
                setTimeout(() => {
                    router.push('/login');
                }, 3000);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [lastActivity, timeoutDetected, router]);

    // Activity event listeners
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const events = ['click', 'keypress', 'input', 'change'];

        events.forEach(event => {
            window.addEventListener(event, resetActivity);
        });

        return () => {
            events.forEach(event => {
                window.removeEventListener(event, resetActivity);
            });
        };
    }, [resetActivity]);

    // Load questions (cycle_id from context)
    useEffect(() => {
        const loadQuestions = async () => {
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

                // Get questions using cycle_id from context
                const questionsResponse = await fetch(
                    `/api/diagnostic/questions?cycle_id=${cycleId}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${session.access_token}`
                        }
                    }
                );

                if (!questionsResponse.ok) {
                    setError('Erro ao carregar perguntas');
                    setLoading(false);
                    return;
                }

                const questionsData = await questionsResponse.json();
                setQuestions(questionsData);
                setLoading(false);
            } catch (err) {
                setError('Erro ao carregar diagnóstico');
                setLoading(false);
            }
        };

        if (!refreshDetected && !timeoutDetected) {
            loadQuestions();
        }
    }, [cycleId, router, supabase, refreshDetected, timeoutDetected]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSubmitting(true);

        try {
            const { data: { session } } = await supabase.auth.getSession();

            if (!session || !cycleId) {
                router.push('/login');
                return;
            }

            const currentQuestion = questions[currentIndex];

            // Type mapping based on question.type
            let typedAnswer: string | number | boolean;

            if (currentQuestion.type === 'number') {
                typedAnswer = Number(answer);
            } else if (currentQuestion.type === 'boolean') {
                typedAnswer = answer as boolean;
            } else {
                typedAnswer = String(answer);
            }

            const response = await fetch('/api/diagnostic/answers', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    cycle_id: cycleId,
                    question_id: currentQuestion.question_id,
                    answer: typedAnswer
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                setError(errorData.error || 'Erro ao enviar resposta');
                setSubmitting(false);
                return;
            }

            // Check if last question
            if (currentIndex === questions.length - 1) {
                // Finish diagnostic
                const finishResponse = await fetch('/api/diagnostic/finish', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`
                    },
                    body: JSON.stringify({ cycle_id: cycleId })
                });

                if (!finishResponse.ok) {
                    const errorData = await finishResponse.json();
                    setError(errorData.error || 'Erro ao finalizar diagnóstico');
                    setSubmitting(false);
                    return;
                }

                router.push('/results');
            } else {
                // Next question
                setCurrentIndex(currentIndex + 1);
                setAnswer('');
                setSubmitting(false);
            }
        } catch (err) {
            setError('Erro ao enviar resposta');
            setSubmitting(false);
        }
    };

    if (refreshDetected) {
        return (
            <div style={{ padding: '2rem', maxWidth: '600px', margin: '4rem auto' }}>
                <ErrorBanner message="Refresh não é suportado durante o diagnóstico. A sessão do diagnóstico foi encerrada. Redirecionando para login..." />
            </div>
        );
    }

    if (timeoutDetected) {
        return (
            <div style={{ padding: '2rem', maxWidth: '600px', margin: '4rem auto' }}>
                <ErrorBanner message="Sessão expirada por inatividade (5 minutos). Redirecionando para login..." />
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
                Carregando diagnóstico...
            </div>
        );
    }

    if (error && !questions.length) {
        return (
            <div style={{ padding: '2rem', maxWidth: '600px', margin: '4rem auto' }}>
                <ErrorBanner message={error} />
            </div>
        );
    }

    const currentQuestion = questions[currentIndex];

    return (
        <div style={{
            padding: '2rem',
            maxWidth: '600px',
            margin: '4rem auto',
            background: 'white',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
            <div style={{ marginBottom: '1.5rem' }}>
                <p style={{ fontSize: '0.9rem', color: '#666' }}>
                    Pergunta {currentIndex + 1} de {questions.length}
                </p>
                <div style={{
                    width: '100%',
                    height: '4px',
                    background: '#eee',
                    borderRadius: '2px',
                    marginTop: '0.5rem'
                }}>
                    <div style={{
                        width: `${((currentIndex + 1) / questions.length) * 100}%`,
                        height: '100%',
                        background: '#667eea',
                        borderRadius: '2px',
                        transition: 'width 0.3s'
                    }} />
                </div>
            </div>

            <h2 style={{ marginBottom: '1.5rem' }}>{currentQuestion.text}</h2>

            {error && <ErrorBanner message={error} />}

            <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '1.5rem' }}>
                    {currentQuestion.type === 'boolean' ? (
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={answer as boolean}
                                onChange={(e) => {
                                    setAnswer(e.target.checked);
                                    resetActivity();
                                }}
                                disabled={submitting}
                                style={{ width: '20px', height: '20px' }}
                            />
                            <span>Sim</span>
                        </label>
                    ) : currentQuestion.type === 'number' ? (
                        <input
                            type="number"
                            value={String(answer)}
                            onChange={(e) => {
                                setAnswer(e.target.value);
                                resetActivity();
                            }}
                            required
                            disabled={submitting}
                            placeholder="Digite um número..."
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                border: '1px solid #ddd',
                                borderRadius: '4px',
                                fontSize: '1rem'
                            }}
                        />
                    ) : (
                        <textarea
                            value={String(answer)}
                            onChange={(e) => {
                                setAnswer(e.target.value);
                                resetActivity();
                            }}
                            disabled={submitting}
                            rows={4}
                            placeholder="Digite sua resposta..."
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                border: '1px solid #ddd',
                                borderRadius: '4px',
                                fontSize: '1rem',
                                fontFamily: 'inherit',
                                resize: 'vertical'
                            }}
                        />
                    )}
                </div>

                <button
                    type="submit"
                    disabled={submitting || (currentQuestion.type !== 'boolean' && !String(answer).trim())}
                    style={{
                        width: '100%',
                        padding: '0.75rem',
                        background: (submitting || (currentQuestion.type !== 'boolean' && !String(answer).trim())) ? '#ccc' : '#667eea',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '1rem',
                        fontWeight: 600,
                        cursor: (submitting || (currentQuestion.type !== 'boolean' && !String(answer).trim())) ? 'not-allowed' : 'pointer'
                    }}
                >
                    {submitting ? 'Enviando...' : (currentIndex === questions.length - 1 ? 'Finalizar' : 'Próxima')}
                </button>
            </form>
        </div>
    );
}
