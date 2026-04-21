'use client';

import { useEffect, useState } from 'react';

export function OfflineBanner() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  if (online) return null;
  return <div className="bg-amber-100 text-amber-900 px-4 py-2 text-sm border-b border-amber-300">You are offline. Reconnect to refresh data.</div>;
}
