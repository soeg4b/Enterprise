// Augments @fastify/jwt with our User payload type so that
// FastifyRequest.user is typed as User (set by requireAuth).

import type { User } from '@prisma/client';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: User;
  }
}

export {};
