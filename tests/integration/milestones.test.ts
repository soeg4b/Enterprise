import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { buildTestApp, type TestApp } from './helpers/buildApp';
import { resetFakePrisma, seed, dump } from './helpers/fakePrisma';
import { resetFakeRedis, fakeMilestoneQueue, queueAddCalls } from './helpers/fakeInfra';
import { makeUser, bearerFor } from './helpers/fixtures';

let h: TestApp;

beforeEach(async () => {
  resetFakePrisma();
  resetFakeRedis();
  fakeMilestoneQueue.add.mockClear();
  h = await buildTestApp();
  await h.app.listen({ port: 0 });
});

afterEach(async () => {
  await h.close();
});

function seedSiteAndMilestone(opts: { fieldUserId?: string | null; status?: string } = {}) {
  const sowId = randomUUID();
  const siteId = randomUUID();
  const milestoneId = randomUUID();
  seed('sOW', [{ id: sowId, sowNumber: 'SOW-1', planRfsDate: new Date('2026-09-01'), actualRfsDate: null }]);
  seed('site', [{
    id: siteId, sowId, code: 'STE-1', name: 'Site', type: 'NE', owner: 'CUSTOMER',
    assignedFieldUserId: opts.fieldUserId ?? null,
  }]);
  seed('milestone', [{
    id: milestoneId, sowId, siteId, type: 'DESIGN', sequence: 3, weight: 10,
    status: opts.status ?? 'NOT_STARTED', planDate: new Date('2026-06-01'), actualDate: null,
    remark: null, blockedReason: null, lastEventAt: null,
  }]);
  return { sowId, siteId, milestoneId };
}

describe('PATCH /v1/milestones/:id', () => {
  it('TC-SITE-I-003: happy path NOT_STARTED → IN_PROGRESS, enqueues recompute job', async () => {
    const u = await makeUser('PM');
    const { milestoneId, sowId } = seedSiteAndMilestone();

    const res = await request(h.app.server)
      .patch(`/v1/milestones/${milestoneId}`)
      .set('Authorization', bearerFor(h.app, u))
      .send({ status: 'IN_PROGRESS' });

    expect(res.status).toBe(200);
    expect(fakeMilestoneQueue.add).toHaveBeenCalledTimes(1);
    expect(queueAddCalls[0]?.opts).toMatchObject({ jobId: `recompute:${sowId}` });
    expect(dump('milestoneEvent')).toHaveLength(1);
    expect(dump('auditLog').some((r) => r.action === 'UPDATE')).toBe(true);
  });

  it('TC-SITE-I-007: NOT_STARTED → DONE rejected (state machine) → 422', async () => {
    const u = await makeUser('PM');
    const { milestoneId } = seedSiteAndMilestone();

    const res = await request(h.app.server)
      .patch(`/v1/milestones/${milestoneId}`)
      .set('Authorization', bearerFor(h.app, u))
      .send({ status: 'DONE', actualDate: '2026-04-19' });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('BUSINESS_RULE');
    expect(fakeMilestoneQueue.add).not.toHaveBeenCalled();
  });

  it('TC-SITE-I-004: status=DONE without actualDate from IN_PROGRESS → 422', async () => {
    const u = await makeUser('PM');
    const { milestoneId } = seedSiteAndMilestone({ status: 'IN_PROGRESS' });

    const res = await request(h.app.server)
      .patch(`/v1/milestones/${milestoneId}`)
      .set('Authorization', bearerFor(h.app, u))
      .send({ status: 'DONE' });

    expect(res.status).toBe(422);
  });

  it('TC-RBAC-I-006: FE not assigned to site → 403', async () => {
    const fe = await makeUser('FE');
    const otherFe = await makeUser('FE');
    const { milestoneId } = seedSiteAndMilestone({ fieldUserId: otherFe.id });

    const res = await request(h.app.server)
      .patch(`/v1/milestones/${milestoneId}`)
      .set('Authorization', bearerFor(h.app, fe))
      .send({ status: 'IN_PROGRESS' });

    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown id', async () => {
    const u = await makeUser('PM');
    const res = await request(h.app.server)
      .patch(`/v1/milestones/${randomUUID()}`)
      .set('Authorization', bearerFor(h.app, u))
      .send({ status: 'IN_PROGRESS' });
    expect(res.status).toBe(404);
  });
});
