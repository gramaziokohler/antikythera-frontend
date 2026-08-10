import { createContext, useContext } from 'react';

export interface AuthIdentity {
  authenticated: boolean;
  email?: string | null;
  user?: string | null;
}

export type AuthMode = 'loading' | 'disabled' | 'authenticated';

export interface AuthState {
  mode: AuthMode;
  identity: AuthIdentity | null;
  signOut: () => void;
}

export const AuthContext = createContext<AuthState>({
  mode: 'loading',
  identity: null,
  signOut: () => undefined,
});

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
