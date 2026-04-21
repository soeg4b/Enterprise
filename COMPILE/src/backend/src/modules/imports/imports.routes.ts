// Imports module — Excel multipart upload → enqueue.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { prisma } from '../../db/prisma.js';
import { requireAuth, requireRole } from '../../auth/auth.js';
import { Errors } from '../../lib/errors.js';
import { audit } from '../../audit/audit.js';
import { importQueue, QUEUE_NAMES } from '../../queues/queues.js';
import { serialise } from '../../lib/serialise.js';

export async function importsRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/v1/imports/excel',
    { preHandler: [requireAuth, requireRole('AD')] },
    async (req, reply) => {
      const file = await req.file();
      if (!file) throw Errors.badRequest('multipart file required');
      if (!file.filename.match(/\.xlsx?$/i)) throw Errors.badRequest('Only .xlsx files allowed');

      const buffer = await file.toBuffer();
      if (buffer.length > 25 * 1024 * 1024) throw Errors.badRequest('File too large (max 25MB)');
      const sha256 = createHash('sha256').update(buffer).digest('hex');

      const existing = await prisma.importJob.findFirst({ where: { sha256 } });
      if (existing) {
        return reply.code(409).send({
          error: 'duplicate', message: 'Identical file already uploaded',
          importJobId: existing.id, status: existing.status,
        });
      }

      // For MVP: store as base64 in s3Key field (real impl: upload to S3).
      // We persist the buffer to a tmp directory keyed by hash so the worker can read it.
      const path = await import('node:path');
      const fs = await import('node:fs/promises');
      const os = await import('node:os');
      const tmpDir = path.join(os.tmpdir(), 'deliveriq-imports');
      await fs.mkdir(tmpDir, { recursive: true });
      const tmpPath = path.join(tmpDir, `${sha256}.xlsx`);
      await fs.writeFile(tmpPath, buffer);

      const job = await prisma.importJob.create({
        data: {
          fileName: file.filename,
          s3Key: tmpPath, // MVP: filesystem path; replace with S3 key
          sha256,
          sizeBytes: buffer.length,
          status: 'UPLOADED',
          uploadedById: req.user!.id,
        },
      });

      await importQueue.add(
        QUEUE_NAMES.importParse,
        { importJobId: job.id, uploadedById: req.user!.id },
        { jobId: `import:${job.id}`, removeOnComplete: 50 },
      );

      await audit({
        actorUserId: req.user!.id, action: 'CREATE', entityType: 'ImportJob', entityId: job.id,
        after: { fileName: job.fileName, sizeBytes: job.sizeBytes }, ip: req.ip ?? null,
      });

      return reply.code(202).send({ importJobId: job.id, status: job.status });
    },
  );

  app.get(
    '/v1/imports/:id',
    { preHandler: [requireAuth, requireRole('AD')] },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const job = await prisma.importJob.findFirst({ where: { id } });
      if (!job) throw Errors.notFound('ImportJob');
      return serialise(job);
    },
  );

  app.get(
    '/v1/imports',
    { preHandler: [requireAuth, requireRole('AD')] },
    async () => {
      const data = await prisma.importJob.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
      return { data: serialise(data) };
    },
  );
}
