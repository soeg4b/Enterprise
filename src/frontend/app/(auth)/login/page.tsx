'use client';

import { useState, type FormEvent } from 'react';
import { useAuth } from '../../../lib/auth';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('admin@deliveriq.local');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-100">
      <form onSubmit={onSubmit} className="w-full max-w-sm bg-white p-6 rounded-lg shadow space-y-4">
        <h1 className="text-2xl font-bold text-center">PDC Enterprise</h1>
        <p className="text-sm text-slate-500 text-center">Masuk ke akun Anda</p>
        <label className="block">
          <span className="text-sm">Email</span>
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full border rounded px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-sm">Password</span>
          <input
            type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full border rounded px-3 py-2"
          />
        </label>
        {error && <div className="text-sm text-red-600">{error}</div>}
        <button
          type="submit" disabled={busy}
          className="w-full py-2 bg-slate-900 text-white rounded disabled:opacity-60"
        >
          {busy ? 'Memproses…' : 'MASUK'}
        </button>
      </form>
    </main>
  );
}
