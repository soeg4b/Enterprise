// Unit tests — Milestone engine (TC-ENG-U-001..022)
//
// Imports the production source directly so we exercise the same code paths
// that ship in the Fastify backend.

import { describe, it, expect } from 'vitest';
import {
  computeProgressPercent,
  computeGapDayToRfs,
  computeOverallStatus,
  computeOverdueDays,
  buildWarningReason,
  type EngineMilestone,
  type EngineSow,
} from '../../../src/backend/src/engine/milestone';
import {
  MILESTONE_WEIGHTS,
  MILESTONE_SEQUENCE,
  STATUS_THRESHOLDS,
} from 'deliveriq-shared';

// -----------------------------------------------------------------------------
// Fixture helpers
// -----------------------------------------------------------------------------

const TODAY = new Date('2026-04-20T00:00:00.000Z'); // pinned "today" for determinism

function days(n: number, base: Date = TODAY): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

function makeMilestones(
  states: Array<{ status: EngineMilestone['status']; planOffset?: number; weight?: number }>,
): EngineMilestone[] {
  return states.map((s, i) => ({
    type: MILESTONE_SEQUENCE[i] ?? 'INSTALLATION',
    status: s.status,
    planDate: s.planOffset === undefined ? null : days(s.planOffset),
    actualDate: null,
    weight: s.weight,
  }));
}

// -----------------------------------------------------------------------------
// computeProgressPercent — table-driven
// -----------------------------------------------------------------------------

describe('computeProgressPercent', () => {
  it('TC-ENG-U-001: all NOT_STARTED → 0', () => {
    const ms = makeMilestones(Array(8).fill({ status: 'NOT_STARTED' }));
    expect(computeProgressPercent(ms)).toBe(0);
  });

  it('TC-ENG-U-002: all DONE with default weights → 100', () => {
    // RFS=15, INSTALLATION=25, MATERIAL_READY=15, PROCUREMENT=15, DESIGN=10,
    // STIP_2_4=5, STIP_10=5, KOM=5, MOS=5, HANDOVER=0 → sum = 100
    const ms: EngineMilestone[] = MILESTONE_SEQUENCE.map((t) => ({
      type: t,
      status: 'DONE',
      planDate: null,
      actualDate: null,
    }));
    expect(computeProgressPercent(ms)).toBe(100);
  });

  it('TC-ENG-U-003: 1 IN_PROGRESS of 2 equal weights → 25', () => {
    const ms: EngineMilestone[] = [
      { type: 'DESIGN', status: 'IN_PROGRESS', planDate: null, actualDate: null, weight: 50 },
      { type: 'INSTALLATION', status: 'NOT_STARTED', planDate: null, actualDate: null, weight: 50 },
    ];
    expect(computeProgressPercent(ms)).toBe(25);
  });

  it('TC-ENG-U-004: per-milestone weight override beats constant table', () => {
    const ms: EngineMilestone[] = [
      { type: 'DESIGN', status: 'DONE', planDate: null, actualDate: null, weight: 100 },
    ];
    expect(computeProgressPercent(ms)).toBe(100);
    // Sanity: without override would have used MILESTONE_WEIGHTS.DESIGN = 10
    expect(MILESTONE_WEIGHTS.DESIGN).toBe(10);
  });

  it('rounds to 1 decimal', () => {
    const ms: EngineMilestone[] = [
      { type: 'DESIGN', status: 'IN_PROGRESS', planDate: null, actualDate: null, weight: 33.3 },
    ];
    // 33.3 * 0.5 = 16.65 → 16.7
    expect(computeProgressPercent(ms)).toBe(16.7);
  });
});

// -----------------------------------------------------------------------------
// computeGapDayToRfs
// -----------------------------------------------------------------------------

describe('computeGapDayToRfs', () => {
  it('TC-ENG-U-005: actualRfsDate 2 days before plan → -2', () => {
    const sow: EngineSow = {
      planRfsDate: days(10),
      actualRfsDate: days(8),
    };
    expect(computeGapDayToRfs(sow, TODAY)).toBe(-2);
  });

  it('TC-ENG-U-006: plan in future, no actual → 0', () => {
    const sow: EngineSow = { planRfsDate: days(10), actualRfsDate: null };
    expect(computeGapDayToRfs(sow, TODAY)).toBe(0);
  });

  it('TC-ENG-U-007: plan 5 days in past, no actual → 5', () => {
    const sow: EngineSow = { planRfsDate: days(-5), actualRfsDate: null };
    expect(computeGapDayToRfs(sow, TODAY)).toBe(5);
  });

  it('TC-ENG-U-022a: same calendar day across UTC midnight — gap = 0 (CQ-10)', () => {
    // planRfsDate = April 20 16:00 UTC (~ 23:00 WIB)
    // today      = April 20 16:30 UTC (~ 23:30 WIB)
    // Same WIB calendar day → gap MUST be 0, not 1.
    const planRfsDate = new Date('2026-04-20T16:00:00.000Z');
    const today = new Date('2026-04-20T16:30:00.000Z');
    const sow: EngineSow = { planRfsDate, actualRfsDate: null };
    expect(computeGapDayToRfs(sow, today)).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// computeOverallStatus — boundary table (covers TC-ENG-U-008..017)
// -----------------------------------------------------------------------------

describe('computeOverallStatus — gap-day boundaries', () => {
  type Row = {
    id: string;
    actualRfsDate: Date | null;
    planRfsDate: Date;
    open: Array<{ planOffset: number }>; // overdue helpers
    expected: 'ON_TRACK' | 'AT_RISK' | 'DELAY';
  };

  const cases: Row[] = [
    {
      id: 'TC-ENG-U-008',
      actualRfsDate: days(-2),
      planRfsDate: days(0),
      open: [],
      expected: 'ON_TRACK',
    },
    {
      id: 'TC-ENG-U-009 (gap=0)',
      actualRfsDate: null,
      planRfsDate: days(0),
      open: [],
      expected: 'ON_TRACK',
    },
    {
      id: 'TC-ENG-U-010 (gap=1, AT_RISK_GAP_MIN)',
      actualRfsDate: null,
      planRfsDate: days(-1),
      open: [],
      expected: 'AT_RISK',
    },
    {
      id: 'TC-ENG-U-011 (gap=7, AT_RISK_GAP_MAX)',
      actualRfsDate: null,
      planRfsDate: days(-7),
      open: [],
      expected: 'AT_RISK',
    },
    {
      id: 'TC-ENG-U-012 (gap=8 → DELAY_GAP_DAYS+1)',
      actualRfsDate: null,
      planRfsDate: days(-8),
      open: [],
      expected: 'DELAY',
    },
  ];

  for (const c of cases) {
    it(`${c.id} → ${c.expected}`, () => {
      const milestones: EngineMilestone[] = c.open.map((o, i) => ({
        type: MILESTONE_SEQUENCE[i] ?? 'INSTALLATION',
        status: 'IN_PROGRESS',
        planDate: days(o.planOffset),
        actualDate: null,
      }));
      const status = computeOverallStatus(
        { actualRfsDate: c.actualRfsDate, planRfsDate: c.planRfsDate },
        milestones,
        TODAY,
      );
      expect(status).toBe(c.expected);
    });
  }
});

describe('computeOverallStatus — overdue & RFS-imminent', () => {
  it('TC-ENG-U-013: open milestone overdue 4 d (>AT_RISK_OVERDUE 3, ≤DELAY_OVERDUE 7) + plan far future + INSTALLATION not present → AT_RISK', () => {
    const sow: EngineSow = { planRfsDate: days(60), actualRfsDate: null };
    const ms: EngineMilestone[] = [
      { type: 'DESIGN', status: 'IN_PROGRESS', planDate: days(-4), actualDate: null },
    ];
    expect(computeOverallStatus(sow, ms, TODAY)).toBe('AT_RISK');
  });

  it('TC-ENG-U-014: open milestone overdue beyond DELAY_OVERDUE_DAYS → DELAY', () => {
    const sow: EngineSow = { planRfsDate: days(60), actualRfsDate: null };
    const ms: EngineMilestone[] = [
      { type: 'DESIGN', status: 'IN_PROGRESS', planDate: days(-(STATUS_THRESHOLDS.DELAY_OVERDUE_DAYS + 1)), actualDate: null },
    ];
    expect(computeOverallStatus(sow, ms, TODAY)).toBe('DELAY');
  });

  it('TC-ENG-U-015: RFS plan 10 d away AND INSTALLATION=NOT_STARTED → DELAY', () => {
    const sow: EngineSow = { planRfsDate: days(10), actualRfsDate: null };
    const ms: EngineMilestone[] = [
      { type: 'INSTALLATION', status: 'NOT_STARTED', planDate: days(5), actualDate: null },
    ];
    expect(computeOverallStatus(sow, ms, TODAY)).toBe('DELAY');
  });

  it('TC-ENG-U-016: open milestone with planDate=null does not produce NaN', () => {
    const sow: EngineSow = { planRfsDate: days(30), actualRfsDate: null };
    const ms: EngineMilestone[] = [
      { type: 'DESIGN', status: 'NOT_STARTED', planDate: null, actualDate: null },
    ];
    expect(computeOverallStatus(sow, ms, TODAY)).toBe('ON_TRACK');
  });

  it('TC-ENG-U-017: empty milestones list, gap=0 → ON_TRACK', () => {
    const sow: EngineSow = { planRfsDate: days(0), actualRfsDate: null };
    expect(computeOverallStatus(sow, [], TODAY)).toBe('ON_TRACK');
  });

  it('TC-ENG-U-022b: midnight-boundary across timezones does not flip status (CQ-10)', () => {
    // plan = Apr 20 16:00 UTC (Apr 20 23:00 WIB)
    // today = Apr 20 16:30 UTC (Apr 20 23:30 WIB) → still same calendar day.
    const sow: EngineSow = {
      planRfsDate: new Date('2026-04-20T16:00:00.000Z'),
      actualRfsDate: null,
    };
    const today = new Date('2026-04-20T16:30:00.000Z');
    expect(computeOverallStatus(sow, [], today)).toBe('ON_TRACK');
  });
});

// -----------------------------------------------------------------------------
// computeOverdueDays
// -----------------------------------------------------------------------------

describe('computeOverdueDays', () => {
  it('TC-ENG-U-020: DONE milestone → 0', () => {
    expect(
      computeOverdueDays(
        { type: 'DESIGN', status: 'DONE', planDate: days(-10), actualDate: days(-9) },
        TODAY,
      ),
    ).toBe(0);
  });

  it('TC-ENG-U-021: NOT_STARTED with null planDate → 0 (no NaN)', () => {
    expect(
      computeOverdueDays(
        { type: 'DESIGN', status: 'NOT_STARTED', planDate: null, actualDate: null },
        TODAY,
      ),
    ).toBe(0);
  });

  it('IN_PROGRESS 5 days overdue → 5', () => {
    expect(
      computeOverdueDays(
        { type: 'DESIGN', status: 'IN_PROGRESS', planDate: days(-5), actualDate: null },
        TODAY,
      ),
    ).toBe(5);
  });
});

// -----------------------------------------------------------------------------
// buildWarningReason
// -----------------------------------------------------------------------------

describe('buildWarningReason', () => {
  it('TC-ENG-U-018: DELAY due to gap → mentions "past plan RFS"', () => {
    const sow: EngineSow = { planRfsDate: days(-10), actualRfsDate: null };
    const reason = buildWarningReason(sow, [], TODAY);
    expect(reason).toMatch(/past plan RFS/i);
  });

  it('TC-ENG-U-019: AT_RISK from overdue mentions worst milestone type', () => {
    const sow: EngineSow = { planRfsDate: days(60), actualRfsDate: null };
    const ms: EngineMilestone[] = [
      { type: 'DESIGN', status: 'IN_PROGRESS', planDate: days(-2), actualDate: null },
      { type: 'PROCUREMENT', status: 'IN_PROGRESS', planDate: days(-5), actualDate: null },
    ];
    const reason = buildWarningReason(sow, ms, TODAY);
    expect(reason).toContain('PROCUREMENT'); // worst (5 days)
    expect(reason).toMatch(/overdue by 5/);
  });

  it('ON_TRACK → null', () => {
    const sow: EngineSow = { planRfsDate: days(60), actualRfsDate: null };
    expect(buildWarningReason(sow, [], TODAY)).toBeNull();
  });
});
