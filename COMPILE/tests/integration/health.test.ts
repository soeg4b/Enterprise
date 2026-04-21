import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { buildTestApp, type TestApp } from './helpers/buildApp';
import { resetFakePrisma } from './helpers/fakePrisma';
import { resetFakeRedis } from './helpers/fakeInfra';

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

describe('GET /healthz (TC-NF-I-001)', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(h.app.server).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.time).toBe('string');
  });
});
