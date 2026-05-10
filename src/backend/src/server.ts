// =============================================================================
// DeliverIQ — Fastify API server bootstrap (Resilient Cloud Run Edition)
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

// Catch unhandled exceptions to prevent silent crashes in Cloud Run
process.on('uncaughtException', (err) => {
  console.error('🔥 FATAL UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('🔥 FATAL UNHANDLED REJECTION:', reason);
});

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: logger as unknown as FastifyBaseLogger,
    trustProxy: true,
    genReqId: () => randomUUID(),
  });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });
  await registerAuth(app);

  app.get('/healthz', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

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
  console.log("Starting initialization...");
  
  let app: FastifyInstance;
  try {
    app = await buildServer();
  } catch (err) {
    console.error("🔥 Error building server:", err);
    process.exit(1);
  }

  // Wajib 0.0.0.0 untuk Docker / Cloud Run
  const port = Number(process.env.PORT) || 8080;
  const host = '0.0.0.0';

  try {
    await app.listen({ port, host });
    console.log(`🚀 DeliverIQ API Live on http://${host}:${port}`);
    
    // Background Admin Bootstrap
    ensureBootstrapAdmin().catch(err => console.error("Admin Bootstrap Error:", err));
  } catch (err) {
    console.error('🔥 Fatal error during app.listen:', err);
    process.exit(1);
  }
}

main();
