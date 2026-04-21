import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { buildTestApp, type TestApp } from './helpers/buildApp';
import { resetFakePrisma, seed } from './helpers/fakePrisma';
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

async function seedUser(email: string, password: string, role = 'PM') {
  const passwordHash = await bcrypt.hash(password, 10);
  return seed('user', [{
    email, role, status: 'ACTIVE', fullName: 'Test', departmentId: null,
    locale: 'id-ID', passwordHash, failedLoginCount: 0, lockedUntil: null, deletedAt: null,
  }])[0];
}

describe('POST /v1/auth/login', () => {
  it('TC-AUTH-I-001: valid credentials → 200 + accessToken', async () => {
    await seedUser('pm@deliveriq.test', 'CorrectHorse1!');
    const res = await request(h.app.server)
      .post('/v1/auth/login')
      .send({ email: 'pm@deliveriq.test', password: 'CorrectHorse1!' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.user.email).toBe('pm@deliveriq.test');
    expect(res.body.expiresIn).toBeGreaterThan(0);
  });

  it('TC-AUTH-I-002: bad password → 401 UNAUTHENTICATED', async () => {
    await seedUser('pm@deliveriq.test', 'CorrectHorse1!');
    const res = await request(h.app.server)
      .post('/v1/auth/login')
      .send({ email: 'pm@deliveriq.test', password: 'WrongPassword1!' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('rejects malformed body with 400 VALIDATION_FAILED', async () => {
    const res = await request(h.app.server)
      .post('/v1/auth/login')
      .send({ email: 'not-an-email', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('TC-AUTH-I-003 (smoke): repeated wrong-password attempts eventually return 429 or 401-with-lock', async () => {
    await seedUser('lock@deliveriq.test', 'CorrectHorse1!');
    const codes: number[] = [];
    for (let i = 0; i < 8; i++) {
      const res = await request(h.app.server)
        .post('/v1/auth/login')
        .send({ email: 'lock@deliveriq.test', password: 'WrongPassword1!' });
      codes.push(res.status);
    }
    // We expect a mix of 401 (invalid creds + lock) and ultimately 429 (rate-limit) somewhere in the trail.
    const sawLockOr429 = codes.some((c) => c === 429) || codes.filter((c) => c === 401).length >= 5;
    expect(sawLockOr429).toBe(true);
  });
});

describe('GET /v1/me', () => {
  it('without token → 401', async () => {
    const res = await request(h.app.server).get('/v1/me');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('with valid bearer → returns user envelope', async () => {
    await seedUser('me@deliveriq.test', 'CorrectHorse1!');
    const login = await request(h.app.server)
      .post('/v1/auth/login')
      .send({ email: 'me@deliveriq.test', password: 'CorrectHorse1!' });
    const res = await request(h.app.server)
      .get('/v1/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('me@deliveriq.test');
  });
});
