// src/lib/AuthContext.jsx
// 修復 C4：用真實的 Supabase auth session 取代假的 AuthProvider
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, ensureAuth } from '@/api/supabaseClient';
import { identifyUser } from '@/lib/monitoring';

const AuthContext = createContext({
  user: null,
  isAuthenticated: false,
  isLoadingAuth: true,
  authError: null,
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    let mounted = true;

    ensureAuth()
      .then((u) => {
        if (mounted) {
          setUser(u);
          identifyUser(u?.id);
          setIsLoadingAuth(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          setAuthError(err);
          setIsLoadingAuth(false);
        }
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      identifyUser(u?.id);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isLoadingAuth,
      authError,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
