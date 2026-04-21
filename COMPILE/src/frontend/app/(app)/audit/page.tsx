'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/api';
import type { AuditLogDto, Paginated } from 'deliveriq-shared';

export default function AuditPage() {
  const [data, setData] = useState<Paginated<AuditLogDto> | null>(null);
  useEffect(() => { apiFetch<Paginated<AuditLogDto>>('/v1/audit').then(setData).catch(() => undefined); }, []);
  if (!data) return <div className="text-slate-500">Loading…</div>;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Audit Log</h1>
      <div className="bg-white shadow rounded">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr><th className="p-3">When</th><th className="p-3">Action</th><th className="p-3">Entity</th><th className="p-3">Actor</th></tr>
          </thead>
          <tbody>
            {data.data.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="p-3 whitespace-nowrap">{new Date(a.occurredAt).toLocaleString('id-ID')}</td>
                <td className="p-3">{a.action}</td>
                <td className="p-3">{a.entityType}{a.entityId ? `#${a.entityId.slice(0, 8)}` : ''}</td>
                <td className="p-3 text-slate-500">{a.actorUserId?.slice(0, 8) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
