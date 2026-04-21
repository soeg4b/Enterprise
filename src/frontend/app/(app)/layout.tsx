'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth';
import { Sidebar } from '../../components/Sidebar';
import { Topbar } from '../../components/Topbar';
import { OfflineBanner } from '../../components/OfflineBanner';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading) return <div className="p-8 text-slate-500">Loading…</div>;
  if (!user) return null;

  return (
    <div className="min-h-screen flex">
      <Sidebar role={user.role} />
      <div className="flex-1 flex flex-col">
        <Topbar />
        <OfflineBanner />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
