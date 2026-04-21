'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { ExecutiveSummaryDto } from 'deliveriq-shared';
import { apiFetch } from '../../../../lib/api';
import { KpiTile } from '../../../../components/KpiTile';
import { IndonesiaDistributionMap } from '../../../../components/IndonesiaDistributionMap';

type ExecutiveDetailDimension = 'province' | 'productCategory';

type ExecutiveDetailDto = {
  dimension: ExecutiveDetailDimension;
  value: string;
  generatedAt: string;
  summary: {
    totalOrders: number;
    totalSows: number;
    totalSites: number;
    deliveredOrders: number;
    totalContractValue: number;
  };
  rows: Array<{
    orderId: string;
    orderNumber: string;
    customerName: string;
    productCategory: string;
    contractValue: number;
    sowCount: number;
    siteCount: number;
    delivered: boolean;
    progressPct: number;
    status: 'ON_TRACK' | 'AT_RISK' | 'DELAY' | 'UNKNOWN';
    provinces: string[];
  }>;
};

const fmtRp = (s: string | number) => {
  const n = typeof s === 'string' ? Number(s) : s;
  if (n >= 1e9) return `Rp ${(n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 })} B`;
  if (n >= 1e6) return `Rp ${(n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} M`;
  return `Rp ${n.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`;
};

export default function ExecutiveSummaryPage() {
  const [data, setData] = useState<ExecutiveSummaryDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ dimension: ExecutiveDetailDimension; value: string } | null>(null);
  const [detail, setDetail] = useState<ExecutiveDetailDto | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const detailSectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    apiFetch<ExecutiveSummaryDto>('/v1/reports/executive-summary')
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      setDetailError(null);
      return;
    }

    setDetailLoading(true);
    setDetailError(null);
    apiFetch<ExecutiveDetailDto>(
      `/v1/reports/executive-summary/detail?dimension=${selected.dimension}&value=${encodeURIComponent(selected.value)}`,
    )
      .then(setDetail)
      .catch((e) => {
        setDetail(null);
        setDetailError(e instanceof Error ? e.message : 'Failed to load detail');
      })
      .finally(() => setDetailLoading(false));
  }, [selected]);

  useEffect(() => {
    if (!selected || !detailSectionRef.current) return;
    detailSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selected]);

  if (error) return <div className="text-red-600">{error}</div>;
  if (!data) return <div className="text-slate-500">Loading executive summary…</div>;

  const totalProvinces = data.projectsByProvince.length;
  const totalProjects = data.projectsByProvince.reduce((a, p) => a + p.totalProjects, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Executive Summary</h1>
          <p className="text-sm text-slate-500">
            Generated {new Date(data.generatedAt).toLocaleString('id-ID')} ({data.cacheStatus})
          </p>
        </div>
      </div>

      {/* Filter strip (read-only labels — wiring filters later) */}
      <div className="bg-white rounded shadow p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <FilterCell label="Year" value="All" />
        <FilterCell label="Departement" value={`${data.filters.departments.length} unit`} />
        <FilterCell label="Product" value={`${data.filters.products.length} kategori`} />
        <FilterCell label="Customer" value={`${data.filters.customers.length} pelanggan`} />
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiTile label="Total Projects" value={totalProjects.toString()} />
        <KpiTile label="Provinces" value={totalProvinces.toString()} />
        <KpiTile label="PO Released" value={data.poMonitoring.grandTotalReleased.toString()} />
        <KpiTile label="PO Delivered" value={data.poMonitoring.grandTotalDelivered.toString()} />
        <KpiTile label="Implementation %" value={`${data.implementation.overallPercent}%`} tone="ontrack" />
        <KpiTile label="Capex Realization %" value={`${data.capexRealization.overallPercent}%`} />
      </div>

      <IndonesiaDistributionMap
        rows={data.projectsByProvince.map((p) => ({ province: p.province, totalProjects: p.totalProjects }))}
        onSelectProvince={(province) => setSelected({ dimension: 'province', value: province })}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Project Summary by Province */}
        <section className="bg-white rounded shadow">
          <header className="px-4 py-3 border-b bg-blue-900 text-white rounded-t">
            <h2 className="font-semibold">Project Summary</h2>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="p-3">Province</th>
                  <th className="p-3">Country</th>
                  <th className="p-3 text-right">Total Project</th>
                </tr>
              </thead>
              <tbody>
                {data.projectsByProvince.map((p) => (
                  <tr
                    key={p.province}
                    className={`border-t hover:bg-blue-50 ${selected?.dimension === 'province' && selected.value === p.province ? 'bg-blue-50' : ''}`}
                    onClick={() => setSelected({ dimension: 'province', value: p.province })}
                  >
                    <td className="p-3 font-medium text-blue-700">
                      <button
                        type="button"
                        className="hover:underline text-left"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected({ dimension: 'province', value: p.province });
                        }}
                      >
                        {p.province}
                      </button>
                    </td>
                    <td className="p-3 text-slate-600">{p.country}</td>
                    <td className="p-3 text-right font-mono">{p.totalProjects}</td>
                  </tr>
                ))}
                {data.projectsByProvince.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-6 text-center text-slate-400">
                      Belum ada data lokasi.
                    </td>
                  </tr>
                )}
              </tbody>
              {data.projectsByProvince.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-100 font-semibold border-t">
                    <td className="p-3" colSpan={2}>Grand Total</td>
                    <td className="p-3 text-right font-mono">{totalProjects}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>

        {/* PO Monitoring */}
        <section className="bg-white rounded shadow">
          <header className="px-4 py-3 border-b bg-blue-900 text-white rounded-t flex justify-between">
            <h2 className="font-semibold">PO Monitoring (Rp)</h2>
            <span className="text-xs">
              Released: {fmtRp(data.poMonitoring.totalPoValue)} • Delivered:{' '}
              {fmtRp(data.poMonitoring.totalDeliveredValue)}
            </span>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="p-3">Product Category</th>
                  <th className="p-3 text-right">Total PO Released</th>
                  <th className="p-3 text-right">Total Delivered PO</th>
                </tr>
              </thead>
              <tbody>
                {data.poMonitoring.rows.map((r) => (
                  <tr
                    key={r.productCategory}
                    className={`border-t hover:bg-blue-50 ${selected?.dimension === 'productCategory' && selected.value === r.productCategory ? 'bg-blue-50' : ''}`}
                    onClick={() => setSelected({ dimension: 'productCategory', value: r.productCategory })}
                  >
                    <td className="p-3 text-blue-700">
                      <button
                        type="button"
                        className="hover:underline text-left"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected({ dimension: 'productCategory', value: r.productCategory });
                        }}
                      >
                        {r.productCategory}
                      </button>
                    </td>
                    <td className="p-3 text-right font-mono">{r.totalReleased}</td>
                    <td className="p-3 text-right font-mono">{r.totalDelivered}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-semibold border-t">
                  <td className="p-3">Grand Total</td>
                  <td className="p-3 text-right font-mono">{data.poMonitoring.grandTotalReleased}</td>
                  <td className="p-3 text-right font-mono">{data.poMonitoring.grandTotalDelivered}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-xs text-slate-500 px-4 py-2">
            *Values based on order contract value.
          </p>
        </section>
      </div>

      <section ref={detailSectionRef} className="bg-white rounded shadow p-4">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="font-semibold text-slate-800">Detail Data</h3>
            <p className="text-xs text-slate-500">
              Klik baris pada tabel Project Summary atau PO Monitoring untuk melihat data rinci.
            </p>
          </div>
          {selected && (
            <button
              type="button"
              className="text-xs text-blue-700 hover:underline"
              onClick={() => setSelected(null)}
            >
              Clear selection
            </button>
          )}
        </div>

        {!selected && (
          <div className="text-sm text-slate-500">Belum ada filter detail dipilih.</div>
        )}

        {selected && detailLoading && (
          <div className="text-sm text-slate-500">Loading detail…</div>
        )}

        {selected && detailError && (
          <div className="text-sm text-red-600">{detailError}</div>
        )}

        {selected && detail && (
          <div className="space-y-3">
            <div className="text-sm text-slate-700">
              Filter aktif:{' '}
              <span className="font-semibold">
                {detail.dimension === 'province' ? 'Province' : 'Product Category'} = {detail.value}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
              <MiniMetric label="Orders" value={detail.summary.totalOrders.toString()} />
              <MiniMetric label="SOW" value={detail.summary.totalSows.toString()} />
              <MiniMetric label="Sites" value={detail.summary.totalSites.toString()} />
              <MiniMetric label="Delivered" value={detail.summary.deliveredOrders.toString()} />
              <MiniMetric label="Contract Value" value={fmtRp(detail.summary.totalContractValue)} />
            </div>

            <div className="overflow-x-auto border rounded">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="p-3">Order #</th>
                    <th className="p-3">Customer</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Provinces</th>
                    <th className="p-3 text-right">SOW</th>
                    <th className="p-3 text-right">Sites</th>
                    <th className="p-3 text-right">Progress</th>
                    <th className="p-3 text-right">Status</th>
                    <th className="p-3 text-right">Contract</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.rows.map((r) => (
                    <tr key={r.orderId} className="border-t">
                      <td className="p-3 font-medium text-blue-700">
                        <Link href={`/orders/${r.orderId}`} className="hover:underline">
                          {r.orderNumber}
                        </Link>
                      </td>
                      <td className="p-3">{r.customerName}</td>
                      <td className="p-3">{r.productCategory}</td>
                      <td className="p-3 text-xs text-slate-600">{r.provinces.join(', ') || '—'}</td>
                      <td className="p-3 text-right font-mono">{r.sowCount}</td>
                      <td className="p-3 text-right font-mono">{r.siteCount}</td>
                      <td className="p-3 text-right font-mono">{r.progressPct}%</td>
                      <td className="p-3 text-right">
                        <StatusBadge status={r.status} delivered={r.delivered} />
                      </td>
                      <td className="p-3 text-right font-mono">{fmtRp(r.contractValue)}</td>
                    </tr>
                  ))}
                  {detail.rows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="p-4 text-center text-slate-400">
                        Tidak ada data detail untuk filter ini.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Implementation */}
        <section className="bg-white rounded shadow p-4">
          <h3 className="font-semibold mb-3 text-slate-700">Implementation</h3>
          <div className="grid grid-cols-2 gap-4 items-center">
            <PieMini
              segments={[
                { label: 'Complete', value: data.implementation.complete, color: '#f59e0b' },
                { label: 'In Progress', value: data.implementation.inProgress, color: '#fbbf24' },
              ]}
            />
            <BucketBars
              title="Distribution"
              items={[
                { label: '<10%', value: data.implementation.buckets.lt10, color: '#cbd5e1' },
                { label: '10-50%', value: data.implementation.buckets.p10_50, color: '#fbbf24' },
                { label: '50-90%', value: data.implementation.buckets.p50_90, color: '#3b82f6' },
                { label: '100%', value: data.implementation.buckets.p100, color: '#10b981' },
              ]}
            />
          </div>
          <div className="mt-4 text-sm border-t pt-3 flex justify-between">
            <span className="text-slate-600">Overall Implementation (%)</span>
            <span className="font-bold">{data.implementation.overallPercent}%</span>
          </div>
        </section>

        {/* Capex Realization */}
        <section className="bg-white rounded shadow p-4">
          <h3 className="font-semibold mb-3 text-slate-700">Capex Realization</h3>
          <div className="grid grid-cols-2 gap-4 items-center">
            <PieMini
              segments={[
                { label: 'Over Budget', value: data.capexRealization.overBudget, color: '#3b82f6' },
                { label: 'Under Budget', value: data.capexRealization.underBudget, color: '#f59e0b' },
              ]}
            />
            <BucketBars
              title="Distribution"
              items={[
                { label: '<=10%', value: data.capexRealization.buckets.lt10, color: '#3b82f6' },
                { label: '10-50%', value: data.capexRealization.buckets.p10_50, color: '#fbbf24' },
                { label: '50-90%', value: data.capexRealization.buckets.p50_90, color: '#fb923c' },
                { label: '100%', value: data.capexRealization.buckets.p100, color: '#10b981' },
                { label: '>100%', value: data.capexRealization.buckets.gt100, color: '#ef4444' },
              ]}
            />
          </div>
          <div className="mt-4 text-sm border-t pt-3 flex justify-between">
            <span className="text-slate-600">Overall Capex Realization (%)</span>
            <span className="font-bold">{data.capexRealization.overallPercent}%</span>
          </div>
        </section>
      </div>
    </div>
  );
}

function FilterCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-semibold text-slate-800">{value}</div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border bg-slate-50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-semibold text-slate-800">{value}</div>
    </div>
  );
}

function StatusBadge({ status, delivered }: { status: 'ON_TRACK' | 'AT_RISK' | 'DELAY' | 'UNKNOWN'; delivered: boolean }) {
  if (delivered) return <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-800 text-xs">DELIVERED</span>;
  if (status === 'DELAY') return <span className="px-2 py-1 rounded bg-red-100 text-red-800 text-xs">DELAY</span>;
  if (status === 'AT_RISK') return <span className="px-2 py-1 rounded bg-amber-100 text-amber-800 text-xs">AT RISK</span>;
  if (status === 'ON_TRACK') return <span className="px-2 py-1 rounded bg-blue-100 text-blue-800 text-xs">ON TRACK</span>;
  return <span className="px-2 py-1 rounded bg-slate-100 text-slate-700 text-xs">UNKNOWN</span>;
}

function PieMini({ segments }: { segments: Array<{ label: string; value: number; color: string }> }) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  let acc = 0;
  const r = 36;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 100 100" className="w-24 h-24 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#f1f5f9" strokeWidth="18" />
        {segments.map((s) => {
          const frac = s.value / total;
          const dash = `${frac * c} ${c}`;
          const offset = -acc * c;
          acc += frac;
          return (
            <circle
              key={s.label}
              cx="50" cy="50" r={r} fill="none"
              stroke={s.color} strokeWidth="18"
              strokeDasharray={dash} strokeDashoffset={offset}
            />
          );
        })}
      </svg>
      <div className="text-xs space-y-1">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <span className="w-3 h-3 inline-block rounded" style={{ background: s.color }} />
            <span>{s.label}: <strong>{s.value}</strong></span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BucketBars({ title, items }: { title: string; items: Array<{ label: string; value: number; color: string }> }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-1">
      <div className="text-xs text-slate-500 mb-1">{title}</div>
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-2 text-xs">
          <span className="w-14 text-slate-600">{i.label}</span>
          <div className="flex-1 bg-slate-100 h-3 rounded overflow-hidden">
            <div className="h-full" style={{ width: `${(i.value / max) * 100}%`, background: i.color }} />
          </div>
          <span className="w-6 text-right font-mono">{i.value}</span>
        </div>
      ))}
    </div>
  );
}
