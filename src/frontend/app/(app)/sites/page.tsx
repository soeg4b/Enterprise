'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '../../../lib/api';
import { MilestoneStepper } from '../../../components/MilestoneStepper';
import { StatusPill } from '../../../components/StatusPill';
import type { MilestoneDto, OverallStatus } from 'deliveriq-shared';

interface VendorAssignment {
  id: string;
  spkNumber: string | null;
  poNumber: string | null;
  amount: string | null;
  vendor: { name: string };
}

interface SiteWithMilestones {
  id: string;
  code: string;
  name: string;
  type: string;
  city: string | null;
  province: string | null;
  address: string | null;
  progressPct: string;
  gapDays: number;
  warningLevel: OverallStatus;
  assignedFieldUser: { id: string; fullName: string; email: string } | null;
  milestones: MilestoneDto[];
}

interface SowDetail {
  id: string;
  sowNumber: string;
  scope: string | null;
  planRfsDate: string;
  actualRfsDate: string | null;
  progressPct: string;
  gapDays: number;
  warningLevel: OverallStatus;
  warningReason: string | null;
  so: {
    id: string;
    soNumber: string;
    order: {
      id: string;
      orderNumber: string;
      description: string | null;
      productCategory: string;
      customer: { name: string };
    };
  };
  owner: { id: string; fullName: string; email: string } | null;
  vendorAssignments: VendorAssignment[];
  sites: SiteWithMilestones[];
}

function SitesContent() {
  const search = useSearchParams();
  const sowId = search?.get('sowId');
  const [sow, setSow] = useState<SowDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openSites, setOpenSites] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!sowId) {
      setError('Missing sowId query param.');
      return;
    }
    setError(null);
    setSow(null);
    apiFetch<SowDetail>(`/v1/sows/${sowId}`)
      .then((data) => {
        setSow(data);
        const initial: Record<string, boolean> = {};
        if (data.sites.length === 1) initial[data.sites[0].id] = true;
        setOpenSites(initial);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, [sowId]);

  if (error) return <div className="text-red-600">{error}</div>;
  if (!sow) return <div className="text-slate-500">Loading SOW detail…</div>;

  const planRfs = new Date(sow.planRfsDate).toLocaleDateString('id-ID');
  const actualRfs = sow.actualRfsDate
    ? new Date(sow.actualRfsDate).toLocaleDateString('id-ID')
    : '—';

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs text-slate-500 mb-1">
          <Link href="/orders" className="hover:underline">Programs</Link>
          {' / '}
          <Link href={`/orders/${sow.so.order.id}`} className="hover:underline">
            {sow.so.order.orderNumber}
          </Link>
          {' / '}
          {sow.so.soNumber}
          {' / '}
          <span className="text-slate-700">{sow.sowNumber}</span>
        </div>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          {sow.sowNumber}
          <StatusPill status={sow.warningLevel} />
        </h1>
        <p className="text-sm text-slate-600">
          {sow.so.order.customer.name} · {sow.so.order.productCategory.replace('_', ' ')}
          {sow.scope ? ` · ${sow.scope}` : ''}
        </p>
      </div>

      {/* SOW summary */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Progress" value={`${Number(sow.progressPct)}%`} />
        <SummaryCard label="Plan RFS" value={planRfs} />
        <SummaryCard label="Actual RFS" value={actualRfs} />
        <SummaryCard
          label="Gap"
          value={sow.gapDays === 0 ? 'On Plan' : `${sow.gapDays} day(s)`}
          tone={sow.gapDays > 0 ? 'warn' : 'ok'}
        />
      </section>

      {sow.warningReason && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded p-3">
          ⚠ {sow.warningReason}
        </div>
      )}

      {/* Vendors */}
      {sow.vendorAssignments.length > 0 && (
        <section className="bg-white rounded shadow">
          <header className="px-4 py-3 border-b font-semibold text-slate-700">Vendor Assignments</header>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="p-3">Vendor</th>
                <th className="p-3">SPK No</th>
                <th className="p-3">PO No</th>
                <th className="p-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {sow.vendorAssignments.map((va) => (
                <tr key={va.id} className="border-t">
                  <td className="p-3 font-medium">{va.vendor.name}</td>
                  <td className="p-3">{va.spkNumber ?? '—'}</td>
                  <td className="p-3">{va.poNumber ?? '—'}</td>
                  <td className="p-3 text-right font-mono">
                    {va.amount
                      ? `Rp ${Number(va.amount).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Sites with milestone details */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Sites & Milestones ({sow.sites.length})</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                setOpenSites(Object.fromEntries(sow.sites.map((s) => [s.id, true])))
              }
              className="text-xs px-3 py-1 border rounded hover:bg-slate-50"
            >
              Expand all
            </button>
            <button
              type="button"
              onClick={() => setOpenSites({})}
              className="text-xs px-3 py-1 border rounded hover:bg-slate-50"
            >
              Collapse all
            </button>
          </div>
        </div>

        {sow.sites.map((site) => {
          const open = !!openSites[site.id];
          const done = site.milestones.filter((m) => m.status === 'DONE').length;
          const total = site.milestones.length;
          return (
            <div key={site.id} className="bg-white rounded shadow overflow-hidden">
              <button
                type="button"
                onClick={() =>
                  setOpenSites((prev) => ({ ...prev, [site.id]: !prev[site.id] }))
                }
                className="w-full px-4 py-3 border-b flex items-center gap-3 hover:bg-slate-50 text-left"
              >
                <span className="text-slate-400">{open ? '▾' : '▸'}</span>
                <div className="flex-1">
                  <div className="font-semibold flex items-center gap-2">
                    {site.code} — {site.name}
                    <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      {site.type}
                    </span>
                    <StatusPill status={site.warningLevel} />
                  </div>
                  <div className="text-xs text-slate-500">
                    {site.city ?? '—'}
                    {site.province ? `, ${site.province}` : ''}
                    {site.assignedFieldUser
                      ? ` · Field: ${site.assignedFieldUser.fullName}`
                      : ''}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="font-mono">
                    {done}/{total} milestones
                  </span>
                  <div className="w-32 h-2 bg-slate-100 rounded overflow-hidden">
                    <div
                      className="h-full bg-emerald-500"
                      style={{
                        width: `${total ? Math.round((done / total) * 100) : 0}%`,
                      }}
                    />
                  </div>
                  <span className="font-mono">{Number(site.progressPct)}%</span>
                </div>
              </button>
              {open && (
                <div className="p-4">
                  {site.milestones.length === 0 ? (
                    <div className="text-sm text-slate-400 italic">
                      No milestones registered for this site.
                    </div>
                  ) : (
                    <MilestoneStepper milestones={site.milestones} />
                  )}
                  <div className="mt-3 text-right">
                    <Link
                      href={`/sites/${site.id}`}
                      className="text-xs text-blue-700 hover:underline"
                    >
                      Open full site detail →
                    </Link>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {sow.sites.length === 0 && (
          <div className="bg-white rounded shadow p-6 text-center text-slate-400">
            No sites registered yet on this SOW.
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({
  label, value, tone = 'default',
}: { label: string; value: string; tone?: 'default' | 'ok' | 'warn' }) {
  const bg =
    tone === 'warn'
      ? 'bg-red-50 border-red-200'
      : tone === 'ok'
        ? 'bg-emerald-50 border-emerald-200'
        : 'bg-white';
  return (
    <div className={`rounded shadow border p-3 ${bg}`}>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}

export default function SitesPage() {
  return (
    <Suspense fallback={<div className="text-slate-500">Loading…</div>}>
      <SitesContent />
    </Suspense>
  );
}
