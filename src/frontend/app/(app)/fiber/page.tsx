'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { API_URL } from '../../../lib/api';

type FiberProject = {
  id: string;
  code: string;
  name: string;
  customerName: string;
  vendorName: string;
  status: string;
  polesTagged: number;
  estimatedLengthMeters: number;
  nearEnd?: { name: string; address: string };
  farEnd?: { name: string; address: string };
  createdAt: string;
  otdrTestsTotal: number;
  otdrTestsPass: number;
  otdrTestsFail: number;
  segmentsTotal: number;
  segmentsComplete: number;
  segmentsFailed: number;
};

type FiberListResponse = { items: FiberProject[] };

const STATUS_COLORS: Record<string, string> = {
  PLANNED: 'bg-slate-100 text-slate-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  COMPLETE: 'bg-emerald-100 text-emerald-700',
  FAILED: 'bg-rose-100 text-rose-700',
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-600';
  return <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${cls}`}>{status.replace('_', ' ')}</span>;
}

export default function FiberProjectsPage() {
  const [projects, setProjects] = useState<FiberProject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/v1/fiber-projects`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<FiberListResponse>;
      })
      .then((d) => setProjects(d.items))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-slate-500">Loading fiber projects…</div>;
  if (error) return <div className="p-6 text-rose-600">Error: {error}</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Fiber Optic Projects</h1>
        <p className="text-sm text-slate-500 mt-1">{projects.length} project{projects.length !== 1 ? 's' : ''} total</p>
      </div>

      {projects.length === 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-slate-500">
          No fiber projects found.
        </div>
      )}

      <div className="grid gap-4">
        {projects.map((p) => {
          const lengthKm = (p.estimatedLengthMeters / 1000).toFixed(2);
          const segComplete = p.segmentsComplete ?? 0;
          const segTotal = p.segmentsTotal ?? 0;
          const segFailed = p.segmentsFailed ?? 0;

          return (
            <div key={p.id} className="bg-white rounded-lg border border-slate-200 p-4 flex flex-col gap-3">
              {/* Header */}
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-slate-400">{p.code}</span>
                    <StatusBadge status={p.status} />
                  </div>
                  <h2 className="text-base font-semibold mt-0.5">{p.name}</h2>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {p.customerName} · <span className="italic">{p.vendorName}</span>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Link
                    href={`/fiber/${p.id}`}
                    className="bg-sky-600 hover:bg-sky-700 text-white px-3 py-1.5 rounded text-xs font-semibold"
                  >
                    Open Map →
                  </Link>
                </div>
              </div>

              {/* Route */}
              {(p.nearEnd || p.farEnd) && (
                <div className="text-xs text-slate-600 bg-slate-50 rounded px-3 py-2">
                  <span className="font-medium">{p.nearEnd?.name ?? 'Near End'}</span>
                  <span className="mx-2 text-slate-400">→</span>
                  <span className="font-medium">{p.farEnd?.name ?? 'Far End'}</span>
                  {p.nearEnd?.address && (
                    <div className="text-slate-400 text-[10px] mt-0.5">{p.nearEnd.address}</div>
                  )}
                </div>
              )}

              {/* Stats */}
              <div className="flex flex-wrap gap-4 text-xs text-slate-600">
                <span><b className="text-slate-900">{p.polesTagged}</b> poles tagged</span>
                <span><b className="text-slate-900">{lengthKm} km</b> route</span>
                {p.otdrTestsTotal > 0 && (
                  <span>
                    OTDR: <b className="text-slate-900">{p.otdrTestsTotal}</b>
                    {p.otdrTestsFail > 0 && <span className="ml-1 text-rose-700 font-semibold">· {p.otdrTestsFail} FAIL</span>}
                    {p.otdrTestsPass > 0 && <span className="ml-1 text-emerald-700 font-semibold">· {p.otdrTestsPass} PASS</span>}
                  </span>
                )}
                {segTotal > 0 && (
                  <span>
                    Segments: <b className={segComplete === segTotal ? 'text-emerald-700' : 'text-slate-900'}>{segComplete}/{segTotal}</b> complete
                    {segFailed > 0 && <span className="ml-1 text-rose-700 font-semibold">· {segFailed} FAILED</span>}
                  </span>
                )}
              </div>

              {/* Progress bar — poles (target 20 poles as 100%) */}
              <div className="w-full bg-slate-100 rounded h-1.5 overflow-hidden">
                <div
                  className="bg-sky-500 h-full transition-all"
                  style={{ width: `${Math.min(100, (p.polesTagged / 20) * 100).toFixed(0)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
