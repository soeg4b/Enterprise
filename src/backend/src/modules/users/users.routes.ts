// Users module — minimal MVP listing.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { requireAuth, requireRole } from '../../auth/auth.js';
import { Errors } from '../../lib/errors.js';

const ListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  q: z.string().max(200).optional(),
});

export async function usersRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/v1/users',
    { preHandler: [requireAuth, requireRole('AD', 'BOD')] },
    async (req) => {
      const { page, pageSize, q } = ListQuery.parse(req.query);
      const where = q
        ? { OR: [{ email: { contains: q, mode: 'insensitive' as const } }, { fullName: { contains: q, mode: 'insensitive' as const } }] }
        : {};
      const [data, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
          select: { id: true, email: true, fullName: true, role: true, status: true, departmentId: true, locale: true },
        }),
        prisma.user.count({ where }),
      ]);
      return {
        data,
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      };
    },
  );

  app.get(
    '/v1/users/:id',
    { preHandler: [requireAuth, requireRole('AD', 'BOD')] },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const u = await prisma.user.findFirst({ where: { id } });
      if (!u) throw Errors.notFound('User');
      return {
        id: u.id, email: u.email, fullName: u.fullName, role: u.role, status: u.status,
        departmentId: u.departmentId, locale: u.locale,
      };
    },
  );
}
