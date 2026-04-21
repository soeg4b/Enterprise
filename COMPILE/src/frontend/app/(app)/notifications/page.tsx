'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/api';
import type { NotificationDto } from 'deliveriq-shared';

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationDto[]>([]);
  useEffect(() => { apiFetch<{ data: NotificationDto[] }>('/v1/notifications').then((r) => setItems(r.data)).catch(() => undefined); }, []);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Notifications</h1>
      {items.length === 0 ? <div className="text-slate-500">No notifications.</div> :
        <ul className="bg-white shadow rounded divide-y">
          {items.map((n) => (
            <li key={n.id} className="p-3">
              <div className="font-medium">{n.title}</div>
              <div className="text-sm text-slate-600">{n.body}</div>
              <div className="text-xs text-slate-400">{new Date(n.createdAt).toLocaleString('id-ID')}</div>
            </li>
          ))}
        </ul>}
    </div>
  );
}
