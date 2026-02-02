'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    const handleLogout = async () => {
      await supabase.auth.signOut();
      router.push('/login');
    };

    handleLogout();
  }, [router]);

  return <div style={{ padding: '2rem', textAlign: 'center' }}>Saindo...</div>;
}
