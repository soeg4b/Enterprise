import { PrismaClient } from '@prisma/client';
import { logger } from '../lib/logger.js';

declare global {
  // eslint-disable-next-line no-var
  var __deliveriq_prisma__: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__deliveriq_prisma__ ??
  new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'error' },
    ],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__deliveriq_prisma__ = prisma;
}

// Soft-delete middleware: rewrite findMany/findFirst/count/update to skip deleted rows.
const SOFT_DELETE_MODELS = new Set([
  'User',
  'Department',
  'Customer',
  'Program',
  'Vendor',
  'Order',
  'SO',
  'SOW',
  'Site',
  'Segment',
  'Milestone',
  'VendorAssignment',
  'RevenueClaim',
  'CapexBudget',
  'CapexEntry',
]);

prisma.$use(async (params, next) => {
  if (params.model && SOFT_DELETE_MODELS.has(params.model)) {
    if (params.action === 'findUnique' || params.action === 'findFirst') {
      params.action = 'findFirst';
      params.args = params.args ?? {};
      params.args.where = { ...(params.args.where ?? {}), deletedAt: null };
    }
    if (params.action === 'findMany' || params.action === 'count') {
      params.args = params.args ?? {};
      params.args.where = { ...(params.args.where ?? {}), deletedAt: { equals: null, ...(params.args.where?.deletedAt ?? {}) } };
    }
    if (params.action === 'delete') {
      params.action = 'update';
      params.args.data = { deletedAt: new Date() };
    }
  }
  return next(params);
});

(prisma as unknown as { $on: (e: string, cb: (ev: { message: string }) => void) => void }).$on(
  'error',
  (e) => logger.error({ err: e }, 'prisma.error'),
);
