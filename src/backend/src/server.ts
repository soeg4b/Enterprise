// server.ts — Resilient Version for Cloud Run
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

// ... (Import routes Bapak tetap sama seperti sebelumnya) ...
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

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: logger as unknown as FastifyBaseLogger,
    trustProxy: true,
    genReqId: () => randomUUID(),
  });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });
  await registerAuth(app);

  // Health Checks
  app.get('/healthz', async () => ({ status: 'ok' }));

  // Register Routes
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

async function main() {
  const app = await buildServer();
  const port = Number(process.env.PORT) || 8080;
  const host = '0.0.0.0';

  try {
    // LANGKAH 1: Nyalakan server secepat mungkin agar Cloud Run puas
    await app.listen({ port, host });
    console.log(`🚀 DeliverIQ Dashboard Live on port ${port}`);

    // LANGKAH 2: Jalankan bootstrap admin setelah server online (Non-blocking)
    ensureBootstrapAdmin().catch(err => console.error("Admin Bootstrap Error:", err));

  } catch (err) {
    console.error('Fatal error during startup:', err);
    process.exit(1);
  }
}

main();
