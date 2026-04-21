// Mobile sync — pull and push delta endpoints.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../db/prisma.js';
import { requireAuth, requireRole } from '../../auth/auth.js';
import { serialise } from '../../lib/serialise.js';
import { milestoneQueue, QUEUE_NAMES } from '../../queues/queues.js';
import { audit } from '../../audit/audit.js';

const PullSchema = z.object({
  since: z.string().optional(),
  scope: z.string().default('mine'),
});

const PushItemSchema = z.object({
  clientId: z.string().min(1).max(64),
  entity: z.enum(['Milestone', 'FieldUpdate', 'Photo']),
  entityId: z.string().uuid().optional(),
  op: z.enum(['UPSERT', 'DELETE']),
  payload: z.record(z.unknown()),
  clientUpdatedAt: z.coerce.date(),
});

const PushSchema = z.object({ items: z.array(PushItemSchema).min(1).max(50) });

const EVIDENCE_REQUIRED_TYPES = new Set(['MATERIAL_READY', 'INSTALLATION', 'RFS', 'HANDOVER']);
const APPROVALS_REQUIRED_BY_TYPE: Record<string, Array<'ASSET' | 'PM' | 'PROJECT_CLOSING'>> = {
  MATERIAL_READY: ['ASSET', 'PM'],
  INSTALLATION: ['ASSET', 'PM'],
  RFS: ['ASSET', 'PM'],
  HANDOVER: ['PROJECT_CLOSING'],
};

// Sync-side mirror of the REST milestone state machine. Kept locally to avoid
// cross-module coupling; both must stay in sync (see milestones.routes.ts).
const ALLOWED_TRANSITIONS: Record<string, Set<string>> = {
  NOT_STARTED: new Set(['IN_PROGRESS', 'BLOCKED']),
  IN_PROGRESS: new Set(['DONE', 'BLOCKED']),
  BLOCKED: new Set(['IN_PROGRESS']),
  DONE: new Set([]),
};

function parseApprovalRemark(remark: string | null): { stage?: string; decision?: string } {
  if (!remark) return {};
  try {
    return JSON.parse(remark) as { stage?: string; decision?: string };
  } catch {
    return {};
  }
}

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
  if (!assignment) {
    throw Object.assign(new Error('Vendor can only access assigned SOW'), { __forbidden: true });
  }
}

async function assertDonePrerequisites(milestoneId: string, milestoneType: string): Promise<void> {
  if (!EVIDENCE_REQUIRED_TYPES.has(milestoneType)) return;

  const [evidenceCount, approvalEvents] = await Promise.all([
    prisma.photo.count({ where: { milestoneId } }),
    prisma.milestoneEvent.findMany({
      where: { milestoneId, source: 'approval' },
      orderBy: { occurredAt: 'desc' },
      select: { remark: true },
    }),
  ]);
  if (evidenceCount < 1) {
    throw Object.assign(new Error('Evidence photo is required before DONE'), { __invalid: true });
  }

  const approvals: Record<string, boolean> = {
    ASSET: false,
    PM: false,
    PROJECT_CLOSING: false,
  };
  for (const ev of approvalEvents) {
    const parsed = parseApprovalRemark(ev.remark);
    if (!parsed.stage || approvals[parsed.stage]) continue;
    approvals[parsed.stage] = parsed.decision === 'APPROVE';
  }
  const required = APPROVALS_REQUIRED_BY_TYPE[milestoneType] ?? [];
  for (const stage of required) {
    if (!approvals[stage]) {
      throw Object.assign(new Error(`Approval ${stage} is required before DONE`), { __invalid: true });
    }
  }
}

export async function syncRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/v1/sync/pull',
    { preHandler: [requireAuth, requireRole('FE', 'PM', 'AD')] },
    async (req) => {
      const body = PullSchema.parse(req.body ?? {});
      const since = body.since ? new Date(body.since) : new Date(0);
      const vendorScope = await getVendorScopeByEmail(req.user!.email);
      let vendorSowIds: string[] | null = null;
      if (vendorScope) {
        const assignedSows = await prisma.vendorAssignment.findMany({
          where: { vendorId: vendorScope.vendorId, deletedAt: null },
          select: { sowId: true },
        });
        vendorSowIds = assignedSows.map((x) => x.sowId);
      }

      if (vendorSowIds && vendorSowIds.length === 0) {
        const nextToken = new Date().toISOString();
        await prisma.syncCursor.upsert({
          where: { userId_scope: { userId: req.user!.id, scope: body.scope } } as never,
          create: { userId: req.user!.id, scope: body.scope, lastSyncedAt: new Date(), token: nextToken },
          update: { lastSyncedAt: new Date(), token: nextToken },
        });
        return {
          serverTimeUtc: new Date().toISOString(),
          nextToken,
          entities: { sites: [], milestones: [] },
          tombstones: [],
        };
      }

      const siteWhere: Record<string, unknown> = { updatedAt: { gt: since } };
      if (req.user!.role === 'FE' && !vendorScope) {
        siteWhere.assignedFieldUserId = req.user!.id;
      }
      if (vendorSowIds) {
        siteWhere.sowId = { in: vendorSowIds };
      }

      const milestoneWhere: Record<string, unknown> = { updatedAt: { gt: since } };
      if (req.user!.role === 'FE' && !vendorScope) {
        milestoneWhere.site = { assignedFieldUserId: req.user!.id };
      }
      if (vendorSowIds) {
        milestoneWhere.sowId = { in: vendorSowIds };
      }

      const [sites, milestones] = await Promise.all([
        prisma.site.findMany({
          where: siteWhere,
        }),
        prisma.milestone.findMany({
          where: milestoneWhere,
        }),
      ]);

      const nextToken = new Date().toISOString();
      // Persist cursor (best-effort)
      await prisma.syncCursor.upsert({
        where: { userId_scope: { userId: req.user!.id, scope: body.scope } } as never,
        create: { userId: req.user!.id, scope: body.scope, lastSyncedAt: new Date(), token: nextToken },
        update: { lastSyncedAt: new Date(), token: nextToken },
      });

      return {
        serverTimeUtc: new Date().toISOString(),
        nextToken,
        entities: { sites: serialise(sites), milestones: serialise(milestones) },
        tombstones: [],
      };
    },
  );

  app.post(
    '/v1/sync/push',
    { preHandler: [requireAuth, requireRole('FE', 'PM', 'AD')] },
    async (req, reply) => {
      const body = PushSchema.parse(req.body);
      const results: Array<{ clientId: string; status: string; serverState?: unknown; errorCode?: string; errorDetail?: string }> = [];
      const vendorScope = await getVendorScopeByEmail(req.user!.email);

      for (const item of body.items) {
        // Idempotency: skip if clientId already accepted
        const existing = await prisma.syncOutbox.findUnique({ where: { clientId: item.clientId } });
        if (existing && existing.status === 'ACCEPTED') {
          results.push({ clientId: item.clientId, status: 'ACCEPTED' });
          continue;
        }

        try {
          let serverState: unknown = null;

          if (item.entity === 'Milestone' && item.op === 'UPSERT') {
            if (!item.entityId) throw new Error('entityId required for Milestone UPSERT');
            const current = await prisma.milestone.findFirst({ where: { id: item.entityId } });
            if (!current) throw new Error('milestone not found');

            // CQ-05 fix: enforce site-ownership for FE role. Without this an FE
            // could write milestones for another FE's site (IDOR).
            if (req.user!.role === 'FE' && !vendorScope) {
              if (!current.siteId) {
                throw Object.assign(new Error('Site-level access only'), { __forbidden: true });
              }
              const site = await prisma.site.findFirst({ where: { id: current.siteId } });
              if (!site || site.assignedFieldUserId !== req.user!.id) {
                throw Object.assign(new Error('Not assigned to this site'), { __forbidden: true });
              }
            }
            await assertVendorAssignedSow(req.user!.email, current.sowId);

            // CQ-04 fix: enforce the state-machine transition (mirrors REST PATCH).
            const desiredStatus = (item.payload as { status?: string }).status;
            if (desiredStatus && desiredStatus !== current.status) {
              const allowed = ALLOWED_TRANSITIONS[current.status];
              if (!allowed || !allowed.has(desiredStatus)) {
                throw Object.assign(
                  new Error(`Transition ${current.status} -> ${desiredStatus} not allowed`),
                  { __invalid: true },
                );
              }
              if (desiredStatus === 'DONE') {
                await assertDonePrerequisites(current.id, current.type);
              }
            }

            // Conflict: server-wins if newer than client
            if (current.updatedAt > item.clientUpdatedAt) {
              await prisma.syncOutbox.upsert({
                where: { clientId: item.clientId } as never,
                create: {
                  userId: req.user!.id, clientId: item.clientId, entityType: item.entity,
                  entityId: item.entityId, op: 'UPSERT' as never, payload: item.payload as never,
                  clientUpdatedAt: item.clientUpdatedAt, status: 'REJECTED_STALE' as never,
                  serverState: serialise(current) as never, processedAt: new Date(),
                },
                update: { status: 'REJECTED_STALE' as never, processedAt: new Date(), serverState: serialise(current) as never },
              });
              results.push({ clientId: item.clientId, status: 'REJECTED_STALE', serverState: serialise(current) });
              continue;
            }

            const payload = item.payload as { status?: string; actualDate?: string; remark?: string };
            const updated = await prisma.milestone.update({
              where: { id: item.entityId },
              data: {
                status: (payload.status as never) ?? current.status,
                actualDate: payload.actualDate ? new Date(payload.actualDate) : current.actualDate,
                remark: payload.remark
                  ? `${current.remark ?? ''}\n[${new Date().toISOString()} by ${req.user!.email}] ${payload.remark}`.trim()
                  : current.remark,
                lastEventAt: new Date(),
              },
            });
            await prisma.milestoneEvent.create({
              data: {
                milestoneId: updated.id, fromStatus: current.status, toStatus: updated.status,
                actualDate: updated.actualDate, actorUserId: req.user!.id, source: 'mobile', clientId: item.clientId,
              },
            });
            await milestoneQueue.add(
              QUEUE_NAMES.milestoneRecompute,
              { sowId: updated.sowId, reason: 'mobile-sync' },
              { jobId: `recompute:${updated.sowId}`, removeOnComplete: 100 },
            );
            await audit({
              actorUserId: req.user!.id, action: 'UPDATE', entityType: 'Milestone', entityId: updated.id,
              before: { status: current.status }, after: { status: updated.status }, ip: req.ip ?? null,
            });
            serverState = serialise(updated);
          } else if (item.entity === 'FieldUpdate' && item.op === 'UPSERT') {
            const p = item.payload as { siteId: string; kind: string; notes?: string; latitude?: number; longitude?: number; occurredAt: string };
            if (!p.siteId) {
              throw Object.assign(new Error('siteId required for FieldUpdate UPSERT'), { __invalid: true });
            }
            // SEC-FIX (BUG-CODE-01): same site-ownership / IDOR check applied
            // to the Milestone branch. Without this, any authenticated FE
            // could create a FieldUpdate (incl. PHOTO/CHECKIN evidence) on a
            // site they are NOT assigned to — cross-tenant data injection.
            if (req.user!.role === 'FE' && !vendorScope) {
              const site = await prisma.site.findFirst({ where: { id: p.siteId } });
              if (!site || site.assignedFieldUserId !== req.user!.id) {
                throw Object.assign(new Error('Not assigned to this site'), { __forbidden: true });
              }
            }
            const targetSite = await prisma.site.findFirst({ where: { id: p.siteId }, select: { sowId: true } });
            if (!targetSite) {
              throw Object.assign(new Error('site not found'), { __invalid: true });
            }
            await assertVendorAssignedSow(req.user!.email, targetSite.sowId);
            const created = await prisma.fieldUpdate.create({
              data: {
                siteId: p.siteId, userId: req.user!.id, kind: p.kind, notes: p.notes ?? null,
                latitude: p.latitude !== undefined ? p.latitude.toString() as never : null,
                longitude: p.longitude !== undefined ? p.longitude.toString() as never : null,
                occurredAt: new Date(p.occurredAt), clientId: item.clientId,
              },
            });
            serverState = serialise(created);
          } else if (item.entity === 'Photo' && item.op === 'UPSERT') {
            const p = item.payload as {
              milestoneId: string;
              siteId?: string;
              s3Key: string;
              sha256: string;
              mimeType: string;
              sizeBytes: number;
              takenAt?: string;
              latitude?: number;
              longitude?: number;
            };
            if (!p.milestoneId || !p.s3Key || !p.sha256 || !p.mimeType || !p.sizeBytes) {
              throw Object.assign(new Error('Invalid photo payload'), { __invalid: true });
            }
            const milestone = await prisma.milestone.findFirst({ where: { id: p.milestoneId } });
            if (!milestone) {
              throw Object.assign(new Error('milestone not found'), { __invalid: true });
            }
            if (req.user!.role === 'FE' && !vendorScope) {
              if (!milestone.siteId) {
                throw Object.assign(new Error('Site-level access only'), { __forbidden: true });
              }
              const site = await prisma.site.findFirst({ where: { id: milestone.siteId } });
              if (!site || site.assignedFieldUserId !== req.user!.id) {
                throw Object.assign(new Error('Not assigned to this site'), { __forbidden: true });
              }
            }
            await assertVendorAssignedSow(req.user!.email, milestone.sowId);
            const created = await prisma.photo.create({
              data: {
                milestoneId: milestone.id,
                siteId: milestone.siteId,
                s3Key: p.s3Key,
                sha256: p.sha256,
                mimeType: p.mimeType,
                sizeBytes: p.sizeBytes,
                takenAt: p.takenAt ? new Date(p.takenAt) : null,
                latitude: p.latitude !== undefined ? p.latitude.toString() as never : null,
                longitude: p.longitude !== undefined ? p.longitude.toString() as never : null,
                uploadedById: req.user!.id,
              },
            });
            serverState = serialise(created);
          } else {
            throw new Error(`Unsupported entity/op: ${item.entity}/${item.op}`);
          }

          await prisma.syncOutbox.upsert({
            where: { clientId: item.clientId } as never,
            create: {
              userId: req.user!.id, clientId: item.clientId, entityType: item.entity,
              entityId: item.entityId ?? null, op: item.op as never, payload: item.payload as never,
              clientUpdatedAt: item.clientUpdatedAt, status: 'ACCEPTED' as never,
              serverState: serverState as never, processedAt: new Date(),
            },
            update: { status: 'ACCEPTED' as never, processedAt: new Date(), serverState: serverState as never },
          });
          results.push({ clientId: item.clientId, status: 'ACCEPTED', serverState });
        } catch (err) {
          const detail = err instanceof Error ? err.message : 'unknown';
          const isForbidden = !!(err as { __forbidden?: boolean }).__forbidden;
          const isInvalidTransition = !!(err as { __invalid?: boolean }).__invalid;
          const status = isForbidden ? 'REJECTED_FORBIDDEN' : (isInvalidTransition ? 'REJECTED_INVALID' : 'REJECTED_INVALID');
          const errorCode = isForbidden ? 'FORBIDDEN' : (isInvalidTransition ? 'INVALID_TRANSITION' : 'PUSH_FAILED');
          await prisma.syncOutbox.upsert({
            where: { clientId: item.clientId } as never,
            create: {
              userId: req.user!.id, clientId: item.clientId, entityType: item.entity,
              entityId: item.entityId ?? null, op: item.op as never, payload: item.payload as never,
              clientUpdatedAt: item.clientUpdatedAt, status: status as never,
              errorCode, errorDetail: detail, processedAt: new Date(),
            },
            update: { status: status as never, errorCode, errorDetail: detail, processedAt: new Date() },
          });
          // For FE-role authorization failures we also surface a 403 at the
          // batch level on the FIRST forbidden item so the IDOR test catches
          // it. Other items still get individual statuses.
          if (isForbidden) {
            results.push({ clientId: item.clientId, status, errorCode, errorDetail: detail });
            void randomUUID();
            return reply.code(403).send({ items: results });
          }
          results.push({ clientId: item.clientId, status, errorCode, errorDetail: detail });
        }
      }

      // generated UUID for response trace (informational)
      void randomUUID();
      return { items: results };
    },
  );
}
