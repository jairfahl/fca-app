'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { getMe, invalidateMe } from './me';
import type { MeResponse } from './api';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  me: MeResponse | null;
  meLoading: boolean;
  meError: string | null;
  loadMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  me: null,
  meLoading: false,
  meError: null,
  loadMe: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(false);
  const [meError, setMeError] = useState<string | null>(null);

  const loadMeInProgressRef = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (!session) {
        invalidateMe();
        setMe(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadMe = useCallback(async () => {
    const token = session?.access_token ?? null;
    if (!token) {
      setMe(null);
      setMeLoading(false);
      setMeError(null);
      return;
    }

    if (loadMeInProgressRef.current) return;
    loadMeInProgressRef.current = true;
    setMeLoading(true);
    setMeError(null);

    try {
      const data = await getMe(token);
      setMe(data);
      if (!data) {
        setMeError('Não foi possível carregar perfil');
      }
    } catch (err: any) {
      setMe(null);
      setMeError(err?.message ?? 'Erro ao carregar perfil');
    } finally {
      loadMeInProgressRef.current = false;
      setMeLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (!session?.access_token) {
      setMe(null);
      setMeLoading(false);
      return;
    }
    loadMe();
  }, [session?.access_token, loadMe]);

  return (
    <AuthContext.Provider value={{ user, session, loading, me, meLoading, meError, loadMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
