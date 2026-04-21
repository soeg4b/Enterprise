'use client';

import { useAuth } from '../lib/auth';

export function Topbar() {
  const { user, logout } = useAuth();
  return (
    <header className="h-14 bg-white border-b flex items-center justify-between px-4">
      <div className="text-sm text-slate-500">Asia/Jakarta · WIB</div>
      <div className="flex items-center gap-3 text-sm">
        <span>{user?.fullName} <em className="text-slate-400">({user?.role})</em></span>
        <button onClick={() => void logout()} className="px-3 py-1 border border-slate-300 rounded">Logout</button>
      </div>
    </header>
  );
}
