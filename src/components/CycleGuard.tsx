'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { CycleProvider } from '@/contexts/CycleContext';

type CycleGuardProps = {
    children: React.ReactNode;
};

export function CycleGuard({ children }: CycleGuardProps) {
    const router = useRouter();
    const supabase = createClient();
    const [isValidating, setIsValidating] = useState(true);
    const [cycleId, setCycleId] = useState<string | null>(null);

    useEffect(() => {
        const validateCycle = async () => {
            const { data: { session } } = await supabase.auth.getSession();

            if (!session) {
                setIsValidating(false);
                return;
            }

            const currentPath = window.location.pathname;

            try {
                const response = await fetch('/api/cycles/active', {
                    headers: {
                        'Authorization': `Bearer ${session.access_token}`
                    }
                });

                if (!response.ok) {
                    setCycleId(null);
                } else {
                    const data = await response.json();

                    if (!data.cycle_id || data.status !== 'active') {
                        setCycleId(null);
                    } else {
                        setCycleId(data.cycle_id);
                    }
                }
            } catch (error) {
                setCycleId(null);
            }

            setIsValidating(false);
        };

        validateCycle();
    }, [router, supabase]);

    if (isValidating) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '100vh'
            }}>
                Validando ciclo...
            </div>
        );
    }

    return (
        <CycleProvider value={{ cycleId }}>
            {children}
        </CycleProvider>
    );
}
