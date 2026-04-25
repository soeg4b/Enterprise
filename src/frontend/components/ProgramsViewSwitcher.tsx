'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

type ViewKey = 'table' | 'board' | 'timeline';

const VIEWS: Array<{ key: ViewKey; label: string; href: string; icon: string; hint: string }> = [
  { key: 'table',    label: 'Table',    href: '/orders',   icon: '☰',  hint: 'Spreadsheet-style list (previous view)' },
  { key: 'board',    label: 'Board',    href: '/board',    icon: '▦',  hint: 'Jira-style Kanban grouped by status' },
  { key: 'timeline', label: 'Timeline', href: '/timeline', icon: '▭',  hint: 'Gantt timeline of delivery windows' },
];

const STORAGE_KEY = 'deliveriq.programsView';

export function ProgramsViewSwitcher({ active }: { active: ViewKey }) {
  const router = useRouter();
  const pathname = usePathname();

  // Remember the most recent choice so the next visit lands on the same view.
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, active); } catch { /* ignore */ }
  }, [active]);

  // Keyboard shortcut: g+t / g+b / g+l (Gmail/Linear-style)
  useEffect(() => {
    let lastKey = '';
    let lastTs = 0;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
      const now = Date.now();
      if (lastKey === 'g' && now - lastTs < 800) {
        const map: Record<string, string> = { t: '/orders', b: '/board', l: '/timeline' };
        const dest = map[e.key.toLowerCase()];
        if (dest && dest !== pathname) {
          e.preventDefault();
          router.push(dest);
        }
        lastKey = '';
      } else if (e.key.toLowerCase() === 'g') {
        lastKey = 'g';
        lastTs = now;
      } else {
        lastKey = '';
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router, pathname]);

  return (
    <div className="inline-flex bg-slate-100 border border-slate-200 rounded-md p-0.5" role="tablist" aria-label="View mode">
      {VIEWS.map((v) => {
        const isActive = v.key === active;
        return (
          <Link
            key={v.key}
            href={v.href}
            role="tab"
            aria-selected={isActive}
            title={v.hint}
            className={
              `px-3 py-1 text-sm rounded inline-flex items-center gap-1.5 transition ` +
              (isActive
                ? 'bg-white shadow-sm text-slate-900 font-medium'
                : 'text-slate-600 hover:text-slate-900')
            }
          >
            <span className="text-base leading-none">{v.icon}</span>
            <span>{v.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

/** Read the last chosen view, falling back to 'table'. Safe on SSR. */
export function getPreferredProgramsView(): ViewKey {
  if (typeof window === 'undefined') return 'table';
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'table' || v === 'board' || v === 'timeline') return v;
  } catch { /* ignore */ }
  return 'table';
}
