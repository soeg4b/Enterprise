// =============================================================================
// DeliverIQ — Fastify API server bootstrap (Production Ready)
// =============================================================================

import Fastify, { type FastifyInstance, type FastifyBaseLogger } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { randomUUID } from 'node:crypto';

import './types/fastify.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './db/prisma.js';
import { getRedis } from './db/redis.js';
import { HttpError } from './lib/errors.js';
import { registerAuth } from './auth/auth.js';
import { ensureBootstrapAdmin } from './bootstrap/admin.js';

import { authRoutes } from './modules/auth/auth.routes.js';
import { usersRoutes } from './modules/users/users.routes.js';
import { ordersRoutes } from './modules/orders/orders.routes.js';
import { sitesRoutes } from './modules/sites/sites.routes.js';
import { milestonesRoutes } from './modules/milestones/milestones.routes.js';
import { importsRoutes } from './modules/imports/imports.routes.js';
import { reportsRoutes } from './modules/reports/reports.routes.js';
import { syncRoutes } from './modules/sync/sync.routes.js';
import { notificationsRoutes, auditRoutes } from './modules/notifications/notifications.routes.js';
import { stubRoutes } from './modules/stubs.js';
import { fiberProjectsRoutes } from './modules/fiber-projects/fiber-projects.routes.js';
import { pmoAiRoutes } from './modules/pmo-ai/pmo-ai.routes.js';

// Workers setup
let startMilestoneWorker: (() => { close(): Promise<void> }) | null = null;
let startImportWorker: (() => { close(): Promise<void> }) | null = null;

try {
  const mw = await import('./workers/milestone.worker.js');
  const iw = await import('./workers/import.worker.js');
  startMilestoneWorker = mw.startMilestoneWorker;
  startImportWorker = iw.startImportWorker;
} catch {
  // Workers unavailable
}

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: logger as unknown as FastifyBaseLogger,
    trustProxy: true,
    bodyLimit: 5 * 1024 * 1024,
    genReqId: () => randomUUID(),
  });

  // Security headers
  app.addHook('onSend', async (req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    if (req.protocol === 'https') {
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    reply.header('X-Request-Id', req.id);
  });

  // CORS config
  const origins = env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || origins.includes(origin) || origins.includes('*')) return cb(null, true);
      cb(new Error('CORS: origin not allowed'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 1 } });
  await registerAuth(app);

  // Global Error Handler
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
    req.log.error({ err }, 'unhandled.error');
    reply.code(500).send({
      type: 'about:blank', title: 'InternalError', status: 500, code: 'INTERNAL',
      detail: 'Unexpected server error', requestId,
    });
  });

  // Health Checks
  app.get('/healthz', async () => ({ status: 'ok', time: new Date().toISOString() }));
  app.get('/readyz', async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      const ping = await getRedis().ping();
      return { status: 'ready', db: 'ok', redis: ping === 'PONG' ? 'ok' : 'fail' };
    } catch (err) {
      app.log.warn({ err }, 'readyz.check.failed');
      return { status: 'not-ready' };
    }
  });

  // Module Registration
  await app.register(authRoutes);
  await app.register(usersRoutes);
  await app.register(ordersRoutes);
  await app.register(sitesRoutes);
  await app.register(milestonesRoutes);
  await app.register(importsRoutes);
  await app.register(reportsRoutes);
  await app.register(syncRoutes);
  await app.register(notificationsRoutes);
  await app.register(auditRoutes);
  await app.register(stubRoutes);
  await app.register(fiberProjectsRoutes);
  await app.register(pmoAiRoutes);

  return app;
}

async function redisVersionMajor(): Promise<number> {
  try {
    const info = await getRedis().info('server');
    const match = info.match(/redis_version:(\d+)/);
    return match ? parseInt(match[1]!, 10) : 0;
  } catch {
    return 0;
  }
}

async function main(): Promise<void> {
  const app = await buildServer();
  await ensureBootstrapAdmin();

  const redisMajor = await redisVersionMajor();
  const milestoneWorker = (redisMajor >= 5 && startMilestoneWorker) ? (startMilestoneWorker as any)() : null;
  const importWorker = (redisMajor >= 5 && startImportWorker) ? (startImportWorker as any)() : null;

  const close = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    await Promise.allSettled([milestoneWorker?.close(), importWorker?.close()].filter(Boolean));
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  
  process.on('SIGINT', () => void close('SIGINT'));
  process.on('SIGTERM', () => void close('SIGTERM'));

  // --- MODIFIKASI KRUSIAL UNTUK CLOUD RUN ---
  const port = Number(process.env.PORT) || 8080;
  const host = '0.0.0.0'; // Wajib 0.0.0.0 di dalam Docker/Cloud Run

  try {
    await app.listen({ port, host });
    app.log.info(`Enterprise Dashboard Live on port ${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  main().catch((err) => {
    console.error('fatal:', err);
    process.exit(1);
  });
}
