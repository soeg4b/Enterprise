import type { OverallStatus } from 'deliveriq-shared';

const COLOR: Record<string, string> = {
  ON_TRACK: 'bg-emerald-100 text-emerald-800',
  AT_RISK: 'bg-amber-100 text-amber-800',
  DELAY: 'bg-red-100 text-red-800',
};

export function StatusPill({ status }: { status: OverallStatus | string }) {
  const cls = COLOR[status] ?? 'bg-slate-100 text-slate-700';
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>{status.replace('_', ' ')}</span>;
}
