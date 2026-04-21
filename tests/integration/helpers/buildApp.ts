// Test app builder. Registers selected route modules on a fresh Fastify instance.
// Test files MUST set up `vi.mock()` for db/prisma, db/redis, queues, audit BEFORE
// importing this module so that the route modules pick up the fakes.

import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { randomUUID } from 'node:crypto';

// Required env vars for env loader.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://test/test';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379/0';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-test-secret-test-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret-test-refresh-secret';
process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_TTL = '7d';
process.env.BCRYPT_COST = '10';
process.env.CORS_ORIGINS = 'http://localhost:3000';

import { HttpError } from '../../../src/backend/src/lib/errors';
import { registerAuth } from '../../../src/backend/src/auth/auth';
import { authRoutes } from '../../../src/backend/src/modules/auth/auth.routes';
import { ordersRoutes } from '../../../src/backend/src/modules/orders/orders.routes';
import { milestonesRoutes } from '../../../src/backend/src/modules/milestones/milestones.routes';
import { syncRoutes } from '../../../src/backend/src/modules/sync/sync.routes';
import { sitesRoutes } from '../../../src/backend/src/modules/sites/sites.routes';
import { reportsRoutes } from '../../../src/backend/src/modules/reports/reports.routes';

export interface TestApp {
  app: FastifyInstance;
  close: () => Promise<void>;
}

export async function buildTestApp(): Promise<TestApp> {
  const app = Fastify({
    logger: false,
    genReqId: () => randomUUID(),
  });

  app.setErrorHandler((err, req, reply) => {
    const requestId = req.id;
    if (err instanceof ZodError) {
      reply.code(400).send({
        type: 'about:blank', title: 'ValidationError', status: 400, code: 'VALIDATION_FAILED',
        detail: 'Request validation failed',
        errors: err.errors.map((e) => ({ path: e.path.join('.'), msg: e.message })),
        requestId,
      });
      return;
    }
    if (err instanceof HttpError) {
      reply.code(err.status).send({
        type: 'about:blank', title: err.message, status: err.status, code: err.code,
        detail: err.detail, errors: err.errors, requestId,
      });
      return;
    }
    reply.code(500).send({
      type: 'about:blank', title: 'InternalError', status: 500, code: 'INTERNAL',
      detail: err instanceof Error ? err.message : 'Unexpected', requestId,
    });
  });

  app.get('/healthz', async () => ({ status: 'ok', time: new Date().toISOString() }));

  await registerAuth(app);
  await app.register(authRoutes);
  await app.register(ordersRoutes);
  await app.register(milestonesRoutes);
  await app.register(syncRoutes);
  await app.register(sitesRoutes);
  await app.register(reportsRoutes);

  await app.ready();
  return {
    app,
    close: async () => { await app.close(); },
  };
}
