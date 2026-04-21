'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { OrderDto, Paginated } from 'deliveriq-shared';
import { apiFetch } from '../../../lib/api';
import { DataTable } from '../../../components/DataTable';

export default function OrdersPage() {
  const [data, setData] = useState<Paginated<OrderDto & { customerName?: string }> | null>(null);
  useEffect(() => {
    apiFetch<Paginated<OrderDto>>('/v1/orders').then(setData).catch(() => undefined);
  }, []);

  if (!data) return <div className="text-slate-500">Loading…</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Programs (Orders)</h1>
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
    </div>
  );
}
