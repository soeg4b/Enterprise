// Augments Fastify request with our `user` field (loaded by requireAuth).

import type { User } from '@prisma/client';

declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
  }
}

export {};
