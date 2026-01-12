'use client'

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';

export default function Home() {
    const router = useRouter();
    const supabase = createClient();

    useEffect(() => {
        const checkSessionAndRedirect = async () => {
            const { data: { session } } = await supabase.auth.getSession();

            if (session) {
                router.push('/company');
            } else {
                router.push('/login');
            }
        };

        checkSessionAndRedirect();
    }, [router, supabase]);

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh'
        }}>
            Redirecionando...
        </div>
    );
}
