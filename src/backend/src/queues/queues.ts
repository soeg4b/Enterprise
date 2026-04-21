// BullMQ queue definitions. Workers consume these.
// Queues are lazy-initialized to gracefully handle Redis < 5.x (e.g. Windows MSOpenTech 3.x).

import { Queue } from 'bullmq';
import { getRedis } from '../db/redis.js';
import { logger } from '../lib/logger.js';

export const QUEUE_NAMES = {
  milestoneRecompute: 'milestone-recompute',
  importParse: 'import-parse',
  notificationFanout: 'notification-fanout',
} as const;

let _milestoneQueue: Queue | null = null;
let _importQueue: Queue | null = null;
let _notificationQueue: Queue | null = null;
let _initFailed = false;

function initQueues() {
  if (_initFailed) return;
  try {
    const connection = getRedis() as never;
    _milestoneQueue = new Queue(QUEUE_NAMES.milestoneRecompute, { connection });
    _importQueue = new Queue(QUEUE_NAMES.importParse, { connection });
    _notificationQueue = new Queue(QUEUE_NAMES.notificationFanout, { connection });
  } catch (err) {
    _initFailed = true;
    logger.warn({ err }, 'BullMQ queues unavailable — queue operations will be no-ops');
  }
}

/** Stub queue that silently drops jobs when BullMQ is unavailable */
const noopQueue = { add: async () => ({}) } as unknown as Queue;

export function getMilestoneQueue(): Queue { initQueues(); return _milestoneQueue ?? noopQueue; }
export function getImportQueue(): Queue { initQueues(); return _importQueue ?? noopQueue; }
export function getNotificationQueue(): Queue { initQueues(); return _notificationQueue ?? noopQueue; }

// Legacy named exports for existing consumers
export const milestoneQueue = { get add() { return getMilestoneQueue().add.bind(getMilestoneQueue()); } } as unknown as Queue;
export const importQueue = { get add() { return getImportQueue().add.bind(getImportQueue()); } } as unknown as Queue;
export const notificationQueue = { get add() { return getNotificationQueue().add.bind(getNotificationQueue()); } } as unknown as Queue;

export interface MilestoneRecomputeJob {
  sowId: string;
  reason: string;
}

export interface ImportParseJob {
  importJobId: string;
  uploadedById: string;
}
