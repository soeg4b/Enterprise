'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV: Array<{ href: string; label: string; roles?: string[] }> = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/my-work', label: 'My Work' },
  { href: '/board', label: 'Board' },
  { href: '/timeline', label: 'Timeline' },
  { href: '/project-management', label: 'Project Management' },
  { href: '/reports/executive', label: 'Executive Summary' },
  { href: '/reports/partners', label: 'Partner Delivery' },
  { href: '/orders', label: 'Programs' },
  { href: '/fiber', label: 'Fiber Projects' },
  { href: '/imports', label: 'Imports' },
  { href: '/notifications', label: 'Notifications' },
  { href: '/audit', label: 'Audit', roles: ['AD'] },
];

export function Sidebar({ role }: { role: string }) {
  const path = usePathname();
  const items = NAV.filter((n) => !n.roles || n.roles.includes(role));
  return (
    <aside className="w-56 bg-slate-900 text-slate-100 min-h-screen p-4 space-y-1">
      <div className="text-lg font-bold mb-4">PDC Enterprise</div>
      <nav className="space-y-1">
        {items.map((it) => {
          const active = path?.startsWith(it.href);
          return (
            <Link
              key={it.href} href={it.href}
              className={`block px-3 py-2 rounded text-sm ${active ? 'bg-slate-700' : 'hover:bg-slate-800'}`}
            >{it.label}</Link>
          );
        })}
      </nav>
    </aside>
  );
}
