'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, API_URL } from '../../../../lib/api';
import { StatusPill } from '../../../../components/StatusPill';
import type { OverallStatus } from 'deliveriq-shared';

interface OrderDetail {
  id: string;
  orderNumber: string;
  customer?: { name: string };
  sos: Array<{
    id: string; soNumber: string;
    sows: Array<{ id: string; sowNumber: string; scope?: string; planRfsDate: string; progressPct: string; gapDays: number; warningLevel: OverallStatus }>;
  }>;
}

type FiberLink = {
  fiberProjectId: string;
  summary: {
    polesTagged: number;
    estimatedLengthMeters: number;
    status: string;
    nearEnd?: { name: string };
    farEnd?: { name: string };
    otdrTestsTotal?: number;
    otdrTestsPass?: number;
    otdrTestsFail?: number;
    segmentsTotal?: number;
    segmentsComplete?: number;
    segmentsFailed?: number;
  };
};

export default function OrderDetailPage({ params }: { params: { id: string } }) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [sowFibers, setSowFibers] = useState<Record<string, FiberLink>>({});

  useEffect(() => {
    apiFetch<OrderDetail>(`/v1/orders/${params.id}`)
      .then(async (o) => {
        setOrder(o);
        // Probe each SOW for a linked fiber tagging project
        const allSows = o.sos.flatMap((s) => s.sows);
        const results = await Promise.all(
          allSows.map(async (sow) => {
            const r = await fetch(`${API_URL}/v1/fiber-projects/by-sow/${sow.sowNumber}`);
            if (!r.ok) return null;
            const f = (await r.json()) as FiberLink;
            return [sow.sowNumber, f] as const;
          }),
        );
        const map: Record<string, FiberLink> = {};
        for (const r of results) if (r) map[r[0]] = r[1];
        setSowFibers(map);
      })
      .catch(() => undefined);
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
            <ul className="ml-6 mt-2 space-y-3">
              {so.sows.map((sow) => {
                const fiber = sowFibers[sow.sowNumber];
                return (
                  <li key={sow.id}>
                    <div className="flex items-center gap-3 flex-wrap">
                      <Link href={`/sites?sowId=${sow.id}`} className="text-blue-600 hover:underline font-medium">
                        ▾ {sow.sowNumber}
                      </Link>
                      {sow.scope && <span className="text-xs text-slate-500">{sow.scope}</span>}
                      <span className="text-sm text-slate-500">Plan RFS: {new Date(sow.planRfsDate).toLocaleDateString('id-ID')}</span>
                      <span className="text-sm">{Number(sow.progressPct)}%</span>
                      <StatusPill status={sow.warningLevel} />
                    </div>
                    {fiber && (
                      <div className="mt-2 ml-6 bg-gradient-to-r from-sky-50 to-white border border-sky-200 rounded p-3">
                        <div className="flex items-start justify-between flex-wrap gap-3">
                          <div>
                            <div className="text-[11px] uppercase tracking-wide text-sky-700 font-semibold">
                              Fiber Optic Link Tagging
                            </div>
                            <div className="text-xs text-slate-600 mt-1">
                              {fiber.summary.nearEnd?.name ?? 'Near End'} → {fiber.summary.farEnd?.name ?? 'Far End'}
                            </div>
                            <div className="flex flex-wrap gap-4 mt-1 text-xs text-slate-600">
                              <span><b className="text-slate-900">{fiber.summary.polesTagged}</b> poles tagged</span>
                              <span><b className="text-slate-900">{(fiber.summary.estimatedLengthMeters / 1000).toFixed(2)} km</b> route</span>
                              <span>Status: <b className="text-slate-900">{fiber.summary.status}</b></span>
                              {(fiber.summary.otdrTestsTotal ?? 0) > 0 && (
                                <span>
                                  OTDR: <b className="text-slate-900">{fiber.summary.otdrTestsTotal}</b>
                                  {(fiber.summary.otdrTestsFail ?? 0) > 0 && (
                                    <span className="ml-1 text-rose-700 font-semibold">· {fiber.summary.otdrTestsFail} FAIL</span>
                                  )}
                                  {(fiber.summary.otdrTestsPass ?? 0) > 0 && (
                                    <span className="ml-1 text-emerald-700 font-semibold">· {fiber.summary.otdrTestsPass} PASS</span>
                                  )}
                                </span>
                              )}
                              {(fiber.summary.segmentsTotal ?? 0) > 0 && (
                                <span>
                                  Segments: <b className="text-slate-900">{fiber.summary.segmentsComplete ?? 0}/{fiber.summary.segmentsTotal}</b> complete
                                  {(fiber.summary.segmentsFailed ?? 0) > 0 && (
                                    <span className="ml-1 text-rose-700 font-semibold">· {fiber.summary.segmentsFailed} FAILED</span>
                                  )}
                                </span>
                              )}
                            </div>
                            <div className="mt-2 w-64 bg-slate-200 rounded h-1.5 overflow-hidden">
                              <div
                                className="bg-sky-600 h-full"
                                style={{ width: `${Math.min(100, (fiber.summary.polesTagged / 20) * 100).toFixed(0)}%` }}
                              />
                            </div>
                          </div>
                          <Link
                            href={`/orders/${params.id}/fiber/${fiber.fiberProjectId}`}
                            className="bg-sky-600 hover:bg-sky-700 text-white px-3 py-1.5 rounded text-xs font-semibold whitespace-nowrap"
                          >
                            Open Tagging Map →
                          </Link>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
