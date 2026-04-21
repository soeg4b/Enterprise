// Auth routes: login, refresh, /me.

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../db/prisma.js';
import { Errors } from '../../lib/errors.js';
import {
  hashPassword,
  signAccessToken,
  signRefreshToken,
  verifyPassword,
  verifyRefreshToken,
  requireAuth,
} from '../../auth/auth.js';
import { tryConsume } from '../../middleware/rate-limit.js';
import { audit } from '../../audit/audit.js';
import { env } from '../../config/env.js';
import dayjs from 'dayjs';

const LoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(200),
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(20),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/auth/login', async (req, reply) => {
    const ip = (req.ip ?? 'unknown').toString();
    if (!tryConsume(`login:${ip}`, { capacity: 10, refillPerSecond: 0.1 })) {
      throw Errors.rateLimited('Too many login attempts');
    }
    const body = LoginSchema.parse(req.body);
    if (!tryConsume(`login:email:${body.email}`, { capacity: 5, refillPerSecond: 0.05 })) {
      throw Errors.rateLimited('Too many attempts for this account');
    }

    const user = await prisma.user.findFirst({
      where: { email: body.email, deletedAt: null },
    });
    if (!user) {
      await audit({
        action: 'LOGIN',
        entityType: 'User',
        entityId: null,
        ip,
        userAgent: req.headers['user-agent'] ?? null,
        after: { ok: false, reason: 'unknown_email' },
      });
      throw Errors.unauthorized('Invalid credentials');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw Errors.unauthorized('Account locked. Try again later');
    }
    if (user.status !== 'ACTIVE') throw Errors.unauthorized('Account not active');

    const ok = await verifyPassword(body.password, user.passwordHash);
    if (!ok) {
      const failed = user.failedLoginCount + 1;
      const locked = failed >= 5;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: failed,
          lockedUntil: locked ? dayjs().add(15, 'minute').toDate() : null,
        },
      });
      await audit({
        actorUserId: user.id,
        action: 'LOGIN',
        entityType: 'User',
        entityId: user.id,
        ip,
        after: { ok: false, locked },
      });
      throw Errors.unauthorized('Invalid credentials');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const accessToken = signAccessToken(app, {
      sub: user.id,
      role: user.role,
      email: user.email,
      departmentId: user.departmentId,
    });
    const jti = randomUUID();
    const refreshToken = signRefreshToken(app, user.id, jti);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: jti, // store jti reference (token already in client)
        expiresAt: dayjs().add(7, 'day').toDate(),
        ip,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });

    await audit({
      actorUserId: user.id,
      action: 'LOGIN',
      entityType: 'User',
      entityId: user.id,
      ip,
      after: { ok: true },
    });

    return reply.send({
      accessToken,
      refreshToken,
      expiresIn: parseTtl(env.JWT_ACCESS_TTL),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        departmentId: user.departmentId,
        locale: user.locale,
      },
    });
  });

  app.post('/v1/auth/refresh', async (req, reply) => {
    const body = RefreshSchema.parse(req.body);
    let payload;
    try {
      payload = verifyRefreshToken(app, body.refreshToken);
    } catch {
      throw Errors.unauthorized('Invalid refresh token');
    }
    const stored = await prisma.refreshToken.findFirst({
      where: { userId: payload.sub, tokenHash: payload.jti, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!stored) throw Errors.unauthorized('Refresh token revoked or expired');

    const user = await prisma.user.findFirst({ where: { id: payload.sub, deletedAt: null, status: 'ACTIVE' } });
    if (!user) throw Errors.unauthorized('User not found');

    // Rotate
    const newJti = randomUUID();
    const newRefresh = signRefreshToken(app, user.id, newJti);
    await prisma.$transaction([
      prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } }),
      prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: newJti,
          expiresAt: dayjs().add(7, 'day').toDate(),
          ip: req.ip ?? null,
        },
      }),
    ]);

    const accessToken = signAccessToken(app, {
      sub: user.id,
      role: user.role,
      email: user.email,
      departmentId: user.departmentId,
    });

    return reply.send({
      accessToken,
      refreshToken: newRefresh,
      expiresIn: parseTtl(env.JWT_ACCESS_TTL),
    });
  });

  app.get('/v1/me', { preHandler: requireAuth }, async (req: FastifyRequest) => {
    const user = req.user!;
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      departmentId: user.departmentId,
      locale: user.locale,
      status: user.status,
    };
  });

  app.post('/v1/auth/logout', { preHandler: requireAuth }, async (req, reply) => {
    await prisma.refreshToken.updateMany({
      where: { userId: req.user!.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return reply.send({ ok: true });
  });
}

// Hash util re-exported for convenience.
export { hashPassword };

function parseTtl(ttl: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(ttl);
  if (!match) return 900;
  const n = Number(match[1]);
  const unit = match[2];
  switch (unit) {
    case 's': return n;
    case 'm': return n * 60;
    case 'h': return n * 3600;
    case 'd': return n * 86400;
    default: return 900;
  }
}
