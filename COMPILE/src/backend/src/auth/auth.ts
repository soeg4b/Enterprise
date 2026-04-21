import bcrypt from 'bcrypt';
import jwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { Errors } from '../lib/errors.js';
import type { UserRole } from 'deliveriq-shared';

export interface AccessTokenPayload {
  sub: string;          // user id
  role: UserRole;
  email: string;
  departmentId: string | null;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  type: 'refresh';
}

export async function registerAuth(app: FastifyInstance): Promise<void> {
  // Access-token signer (default namespace).
  await app.register(jwt, {
    secret: {
      private: env.JWT_SECRET,
      public: env.JWT_SECRET,
    } as never,
    sign: { expiresIn: env.JWT_ACCESS_TTL },
    verify: {},
  });

  // SEC-FIX (BUG-AUTH-01 / CQ-01): separate signer for refresh tokens to
  // eliminate the algorithm/token-confusion class. Different secret + namespace
  // means an access token can never be replayed as a refresh token (and vice-
  // versa) even if the in-payload `type` discriminator is removed or bypassed.
  await app.register(jwt, {
    namespace: 'refresh',
    secret: {
      private: env.JWT_REFRESH_SECRET,
      public: env.JWT_REFRESH_SECRET,
    } as never,
    sign: { expiresIn: env.JWT_REFRESH_TTL },
    verify: {},
  });
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signAccessToken(app: FastifyInstance, payload: Omit<AccessTokenPayload, 'type'>): string {
  return app.jwt.sign({ ...payload, type: 'access' }, { expiresIn: env.JWT_ACCESS_TTL });
}

export function signRefreshToken(app: FastifyInstance, userId: string, jti: string): string {
  // SEC-FIX (BUG-AUTH-01): use the dedicated `refresh` namespace so refresh
  // tokens are signed/verified with JWT_REFRESH_SECRET via a separate plugin
  // instance — no shared key material with the access signer.
  const refreshJwt = (app as unknown as { jwt: { refresh: { sign: (p: object, o?: object) => string } } }).jwt.refresh;
  return refreshJwt.sign(
    { sub: userId, jti, type: 'refresh' } satisfies RefreshTokenPayload,
    { expiresIn: env.JWT_REFRESH_TTL },
  );
}

export function verifyRefreshToken(app: FastifyInstance, token: string): RefreshTokenPayload {
  const refreshJwt = (app as unknown as { jwt: { refresh: { verify: <T>(t: string) => T } } }).jwt.refresh;
  const decoded = refreshJwt.verify<RefreshTokenPayload>(token);
  if (decoded.type !== 'refresh') throw Errors.unauthorized('Invalid token type');
  return decoded;
}

/**
 * Pre-handler: require valid Bearer access token. Loads user into request.
 */
export async function requireAuth(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) throw Errors.unauthorized();
  const token = header.slice(7);
  let decoded: AccessTokenPayload;
  try {
    decoded = req.server.jwt.verify<AccessTokenPayload>(token);
  } catch {
    throw Errors.unauthorized('Invalid or expired token');
  }
  if (decoded.type !== 'access') throw Errors.unauthorized('Invalid token type');

  const user = await prisma.user.findFirst({
    where: { id: decoded.sub, deletedAt: null, status: 'ACTIVE' },
  });
  if (!user) throw Errors.unauthorized('User not found or inactive');
  (req as FastifyRequest & { user: typeof user }).user = user;
}

/**
 * RBAC middleware factory: pass an array of allowed roles. Returns a Fastify pre-handler.
 */
export function requireRole(...allowed: UserRole[]) {
  return async function (req: FastifyRequest): Promise<void> {
    const u = (req as FastifyRequest & { user?: { role: UserRole } }).user;
    if (!u) throw Errors.unauthorized();
    if (!allowed.includes(u.role)) throw Errors.forbidden(`Role ${u.role} not permitted`);
  };
}
