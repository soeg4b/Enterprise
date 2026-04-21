// Pull/push sync against /v1/sync endpoints. Conflict policy implemented server-side.
import { api } from './api';
import { getCursor, markSent, pendingOutbox, setCursor } from './db';

export interface PullResult { count: number; cursor: string | null; }

export async function pullDelta(): Promise<PullResult> {
  const since = await getCursor();
  const res = await api<{
    since?: string | null;
    sites?: unknown[];
    milestones?: unknown[];
    nextCursor?: string | null;
    entities?: { sites?: unknown[]; milestones?: unknown[] };
    nextToken?: string | null;
  }>(
    '/v1/sync/pull',
    { method: 'POST', body: JSON.stringify({ since }) },
  );
  const nextCursor = res.nextToken ?? res.nextCursor ?? null;
  const sites = res.entities?.sites ?? res.sites ?? [];
  const milestones = res.entities?.milestones ?? res.milestones ?? [];
  if (nextCursor) await setCursor(nextCursor);
  return { count: (sites.length ?? 0) + (milestones.length ?? 0), cursor: nextCursor };
}

export interface PushResult { sent: number; rejected: number; }

export async function pushOutbox(): Promise<PushResult> {
  const items = await pendingOutbox();
  if (items.length === 0) return { sent: 0, rejected: 0 };
  const payload = items.map((i) => {
    const raw = (i.payload ?? {}) as Record<string, unknown>;
    const op = (i.op || 'UPSERT').toUpperCase();
    const entityId = i.entity === 'Milestone' && typeof raw.milestoneId === 'string'
      ? raw.milestoneId
      : undefined;
    const nextPayload = { ...raw };
    if ('milestoneId' in nextPayload) delete nextPayload.milestoneId;
    return {
      clientId: i.clientId,
      entity: i.entity,
      entityId,
      op,
      clientUpdatedAt: i.createdAt,
      payload: nextPayload,
    };
  });
  const res = await api<{ items: Array<{ clientId: string; status: string; error?: string }> }>(
    '/v1/sync/push',
    { method: 'POST', body: JSON.stringify({ items: payload }) },
  );
  let rejected = 0;
  for (const r of res.items) {
    await markSent(r.clientId, r);
    if (r.status !== 'ACCEPTED') rejected++;
  }
  return { sent: res.items.length - rejected, rejected };
}
