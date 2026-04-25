// Thin authenticated fetch wrapper for the mobile app.
import * as SecureStore from 'expo-secure-store';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3600';
const TOKEN_KEY = 'deliveriq.accessToken';
const REFRESH_KEY = 'deliveriq.refreshToken';
const USER_KEY = 'deliveriq.currentUser';

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}
export async function setTokens(access: string, refresh: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, access);
  await SecureStore.setItemAsync(REFRESH_KEY, refresh);
}
export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}

// Persist the current user profile so screens can read it without an extra round-trip.
export async function storeUser(user: { id: string; email: string; fullName: string; role: string }): Promise<void> {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}
export async function getStoredUser(): Promise<{ id: string; email: string; fullName: string; role: string } | null> {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as { id: string; email: string; fullName: string; role: string }; }
  catch { return null; }
}

export async function api<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (init.auth !== false) {
    const t = await getToken();
    if (t) headers.set('Authorization', `Bearer ${t}`);
  }
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const ct = res.headers.get('content-type') ?? '';
  const body = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const detail = (body && typeof body === 'object' && 'detail' in body) ? (body as { detail: string }).detail : `HTTP ${res.status}`;
    throw new Error(detail);
  }
  return body as T;
}
