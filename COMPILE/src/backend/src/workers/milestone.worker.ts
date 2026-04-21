// Milestone recompute worker — reads SOW + milestones, calls pure engine, persists.
// Per-SOW concurrency=1 via job ID `recompute:{sowId}`.

import { Worker } from 'bullmq';
import { getRedis } from '../db/redis.js';
import { prisma } from '../db/prisma.js';
import { logger } from '../lib/logger.js';
import { QUEUE_NAMES, type MilestoneRecomputeJob } from '../queues/queues.js';
import {
  buildWarningReason,
  computeGapDayToRfs,
  computeOverallStatus,
  computeOverdueDays,
  computeProgressPercent,
} from '../engine/milestone.js';
import { cache } from '../services/cache.js';

export function startMilestoneWorker(): Worker {
  const worker = new Worker<MilestoneRecomputeJob>(
    QUEUE_NAMES.milestoneRecompute,
    async (job) => {
      const { sowId, reason } = job.data;
      const sow = await prisma.sOW.findFirst({ where: { id: sowId }, include: { milestones: true, sites: true } });
      if (!sow) return { skipped: true };

      const today = new Date();
      const engineSow = { planRfsDate: sow.planRfsDate, actualRfsDate: sow.actualRfsDate };
      const engineMs = sow.milestones.map((m) => ({
        type: m.type,
        status: m.status,
        planDate: m.planDate,
        actualDate: m.actualDate,
        weight: m.weight,
      }));

      const progress = computeProgressPercent(engineMs);
      const gap = computeGapDayToRfs(engineSow, today);
      const status = computeOverallStatus(engineSow, engineMs, today);
      const reasonStr = buildWarningReason(engineSow, engineMs, today);

      await prisma.sOW.update({
        where: { id: sowId },
        data: {
          progressPct: progress.toString() as never,
          gapDays: gap,
          warningLevel: status,
          warningReason: reasonStr,
          lastComputedAt: new Date(),
        },
      });

      // Update per-milestone overdueDays
      await Promise.all(
        sow.milestones.map((m) =>
          prisma.milestone.update({
            where: { id: m.id },
            data: { overdueDays: computeOverdueDays({ type: m.type, status: m.status, planDate: m.planDate, actualDate: m.actualDate }, today) },
          }),
        ),
      );

      // Mirror site rollups (group by site)
      const sites = sow.sites;
      for (const site of sites) {
        const siteMs = engineMs.filter((m) => sow.milestones.find((dbm) => dbm.type === m.type && dbm.siteId === site.id));
        const sp = siteMs.length ? computeProgressPercent(siteMs) : progress;
        const sStatus = siteMs.length ? computeOverallStatus(engineSow, siteMs, today) : status;
        await prisma.site.update({
          where: { id: site.id },
          data: {
            progressPct: sp.toString() as never,
            gapDays: gap,
            warningLevel: sStatus,
            lastComputedAt: new Date(),
          },
        });
      }

      // Cache invalidation
      await cache.invalidatePattern(cache.key('default', 'reports', '*'));

      logger.info({ sowId, reason, progress, gap, status }, 'milestone.recompute.done');
      return { sowId, progress, gap, status };
    },
    { connection: getRedis() as never, concurrency: 4 },
  );

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'milestone.worker.failed');
  });

  return worker;
}
