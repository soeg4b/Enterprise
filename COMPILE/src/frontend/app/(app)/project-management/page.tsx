'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type {
  ExecutiveSummaryDto,
  PartnerDeliveryReportDto,
  PartnerDeliveryRowDto,
  ProductCategory,
} from 'deliveriq-shared';
import { apiFetch } from '../../../lib/api';
import { StatusPill } from '../../../components/StatusPill';
import { ProgressTrackingReport } from '../../../components/ProgressTrackingReport';

type FilterDimension = 'province' | 'productCategory' | 'status' | 'completion';

type SelectedFilter = {
  dimension: FilterDimension;
  value: string;
};

type ExecutiveDetailDto = {
  dimension: 'province' | 'productCategory';
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

type ProgramSummaryRow = {
  productCategory: ProductCategory;
  customerTotal: number;
  programTotal: number;
  programCompleted: number;
  soNumb: number;
  installationStart: number;
  rfsRfi: number;
  atpProcess: number;
  atpDone: number;
  remark: string;
};

type DetailRow = {
  orderId: string;
  orderNumber: string;
  customerName: string;
  productCategory: string;
  targetDate: string;
  gapDay: number;
  statusProgram: 'ON_TRACK' | 'AT_RISK' | 'DELAY' | 'UNKNOWN';
  issue: string;
  progressPct: number;
};

const AUTO_REFRESH_MS = 30000;

const fmtDate = (v: string) => {
  if (!v) return '-';
  return new Date(v).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' });
};

const fmtCurrency = (value: number) => `Rp ${Number(value || 0).toLocaleString('id-ID')}`;

function toLabel(category: ProductCategory): string {
  switch (category) {
    case 'CONNECTIVITY': return 'DC Interconnect';
    case 'DATACENTER': return 'Dedicated Internet';
    case 'CLOUD': return 'Cloud';
    case 'MANAGED_SERVICE': return 'IBS';
    case 'ICT_SOLUTION': return 'ICT Solution';
    case 'OTHER': return 'Power as a Service (PaaS)';
    default: return category;
  }
}

function donutBackground(parts: Array<{ value: number; color: string }>): string {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  let acc = 0;
  const stops = parts.map((p) => {
    const start = (acc / total) * 100;
    acc += p.value;
    const end = (acc / total) * 100;
    return `${p.color} ${start}% ${end}%`;
  });
  return `conic-gradient(${stops.join(', ')})`;
}

function tinyRemarkFromRows(rows: PartnerDeliveryRowDto[]): string {
  if (rows.length === 0) return '-';
  const delayed = rows.filter((r) => r.warningLevel === 'DELAY').length;
  const atRisk = rows.filter((r) => r.warningLevel === 'AT_RISK').length;
  if (delayed > 0) return `${delayed} delayed`;
  if (atRisk > 0) return `${atRisk} at risk`;
  return 'On track';
}

function RingChart({
  title,
  center,
  parts,
  onSelect,
}: {
  title: string;
  center: string;
  parts: Array<{ label: string; value: number; color: string; selectValue?: string }>;
  onSelect?: (value: string) => void;
}) {
  return (
    <section className="bg-white rounded border p-4">
      <h3 className="font-semibold text-slate-700 mb-3 text-sm">{title}</h3>
      <div className="flex items-center gap-5">
        <div
          className="w-44 h-44 rounded-full relative"
          style={{ background: donutBackground(parts) }}
        >
          <div className="absolute inset-6 rounded-full bg-white grid place-items-center text-center border">
            <div>
              <div className="text-xl font-bold text-slate-800">{center}</div>
              <div className="text-[11px] text-slate-500">Live</div>
            </div>
          </div>
        </div>
        <div className="space-y-2 text-xs">
          {parts.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                if (!p.selectValue || !onSelect) return;
                onSelect(p.selectValue);
              }}
              className={`flex items-center gap-2 ${p.selectValue && onSelect ? 'hover:underline' : ''}`}
            >
              <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: p.color }} />
              <span className="text-slate-600">{p.label}</span>
              <span className="font-mono font-semibold text-slate-900">{p.value}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function GroupBarChart({
  title,
  labels,
  seriesA,
  seriesB,
  onClickLabel,
}: {
  title: string;
  labels: string[];
  seriesA: number[];
  seriesB: number[];
  onClickLabel?: (labelIndex: number) => void;
}) {
  const max = Math.max(1, ...seriesA, ...seriesB);
  return (
    <section className="bg-white rounded border p-4">
      <h3 className="font-semibold text-slate-700 mb-3 text-sm">{title}</h3>
      <div className="space-y-3">
        {labels.map((label, idx) => (
          <button
            key={label}
            type="button"
            onClick={() => onClickLabel?.(idx)}
            className="w-full text-left"
          >
            <div className="flex justify-between text-[11px] text-slate-600 mb-1">
              <span className="truncate pr-2">{label}</span>
              <span className="font-mono">{seriesA[idx]} / {seriesB[idx]}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="h-3 rounded bg-slate-100 overflow-hidden">
                <div className="h-3 bg-blue-900" style={{ width: `${(((seriesA[idx] ?? 0) / max) * 100)}%` }} />
              </div>
              <div className="h-3 rounded bg-slate-100 overflow-hidden">
                <div className="h-3 bg-blue-300" style={{ width: `${(((seriesB[idx] ?? 0) / max) * 100)}%` }} />
              </div>
            </div>
          </button>
        ))}
      </div>
      <div className="text-[11px] text-slate-500 mt-3 flex gap-4">
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 bg-blue-900 rounded" /> Program Total</span>
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 bg-blue-300 rounded" /> Program Completed</span>
      </div>
    </section>
  );
}

export default function ProjectManagementPage() {
  const [executive, setExecutive] = useState<ExecutiveSummaryDto | null>(null);
  const [partner, setPartner] = useState<PartnerDeliveryReportDto | null>(null);
  const [programRows, setProgramRows] = useState<ProgramSummaryRow[]>([]);
  const [selected, setSelected] = useState<SelectedFilter | null>(null);
  const [detailRows, setDetailRows] = useState<DetailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<DetailRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadBase = useCallback(async () => {
    const [exec, partnerReport] = await Promise.all([
      apiFetch<ExecutiveSummaryDto>('/v1/reports/executive-summary'),
      apiFetch<PartnerDeliveryReportDto>('/v1/reports/partner-delivery'),
    ]);

    const byCategoryPartner = new Map<ProductCategory, PartnerDeliveryRowDto[]>();
    for (const row of partnerReport.rows) {
      const cat = row.productCategory;
      const arr = byCategoryPartner.get(cat) ?? [];
      arr.push(row);
      byCategoryPartner.set(cat, arr);
    }

    const detailByCategory = await Promise.all(
      exec.poMonitoring.rows.map((row) =>
        apiFetch<ExecutiveDetailDto>(
          `/v1/reports/executive-summary/detail?dimension=productCategory&value=${encodeURIComponent(row.productCategory)}`,
        ).catch(() => ({
          dimension: 'productCategory' as const,
          value: row.productCategory,
          generatedAt: new Date().toISOString(),
          summary: { totalOrders: row.totalReleased, totalSows: 0, totalSites: 0, deliveredOrders: row.totalDelivered, totalContractValue: 0 },
          rows: [],
        })),
      ),
    );

    const nextRows: ProgramSummaryRow[] = detailByCategory.map((d) => {
      const category = d.value as ProductCategory;
      const customers = new Set(d.rows.map((r) => r.customerName));
      const partnerRowsForCategory = byCategoryPartner.get(category) ?? [];
      return {
        productCategory: category,
        customerTotal: customers.size,
        programTotal: d.summary.totalOrders,
        programCompleted: d.summary.deliveredOrders,
        soNumb: d.summary.totalSows,
        installationStart: d.summary.totalSites,
        rfsRfi: d.summary.deliveredOrders,
        atpProcess: Math.max(d.summary.totalOrders - d.summary.deliveredOrders, 0),
        atpDone: d.summary.deliveredOrders,
        remark: tinyRemarkFromRows(partnerRowsForCategory),
      };
    });

    setExecutive(exec);
    setPartner(partnerReport);
    setProgramRows(nextRows);
    setLastUpdated(new Date());
  }, []);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        if (loading) setLoading(true);
        setError(null);
        await loadBase();
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : 'Failed to load Project Management dashboard');
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();

    const timer = setInterval(() => {
      void run();
    }, AUTO_REFRESH_MS);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [loadBase, loading]);

  useEffect(() => {
    const loadDetail = async () => {
      if (!selected) {
        setDetailRows([]);
        setSelectedProgram(null);
        return;
      }
      if (!partner || !executive) return;

      try {
        setDetailLoading(true);
        if (selected.dimension === 'status') {
          const rows = partner.rows
            .filter((r) => r.warningLevel === selected.value)
            .map((r) => ({
              orderId: r.orderId,
              orderNumber: r.orderNumber,
              customerName: r.customerName,
              productCategory: r.productCategory,
              targetDate: '-',
              gapDay: Math.round(r.implementationPct - r.capexRealizationPct),
              statusProgram: r.warningLevel,
              issue: r.criticalIssue,
              progressPct: r.implementationPct,
            }));
          setDetailRows(rows);
          setSelectedProgram(rows[0] ?? null);
          return;
        }

        if (selected.dimension === 'completion') {
          const allDetail = await Promise.all(
            executive.poMonitoring.rows.map((row) =>
              apiFetch<ExecutiveDetailDto>(
                `/v1/reports/executive-summary/detail?dimension=productCategory&value=${encodeURIComponent(row.productCategory)}`,
              ).catch(() => null),
            ),
          );

          const mergedRows = allDetail
            .filter((d): d is ExecutiveDetailDto => Boolean(d))
            .flatMap((detail) =>
              detail.rows.map((r) => ({
                orderId: r.orderId,
                orderNumber: r.orderNumber,
                customerName: r.customerName,
                productCategory: r.productCategory,
                targetDate: detail.generatedAt,
                gapDay: Math.round(100 - r.progressPct),
                statusProgram: r.status,
                issue: r.delivered ? 'Completed' : r.status === 'DELAY' ? 'Delay Progress' : 'Need follow-up',
                progressPct: r.progressPct,
                delivered: r.delivered,
              })),
            );

          const filtered = mergedRows
            .filter((r) => (selected.value === 'COMPLETED' ? r.delivered : !r.delivered))
            .map(({ delivered, ...row }) => row);

          setDetailRows(filtered);
          setSelectedProgram(filtered[0] ?? null);
          return;
        }

        const detail = await apiFetch<ExecutiveDetailDto>(
          `/v1/reports/executive-summary/detail?dimension=${selected.dimension}&value=${encodeURIComponent(selected.value)}`,
        );
        const nextRows = detail.rows.map((r) => ({
            orderId: r.orderId,
            orderNumber: r.orderNumber,
            customerName: r.customerName,
            productCategory: r.productCategory,
            targetDate: detail.generatedAt,
            gapDay: Math.round(100 - r.progressPct),
            statusProgram: r.status,
            issue: r.delivered ? 'Completed' : r.status === 'DELAY' ? 'Delay Progress' : 'Need follow-up',
            progressPct: r.progressPct,
          }));
        setDetailRows(nextRows);
        setSelectedProgram(nextRows[0] ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load detail');
      } finally {
        setDetailLoading(false);
      }
    };

    void loadDetail();
  }, [selected, partner, executive]);

  const summaryCard = useMemo(() => {
    if (!executive) {
      return {
        totalCustomer: 0,
        totalProgram: 0,
        complete: 0,
        nyComplete: 0,
      };
    }
    const totalCustomer = executive.filters.customers.length;
    const totalProgram = executive.poMonitoring.grandTotalReleased;
    const complete = executive.poMonitoring.grandTotalDelivered;
    return {
      totalCustomer,
      totalProgram,
      complete,
      nyComplete: Math.max(totalProgram - complete, 0),
    };
  }, [executive]);

  const productLabels = useMemo(
    () => programRows.map((r) => toLabel(r.productCategory)),
    [programRows],
  );

  const highlightIssues = useMemo(() => {
    if (!partner) return [];
    return partner.rows
      .filter((r) => r.warningLevel !== 'ON_TRACK')
      .slice(0, 4)
      .map((r) => `${toLabel(r.productCategory as ProductCategory)} - ${r.customerName}: ${r.criticalIssue}`);
  }, [partner]);

  if (error) return <div className="text-red-600">{error}</div>;
  if (loading || !executive || !partner) return <div className="text-slate-500">Loading Project Management dashboard…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-blue-900">ENTERPRISE - PROJECT MANAGEMENT</h1>
          <p className="text-xs text-slate-500">
            Auto refresh setiap {AUTO_REFRESH_MS / 1000}s • Last update: {lastUpdated ? lastUpdated.toLocaleTimeString('id-ID') : '-'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadBase()}
          className="px-3 py-2 text-sm rounded border bg-white hover:bg-slate-50"
        >
          Refresh Now
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <RingChart
              title="PROGRAM PROGRESS UPDATE"
              center={`${summaryCard.complete}`}
              parts={[
                {
                  label: 'Completed',
                  value: summaryCard.complete,
                  color: '#0f2f78',
                  selectValue: 'COMPLETED',
                },
                {
                  label: 'NY Completed',
                  value: summaryCard.nyComplete,
                  color: '#93c5fd',
                  selectValue: 'NY_COMPLETED',
                },
              ]}
              onSelect={(v) => setSelected({ dimension: 'completion', value: v })}
            />

            <GroupBarChart
              title="PROGRAM PROGRESS (PER PRODUCT)"
              labels={productLabels}
              seriesA={programRows.map((r) => r.programTotal)}
              seriesB={programRows.map((r) => r.programCompleted)}
              onClickLabel={(idx) => {
                const row = programRows[idx];
                if (!row) return;
                setSelected({ dimension: 'productCategory', value: row.productCategory });
              }}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <RingChart
              title="WIP STATUS UPDATE"
              center={`${partner.rows.length}`}
              parts={[
                {
                  label: 'On Track',
                  value: partner.rows.filter((r) => r.warningLevel === 'ON_TRACK').length,
                  color: '#10b981',
                  selectValue: 'ON_TRACK',
                },
                {
                  label: 'At Risk',
                  value: partner.rows.filter((r) => r.warningLevel === 'AT_RISK').length,
                  color: '#f59e0b',
                  selectValue: 'AT_RISK',
                },
                {
                  label: 'Delay',
                  value: partner.rows.filter((r) => r.warningLevel === 'DELAY').length,
                  color: '#ef4444',
                  selectValue: 'DELAY',
                },
              ]}
              onSelect={(v) => setSelected({ dimension: 'status', value: v })}
            />

            <GroupBarChart
              title="IMPLEMENTATION VS CAPEX (PER PRODUCT)"
              labels={productLabels}
              seriesA={programRows.map((r) => r.atpProcess + r.atpDone)}
              seriesB={programRows.map((r) => r.atpDone)}
              onClickLabel={(idx) => {
                const row = programRows[idx];
                if (!row) return;
                setSelected({ dimension: 'productCategory', value: row.productCategory });
              }}
            />
          </div>
        </div>

        <aside className="bg-white rounded border p-4 h-fit">
          <h2 className="text-3xl text-blue-900 font-bold mb-4">HIGHLIGHT'S</h2>
          <div className="space-y-3 mb-4">
            <div className="rounded-xl border p-3 text-center">
              <div className="text-xs font-semibold text-slate-600">TOTAL CUSTOMER</div>
              <div className="text-4xl font-bold text-slate-900">{summaryCard.totalCustomer}</div>
            </div>
            <div className="rounded-xl border p-3 text-center">
              <div className="text-xs font-semibold text-slate-600">TOTAL PROGRAM</div>
              <div className="text-4xl font-bold text-slate-900">{summaryCard.totalProgram}</div>
              <div className="text-blue-700 font-semibold">Complete: {summaryCard.complete}</div>
              <div className="text-red-600 font-semibold">NY Complete: {summaryCard.nyComplete}</div>
            </div>
          </div>
          <ul className="space-y-2 text-xs text-slate-700 list-disc pl-4">
            {highlightIssues.length > 0 ? (
              highlightIssues.map((issue) => <li key={issue}>{issue}</li>)
            ) : (
              <li>Tidak ada isu kritikal saat ini.</li>
            )}
          </ul>
          <div className="mt-4 pt-3 border-t">
            <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Quick Filter Province</div>
            <div className="flex flex-wrap gap-1.5">
              {executive.projectsByProvince.slice(0, 8).map((p) => (
                <button
                  key={p.province}
                  type="button"
                  onClick={() => setSelected({ dimension: 'province', value: p.province })}
                  className="px-2 py-1 rounded border text-[11px] hover:bg-blue-50"
                >
                  {p.province} ({p.totalProjects})
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <section className="bg-white rounded border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-blue-100 text-blue-950">
            <tr>
              <th className="p-2 text-left">Product Type</th>
              <th className="p-2 text-right">Customer Total</th>
              <th className="p-2 text-right">Program Total</th>
              <th className="p-2 text-right">Program Completed</th>
              <th className="p-2 text-right">SO Numb</th>
              <th className="p-2 text-right">Installation Start</th>
              <th className="p-2 text-right">RFS/RFI</th>
              <th className="p-2 text-right">ATP Process</th>
              <th className="p-2 text-right">ATP Done</th>
              <th className="p-2 text-left">Remark</th>
            </tr>
          </thead>
          <tbody>
            {programRows.map((row) => (
              <tr key={row.productCategory} className="border-t hover:bg-blue-50">
                <td className="p-2 text-blue-700 font-medium">
                  <button
                    type="button"
                    className="hover:underline text-left"
                    onClick={() => setSelected({ dimension: 'productCategory', value: row.productCategory })}
                  >
                    {toLabel(row.productCategory)}
                  </button>
                </td>
                <td className="p-2 text-right font-mono">{row.customerTotal}</td>
                <td className="p-2 text-right font-mono">{row.programTotal}</td>
                <td className="p-2 text-right font-mono">{row.programCompleted}</td>
                <td className="p-2 text-right font-mono">{row.soNumb}</td>
                <td className="p-2 text-right font-mono">{row.installationStart}</td>
                <td className="p-2 text-right font-mono">{row.rfsRfi}</td>
                <td className="p-2 text-right font-mono">{row.atpProcess}</td>
                <td className="p-2 text-right font-mono">{row.atpDone}</td>
                <td className="p-2 text-xs">{row.remark}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-slate-50 font-semibold">
              <td className="p-2">Grand Total</td>
              <td className="p-2 text-right font-mono">{programRows.reduce((a, r) => a + r.customerTotal, 0)}</td>
              <td className="p-2 text-right font-mono">{programRows.reduce((a, r) => a + r.programTotal, 0)}</td>
              <td className="p-2 text-right font-mono">{programRows.reduce((a, r) => a + r.programCompleted, 0)}</td>
              <td className="p-2 text-right font-mono">{programRows.reduce((a, r) => a + r.soNumb, 0)}</td>
              <td className="p-2 text-right font-mono">{programRows.reduce((a, r) => a + r.installationStart, 0)}</td>
              <td className="p-2 text-right font-mono">{programRows.reduce((a, r) => a + r.rfsRfi, 0)}</td>
              <td className="p-2 text-right font-mono">{programRows.reduce((a, r) => a + r.atpProcess, 0)}</td>
              <td className="p-2 text-right font-mono">{programRows.reduce((a, r) => a + r.atpDone, 0)}</td>
              <td className="p-2">-</td>
            </tr>
          </tfoot>
        </table>
      </section>

      <section className="bg-white rounded border overflow-x-auto">
        <div className="px-4 py-3 border-b bg-blue-900 text-white flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-lg">ENTERPRISE - PROJECT MANAGEMENT (WIP Program)</h2>
            <p className="text-xs text-blue-100">
              Klik dari dashboard/chart/table untuk membuka detail terfilter.
            </p>
          </div>
          {selected && (
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="px-2 py-1 text-xs rounded border border-blue-300 hover:bg-blue-800"
            >
              Clear Filter
            </button>
          )}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-2 text-left">No</th>
              <th className="p-2 text-left">Product Type</th>
              <th className="p-2 text-left">Customer</th>
              <th className="p-2 text-left">Program Name</th>
              <th className="p-2 text-left">Target Date</th>
              <th className="p-2 text-right">Gap Day</th>
              <th className="p-2 text-left">Status Program</th>
              <th className="p-2 text-left">Issue</th>
              <th className="p-2 text-right">Progress</th>
            </tr>
          </thead>
          <tbody>
            {detailLoading && (
              <tr><td className="p-4 text-slate-500" colSpan={9}>Loading detail…</td></tr>
            )}
            {!detailLoading && detailRows.map((row, idx) => (
              <tr
                key={`${row.orderId}-${idx}`}
                className={`border-t hover:bg-slate-50 cursor-pointer ${selectedProgram?.orderId === row.orderId ? 'bg-blue-50' : ''}`}
                onClick={() => setSelectedProgram(row)}
              >
                <td className="p-2 font-mono">{idx + 1}</td>
                <td className="p-2">{toLabel(row.productCategory as ProductCategory)}</td>
                <td className="p-2">{row.customerName}</td>
                <td className="p-2">
                  <Link
                    href={`/orders/${row.orderId}`}
                    className="text-blue-700 hover:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {row.orderNumber}
                  </Link>
                </td>
                <td className="p-2">{fmtDate(row.targetDate)}</td>
                <td className="p-2 text-right font-mono">{row.gapDay}</td>
                <td className="p-2"><StatusPill status={row.statusProgram === 'UNKNOWN' ? 'AT_RISK' : row.statusProgram} /></td>
                <td className="p-2 text-xs">{row.issue}</td>
                <td className="p-2 text-right font-mono">{row.progressPct}%</td>
              </tr>
            ))}
            {!detailLoading && detailRows.length === 0 && (
              <tr>
                <td className="p-4 text-slate-500" colSpan={9}>
                  {selected ? 'Tidak ada data untuk filter terpilih.' : 'Pilih elemen di dashboard untuk melihat detail WIP Program.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {selectedProgram && (
        <ProgressTrackingReport
          title={`PROGRESS TRACKING REPORT - ${selectedProgram.orderNumber} (${selectedProgram.customerName})`}
          reportDate={new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' })}
          targetDate={fmtDate(selectedProgram.targetDate)}
          progressPct={selectedProgram.progressPct}
          detailHref={`/orders/${selectedProgram.orderId}`}
        />
      )}

      <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {partner.rows.slice(0, 2).map((row) => (
          <article key={row.orderId} className="bg-white rounded border p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-2xl font-bold text-blue-900">{toLabel(row.productCategory as ProductCategory)} - UPDATE</h3>
              <StatusPill status={row.warningLevel} />
            </div>
            <p className="text-sm text-slate-600 mb-3">
              Customer: <span className="font-semibold">{row.customerName}</span> • Project: <span className="font-semibold">{row.orderNumber}</span>
            </p>
            <div className="grid grid-cols-2 gap-3 text-xs mb-3">
              <div className="rounded border p-2">
                <div className="text-slate-500">Implementation</div>
                <div className="font-bold text-lg">{row.implementationPct}%</div>
              </div>
              <div className="rounded border p-2">
                <div className="text-slate-500">Capex Realization</div>
                <div className="font-bold text-lg">{row.capexRealizationPct}%</div>
              </div>
            </div>
            <div className="rounded border p-3 bg-slate-50">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Highlight's</div>
              <div className="text-sm mt-1">{row.criticalIssue}</div>
            </div>
            <div className="mt-3">
              <Link href={`/orders/${row.orderId}`} className="text-sm text-blue-700 hover:underline">Open full project detail</Link>
            </div>
          </article>
        ))}
      </section>

      <div className="text-xs text-slate-500">
        Source: live API <code>/v1/reports/executive-summary</code> + <code>/v1/reports/partner-delivery</code>. Detail akan otomatis update mengikuti input data terbaru.
      </div>

      <section className="bg-white rounded border p-4">
        <h2 className="text-lg font-semibold mb-2">KPI Snapshot</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="rounded border p-3">
            <div className="text-slate-500 text-xs">Total PO Value</div>
            <div className="font-semibold">{fmtCurrency(Number(executive.poMonitoring.totalPoValue))}</div>
          </div>
          <div className="rounded border p-3">
            <div className="text-slate-500 text-xs">Total Delivered Value</div>
            <div className="font-semibold">{fmtCurrency(Number(executive.poMonitoring.totalDeliveredValue))}</div>
          </div>
          <div className="rounded border p-3">
            <div className="text-slate-500 text-xs">Overall Capex Realization</div>
            <div className="font-semibold">{executive.capexRealization.overallPercent}%</div>
          </div>
        </div>
      </section>
    </div>
  );
}
