// Stub routes for SO/SOW/Vendor/Field-Update — return 501 (NOT_IMPLEMENTED) with TODO marker.
// These keep the API contract surface visible for QA + frontend wiring; concrete impl is roadmap.

import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/auth.js';
import { Errors } from '../lib/errors.js';

const NOT_IMPL = (name: string) => `TODO: ${name} not implemented in MVP cut.`;

export async function stubRoutes(app: FastifyInstance): Promise<void> {
  // SOs
  app.get('/v1/sos', { preHandler: [requireAuth] }, async () => { throw Errors.notImplemented(NOT_IMPL('GET /v1/sos')); });
  app.post('/v1/sos', { preHandler: [requireAuth] }, async () => { throw Errors.notImplemented(NOT_IMPL('POST /v1/sos')); });
  app.get('/v1/sos/:id', { preHandler: [requireAuth] }, async () => { throw Errors.notImplemented(NOT_IMPL('GET /v1/sos/:id')); });

  // SOWs
  app.get('/v1/sows', { preHandler: [requireAuth] }, async () => { throw Errors.notImplemented(NOT_IMPL('GET /v1/sows')); });
  app.post('/v1/sows', { preHandler: [requireAuth] }, async () => { throw Errors.notImplemented(NOT_IMPL('POST /v1/sows')); });
  // GET /v1/sows/:id implemented in sites.routes.ts

  // Vendors
  app.get('/v1/vendors', { preHandler: [requireAuth] }, async () => { throw Errors.notImplemented(NOT_IMPL('GET /v1/vendors')); });
  app.post('/v1/vendors', { preHandler: [requireAuth] }, async () => { throw Errors.notImplemented(NOT_IMPL('POST /v1/vendors')); });

  // Field updates
  app.get('/v1/field-updates', { preHandler: [requireAuth] }, async () => { throw Errors.notImplemented(NOT_IMPL('GET /v1/field-updates')); });

}
