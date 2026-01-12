'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ActionsPage() {
    const router = useRouter();
    const [completing, setCompleting] = useState(false);

    const handleComplete = () => {
        setCompleting(true);
        router.push('/dashboard');
    };

    return (
        <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
            <h1>Seleção de Ações</h1>
            <p>Placeholder da tela de seleção de ações</p>
            <button
                onClick={handleComplete}
                disabled={completing}
                style={{
                    padding: '0.75rem 1.5rem',
                    background: '#667eea',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: completing ? 'not-allowed' : 'pointer',
                    marginTop: '1rem'
                }}
            >
                {completing ? 'Concluindo...' : 'Concluir etapa'}
            </button>
        </div>
    );
}
