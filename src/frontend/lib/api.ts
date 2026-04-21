// Typed fetch wrapper. Browser-side; injects bearer token from localStorage.
// MVP trade-off: token is in localStorage (XSS-vulnerable). For production, switch
// to httpOnly cookies via Next route handlers — see lib/auth.tsx for note.

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3600';
const TOKEN_KEY = 'deliveriq.accessToken';
const REFRESH_KEY = 'deliveriq.refreshToken';

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setTokens(access: string, refresh: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TOKEN_KEY, access);
  window.localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
}

export class ApiError extends Error {
  status: number;
  code?: string;
  detail?: string;
  constructor(status: number, message: string, code?: string, detail?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  if (init.body && !headers.has('Content-Type') && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (init.auth !== false) {
    const t = getAccessToken();
    if (t) headers.set('Authorization', `Bearer ${t}`);
  }

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json().catch(() => null) : await res.text().catch(() => '');

  if (!res.ok) {
    const code = (body && typeof body === 'object' && 'code' in body) ? (body as { code: string }).code : undefined;
    const detail = (body && typeof body === 'object' && 'detail' in body) ? (body as { detail: string }).detail : undefined;
    throw new ApiError(res.status, `HTTP ${res.status}`, code, detail);
  }
  return body as T;
}
