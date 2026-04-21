import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { buildTestApp, type TestApp } from './helpers/buildApp';
import { resetFakePrisma, seed, dump } from './helpers/fakePrisma';
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

describe('POST /v1/orders — validation', () => {
  it('TC-ORD-I-002: missing customerId → 400 VALIDATION_FAILED', async () => {
    const u = await makeUser('PM');
    const res = await request(h.app.server)
      .post('/v1/orders')
      .set('Authorization', bearerFor(h.app, u))
      .send({
        orderNumber: 'ORD-001',
        type: 'NEW',
        productCategory: 'CONNECTIVITY',
        contractValue: 1000,
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'customerId' })]));
  });

  it('TC-ORD-I-003: contractValue < 0 → 400', async () => {
    const u = await makeUser('PM');
    const res = await request(h.app.server)
      .post('/v1/orders')
      .set('Authorization', bearerFor(h.app, u))
      .send({
        orderNumber: 'ORD-002',
        customerId: randomUUID(),
        type: 'NEW',
        productCategory: 'CONNECTIVITY',
        contractValue: -1,
      });
    expect(res.status).toBe(400);
  });

  it('happy path → 201 + serialised body + audit row written', async () => {
    const u = await makeUser('PM');
    const customerId = randomUUID();
    seed('customer', [{ id: customerId, name: 'Acme Telco', code: 'ACME' }]);

    const res = await request(h.app.server)
      .post('/v1/orders')
      .set('Authorization', bearerFor(h.app, u))
      .send({
        orderNumber: 'ord-100',
        customerId,
        type: 'NEW',
        productCategory: 'CONNECTIVITY',
        contractValue: 1500000000,
        otcAmount: 500000000,
        mrcAmount: 50000000,
      });
    expect(res.status).toBe(201);
    expect(res.body.orderNumber).toBe('ORD-100'); // upper-cased
    expect(dump('order')).toHaveLength(1);
    expect(dump('auditLog').some((r) => r.action === 'CREATE')).toBe(true);
  });

  it('businessRule: endDate < startDate → 422', async () => {
    const u = await makeUser('PM');
    const customerId = randomUUID();
    seed('customer', [{ id: customerId, name: 'Acme', code: 'A' }]);

    const res = await request(h.app.server)
      .post('/v1/orders')
      .set('Authorization', bearerFor(h.app, u))
      .send({
        orderNumber: 'ORD-101',
        customerId,
        type: 'NEW',
        productCategory: 'CONNECTIVITY',
        contractValue: 100,
        startDate: '2026-06-01',
        endDate: '2026-05-01',
      });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('BUSINESS_RULE');
  });
});
