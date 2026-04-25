'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { OrderDto, Paginated, PartnerDeliveryReportDto, PartnerDeliveryRowDto, OverallStatus } from 'deliveriq-shared';
import { apiFetch } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  level: string;
  readAt: string | null;
  createdAt: string;
}

const STATUS_BADGE: Record<OverallStatus, string> = {
  ON_TRACK: 'bg-emerald-100 text-emerald-700',
  AT_RISK:  'bg-amber-100   text-amber-700',
  DELAY:    'bg-rose-100    text-rose-700',
  UNKNOWN:  'bg-slate-100   text-slate-700',
};

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export default function MyWorkPage() {
  const { user, loading } = useAuth();
  const [orders, setOrders] = useState<OrderDto[] | null>(null);
  const [report, setReport] = useState<PartnerDeliveryReportDto | null>(null);
  const [notifs, setNotifs] = useState<NotificationItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    // Orders endpoint already scopes PMs to their own; for AD/BOD/DH we'll filter client-side by ownerUserId.
    apiFetch<Paginated<OrderDto>>('/v1/orders?pageSize=200')
      .then((r) => setOrders(r.data))
      .catch((e) => setError(String(e)));
    apiFetch<PartnerDeliveryReportDto>('/v1/reports/partner-delivery')
      .then(setReport)
      .catch(() => undefined);
    apiFetch<{ data: NotificationItem[] }>('/v1/notifications')
      .then((r) => setNotifs(r.data ?? []))
      .catch(() => undefined);
  }, [user]);

  const myOrders = useMemo<OrderDto[]>(() => {
    if (!orders || !user) return [];
    if (user.role === 'PM') return orders; // server already filtered
    return orders.filter((o) => o.ownerUserId === user.id);
  }, [orders, user]);

  const statusByOrder = useMemo(() => {
    const m = new Map<string, PartnerDeliveryRowDto>();
    if (report) for (const r of report.rows) m.set(r.orderId, r);
    return m;
  }, [report]);

  const counts = useMemo(() => {
    const c: Record<OverallStatus, number> = { ON_TRACK: 0, AT_RISK: 0, DELAY: 0, UNKNOWN: 0 };
    for (const o of myOrders) {
      const r = statusByOrder.get(o.id);
      c[r?.warningLevel ?? 'UNKNOWN']++;
    }
    return c;
  }, [myOrders, statusByOrder]);

  const overdue = useMemo(() => {
    const now = Date.now();
    return myOrders.filter((o) => {
      const r = statusByOrder.get(o.id);
      const isLate = r?.warningLevel === 'DELAY';
      const past = o.endDate && new Date(o.endDate).getTime() < now;
      return isLate || past;
    });
  }, [myOrders, statusByOrder]);

  const unreadNotifs = notifs.filter((n) => !n.readAt);

  if (loading) return <div className="p-6 text-slate-500">Loading…</div>;
  if (!user) return <div className="p-6 text-rose-600">Not signed in</div>;
  if (error) return <div className="p-6 text-rose-600">Error: {error}</div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">My Work</h1>
        <p className="text-sm text-slate-500">
          Welcome back, <span className="font-medium">{user.fullName}</span> · role <code className="bg-slate-100 px-1 rounded">{user.role}</code>
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryCard label="My Orders"  value={myOrders.length}        accent="bg-sky-500"     href="/orders" />
        <SummaryCard label="On Track"   value={counts.ON_TRACK}         accent="bg-emerald-500" />
        <SummaryCard label="At Risk"    value={counts.AT_RISK}          accent="bg-amber-500" />
        <SummaryCard label="Delayed"    value={counts.DELAY}            accent="bg-rose-500"    href="/board" />
        <SummaryCard label="Unread"     value={unreadNotifs.length}     accent="bg-violet-500"  href="/notifications" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Overdue / at-risk priority queue */}
        <section className="lg:col-span-2 bg-white rounded-lg border border-slate-200">
          <div className="px-4 py-2 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-semibold text-sm">⚠ Needs attention</h2>
            <span className="text-xs text-slate-500">{overdue.length}</span>
          </div>
          <div className="divide-y divide-slate-100">
            {overdue.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-slate-500">
                Nothing overdue. Nice work!
              </div>
            )}
            {overdue.map((o) => {
              const r = statusByOrder.get(o.id);
              const lvl: OverallStatus = r?.warningLevel ?? 'UNKNOWN';
              return (
                <Link key={o.id} href={`/orders/${o.id}`} className="block px-4 py-2.5 hover:bg-slate-50">
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_BADGE[lvl]}`}>{lvl.replace('_', ' ')}</span>
                    <span className="font-mono text-xs text-slate-600">{o.orderNumber}</span>
                    <span className="font-medium text-sm flex-1 truncate">{r?.projectName ?? `${o.productCategory}`}</span>
                    {r && <span className="text-xs text-slate-500 font-mono">{r.implementationPct}%</span>}
                  </div>
                  {r?.criticalIssue && r.criticalIssue !== '-' && (
                    <div className="text-xs text-slate-500 mt-1 truncate">{r.criticalIssue}</div>
                  )}
                </Link>
              );
            })}
          </div>
        </section>

        {/* Notifications inbox */}
        <section className="bg-white rounded-lg border border-slate-200">
          <div className="px-4 py-2 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-semibold text-sm">🔔 Inbox</h2>
            <Link href="/notifications" className="text-xs text-sky-600 hover:underline">See all</Link>
          </div>
          <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
            {notifs.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-slate-500">No notifications.</div>
            )}
            {notifs.slice(0, 12).map((n) => (
              <div key={n.id} className={`px-4 py-2 ${n.readAt ? '' : 'bg-sky-50/40'}`}>
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium truncate">{n.title}</span>
                  <span className="text-[10px] text-slate-400 ml-auto whitespace-nowrap">{relTime(n.createdAt)}</span>
                </div>
                <p className="text-xs text-slate-600 line-clamp-2 mt-0.5">{n.body}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* All my orders */}
      <section className="bg-white rounded-lg border border-slate-200">
        <div className="px-4 py-2 border-b border-slate-200">
          <h2 className="font-semibold text-sm">All my orders</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2">Order</th>
                <th className="px-4 py-2">Project</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Progress</th>
                <th className="px-4 py-2">End</th>
              </tr>
            </thead>
            <tbody>
              {myOrders.map((o) => {
                const r = statusByOrder.get(o.id);
                const lvl: OverallStatus = r?.warningLevel ?? 'UNKNOWN';
                return (
                  <tr key={o.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono text-xs">
                      <Link href={`/orders/${o.id}`} className="text-sky-700 hover:underline">{o.orderNumber}</Link>
                    </td>
                    <td className="px-4 py-2 truncate max-w-[280px]">{r?.projectName ?? '—'}</td>
                    <td className="px-4 py-2">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_BADGE[lvl]}`}>{lvl.replace('_', ' ')}</span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{r ? `${r.implementationPct}%` : '—'}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">{o.endDate ?? '—'}</td>
                  </tr>
                );
              })}
              {myOrders.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">No orders assigned to you.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value, accent, href }: { label: string; value: number; accent: string; href?: string }) {
  const inner = (
    <div className="bg-white rounded-lg border border-slate-200 px-4 py-3 flex items-center gap-3">
      <span className={`w-1.5 h-10 rounded ${accent}`} />
      <div>
        <div className="text-2xl font-bold leading-tight">{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </div>
  );
  return href ? <Link href={href} className="block hover:shadow-sm transition">{inner}</Link> : inner;
}
