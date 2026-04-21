// Milestone update — triggers recompute via BullMQ.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Milestone } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { requireAuth, requireRole } from '../../auth/auth.js';
import { Errors } from '../../lib/errors.js';
import { audit } from '../../audit/audit.js';
import { serialise } from '../../lib/serialise.js';
import { milestoneQueue, QUEUE_NAMES } from '../../queues/queues.js';
import dayjs from 'dayjs';

const EVIDENCE_REQUIRED_TYPES = new Set(['MATERIAL_READY', 'INSTALLATION', 'RFS', 'HANDOVER']);
const APPROVALS_REQUIRED_BY_TYPE: Record<string, Array<'ASSET' | 'PM' | 'PROJECT_CLOSING'>> = {
  MATERIAL_READY: ['ASSET', 'PM'],
  INSTALLATION: ['ASSET', 'PM'],
  RFS: ['ASSET', 'PM'],
  HANDOVER: ['PROJECT_CLOSING'],
};

const ApprovalSchema = z.object({
  stage: z.enum(['ASSET', 'PM', 'PROJECT_CLOSING']),
  decision: z.enum(['APPROVE', 'REJECT']),
  note: z.string().max(1000).optional(),
});

const EvidenceItemSchema = z.object({
  s3Key: z.string().min(1).max(500),
  sha256: z.string().min(8).max(128),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive().max(20_000_000),
  takenAt: z.coerce.date().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

const EvidenceSchema = z.object({
  items: z.array(EvidenceItemSchema).min(1).max(10),
});

const PatchSchema = z.object({
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'BLOCKED']).optional(),
  actualDate: z.coerce.date().nullable().optional(),
  remark: z.string().max(2000).nullable().optional(),
  blockedReason: z.string().max(500).nullable().optional(),
});

const ALLOWED: Record<string, Set<string>> = {
  NOT_STARTED: new Set(['IN_PROGRESS', 'BLOCKED']),
  IN_PROGRESS: new Set(['DONE', 'BLOCKED']),
  BLOCKED: new Set(['IN_PROGRESS']),
  DONE: new Set([]), // locked (admin reopen path TBD)
};

type WorkflowSummary = {
  evidenceCount: number;
  approvals: Record<string, { approved: boolean; approvedById: string | null; approvedAt: string | null; note: string | null }>;
};

function parseApprovalRemark(remark: string | null): { stage?: string; decision?: string; note?: string } {
  if (!remark) return {};
  try {
    const parsed = JSON.parse(remark) as { stage?: string; decision?: string; note?: string };
    return parsed;
  } catch {
    return {};
  }
}

async function getVendorScope(req: { user: { email: string } }): Promise<{ vendorId: string } | null> {
  const vendor = await prisma.vendor.findFirst({
    where: { picEmail: req.user.email, isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (!vendor) return null;
  return { vendorId: vendor.id };
}

async function assertMilestoneAccess(params: {
  milestoneId: string;
  userId: string;
  role: string;
  email: string;
}): Promise<Milestone> {
  const existing = await prisma.milestone.findFirst({ where: { id: params.milestoneId } });
  if (!existing) throw Errors.notFound('Milestone');

  const vendorScope = await getVendorScope({ user: { email: params.email } });

  if (params.role === 'FE' && !vendorScope) {
    if (!existing.siteId) throw Errors.forbidden('Site-level access only');
    const site = await prisma.site.findFirst({ where: { id: existing.siteId } });
    if (!site || site.assignedFieldUserId !== params.userId) {
      throw Errors.forbidden('Not assigned to this site');
    }
  }

  if (vendorScope) {
    const assignment = await prisma.vendorAssignment.findFirst({
      where: { sowId: existing.sowId, vendorId: vendorScope.vendorId, deletedAt: null },
      select: { id: true },
    });
    if (!assignment) {
      throw Errors.forbidden('Vendor can only access assigned SOW');
    }
  }

  return existing;
}

async function getWorkflowSummary(milestoneId: string): Promise<WorkflowSummary> {
  const [evidenceCount, approvalEvents] = await Promise.all([
    prisma.photo.count({ where: { milestoneId } }),
    prisma.milestoneEvent.findMany({
      where: { milestoneId, source: 'approval' },
      orderBy: { occurredAt: 'desc' },
      select: { remark: true, actorUserId: true, occurredAt: true },
    }),
  ]);

  const approvals: WorkflowSummary['approvals'] = {
    ASSET: { approved: false, approvedById: null, approvedAt: null, note: null },
    PM: { approved: false, approvedById: null, approvedAt: null, note: null },
    PROJECT_CLOSING: { approved: false, approvedById: null, approvedAt: null, note: null },
  };

  for (const ev of approvalEvents) {
    const parsed = parseApprovalRemark(ev.remark);
    const stage = parsed.stage as keyof typeof approvals | undefined;
    if (!stage || !approvals[stage]) continue;
    if (approvals[stage].approvedAt) continue;
    approvals[stage] = {
      approved: parsed.decision === 'APPROVE',
      approvedById: ev.actorUserId,
      approvedAt: ev.occurredAt.toISOString(),
      note: parsed.note ?? null,
    };
  }

  return { evidenceCount, approvals };
}

function assertApprovalRole(stage: 'ASSET' | 'PM' | 'PROJECT_CLOSING', role: string): void {
  if (stage === 'ASSET' && !['DH', 'AD'].includes(role)) {
    throw Errors.forbidden('ASSET approval requires DH/AD role');
  }
  if (stage === 'PM' && !['PM', 'AD'].includes(role)) {
    throw Errors.forbidden('PM approval requires PM/AD role');
  }
  if (stage === 'PROJECT_CLOSING' && !['FN', 'AD'].includes(role)) {
    throw Errors.forbidden('PROJECT_CLOSING approval requires FN/AD role');
  }
}

export async function milestonesRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/v1/milestones/:id/workflow',
    { preHandler: [requireAuth, requireRole('AD', 'PM', 'DH', 'FN', 'FE')] },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const milestone = await assertMilestoneAccess({
        milestoneId: id,
        userId: req.user!.id,
        role: req.user!.role,
        email: req.user!.email,
      });
      const workflow = await getWorkflowSummary(id);
      return serialise({ milestoneId: milestone.id, type: milestone.type, status: milestone.status, ...workflow });
    },
  );

  app.post(
    '/v1/milestones/:id/evidence',
    { preHandler: [requireAuth, requireRole('AD', 'PM', 'FE')] },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = EvidenceSchema.parse(req.body);

      const milestone = await assertMilestoneAccess({
        milestoneId: id,
        userId: req.user!.id,
        role: req.user!.role,
        email: req.user!.email,
      });

      const created = [];
      for (const item of body.items) {
        const row = await prisma.photo.create({
          data: {
            milestoneId: id,
            siteId: milestone.siteId,
            s3Key: item.s3Key,
            sha256: item.sha256,
            mimeType: item.mimeType,
            sizeBytes: item.sizeBytes,
            takenAt: item.takenAt ?? null,
            latitude: item.latitude !== undefined ? item.latitude.toString() as never : null,
            longitude: item.longitude !== undefined ? item.longitude.toString() as never : null,
            uploadedById: req.user!.id,
          },
        });
        created.push(row);
      }

      await prisma.milestoneEvent.create({
        data: {
          milestoneId: id,
          fromStatus: milestone.status,
          toStatus: milestone.status,
          actorUserId: req.user!.id,
          source: 'evidence',
          remark: JSON.stringify({ count: created.length }),
        },
      });

      return reply.code(201).send(serialise({ uploaded: created.length }));
    },
  );

  app.post(
    '/v1/milestones/:id/approvals',
    { preHandler: [requireAuth, requireRole('AD', 'PM', 'DH', 'FN')] },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = ApprovalSchema.parse(req.body);

      assertApprovalRole(body.stage, req.user!.role);
      const milestone = await assertMilestoneAccess({
        milestoneId: id,
        userId: req.user!.id,
        role: req.user!.role,
        email: req.user!.email,
      });

      await prisma.milestoneEvent.create({
        data: {
          milestoneId: id,
          fromStatus: milestone.status,
          toStatus: milestone.status,
          actorUserId: req.user!.id,
          source: 'approval',
          remark: JSON.stringify({ stage: body.stage, decision: body.decision, note: body.note ?? null }),
        },
      });

      const workflow = await getWorkflowSummary(id);
      return reply.code(201).send(serialise({ milestoneId: id, ...workflow }));
    },
  );

  app.patch(
    '/v1/milestones/:id',
    { preHandler: [requireAuth, requireRole('AD', 'PM', 'FE')] },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = PatchSchema.parse(req.body);

      const existing = await assertMilestoneAccess({
        milestoneId: id,
        userId: req.user!.id,
        role: req.user!.role,
        email: req.user!.email,
      });

      // State machine guards
      if (body.status && body.status !== existing.status) {
        const allowed = ALLOWED[existing.status];
        if (!allowed || !allowed.has(body.status)) {
          throw Errors.businessRule(`Transition ${existing.status} -> ${body.status} not allowed`);
        }
        if (body.status === 'DONE' && !body.actualDate) {
          throw Errors.businessRule('actualDate required when status=DONE');
        }
        if (body.status === 'DONE' && EVIDENCE_REQUIRED_TYPES.has(existing.type)) {
          const workflow = await getWorkflowSummary(id);
          if (workflow.evidenceCount < 1) {
            throw Errors.businessRule('Evidence photo is required before DONE');
          }
          const requiredApprovals = APPROVALS_REQUIRED_BY_TYPE[existing.type] ?? [];
          for (const stage of requiredApprovals) {
            if (!workflow.approvals[stage]?.approved) {
              throw Errors.businessRule(`Approval ${stage} is required before DONE`);
            }
          }
        }
        // backdate >30d guard
        if (body.actualDate && dayjs().diff(dayjs(body.actualDate), 'day') > 30) {
          throw Errors.businessRule('Backdate >30d requires DH approval (provide approval token; not implemented)');
        }
      }

      const before = { status: existing.status, actualDate: existing.actualDate, remark: existing.remark };

      const updated = await prisma.milestone.update({
        where: { id },
        data: {
          status: body.status ?? existing.status,
          actualDate: body.actualDate === undefined ? existing.actualDate : body.actualDate,
          remark: body.remark === undefined ? existing.remark : body.remark,
          blockedReason: body.blockedReason === undefined ? existing.blockedReason : body.blockedReason,
          lastEventAt: new Date(),
        },
      });

      await prisma.milestoneEvent.create({
        data: {
          milestoneId: id,
          fromStatus: existing.status,
          toStatus: updated.status,
          actualDate: updated.actualDate,
          remark: body.remark ?? null,
          actorUserId: req.user!.id,
          source: 'web',
        },
      });

      await audit({
        actorUserId: req.user!.id,
        action: 'UPDATE',
        entityType: 'Milestone',
        entityId: id,
        before, after: { status: updated.status, actualDate: updated.actualDate, remark: updated.remark },
        ip: req.ip ?? null,
      });

      // enqueue recompute (idempotent per sow)
      await milestoneQueue.add(
        QUEUE_NAMES.milestoneRecompute,
        { sowId: updated.sowId, reason: 'milestone-updated' },
        { jobId: `recompute:${updated.sowId}`, removeOnComplete: 100, removeOnFail: 100 },
      );

      return serialise(updated);
    },
  );
}
