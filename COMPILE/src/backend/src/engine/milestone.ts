// Pure-function milestone engine.
// Computes per-SOW progressPct, gapDays, overallStatus from milestones list.
// Inputs are plain JS objects so this module is unit-testable without a DB.

import {
  MILESTONE_WEIGHTS,
  STATUS_THRESHOLDS,
  type MilestoneStatus,
  type MilestoneType,
  type OverallStatus,
} from 'deliveriq-shared';

export interface EngineMilestone {
  type: MilestoneType;
  status: MilestoneStatus;
  planDate: Date | null;
  actualDate: Date | null;
  weight?: number;
}

export interface EngineSow {
  planRfsDate: Date;
  actualRfsDate: Date | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Calendar-day difference (later - earlier) treating each Date as its UTC calendar day.
 * Normalising to UTC midnight on each side eliminates the off-by-one (CQ-10) that the
 * previous Math.ceil-based diff exhibited around timezone/DST boundaries.
 * Returns a signed integer number of whole days.
 */
function diffDays(later: Date, earlier: Date): number {
  const a = Date.UTC(later.getUTCFullYear(), later.getUTCMonth(), later.getUTCDate());
  const b = Date.UTC(earlier.getUTCFullYear(), earlier.getUTCMonth(), earlier.getUTCDate());
  return Math.round((a - b) / MS_PER_DAY);
}

function statusFactor(status: MilestoneStatus): number {
  switch (status) {
    case 'DONE':
      return 1.0;
    case 'IN_PROGRESS':
      return 0.5;
    default:
      return 0;
  }
}

/**
 * Sum(weight * factor) — returns 0..100 rounded to 1 decimal.
 */
export function computeProgressPercent(milestones: EngineMilestone[]): number {
  const total = milestones.reduce((acc, m) => {
    const w = m.weight ?? MILESTONE_WEIGHTS[m.type] ?? 0;
    return acc + w * statusFactor(m.status);
  }, 0);
  return Math.round(total * 10) / 10;
}

/**
 * Days between actual (or today) and plan RFS. 0 if plan is in the future and no actual.
 */
export function computeGapDayToRfs(sow: EngineSow, today: Date = new Date()): number {
  if (sow.actualRfsDate) return diffDays(sow.actualRfsDate, sow.planRfsDate);
  return Math.max(0, diffDays(today, sow.planRfsDate));
}

/**
 * Overall status per Data agent §7.3.
 */
export function computeOverallStatus(
  sow: EngineSow,
  milestones: EngineMilestone[],
  today: Date = new Date(),
): OverallStatus {
  if (sow.actualRfsDate) return 'ON_TRACK';

  const open = milestones.filter((m) => m.status !== 'DONE' && m.planDate);
  const overdueDays = open.map((m) => Math.max(0, diffDays(today, m.planDate as Date)));
  const maxOverdue = overdueDays.length ? Math.max(...overdueDays) : 0;
  const anyOverdue = overdueDays.some((d) => d > STATUS_THRESHOLDS.AT_RISK_OVERDUE_DAYS);

  const installation = milestones.find((m) => m.type === 'INSTALLATION');
  const installNotStarted = installation?.status === 'NOT_STARTED';
  const daysUntilRfs = diffDays(sow.planRfsDate, today);
  const rfsImminentNoInstall =
    daysUntilRfs <= STATUS_THRESHOLDS.RFS_IMMINENT_WINDOW_DAYS && installNotStarted;

  const gap = computeGapDayToRfs(sow, today);

  if (
    (anyOverdue && maxOverdue > STATUS_THRESHOLDS.DELAY_OVERDUE_DAYS) ||
    gap > STATUS_THRESHOLDS.DELAY_GAP_DAYS ||
    rfsImminentNoInstall
  ) {
    return 'DELAY';
  }
  if (
    anyOverdue ||
    (gap >= STATUS_THRESHOLDS.AT_RISK_GAP_MIN_DAYS && gap <= STATUS_THRESHOLDS.AT_RISK_GAP_MAX_DAYS)
  ) {
    return 'AT_RISK';
  }
  return 'ON_TRACK';
}

/**
 * Per-milestone overdue days (open milestones only).
 */
export function computeOverdueDays(m: EngineMilestone, today: Date = new Date()): number {
  if (m.status === 'DONE' || !m.planDate) return 0;
  return Math.max(0, diffDays(today, m.planDate));
}

/**
 * Friendly human-readable reason string for the worst signal influencing status.
 */
export function buildWarningReason(
  sow: EngineSow,
  milestones: EngineMilestone[],
  today: Date = new Date(),
): string | null {
  const status = computeOverallStatus(sow, milestones, today);
  if (status === 'ON_TRACK') return null;
  const gap = computeGapDayToRfs(sow, today);
  if (gap > 0) return `${gap} day(s) past plan RFS`;
  const open = milestones.filter((m) => m.status !== 'DONE' && m.planDate);
  const overdue = open
    .map((m) => ({ type: m.type, days: computeOverdueDays(m, today) }))
    .filter((x) => x.days > 0)
    .sort((a, b) => b.days - a.days);
  if (overdue.length && overdue[0]) {
    return `${overdue[0].type} overdue by ${overdue[0].days} day(s)`;
  }
  return 'RFS imminent without Installation started';
}
