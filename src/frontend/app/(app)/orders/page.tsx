'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { OrderDto, Paginated } from 'deliveriq-shared';
import { apiFetch } from '../../../lib/api';
import { DataTable } from '../../../components/DataTable';
import { ProgramsViewSwitcher } from '../../../components/ProgramsViewSwitcher';

export default function OrdersPage() {
  const [data, setData] = useState<Paginated<OrderDto & { customerName?: string }> | null>(null);
  useEffect(() => {
    apiFetch<Paginated<OrderDto>>('/v1/orders').then(setData).catch(() => undefined);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Programs (Orders)</h1>
          <p className="text-xs text-slate-500">Press <kbd className="bg-slate-100 px-1 rounded">g</kbd> then <kbd className="bg-slate-100 px-1 rounded">t</kbd>/<kbd className="bg-slate-100 px-1 rounded">b</kbd>/<kbd className="bg-slate-100 px-1 rounded">l</kbd> to switch views</p>
        </div>
        <ProgramsViewSwitcher active="table" />
      </div>

      {!data ? (
        <div className="text-slate-500">Loading…</div>
      ) : (
        <DataTable
          rows={data.data}
          columns={[
            { key: 'orderNumber', header: 'Order #', render: (o) => <Link href={`/orders/${o.id}`} className="text-blue-600 hover:underline">{o.orderNumber}</Link> },
            { key: 'customerName', header: 'Customer', render: (o) => o.customerName ?? '—' },
            { key: 'type', header: 'Type' },
            { key: 'productCategory', header: 'Product' },
            { key: 'contractValue', header: 'Contract', render: (o) => `Rp ${Number(o.contractValue).toLocaleString('id-ID')}` },
          ]}
        />
      )}
    </div>
  );
}
