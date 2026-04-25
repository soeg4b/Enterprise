'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { OrderDto, Paginated, OverallStatus, PartnerDeliveryReportDto } from 'deliveriq-shared';
import { apiFetch } from '../../../lib/api';
import { ProgramsViewSwitcher } from '../../../components/ProgramsViewSwitcher';

// Map orderId -> metadata from partner-delivery report.
type StatusMap = Map<string, { warningLevel: OverallStatus; implementationPct: number; projectName: string; customerName: string }>;

const STATUS_COLOR: Record<OverallStatus, string> = {
  ON_TRACK: '#10b981',
  AT_RISK:  '#f59e0b',
  DELAY:    '#f43f5e',
  UNKNOWN:  '#94a3b8',
};

const DAY_MS = 86_400_000;

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function fmtMonth(d: Date) { return d.toLocaleString('en-US', { month: 'short', year: '2-digit' }); }

export default function TimelinePage() {
  const [orders, setOrders] = useState<OrderDto[] | null>(null);
  const [statusMap, setStatusMap] = useState<StatusMap>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Paginated<OrderDto>>('/v1/orders?pageSize=200')
      .then((r) => setOrders(r.data))
      .catch((e) => setError(String(e)));
    apiFetch<PartnerDeliveryReportDto>('/v1/reports/partner-delivery')
      .then((r) => {
        const m: StatusMap = new Map();
        for (const row of r.rows)
          m.set(row.orderId, {
            warningLevel: row.warningLevel,
            implementationPct: row.implementationPct,
            projectName: row.projectName,
            customerName: row.customerName,
          });
        setStatusMap(m);
      })
      .catch(() => undefined);
  }, []);

  const datedOrders = useMemo(
    () => (orders ?? []).filter((o) => o.startDate && o.endDate),
    [orders],
  );

  const range = useMemo(() => {
    if (datedOrders.length === 0) return null;
    let min = Infinity, max = -Infinity;
    for (const o of datedOrders) {
      const s = new Date(o.startDate!).getTime();
      const e = new Date(o.endDate!).getTime();
      if (s < min) min = s;
      if (e > max) max = e;
    }
    const start = startOfMonth(new Date(min));
    const end = addMonths(startOfMonth(new Date(max)), 1);
    const months: Date[] = [];
    for (let d = new Date(start); d < end; d = addMonths(d, 1)) months.push(new Date(d));
    return { start, end, months, totalMs: end.getTime() - start.getTime() };
  }, [datedOrders]);

  if (error) return <div className="p-6 text-rose-600">Error: {error}</div>;
  if (!orders) return <div className="p-6 text-slate-500">Loading timeline…</div>;
  if (!range) return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-2">Timeline</h1>
      <p className="text-slate-500">No orders have both start and end dates set.</p>
    </div>
  );

  const ROW_H = 40;
  const HEADER_H = 32;
  const LABEL_W = 280;
  const CONTENT_W = Math.max(800, range.months.length * 90);
  const today = Date.now();
  const todayX = ((today - range.start.getTime()) / range.totalMs) * CONTENT_W;
  const todayInRange = today >= range.start.getTime() && today <= range.end.getTime();

  // Sort by startDate so Gantt reads top-to-bottom chronologically.
  const sorted = [...datedOrders].sort(
    (a, b) => new Date(a.startDate!).getTime() - new Date(b.startDate!).getTime(),
  );

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div className="space-y-2">
          <ProgramsViewSwitcher active="timeline" />
          <h1 className="text-2xl font-bold">Timeline</h1>
          <p className="text-sm text-slate-500">
            {sorted.length} orders with scheduled delivery windows · color-coded by warning level
          </p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-3 text-xs">
        {(Object.keys(STATUS_COLOR) as OverallStatus[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded" style={{ background: STATUS_COLOR[k] }} />
            {k.replace('_', ' ')}
          </span>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <div style={{ width: LABEL_W + CONTENT_W, minWidth: '100%' }}>
          {/* Month header */}
          <div className="flex border-b border-slate-200 bg-slate-50 sticky top-0 z-10" style={{ height: HEADER_H }}>
            <div style={{ width: LABEL_W }} className="px-3 flex items-center text-xs font-semibold text-slate-600 border-r border-slate-200">
              Project
            </div>
            <div className="relative flex-1" style={{ width: CONTENT_W }}>
              {range.months.map((m, i) => {
                const x = (i / range.months.length) * CONTENT_W;
                return (
                  <div
                    key={m.toISOString()}
                    className="absolute top-0 bottom-0 border-l border-slate-200 text-[10px] text-slate-500 px-1 flex items-center"
                    style={{ left: x, width: CONTENT_W / range.months.length }}
                  >
                    {fmtMonth(m)}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Rows */}
          <div className="relative">
            {todayInRange && (
              <div
                className="absolute top-0 bottom-0 border-l-2 border-sky-500 z-20 pointer-events-none"
                style={{ left: LABEL_W + todayX }}
                title={`Today: ${new Date(today).toLocaleDateString()}`}
              >
                <span className="absolute -top-0 left-1 text-[9px] text-sky-600 bg-white px-1 rounded">today</span>
              </div>
            )}

            {sorted.map((o) => {
              const start = new Date(o.startDate!).getTime();
              const end = new Date(o.endDate!).getTime();
              const x = ((start - range.start.getTime()) / range.totalMs) * CONTENT_W;
              const w = Math.max(4, ((end - start) / range.totalMs) * CONTENT_W);
              const meta = statusMap.get(o.id);
              const color = STATUS_COLOR[meta?.warningLevel ?? 'UNKNOWN'];
              const pct = meta?.implementationPct ?? 0;
              const days = Math.round((end - start) / DAY_MS);
              const projectName = meta?.projectName ?? o.orderNumber;
              const customerName = meta?.customerName ?? '';

              return (
                <Link
                  key={o.id}
                  href={`/orders/${o.id}`}
                  className="flex border-b border-slate-100 hover:bg-sky-50/50 transition"
                  style={{ height: ROW_H }}
                >
                  <div
                    style={{ width: LABEL_W }}
                    className="px-3 flex flex-col justify-center gap-0.5 border-r border-slate-200 min-w-0"
                  >
                    <span className="text-xs font-medium text-slate-800 truncate leading-tight" title={projectName}>{projectName}</span>
                    <span className="text-[10px] text-slate-400 truncate leading-tight">
                      <span className="font-mono">{o.orderNumber}</span>
                      {customerName && <span> · {customerName}</span>}
                      <span className="ml-1 text-slate-300">({days}d)</span>
                    </span>
                  </div>
                  <div className="relative flex-1" style={{ width: CONTENT_W }}>
                    <div
                      className="absolute top-1 bottom-1 rounded shadow-sm flex items-center px-2 overflow-hidden"
                      style={{ left: x, width: w, background: color }}
                      title={`${projectName} (${o.orderNumber}) · ${o.startDate} → ${o.endDate} · ${pct}%`}
                    >
                      {w > 60 && <span className="text-[10px] text-white font-mono">{pct}%</span>}
                      <div
                        className="absolute left-0 top-0 bottom-0 bg-black/20"
                        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                      />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {orders.length > sorted.length && (
        <p className="text-xs text-slate-400">
          {orders.length - sorted.length} order(s) hidden — missing start/end dates.
        </p>
      )}
    </div>
  );
}
