// First-boot admin seeder — runs once on server start. Idempotent.

import bcrypt from 'bcryptjs';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

export async function ensureBootstrapAdmin(): Promise<void> {
  try {
    const existing = await prisma.user.findFirst({
      where: { email: env.SEED_ADMIN_EMAIL, deletedAt: null },
    });
    if (existing) return;

    const hash = await bcrypt.hash(env.SEED_ADMIN_PASSWORD, env.BCRYPT_COST);
    await prisma.user.create({
      data: {
        email: env.SEED_ADMIN_EMAIL,
        passwordHash: hash,
        fullName: env.SEED_ADMIN_FULLNAME,
        role: 'AD',
        status: 'ACTIVE',
        locale: 'id-ID',
      },
    });
    logger.warn(
      { email: env.SEED_ADMIN_EMAIL },
      'bootstrap admin user created — change the password immediately',
    );
  } catch (err) {
    logger.error({ err }, 'bootstrap.admin.failed');
  }
}
