// Sites + minimal endpoints.
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
  sowId: z.string().uuid().optional(),
  q: z.string().max(200).optional(),
});

const CreateSiteSchema = z.object({
  sowId: z.string().uuid(),
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  type: z.enum(['NE', 'FE', 'POP']),
  owner: z.enum(['CUSTOMER', 'TELCO', 'THIRD_PARTY']).default('CUSTOMER'),
  address: z.string().max(500).optional(),
  city: z.string().max(120).optional(),
  province: z.string().max(120).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  assignedFieldUserId: z.string().uuid().nullable().optional(),
});

async function getVendorScopeByEmail(email: string): Promise<{ vendorId: string } | null> {
  const vendor = await prisma.vendor.findFirst({
    where: { picEmail: email, isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (!vendor) return null;
  return { vendorId: vendor.id };
}

async function assertVendorAssignedSow(email: string, sowId: string): Promise<void> {
  const vendorScope = await getVendorScopeByEmail(email);
  if (!vendorScope) return;
  const assignment = await prisma.vendorAssignment.findFirst({
    where: { sowId, vendorId: vendorScope.vendorId, deletedAt: null },
    select: { id: true },
  });
  if (!assignment) throw Errors.forbidden('Vendor can only access assigned SOW');
}

export async function sitesRoutes(app: FastifyInstance): Promise<void> {
  // SOW detail with sites + milestones — used by the SOW drill-down view.
  app.get(
    '/v1/sows/:id',
    { preHandler: [requireAuth, requireRole('AD', 'BOD', 'DH', 'PM', 'FE', 'FN')] },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const where: Record<string, unknown> = { id };
      const sow = await prisma.sOW.findFirst({
        where,
        include: {
          so: {
            select: {
              id: true,
              soNumber: true,
              order: {
                select: {
                  id: true,
                  orderNumber: true,
                  description: true,
                  productCategory: true,
                  customer: { select: { name: true } },
                },
              },
            },
          },
          owner: { select: { id: true, fullName: true, email: true } },
          vendorAssignments: {
            select: {
              id: true, spkNumber: true, poNumber: true, amount: true,
              vendor: { select: { name: true } },
            },
          },
          sites: {
            orderBy: { code: 'asc' },
            include: {
              assignedFieldUser: { select: { id: true, fullName: true, email: true } },
              milestones: { orderBy: { sequence: 'asc' } },
            },
          },
          milestones: {
            where: { siteId: null },
            orderBy: { sequence: 'asc' },
          },
        },
      });
      if (!sow) throw Errors.notFound('SOW');
      await assertVendorAssignedSow(req.user!.email, sow.id);
      const vendorScope = await getVendorScopeByEmail(req.user!.email);
      // FE role: only return sites assigned to them
      if (req.user!.role === 'FE' && !vendorScope) {
        sow.sites = sow.sites.filter((s) => s.assignedFieldUserId === req.user!.id);
      }
      return serialise(sow);
    },
  );

  app.get(
    '/v1/sites',
    { preHandler: [requireAuth, requireRole('AD', 'BOD', 'DH', 'PM', 'FE', 'FN')] },
    async (req) => {
      const { page, pageSize, sowId, q } = ListQuery.parse(req.query);
      const where: Record<string, unknown> = {};
      if (sowId) where.sowId = sowId;
      if (q) where.OR = [
        { code: { contains: q, mode: 'insensitive' as const } },
        { name: { contains: q, mode: 'insensitive' as const } },
      ];

      const vendorScope = await getVendorScopeByEmail(req.user!.email);
      if (req.user!.role === 'FE' && !vendorScope) where.assignedFieldUserId = req.user!.id;
      if (vendorScope) {
        const assignments = await prisma.vendorAssignment.findMany({
          where: { vendorId: vendorScope.vendorId, deletedAt: null },
          select: { sowId: true },
        });
        const scopedSowIds = assignments.map((a) => a.sowId);
        if (scopedSowIds.length === 0) {
          return {
            data: [],
            pagination: { page, pageSize, total: 0, totalPages: 0 },
          };
        }
        where.sowId = sowId ? { in: scopedSowIds.filter((x) => x === sowId) } : { in: scopedSowIds };
      }

      const [data, total] = await Promise.all([
        prisma.site.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { code: 'asc' },
        }),
        prisma.site.count({ where }),
      ]);
      return {
        data: serialise(data),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      };
    },
  );

  app.get(
    '/v1/sites/:id',
    { preHandler: [requireAuth, requireRole('AD', 'BOD', 'DH', 'PM', 'FE', 'FN')] },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const site = await prisma.site.findFirst({
        where: { id },
        include: {
          sow: { select: { id: true, sowNumber: true, planRfsDate: true } },
          milestones: { orderBy: { sequence: 'asc' } },
          assignedFieldUser: { select: { id: true, fullName: true, email: true } },
        },
      });
      if (!site) throw Errors.notFound('Site');
      const vendorScope = await getVendorScopeByEmail(req.user!.email);
      await assertVendorAssignedSow(req.user!.email, site.sowId);
      if (req.user!.role === 'FE' && !vendorScope && site.assignedFieldUserId !== req.user!.id) {
        throw Errors.forbidden('Not assigned to this site');
      }
      return serialise(site);
    },
  );

  app.post(
    '/v1/sites',
    { preHandler: [requireAuth, requireRole('AD', 'PM')] },
    async (req, reply) => {
      const body = CreateSiteSchema.parse(req.body);
      const sow = await prisma.sOW.findFirst({ where: { id: body.sowId } });
      if (!sow) throw Errors.notFound('SOW');

      const created = await prisma.site.create({
        data: {
          sowId: body.sowId,
          code: body.code.toUpperCase(),
          name: body.name,
          type: body.type,
          owner: body.owner,
          address: body.address ?? null,
          city: body.city ?? null,
          province: body.province ?? null,
          latitude: body.latitude !== undefined ? body.latitude.toString() as never : null,
          longitude: body.longitude !== undefined ? body.longitude.toString() as never : null,
          assignedFieldUserId: body.assignedFieldUserId ?? null,
        },
      });

      await audit({
        actorUserId: req.user!.id, action: 'CREATE', entityType: 'Site', entityId: created.id,
        after: { code: created.code }, ip: req.ip ?? null,
      });

      return reply.code(201).send(serialise(created));
    },
  );
}
