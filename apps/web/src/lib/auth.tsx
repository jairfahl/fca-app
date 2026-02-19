'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { fetchMe, type MeResponse } from './api';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  me: MeResponse | null;
  meLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  me: null,
  meLoading: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(false);

  const lastTokenRef = useRef<string | null>(null);
  const inFlightRef = useRef<{ token: string; promise: Promise<MeResponse> } | null>(null);

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
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const token = session?.access_token ?? null;
    if (!token) {
      setMe(null);
      setMeLoading(false);
      lastTokenRef.current = null;
      inFlightRef.current = null;
      return;
    }

    if (lastTokenRef.current === token && me) {
      return;
    }

    if (inFlightRef.current?.token === token) {
      inFlightRef.current.promise
        .then((data) => {
          lastTokenRef.current = token;
          setMe(data);
        })
        .catch(() => {})
        .finally(() => {
          if (inFlightRef.current?.token === token) {
            inFlightRef.current = null;
            setMeLoading(false);
          }
        });
      return;
    }

    setMeLoading(true);
    const promise = fetchMe(token);
    inFlightRef.current = { token, promise };
    promise
      .then((data) => {
        lastTokenRef.current = token;
        setMe(data);
      })
      .catch(() => {
        setMe(null);
      })
      .finally(() => {
        if (inFlightRef.current?.token === token) {
          inFlightRef.current = null;
        }
        setMeLoading(false);
      });
  }, [session?.access_token]);

  return (
    <AuthContext.Provider value={{ user, session, loading, me, meLoading }}>
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
