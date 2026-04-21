'use client';

// Client-side auth context.
// MVP trade-off: tokens stored in localStorage for simplicity. This exposes them to XSS.
// Production hardening: move to httpOnly cookies via Next.js route handlers acting as a BFF
// to the Fastify API; see roadmap in .artifacts/06-coder-plan.md §Quality.

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, clearTokens, getAccessToken, setTokens } from './api';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  departmentId: string | null;
  locale: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const load = useCallback(async () => {
    if (!getAccessToken()) { setLoading(false); return; }
    try {
      const me = await apiFetch<AuthUser>('/v1/me');
      setUser(me);
    } catch {
      clearTokens();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiFetch<{ accessToken: string; refreshToken: string; user: AuthUser }>(
      '/v1/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }), auth: false },
    );
    setTokens(res.accessToken, res.refreshToken);
    setUser(res.user);
    router.push('/dashboard');
  }, [router]);

  const logout = useCallback(async () => {
    try { await apiFetch('/v1/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    clearTokens();
    setUser(null);
    router.push('/login');
  }, [router]);

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
