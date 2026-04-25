'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { PartnerDeliveryReportDto, PartnerDeliveryRowDto, OverallStatus } from 'deliveriq-shared';
import { apiFetch } from '../../../lib/api';
import { ProgramsViewSwitcher } from '../../../components/ProgramsViewSwitcher';

type Column = { key: OverallStatus; title: string; cls: string; ringCls: string };

const COLUMNS: Column[] = [
  { key: 'ON_TRACK', title: 'On Track',   cls: 'bg-emerald-50 border-emerald-200',  ringCls: 'bg-emerald-500' },
  { key: 'AT_RISK',  title: 'At Risk',    cls: 'bg-amber-50   border-amber-200',    ringCls: 'bg-amber-500' },
  { key: 'DELAY',    title: 'Delayed',    cls: 'bg-rose-50    border-rose-200',     ringCls: 'bg-rose-500' },
  { key: 'UNKNOWN',  title: 'Unknown',    cls: 'bg-slate-50   border-slate-200',    ringCls: 'bg-slate-400' },
];

export default function BoardPage() {
  const [data, setData] = useState<PartnerDeliveryReportDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [productFilter, setProductFilter] = useState<string>('ALL');

  useEffect(() => {
    apiFetch<PartnerDeliveryReportDto>('/v1/reports/partner-delivery')
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  const products = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.rows.map((r) => r.productCategory))).sort();
  }, [data]);

  const filtered = useMemo<PartnerDeliveryRowDto[]>(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.rows.filter((r) => {
      if (productFilter !== 'ALL' && r.productCategory !== productFilter) return false;
      if (!q) return true;
      return [r.orderNumber, r.projectName, r.customerName, ...(r.siteNames ?? []), ...(r.vendorNames ?? [])]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q));
    });
  }, [data, search, productFilter]);

  const groups = useMemo(() => {
    const m: Record<OverallStatus, PartnerDeliveryRowDto[]> = { ON_TRACK: [], AT_RISK: [], DELAY: [], UNKNOWN: [] };
    for (const r of filtered) (m[r.warningLevel] ??= []).push(r);
    return m;
  }, [filtered]);

  if (error) return <div className="p-6 text-rose-600">Error: {error}</div>;
  if (!data) return <div className="p-6 text-slate-500">Loading board…</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div className="space-y-2">
          <ProgramsViewSwitcher active="board" />
          <h1 className="text-2xl font-bold">Delivery Board</h1>
          <p className="text-sm text-slate-500">{filtered.length} of {data.rows.length} orders · grouped by warning level · cache: {data.cacheStatus}</p>
        </div>
        <div className="flex gap-2 items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order, customer, site, vendor…"
            className="border border-slate-300 rounded px-2 py-1 text-sm w-64"
          />
          <select
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
            className="border border-slate-300 rounded px-2 py-1 text-sm"
          >
            <option value="ALL">All Products</option>
            {products.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {COLUMNS.map((col) => {
          const items = groups[col.key] ?? [];
          return (
            <div key={col.key} className={`rounded-lg border ${col.cls} flex flex-col`}>
              <div className="px-3 py-2 border-b border-slate-200/70 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${col.ringCls}`} />
                  <h2 className="font-semibold text-sm">{col.title}</h2>
                </div>
                <span className="text-xs font-mono bg-white border border-slate-200 rounded px-1.5">{items.length}</span>
              </div>
              <div className="p-2 space-y-2 max-h-[70vh] overflow-y-auto min-h-[100px]">
                {items.length === 0 && (
                  <div className="text-xs text-slate-400 text-center py-6">No orders</div>
                )}
                {items.map((r) => (
                  <Link
                    key={r.orderId}
                    href={`/orders/${r.orderId}`}
                    className="block bg-white rounded border border-slate-200 hover:border-sky-400 hover:shadow-sm transition p-3 group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-[11px] text-slate-500">{r.orderNumber}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{r.productCategory}</span>
                    </div>
                    <div className="font-semibold text-sm mt-1 group-hover:text-sky-700 line-clamp-2">{r.projectName}</div>
                    <div className="text-xs text-slate-500 mt-0.5 truncate">{r.customerName}</div>

                    {/* Implementation progress */}
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-[10px] text-slate-500 mb-0.5">
                        <span>Implementation</span>
                        <span className="font-mono">{r.implementationPct}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded h-1 overflow-hidden">
                        <div
                          className={`h-full ${col.ringCls}`}
                          style={{ width: `${Math.min(100, Math.max(0, r.implementationPct))}%` }}
                        />
                      </div>
                    </div>

                    {/* Capex */}
                    <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1.5">
                      <span>Capex realisation</span>
                      <span className={`font-mono ${r.capexHealth === 'OVER' ? 'text-rose-600 font-semibold' : ''}`}>{r.capexRealizationPct}%</span>
                    </div>

                    {/* Sites & vendors */}
                    {(r.siteNames?.length ?? 0) > 0 && (
                      <div className="text-[10px] text-slate-500 mt-1 truncate">
                        🏢 {r.siteNames.slice(0, 2).join(', ')}{r.siteNames.length > 2 ? ` +${r.siteNames.length - 2}` : ''}
                      </div>
                    )}
                    {(r.vendorNames?.length ?? 0) > 0 && (
                      <div className="text-[10px] text-slate-500 truncate">
                        🛠 {r.vendorNames.slice(0, 2).join(', ')}{r.vendorNames.length > 2 ? ` +${r.vendorNames.length - 2}` : ''}
                      </div>
                    )}

                    {r.criticalIssue && r.criticalIssue !== '-' && (
                      <div className="mt-1.5 text-[11px] bg-rose-50 text-rose-700 border border-rose-200 rounded px-1.5 py-0.5 line-clamp-2">
                        ⚠ {r.criticalIssue}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
