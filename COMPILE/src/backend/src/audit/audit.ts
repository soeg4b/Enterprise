// Append-only audit log writer. Should be called within the same DB tx as the mutation
// where possible (Phase-1: best-effort separate write).

import type { AuditAction, Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { logger } from '../lib/logger.js';

export interface AuditWriteInput {
  actorUserId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  traceId?: string | null;
  tx?: Prisma.TransactionClient;
}

export async function audit(input: AuditWriteInput): Promise<void> {
  const client = input.tx ?? prisma;
  try {
    await client.auditLog.create({
      data: {
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        before: (input.before ?? null) as Prisma.InputJsonValue,
        after: (input.after ?? null) as Prisma.InputJsonValue,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        requestId: input.requestId ?? null,
        traceId: input.traceId ?? null,
      },
    });
  } catch (err) {
    logger.warn({ err, action: input.action, entityType: input.entityType }, 'audit.write.failed');
  }
}
