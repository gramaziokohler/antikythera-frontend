import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AuthContext } from './AuthContext';
import type { AuthIdentity, AuthMode } from './AuthContext';

function currentReturnUrl(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function startLogin(navigate: (url: string) => void): void {
  const returnUrl = encodeURIComponent(currentReturnUrl());
  navigate(`/oauth2/start?rd=${returnUrl}`);
}

const defaultNavigate = (url: string) => window.location.assign(url);

interface AuthProviderProps {
  children: ReactNode;
  apiBaseUrl?: string;
  navigate?: (url: string) => void;
}

export function AuthProvider({ children, apiBaseUrl = '/api', navigate = defaultNavigate }: AuthProviderProps) {
  const [mode, setMode] = useState<AuthMode>('loading');
  const [identity, setIdentity] = useState<AuthIdentity | null>(null);
  const modeRef = useRef<AuthMode>('loading');

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const checkSession = useCallback(async () => {
    try {
      const response = await window.fetch(`${apiBaseUrl}/whoami`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });

      if (response.status === 401) {
        // The global wrapper below handles this once an authenticated session
        // exists. This branch covers the provider's initial/loading state.
        if (modeRef.current !== 'authenticated') startLogin(navigate);
        return;
      }
      if (!response.ok) return;

      const nextIdentity = await response.json() as AuthIdentity;
      setIdentity(nextIdentity);
      setMode(nextIdentity.authenticated ? 'authenticated' : 'disabled');
    } catch {
      // A transient API/network failure must not log the user out.
    }
  }, [apiBaseUrl, navigate]);

  useEffect(() => {
    queueMicrotask(() => void checkSession());
    const interval = window.setInterval(() => void checkSession(), 30_000);
    const onFocus = () => void checkSession();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void checkSession();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [checkSession]);

  useEffect(() => {
    // Existing components use fetch directly. Intercept authenticated API 401s
    // centrally so an expired cookie restarts login immediately without a
    // large, error-prone rewrite of every call site.
    const originalFetch = window.fetch.bind(window);
    const authAwareFetch: typeof window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (response.status === 401 && modeRef.current === 'authenticated') startLogin(navigate);
      return response;
    };
    window.fetch = authAwareFetch;
    return () => {
      if (window.fetch === authAwareFetch) window.fetch = originalFetch;
    };
  }, [navigate]);

  const signOut = useCallback(() => {
    navigate('/oauth2/sign_out?rd=/signed-out.html');
  }, [navigate]);

  return <AuthContext.Provider value={{ mode, identity, signOut }}>{children}</AuthContext.Provider>;
}
