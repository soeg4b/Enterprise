'use client';

import { useEffect, useState } from 'react';
import type { BodReportDto } from 'deliveriq-shared';
import { apiFetch } from '../../../lib/api';
import { KpiTile } from '../../../components/KpiTile';
import { StatusPill } from '../../../components/StatusPill';

export default function DashboardPage() {
  const [data, setData] = useState<BodReportDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<BodReportDto>('/v1/reports/bod')
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  if (error) return <div className="text-red-600">{error}</div>;
  if (!data) return <div className="text-slate-500">Loading dashboard…</div>;

  const fmt = (s: string) => `Rp ${Number(s).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Portfolio Overview</h1>
        <p className="text-sm text-slate-500">Generated {new Date(data.generatedAt).toLocaleString('id-ID')} ({data.cacheStatus})</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiTile label="Total Revenue" value={fmt(data.totalRevenue)} />
        <KpiTile label="Revenue at Risk" value={fmt(data.revenueAtRisk)} tone="delay" />
        <KpiTile label="On Track" value={`${data.onTrackPercent}%`} tone="ontrack" />
        <KpiTile label="CAPEX %" value={`${data.capexConsumedPercent}%`} />
        <KpiTile label="RFS M-T-D" value={`${data.rfsMonthActual}/${data.rfsMonthPlan}`} />
        <KpiTile label="Overdue" value={data.overdueCount.toString()} tone="atrisk" />
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">Status Distribution</h2>
        <div className="bg-white rounded shadow p-4 flex gap-4">
          <div>On Track: <strong>{data.statusDistribution.onTrack}</strong></div>
          <div>At Risk: <strong>{data.statusDistribution.atRisk}</strong></div>
          <div>Delay: <strong>{data.statusDistribution.delay}</strong></div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Departments</h2>
        <div className="bg-white rounded shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr><th className="p-3">Dept</th><th className="p-3">On Track</th><th className="p-3">At Risk</th><th className="p-3">Delay</th><th className="p-3">Status</th></tr>
            </thead>
            <tbody>
              {data.departments.map((d) => {
                const status = d.delay > 0 ? 'DELAY' : d.atRisk > 0 ? 'AT_RISK' : 'ON_TRACK';
                return (
                  <tr key={d.departmentId} className="border-t">
                    <td className="p-3 font-medium">{d.departmentCode} — {d.departmentName}</td>
                    <td className="p-3">{d.onTrack}</td>
                    <td className="p-3">{d.atRisk}</td>
                    <td className="p-3">{d.delay}</td>
                    <td className="p-3"><StatusPill status={status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
