'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '../../../../lib/api';
import { StatusPill } from '../../../../components/StatusPill';
import type { OverallStatus } from 'deliveriq-shared';

interface OrderDetail {
  id: string;
  orderNumber: string;
  customer?: { name: string };
  sos: Array<{
    id: string; soNumber: string;
    sows: Array<{ id: string; sowNumber: string; planRfsDate: string; progressPct: string; gapDays: number; warningLevel: OverallStatus }>;
  }>;
}

export default function OrderDetailPage({ params }: { params: { id: string } }) {
  const [order, setOrder] = useState<OrderDetail | null>(null);

  useEffect(() => {
    apiFetch<OrderDetail>(`/v1/orders/${params.id}`).then(setOrder).catch(() => undefined);
  }, [params.id]);

  if (!order) return <div className="text-slate-500">Loading…</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{order.orderNumber} — {order.customer?.name ?? ''}</h1>
      <div className="bg-white shadow rounded p-4">
        <h2 className="font-semibold mb-2">SO / SOW Tree</h2>
        {order.sos.map((so) => (
          <div key={so.id} className="mb-4">
            <div className="font-medium">▾ {so.soNumber}</div>
            <ul className="ml-6 mt-2 space-y-2">
              {so.sows.map((sow) => (
                <li key={sow.id} className="flex items-center gap-3">
                  <Link href={`/sites?sowId=${sow.id}`} className="text-blue-600 hover:underline">▾ {sow.sowNumber}</Link>
                  <span className="text-sm text-slate-500">Plan RFS: {new Date(sow.planRfsDate).toLocaleDateString('id-ID')}</span>
                  <span className="text-sm">{Number(sow.progressPct)}%</span>
                  <StatusPill status={sow.warningLevel} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
