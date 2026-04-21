// Vitest setup: register module mocks shared by all integration tests.
// The vi.mock calls are hoisted by vitest so they apply BEFORE any import
// inside the test files (and inside helpers/buildApp.ts) resolves.

import { vi } from 'vitest';

// Required env vars for the backend `config/env.ts` zod loader. Must be set
// before any backend module is imported.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://test/test';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379/0';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-test-secret-test-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret-test-refresh-secret';
process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_TTL = '7d';
process.env.BCRYPT_COST = '10';
process.env.CORS_ORIGINS = 'http://localhost:3000';

vi.mock('../../src/backend/src/db/prisma', async () => {
  const { fakePrisma } = await import('./helpers/fakePrisma');
  return { prisma: fakePrisma };
});

// `@prisma/client` is not generated in the test environment (the production
// schema uses preview features unsupported by the installed CLI). Stub the
// `Prisma` namespace surface used by `serialise.ts` and `audit.ts`.
class FakeDecimal {
  v: string;
  constructor(v: string | number) { this.v = String(v); }
  toString(): string { return this.v; }
}
vi.mock('@prisma/client', () => ({
  Prisma: { Decimal: FakeDecimal },
  PrismaClient: class { $use(): void {} $on(): void {} async $disconnect(): Promise<void> {} },
}));

vi.mock('../../src/backend/src/db/redis', async () => {
  const { fakeRedis } = await import('./helpers/fakeInfra');
  return { getRedis: () => fakeRedis };
});

vi.mock('../../src/backend/src/queues/queues', async () => {
  const m = await import('./helpers/fakeInfra');
  return {
    QUEUE_NAMES: m.QUEUE_NAMES,
    milestoneQueue: m.fakeMilestoneQueue,
    importQueue: m.fakeImportQueue,
    notificationQueue: m.fakeNotificationQueue,
  };
});

// Disable in-process token-bucket rate limiter for integration tests.
// The buckets Map is module-level state that persists across the entire
// vitest worker, so without this stubbing tests in different files would
// collide on the IP-level bucket.
vi.mock('../../src/backend/src/middleware/rate-limit', () => ({
  tryConsume: () => true,
}));

// Workers are not registered by buildTestApp, but if a stray import path
// resolves them they should be no-op.
vi.mock('../../src/backend/src/workers/milestone.worker', () => ({
  startMilestoneWorker: () => ({ close: async () => {} }),
}));
vi.mock('../../src/backend/src/workers/import.worker', () => ({
  startImportWorker: () => ({ close: async () => {} }),
}));
