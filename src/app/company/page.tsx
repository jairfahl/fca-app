'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ErrorBanner } from '@/components/ErrorBanner';
import { createClient } from '@/lib/supabase-client';

type Segment = 'COMMERCE' | 'INDUSTRY' | 'SERVICES';

export default function CompanyPage() {
    const router = useRouter();
    const supabase = createClient();
    const [name, setName] = useState('');
    const [segment, setSegment] = useState<Segment | ''>('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!name.trim()) {
            setError('Nome da empresa é obrigatório');
            return;
        }

        if (!segment) {
            setError('Selecione um segmento');
            return;
        }

        setLoading(true);

        try {
            const { data: { session } } = await supabase.auth.getSession();

            if (!session) {
                setError('Sessão inválida');
                setLoading(false);
                return;
            }

            const response = await fetch('/api/companies', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    name: name.trim(),
                    segment
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                setError(errorData.error || 'Erro ao criar empresa');
                setLoading(false);
                return;
            }

            const data = await response.json();

            if (data.company_id) {
                router.push('/diagnostic');
            }
        } catch (err) {
            setError('Erro ao criar empresa');
            setLoading(false);
        }
    };

    return (
        <div style={{
            padding: '2rem',
            maxWidth: '500px',
            margin: '4rem auto',
            background: 'white',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
            <h1 style={{ marginBottom: '0.5rem', textAlign: 'center' }}>Cadastro da Empresa</h1>
            <p style={{
                textAlign: 'center',
                color: '#666',
                fontSize: '0.9rem',
                marginBottom: '2rem'
            }}>
                Complete as informações para continuar
            </p>

            {error && <ErrorBanner message={error} />}

            <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
                        Nome da Empresa
                    </label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        disabled={loading}
                        placeholder="Digite o nome da empresa"
                        style={{
                            width: '100%',
                            padding: '0.75rem',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            fontSize: '1rem'
                        }}
                    />
                </div>

                <div style={{ marginBottom: '2rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 600 }}>
                        Segmento
                    </label>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <label style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '0.75rem',
                            border: '2px solid',
                            borderColor: segment === 'COMMERCE' ? '#667eea' : '#ddd',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            background: segment === 'COMMERCE' ? '#f0f4ff' : 'white'
                        }}>
                            <input
                                type="radio"
                                name="segment"
                                value="COMMERCE"
                                checked={segment === 'COMMERCE'}
                                onChange={(e) => setSegment(e.target.value as Segment)}
                                disabled={loading}
                                style={{ marginRight: '0.75rem' }}
                            />
                            <span style={{ fontWeight: segment === 'COMMERCE' ? 600 : 400 }}>
                                Comércio
                            </span>
                        </label>

                        <label style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '0.75rem',
                            border: '2px solid',
                            borderColor: segment === 'INDUSTRY' ? '#667eea' : '#ddd',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            background: segment === 'INDUSTRY' ? '#f0f4ff' : 'white'
                        }}>
                            <input
                                type="radio"
                                name="segment"
                                value="INDUSTRY"
                                checked={segment === 'INDUSTRY'}
                                onChange={(e) => setSegment(e.target.value as Segment)}
                                disabled={loading}
                                style={{ marginRight: '0.75rem' }}
                            />
                            <span style={{ fontWeight: segment === 'INDUSTRY' ? 600 : 400 }}>
                                Indústria
                            </span>
                        </label>

                        <label style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '0.75rem',
                            border: '2px solid',
                            borderColor: segment === 'SERVICES' ? '#667eea' : '#ddd',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            background: segment === 'SERVICES' ? '#f0f4ff' : 'white'
                        }}>
                            <input
                                type="radio"
                                name="segment"
                                value="SERVICES"
                                checked={segment === 'SERVICES'}
                                onChange={(e) => setSegment(e.target.value as Segment)}
                                disabled={loading}
                                style={{ marginRight: '0.75rem' }}
                            />
                            <span style={{ fontWeight: segment === 'SERVICES' ? 600 : 400 }}>
                                Serviços
                            </span>
                        </label>
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    style={{
                        width: '100%',
                        padding: '0.75rem',
                        background: loading ? '#ccc' : '#667eea',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '1rem',
                        fontWeight: 600,
                        cursor: loading ? 'not-allowed' : 'pointer'
                    }}
                >
                    {loading ? 'Cadastrando...' : 'Cadastrar Empresa'}
                </button>
            </form>
        </div>
    );
}
