// Notifications, Audit, and other concrete-but-thin endpoints.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { requireAuth, requireRole } from '../../auth/auth.js';
import { serialise } from '../../lib/serialise.js';

export async function notificationsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/v1/notifications',
    { preHandler: [requireAuth] },
    async (req) => {
      const data = await prisma.notification.findMany({
        where: { userId: req.user!.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return { data: serialise(data) };
    },
  );

  app.post(
    '/v1/notifications/:id/read',
    { preHandler: [requireAuth] },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const updated = await prisma.notification.updateMany({
        where: { id, userId: req.user!.id, readAt: null },
        data: { readAt: new Date() },
      });
      return { ok: true, updated: updated.count };
    },
  );
}

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/v1/audit',
    { preHandler: [requireAuth, requireRole('AD')] },
    async (req) => {
      const q = z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(200).default(50),
        entityType: z.string().optional(),
        entityId: z.string().optional(),
      }).parse(req.query);
      const where: Record<string, unknown> = {};
      if (q.entityType) where.entityType = q.entityType;
      if (q.entityId) where.entityId = q.entityId;

      const [rows, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          orderBy: { occurredAt: 'desc' },
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
        prisma.auditLog.count({ where }),
      ]);
      // BigInt -> string for JSON
      const data = rows.map((r) => ({ ...r, id: r.id.toString() }));
      return {
        data: serialise(data),
        pagination: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) },
      };
    },
  );
}
