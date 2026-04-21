'use client';

import { useEffect, useState } from 'react';
import type { DepartmentReportDto } from 'deliveriq-shared';
import { apiFetch } from '../../../../lib/api';

export default function DepartmentDetailPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<DepartmentReportDto | null>(null);
  useEffect(() => {
    apiFetch<DepartmentReportDto>(`/v1/reports/department/${params.id}`).then(setData).catch(() => undefined);
  }, [params.id]);

  if (!data) return <div className="text-slate-500">Loading…</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{data.departmentCode} — {data.departmentName}</h1>
      <div className="bg-white shadow rounded">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr><th className="p-3">Stage</th><th className="p-3">Count</th><th className="p-3">Overdue</th><th className="p-3">Avg days</th></tr>
          </thead>
          <tbody>
            {data.funnel.map((f) => (
              <tr key={f.stage} className="border-t">
                <td className="p-3">{f.stage}</td>
                <td className="p-3">{f.count}</td>
                <td className="p-3">{f.overdue}</td>
                <td className="p-3">{f.avgDaysInStage}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
