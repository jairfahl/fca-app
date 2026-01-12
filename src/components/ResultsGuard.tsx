'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { useCycle } from '@/contexts/CycleContext';

type ResultsGuardProps = {
    children: React.ReactNode;
};

export function ResultsGuard({ children }: ResultsGuardProps) {
    const router = useRouter();
    const supabase = createClient();
    const { cycleId } = useCycle();
    const [isValidating, setIsValidating] = useState(true);

    useEffect(() => {
        const validateResults = async () => {
            const { data: { session } } = await supabase.auth.getSession();

            if (!session) {
                setIsValidating(false);
                return;
            }

            const currentPath = window.location.pathname;

            // Only validate for /results and /actions routes
            if (currentPath !== '/results' && currentPath !== '/actions') {
                setIsValidating(false);
                return;
            }

            // Check for page reload on /results - redirect to /login
            if (currentPath === '/results') {
                const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
                if (navigation && navigation.type === 'reload') {
                    router.push('/login');
                    return;
                }
            }

            if (!cycleId) {
                setIsValidating(false);
                return;
            }

            try {
                const response = await fetch(`/api/results/status?cycle_id=${cycleId}`, {
                    headers: {
                        'Authorization': `Bearer ${session.access_token}`
                    }
                });

                if (!response.ok) {
                    router.push('/diagnostic');
                    return;
                }

                const data = await response.json();

                if (data.diagnostic_status !== 'completed') {
                    router.push('/diagnostic');
                    return;
                }
            } catch (error) {
                router.push('/diagnostic');
                return;
            }

            setIsValidating(false);
        };

        validateResults();
    }, [router, supabase, cycleId]);

    if (isValidating) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '100vh'
            }}>
                Validando resultados...
            </div>
        );
    }

    return <>{children}</>;
}
