import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { buildTestApp, type TestApp } from './helpers/buildApp';
import { resetFakePrisma, seed } from './helpers/fakePrisma';
import { resetFakeRedis, fakeMilestoneQueue } from './helpers/fakeInfra';
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

function seedScene(victimFeId: string) {
  const sowId = randomUUID();
  const siteId = randomUUID();
  const milestoneId = randomUUID();
  seed('sOW', [{ id: sowId, sowNumber: 'SOW-A', planRfsDate: new Date('2026-12-01'), actualRfsDate: null }]);
  seed('site', [{
    id: siteId, sowId, code: 'STE-A', name: 'Victim Site', type: 'NE', owner: 'CUSTOMER',
    assignedFieldUserId: victimFeId,
  }]);
  seed('milestone', [{
    id: milestoneId, sowId, siteId, type: 'DESIGN', sequence: 3, weight: 10,
    status: 'NOT_STARTED', planDate: new Date('2026-06-01'), actualDate: null,
    remark: null, blockedReason: null, lastEventAt: null,
    updatedAt: new Date(Date.now() - 60_000),
  }]);
  return { sowId, siteId, milestoneId };
}

describe('POST /v1/sync/push', () => {
  it('TC-SYN-I-007: IDOR — attacker FE pushes update for milestone of another FE\'s site → MUST be 403', async () => {
    const victim = await makeUser('FE');
    const attacker = await makeUser('FE');
    const { milestoneId } = seedScene(victim.id);

    const res = await request(h.app.server)
      .post('/v1/sync/push')
      .set('Authorization', bearerFor(h.app, attacker))
      .send({
        items: [{
          clientId: 'cid-1',
          entity: 'Milestone',
          entityId: milestoneId,
          op: 'UPSERT',
          payload: { status: 'IN_PROGRESS' },
          clientUpdatedAt: new Date().toISOString(),
        }],
      });

    // NOTE: Per the QA plan (CQ-05) the production sync handler does NOT check
    // assigned-site ownership and currently accepts the write. This assertion
    // captures the regression and SHOULD FAIL until the bug is fixed.
    // Tester logs DEFECT BUG-SEC-01 (IDOR) when this fails.
    expect(res.status).toBe(403);
  });

  it('TC-SYN-I-009: batch > 50 items → 400 VALIDATION_FAILED', async () => {
    const u = await makeUser('FE');
    const items = Array.from({ length: 51 }, (_, i) => ({
      clientId: `cid-${i}`,
      entity: 'Milestone' as const,
      entityId: randomUUID(),
      op: 'UPSERT' as const,
      payload: {},
      clientUpdatedAt: new Date().toISOString(),
    }));
    const res = await request(h.app.server)
      .post('/v1/sync/push')
      .set('Authorization', bearerFor(h.app, u))
      .send({ items });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('TC-SYN-I-005: idempotency — replay of same clientId returns ACCEPTED without re-applying', async () => {
    const fe = await makeUser('FE');
    const { milestoneId } = seedScene(fe.id);

    const item = {
      clientId: 'cid-once',
      entity: 'Milestone' as const,
      entityId: milestoneId,
      op: 'UPSERT' as const,
      payload: { status: 'IN_PROGRESS' },
      clientUpdatedAt: new Date().toISOString(),
    };

    const r1 = await request(h.app.server)
      .post('/v1/sync/push')
      .set('Authorization', bearerFor(h.app, fe))
      .send({ items: [item] });
    expect(r1.status).toBe(200);
    expect(r1.body.items[0].status).toBe('ACCEPTED');

    fakeMilestoneQueue.add.mockClear();

    const r2 = await request(h.app.server)
      .post('/v1/sync/push')
      .set('Authorization', bearerFor(h.app, fe))
      .send({ items: [item] });
    expect(r2.status).toBe(200);
    expect(r2.body.items[0].status).toBe('ACCEPTED');
    // Replay must not enqueue a second recompute.
    expect(fakeMilestoneQueue.add).not.toHaveBeenCalled();
  });

  it('TC-SYN-I-008: state-machine bypass via sync — NOT_STARTED → DONE should be REJECTED_INVALID', async () => {
    const fe = await makeUser('FE');
    const { milestoneId } = seedScene(fe.id);

    const res = await request(h.app.server)
      .post('/v1/sync/push')
      .set('Authorization', bearerFor(h.app, fe))
      .send({
        items: [{
          clientId: 'cid-bypass',
          entity: 'Milestone',
          entityId: milestoneId,
          op: 'UPSERT',
          payload: { status: 'DONE', actualDate: '2026-04-19' },
          clientUpdatedAt: new Date().toISOString(),
        }],
      });
    expect(res.status).toBe(200);
    // Per CQ-04, the sync handler currently skips the state-machine check used by REST.
    // When fixed, the item status should be REJECTED_INVALID. Captured here as a
    // regression test that is expected to FAIL until validateTransition() is shared.
    expect(res.body.items[0].status).toBe('REJECTED_INVALID');
  });
});
