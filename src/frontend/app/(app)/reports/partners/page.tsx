'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PartnerDeliveryReportDto, PartnerDeliveryRowDto } from 'deliveriq-shared';
import { apiFetch } from '../../../../lib/api';
import { StatusPill } from '../../../../components/StatusPill';

export default function PartnerDeliveryPage() {
  const [data, setData] = useState<PartnerDeliveryReportDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'ON_TRACK' | 'AT_RISK' | 'DELAY' | 'OVER_BUDGET'>('ALL');
  const [search, setSearch] = useState('');

  useEffect(() => {
    apiFetch<PartnerDeliveryReportDto>('/v1/reports/partner-delivery')
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.rows.filter((r) => {
      if (filter === 'OVER_BUDGET' && r.capexHealth !== 'OVER') return false;
      if (filter !== 'ALL' && filter !== 'OVER_BUDGET' && r.warningLevel !== filter) return false;
      if (q) {
        const searchBlob = [
          r.projectName,
          r.customerName,
          r.productCategory,
          ...r.siteNames,
        ]
          .join(' ')
          .toLowerCase();
        if (!searchBlob.includes(q)) return false;
      }
      return true;
    });
  }, [data, filter, search]);

  if (error) return <div className="text-red-600">{error}</div>;
  if (!data) return <div className="text-slate-500">Loading partner delivery report…</div>;

  const totalImpl = data.rows.length
    ? Math.round(
        (data.rows.reduce((a, r) => a + r.implementationPct, 0) / data.rows.length) * 10,
      ) / 10
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Partner Delivery Status</h1>
          <p className="text-sm text-slate-500">
            {data.rows.length} project • Avg implementation {totalImpl}% • Generated{' '}
            {new Date(data.generatedAt).toLocaleString('id-ID')} ({data.cacheStatus})
          </p>
        </div>
      </div>

      <div className="bg-white rounded shadow p-3 flex flex-wrap gap-2 items-center">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search product, customer, project, or site…"
          className="border rounded px-3 py-1.5 text-sm flex-1 min-w-[200px]"
        />
        <FilterBtn cur={filter} val="ALL" onSet={setFilter}>All ({data.rows.length})</FilterBtn>
        <FilterBtn cur={filter} val="ON_TRACK" onSet={setFilter}>
          On Track ({data.rows.filter((r) => r.warningLevel === 'ON_TRACK').length})
        </FilterBtn>
        <FilterBtn cur={filter} val="AT_RISK" onSet={setFilter}>
          At Risk ({data.rows.filter((r) => r.warningLevel === 'AT_RISK').length})
        </FilterBtn>
        <FilterBtn cur={filter} val="DELAY" onSet={setFilter}>
          Delay ({data.rows.filter((r) => r.warningLevel === 'DELAY').length})
        </FilterBtn>
        <FilterBtn cur={filter} val="OVER_BUDGET" onSet={setFilter}>
          Over Budget ({data.rows.filter((r) => r.capexHealth === 'OVER').length})
        </FilterBtn>
      </div>

      <section className="bg-white rounded shadow overflow-hidden">
        <header className="bg-blue-900 text-white px-4 py-3 grid grid-cols-12 gap-2 text-sm font-semibold">
          <div className="col-span-5">PROJECT NAME</div>
          <div className="col-span-2 text-center">IMPLEMENTATION (%)</div>
          <div className="col-span-2 text-center">CAPEX REALIZATION</div>
          <div className="col-span-3">CRITICAL ISSUE</div>
        </header>
        <div className="divide-y">
          {rows.map((r) => (
            <Row key={r.orderId} r={r} />
          ))}
          {rows.length === 0 && (
            <div className="p-8 text-center text-slate-400">No projects match filter.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function FilterBtn({
  cur, val, onSet, children,
}: {
  cur: string;
  val: 'ALL' | 'ON_TRACK' | 'AT_RISK' | 'DELAY' | 'OVER_BUDGET';
  onSet: (v: 'ALL' | 'ON_TRACK' | 'AT_RISK' | 'DELAY' | 'OVER_BUDGET') => void;
  children: React.ReactNode;
}) {
  const active = cur === val;
  return (
    <button
      type="button"
      onClick={() => onSet(val)}
      className={`text-xs px-3 py-1.5 rounded border ${
        active
          ? 'bg-blue-900 text-white border-blue-900'
          : 'bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  );
}

function Row({ r }: { r: PartnerDeliveryRowDto }) {
  return (
    <div className="grid grid-cols-12 gap-2 px-4 py-3 text-sm items-center hover:bg-slate-50">
      <div className="col-span-5">
        <a
          href={`/orders/${r.orderId}`}
          className="text-blue-700 hover:underline font-medium"
        >
          {r.projectName}
        </a>
        <div className="text-xs text-slate-500">
          {r.orderNumber} • {r.customerName}
          {r.vendorNames.length > 0 && ` • ${r.vendorNames.join(', ')}`}
        </div>
      </div>
      <div className="col-span-2">
        <ProgressBar pct={r.implementationPct} level={r.warningLevel} />
      </div>
      <div className="col-span-2 flex items-center justify-center gap-2">
        <span className="font-mono text-sm">{r.capexRealizationPct}%</span>
        <CapexIcon ok={r.capexHealth === 'OK'} />
      </div>
      <div className="col-span-3 flex items-center gap-2">
        <StatusPill status={r.warningLevel} />
        <span className="text-xs text-slate-700 truncate" title={r.criticalIssue}>
          {r.criticalIssue}
        </span>
      </div>
    </div>
  );
}

function ProgressBar({ pct, level }: { pct: number; level: string }) {
  const color =
    level === 'DELAY' ? '#ef4444' : level === 'AT_RISK' ? '#f59e0b' : '#10b981';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-100 h-3 rounded overflow-hidden">
        <div
          className="h-full rounded transition-all"
          style={{ width: `${Math.min(100, pct)}%`, background: color }}
        />
      </div>
      <span className="text-xs font-mono w-10 text-right">{pct}%</span>
    </div>
  );
}

function CapexIcon({ ok }: { ok: boolean }) {
  if (ok) {
    return (
      <span
        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white text-xs"
        title="Within budget"
      >
        ✓
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-xs"
      title="Over budget"
    >
      ✕
    </span>
  );
}
