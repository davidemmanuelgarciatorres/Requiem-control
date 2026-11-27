import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, setCsrfToken, type SessionInfo } from '../lib/api';

export type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'unreachable' }
  | { status: 'authenticated'; session: SessionInfo };

type AuthValue = {
  state: AuthState;
  session: SessionInfo | null;
  can: (permission: string) => boolean;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<SessionInfo>;
  register: (input: { email: string; password: string; full_name: string; organization_name?: string; invite_token?: string; preferred_language: 'es' | 'en' }) => Promise<SessionInfo>;
  logout: () => Promise<void>;
  switchOrganization: (organizationId: string) => Promise<void>;
  createOrganization: (name: string) => Promise<void>;
  /** Sustituye la sesión con una respuesta de la API que la devuelve completa. */
  applySession: (session: SessionInfo) => void;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const applySession = useCallback((session: SessionInfo) => {
    setCsrfToken(session.csrf_token);
    setState({ status: 'authenticated', session });
  }, []);

  const clear = useCallback((status: 'anonymous' | 'unreachable') => {
    setCsrfToken(null);
    setState({ status });
  }, []);

  const refresh = useCallback(async () => {
    try {
      applySession(await api<SessionInfo>('/auth/me'));
    } catch (e) {
      clear(e instanceof ApiError && e.status === 401 ? 'anonymous' : 'unreachable');
    }
  }, [applySession, clear]);

  useEffect(() => {
    let cancelled = false;
    api<SessionInfo>('/auth/me')
      .then((s) => !cancelled && applySession(s))
      .catch((e: unknown) => !cancelled && clear(e instanceof ApiError && e.status === 401 ? 'anonymous' : 'unreachable'));
    return () => {
      cancelled = true;
    };
  }, [applySession, clear]);

  const value = useMemo<AuthValue>(() => {
    const session = state.status === 'authenticated' ? state.session : null;
    return {
      state,
      session,
      can: (p) => !!session?.permissions.includes(p),
      refresh,
      applySession,
      login: async (email, password) => {
        const s = await api<SessionInfo>('/auth/login', { method: 'POST', body: { email, password } });
        applySession(s);
        return s;
      },
      register: async (input) => {
        const s = await api<SessionInfo>('/auth/register', { method: 'POST', body: input });
        applySession(s);
        return s;
      },
      logout: async () => {
        try {
          await api<void>('/auth/logout', { method: 'POST' });
        } finally {
          clear('anonymous');
        }
      },
      switchOrganization: async (organization_id) => {
        applySession(await api<SessionInfo>('/auth/switch-organization', { method: 'POST', body: { organization_id } }));
      },
      createOrganization: async (name) => {
        applySession(await api<SessionInfo>('/organizations', { method: 'POST', body: { name } }));
      },
    };
  }, [state, refresh, applySession, clear]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
