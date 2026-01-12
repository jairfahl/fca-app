'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-client';
import { AuthProvider } from '@/contexts/AuthContext';

type AuthGuardProps = {
    children: React.ReactNode;
};

export function AuthGuard({ children }: AuthGuardProps) {
    const router = useRouter();
    const supabase = createClient();
    const [isValidating, setIsValidating] = useState(true);
    const [accessToken, setAccessToken] = useState<string>('');

    useEffect(() => {
        const validateSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();

            if (!session) {
                const currentPath = window.location.pathname;
                if (currentPath !== '/login' && currentPath !== '/register') {
                    router.push('/login');
                }
                setIsValidating(false);
                return;
            }

            setAccessToken(session.access_token);
            setIsValidating(false);
        };

        validateSession();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') {
                router.push('/login');
            } else if (event === 'SIGNED_IN' && session) {
                setAccessToken(session.access_token);
                const currentPath = window.location.pathname;
                if (currentPath === '/login' || currentPath === '/register') {
                    router.push('/company');
                }
            }
        });

        return () => {
            subscription.unsubscribe();
        };
    }, [router, supabase]);

    if (isValidating) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '100vh'
            }}>
                Validando sessão...
            </div>
        );
    }

    // Check if current route is public
    const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
    const isPublicRoute = currentPath === '/login' || currentPath === '/register';

    // Public routes don't need accessToken
    if (isPublicRoute && !accessToken) {
        return <>{children}</>;
    }

    // Protected routes need access Token
    if (!accessToken) {
        return null;
    }

    return (
        <AuthProvider value={{ accessToken }}>
            {children}
        </AuthProvider>
    );
}
