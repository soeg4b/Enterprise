import type { MilestoneDto, MilestoneType } from 'deliveriq-shared';
import { MILESTONE_LABELS, MILESTONE_DESCRIPTIONS } from 'deliveriq-shared';

const STATUS_DOT: Record<string, string> = {
  DONE: 'bg-emerald-500',
  IN_PROGRESS: 'bg-blue-500',
  BLOCKED: 'bg-red-500',
  NOT_STARTED: 'bg-slate-300',
};
const STATUS_BADGE: Record<string, string> = {
  DONE: 'bg-emerald-100 text-emerald-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  BLOCKED: 'bg-red-100 text-red-700',
  NOT_STARTED: 'bg-slate-100 text-slate-600',
};

export function MilestoneStepper({ milestones }: { milestones: MilestoneDto[] }) {
  const sorted = [...milestones].sort((a, b) => a.sequence - b.sequence);
  return (
    <ol className="space-y-3">
      {sorted.map((m) => {
        const label = MILESTONE_LABELS[m.type as MilestoneType] ?? m.type;
        const desc = MILESTONE_DESCRIPTIONS[m.type as MilestoneType] ?? '';
        return (
          <li key={m.id} className="flex items-start gap-3 border-b last:border-b-0 pb-2">
            <span
              className={`mt-1.5 w-3 h-3 rounded-full flex-shrink-0 ${
                STATUS_DOT[m.status] ?? 'bg-slate-300'
              }`}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">
                  {m.sequence}. {label}
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded ${STATUS_BADGE[m.status] ?? 'bg-slate-100'}`}
                >
                  {m.status.replace('_', ' ')}
                </span>
                {m.overdueDays > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-red-100 text-red-700">
                    overdue {m.overdueDays}d
                  </span>
                )}
              </div>
              {desc && <div className="text-xs text-slate-500 mt-0.5">{desc}</div>}
              <div className="text-xs text-slate-600 mt-1">
                Plan: {m.planDate ? new Date(m.planDate).toLocaleDateString('id-ID') : '—'}
                {m.actualDate
                  ? ` · Actual: ${new Date(m.actualDate).toLocaleDateString('id-ID')}`
                  : ''}
                {m.weight > 0 && ` · Weight: ${m.weight}%`}
              </div>
              {m.remark && (
                <div className="text-xs italic text-slate-600 mt-1">Note: {m.remark}</div>
              )}
              {m.blockedReason && (
                <div className="text-xs italic text-red-700 mt-1">
                  Blocked: {m.blockedReason}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
