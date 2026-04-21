import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { buildTestApp, type TestApp } from './helpers/buildApp';
import { resetFakePrisma, seed } from './helpers/fakePrisma';
import { resetFakeRedis } from './helpers/fakeInfra';
import { makeUser, bearerFor } from './helpers/fixtures';

let h: TestApp;

beforeEach(async () => {
  resetFakePrisma();
  resetFakeRedis();
  h = await buildTestApp();
  await h.app.listen({ port: 0 });
});

afterEach(async () => {
  await h.close();
});

describe('GET /v1/reports/bod — cache behaviour', () => {
  it('TC-BOD-I-001/002: cold call returns MISS, warm call returns HIT with identical body', async () => {
    const bod = await makeUser('BOD');
    seed('order', [
      { orderNumber: 'O-1', contractValue: '1000', otcAmount: '500', mrcAmount: '10', capexBudget: '0', departmentId: null },
      { orderNumber: 'O-2', contractValue: '2000', otcAmount: '0', mrcAmount: '0', capexBudget: '500', departmentId: null },
    ]);

    const r1 = await request(h.app.server)
      .get('/v1/reports/bod')
      .set('Authorization', bearerFor(h.app, bod));
    expect(r1.status).toBe(200);
    expect(r1.body.cacheStatus).toBe('MISS');
    expect(Number(r1.body.totalRevenue)).toBeCloseTo(3000);

    const r2 = await request(h.app.server)
      .get('/v1/reports/bod')
      .set('Authorization', bearerFor(h.app, bod));
    expect(r2.status).toBe(200);
    expect(r2.body.cacheStatus).toBe('HIT');
    // generatedAt is part of the cached value, so it must match exactly across HIT.
    expect(r2.body.generatedAt).toBe(r1.body.generatedAt);
  });

  it('TC-RBAC-I-007 (re-asserted): PM forbidden from /v1/reports/bod', async () => {
    const pm = await makeUser('PM');
    const res = await request(h.app.server)
      .get('/v1/reports/bod')
      .set('Authorization', bearerFor(h.app, pm));
    expect(res.status).toBe(403);
  });
});
