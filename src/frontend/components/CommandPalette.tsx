'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, API_URL } from '../lib/api';

type SearchHit = {
  kind: 'order' | 'sow' | 'site' | 'fiber' | 'nav';
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  badge?: string;
};

type OrdersList = {
  data: Array<{
    id: string;
    orderNumber: string;
    customerName?: string;
    productCategory?: string;
  }>;
};

type FiberList = {
  items: Array<{
    id: string;
    code: string;
    name: string;
    customerName: string;
    status: string;
  }>;
};

const QUICK_NAV: SearchHit[] = [
  { kind: 'nav', id: 'nav-dashboard', title: 'Dashboard', subtitle: 'Portfolio overview', href: '/dashboard' },
  { kind: 'nav', id: 'nav-board', title: 'Board', subtitle: 'Kanban view of SOWs', href: '/board' },
  { kind: 'nav', id: 'nav-timeline', title: 'Timeline', subtitle: 'Gantt view of SOWs', href: '/timeline' },
  { kind: 'nav', id: 'nav-mywork', title: 'My Work', subtitle: 'Items assigned to me', href: '/my-work' },
  { kind: 'nav', id: 'nav-orders', title: 'Programs', subtitle: 'All orders', href: '/orders' },
  { kind: 'nav', id: 'nav-fiber', title: 'Fiber Projects', subtitle: 'Fiber link tagging', href: '/fiber' },
  { kind: 'nav', id: 'nav-pm', title: 'Project Management', href: '/project-management' },
  { kind: 'nav', id: 'nav-execsum', title: 'Executive Summary', href: '/reports/executive' },
  { kind: 'nav', id: 'nav-partners', title: 'Partner Delivery', href: '/reports/partners' },
  { kind: 'nav', id: 'nav-imports', title: 'Imports', href: '/imports' },
  { kind: 'nav', id: 'nav-notifications', title: 'Notifications', href: '/notifications' },
  { kind: 'nav', id: 'nav-audit', title: 'Audit', href: '/audit' },
];

const KIND_META: Record<SearchHit['kind'], { label: string; cls: string }> = {
  nav: { label: 'GO', cls: 'bg-slate-100 text-slate-600' },
  order: { label: 'ORDER', cls: 'bg-blue-100 text-blue-700' },
  sow: { label: 'SOW', cls: 'bg-violet-100 text-violet-700' },
  site: { label: 'SITE', cls: 'bg-amber-100 text-amber-700' },
  fiber: { label: 'FIBER', cls: 'bg-sky-100 text-sky-700' },
};

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [orders, setOrders] = useState<SearchHit[]>([]);
  const [fibers, setFibers] = useState<SearchHit[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Global keybinding: Ctrl/Cmd+K opens palette; Esc closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Lazy-load searchable corpora when palette opens
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    setActiveIdx(0);

    apiFetch<OrdersList>('/v1/orders?limit=200')
      .then((d) =>
        setOrders(
          d.data.map((o) => ({
            kind: 'order' as const,
            id: o.id,
            title: o.orderNumber,
            subtitle: [o.customerName, o.productCategory].filter(Boolean).join(' · '),
            href: `/orders/${o.id}`,
          })),
        ),
      )
      .catch(() => undefined);

    fetch(`${API_URL}/v1/fiber-projects`)
      .then((r) => (r.ok ? (r.json() as Promise<FiberList>) : null))
      .then((d) => {
        if (!d) return;
        setFibers(
          d.items.map((f) => ({
            kind: 'fiber' as const,
            id: f.id,
            title: f.code,
            subtitle: `${f.name} · ${f.customerName}`,
            href: `/fiber/${f.id}`,
            badge: f.status,
          })),
        );
      })
      .catch(() => undefined);
  }, [open]);

  const hits = useMemo<SearchHit[]>(() => {
    const q = query.trim().toLowerCase();
    const all = [...QUICK_NAV, ...orders, ...fibers];
    if (!q) return all.slice(0, 12);
    return all
      .filter((h) =>
        h.title.toLowerCase().includes(q) ||
        (h.subtitle ?? '').toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [query, orders, fibers]);

  function go(hit: SearchHit) {
    setOpen(false);
    setQuery('');
    router.push(hit.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, hits.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const h = hits[activeIdx]; if (h) go(h); }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="hidden md:inline-flex items-center gap-2 text-xs text-slate-500 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded px-2 py-1"
        title="Search (Ctrl+K)"
      >
        <span>🔎 Search…</span>
        <kbd className="bg-white border border-slate-300 px-1 rounded text-[10px] font-mono">Ctrl K</kbd>
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-[10vh] px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="bg-white rounded-lg shadow-2xl w-full max-w-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-3 py-2 flex items-center gap-2">
          <span className="text-slate-400">🔎</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
            onKeyDown={onKeyDown}
            placeholder="Search orders, fiber projects, pages…"
            className="flex-1 outline-none text-sm py-1"
          />
          <kbd className="text-[10px] text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded">Esc</kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {hits.length === 0 && (
            <div className="px-3 py-6 text-sm text-slate-500 text-center">No results for &quot;{query}&quot;</div>
          )}
          {hits.map((h, i) => {
            const meta = KIND_META[h.kind];
            const active = i === activeIdx;
            return (
              <button
                key={`${h.kind}-${h.id}`}
                onClick={() => go(h)}
                onMouseEnter={() => setActiveIdx(i)}
                className={`w-full text-left px-3 py-2 flex items-center gap-3 ${active ? 'bg-sky-50' : 'hover:bg-slate-50'}`}
              >
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${meta.cls}`}>{meta.label}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium truncate">{h.title}</span>
                  {h.subtitle && <span className="block text-xs text-slate-500 truncate">{h.subtitle}</span>}
                </span>
                {h.badge && <span className="text-[10px] text-slate-500">{h.badge}</span>}
              </button>
            );
          })}
        </div>
        <div className="px-3 py-1.5 border-t border-slate-200 text-[11px] text-slate-500 flex items-center justify-between">
          <span>↑↓ navigate · ⏎ open · Esc close</span>
          <span>{hits.length} result{hits.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  );
}
