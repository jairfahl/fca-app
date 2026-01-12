'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-client';

type CompanyGuardProps = {
    children: React.ReactNode;
};

export function CompanyGuard({ children }: CompanyGuardProps) {
    const router = useRouter();
    const supabase = createClient();
    const [isValidating, setIsValidating] = useState(true);

    useEffect(() => {
        const validateCompany = async () => {
            const { data: { session } } = await supabase.auth.getSession();

            if (!session) {
                setIsValidating(false);
                return;
            }

            try {
                const response = await fetch('/api/companies/me', {
                    headers: {
                        'Authorization': `Bearer ${session.access_token}`
                    }
                });

                const currentPath = window.location.pathname;

                if (response.ok) {
                    const data = await response.json();

                    if (data.company_id) {
                        if (currentPath === '/company') {
                            router.push('/diagnostic');
                        }
                    } else {
                        router.push('/company');
                    }
                } else {
                    // 404 or any error - always redirect to /company
                    router.push('/company');
                }
            } catch (error) {
                // On error - always redirect to /company
                router.push('/company');
            }

            setIsValidating(false);
        };

        validateCompany();
    }, [router, supabase]);

    if (isValidating) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '100vh'
            }}>
                Validando empresa...
            </div>
        );
    }

    return <>{children}</>;
}
