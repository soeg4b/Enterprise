import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { buildTestApp, type TestApp } from './helpers/buildApp';
import { resetFakePrisma } from './helpers/fakePrisma';
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

// Sweep of protected endpoints — without a token they MUST all return 401.
const PROTECTED_ENDPOINTS = [
  ['get', '/v1/me'],
  ['get', '/v1/orders'],
  ['post', '/v1/orders'],
  ['get', '/v1/sites'],
  ['post', '/v1/sites'],
  ['post', '/v1/sync/pull'],
  ['post', '/v1/sync/push'],
  ['get', '/v1/reports/bod'],
] as const;

describe('RBAC — 401 sweep (TC-RBAC-I-401)', () => {
  for (const [method, path] of PROTECTED_ENDPOINTS) {
    it(`${method.toUpperCase()} ${path} without bearer → 401`, async () => {
      const res = await (request(h.app.server) as unknown as Record<string, (p: string) => request.Test>)[method](path).send({});
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    });
  }
});

describe('RBAC — 403 sweep (TC-RBAC-I-403)', () => {
  it('TC-RBAC-I-004: BOD attempting POST /v1/orders → 403', async () => {
    const u = await makeUser('BOD');
    const auth = bearerFor(h.app, u);
    const res = await request(h.app.server)
      .post('/v1/orders')
      .set('Authorization', auth)
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('TC-RBAC-I-007: PM attempting GET /v1/reports/bod → 403', async () => {
    const u = await makeUser('PM');
    const auth = bearerFor(h.app, u);
    const res = await request(h.app.server)
      .get('/v1/reports/bod')
      .set('Authorization', auth);
    expect(res.status).toBe(403);
  });

  it('TC-RBAC-I-008: FE attempting GET /v1/orders → 403', async () => {
    const u = await makeUser('FE');
    const auth = bearerFor(h.app, u);
    const res = await request(h.app.server)
      .get('/v1/orders')
      .set('Authorization', auth);
    expect(res.status).toBe(403);
  });
});
