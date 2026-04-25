// Orders module: list + create + read.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { requireAuth, requireRole } from '../../auth/auth.js';
import { Errors } from '../../lib/errors.js';
import { audit } from '../../audit/audit.js';
import { serialise } from '../../lib/serialise.js';

const ListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  customerId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  q: z.string().max(200).optional(),
});

const CreateOrderSchema = z.object({
  orderNumber: z.string().min(1).max(64),
  customerId: z.string().uuid(),
  departmentId: z.string().uuid().nullable().optional(),
  programId: z.string().uuid().nullable().optional(),
  ownerUserId: z.string().uuid().nullable().optional(),
  type: z.enum(['NEW', 'UPGRADE', 'RENEWAL', 'RELOCATION', 'TERMINATION']),
  productCategory: z.enum(['CONNECTIVITY', 'DATACENTER', 'CLOUD', 'MANAGED_SERVICE', 'ICT_SOLUTION', 'OTHER']),
  description: z.string().max(2000).optional(),
  contractValue: z.coerce.number().nonnegative(),
  otcAmount: z.coerce.number().nonnegative().default(0),
  mrcAmount: z.coerce.number().nonnegative().default(0),
  capexBudget: z.coerce.number().nonnegative().default(0),
  startDate: z.coerce.date().nullable().optional(),
  endDate: z.coerce.date().nullable().optional(),
});

export async function ordersRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/v1/orders',
    { preHandler: [requireAuth, requireRole('AD', 'BOD', 'DH', 'PM', 'FN')] },
    async (req) => {
      const { page, pageSize, customerId, departmentId, q } = ListQuery.parse(req.query);
      const where: Record<string, unknown> = {};
      if (customerId) where.customerId = customerId;
      if (departmentId) where.departmentId = departmentId;
      if (q) where.orderNumber = { contains: q, mode: 'insensitive' as const };

      // PM scope: only own orders
      if (req.user!.role === 'PM') where.ownerUserId = req.user!.id;
      if (req.user!.role === 'DH' && req.user!.departmentId) where.departmentId = req.user!.departmentId;

      const [rows, total] = await Promise.all([
        prisma.order.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
          include: { customer: { select: { name: true, code: true } } },
        }),
        prisma.order.count({ where }),
      ]);

      return {
        data: serialise(rows.map((r) => ({
          ...r,
          customerName: r.customer?.name,
          customer: undefined,
        }))),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      };
    },
  );

  app.get(
    '/v1/orders/:id',
    { preHandler: [requireAuth, requireRole('AD', 'BOD', 'DH', 'PM', 'FN')] },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const order = await prisma.order.findFirst({
        where: { id },
        include: {
          customer: true,
          department: true,
          owner: { select: { id: true, fullName: true, email: true } },
          sos: {
            include: {
              sows: {
                select: {
                  id: true, sowNumber: true, scope: true, planRfsDate: true, actualRfsDate: true,
                  progressPct: true, gapDays: true, warningLevel: true,
                },
              },
            },
          },
        },
      });
      if (!order) throw Errors.notFound('Order');
      return serialise(order);
    },
  );

  app.post(
    '/v1/orders',
    { preHandler: [requireAuth, requireRole('AD', 'PM')] },
    async (req, reply) => {
      const body = CreateOrderSchema.parse(req.body);

      // Sanity: end >= start
      if (body.startDate && body.endDate && body.endDate < body.startDate) {
        throw Errors.businessRule('endDate must be >= startDate');
      }

      const created = await prisma.order.create({
        data: {
          orderNumber: body.orderNumber.toUpperCase(),
          customerId: body.customerId,
          departmentId: body.departmentId ?? null,
          programId: body.programId ?? null,
          ownerUserId: body.ownerUserId ?? req.user!.id,
          type: body.type,
          productCategory: body.productCategory,
          description: body.description ?? null,
          contractValue: body.contractValue.toString() as never,
          otcAmount: body.otcAmount.toString() as never,
          mrcAmount: body.mrcAmount.toString() as never,
          capexBudget: body.capexBudget.toString() as never,
          startDate: body.startDate ?? null,
          endDate: body.endDate ?? null,
          createdById: req.user!.id,
        },
      });

      await audit({
        actorUserId: req.user!.id,
        action: 'CREATE',
        entityType: 'Order',
        entityId: created.id,
        after: { orderNumber: created.orderNumber },
        ip: req.ip ?? null,
      });

      return reply.code(201).send(serialise(created));
    },
  );
}
