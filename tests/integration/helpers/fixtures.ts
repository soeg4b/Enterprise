// Common test fixtures: hash a password, seed a user, get a valid bearer token.

import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { seed } from './fakePrisma';

export type TestRole = 'AD' | 'BOD' | 'DH' | 'PM' | 'FE' | 'FN';

export async function makeUser(role: TestRole, overrides: Record<string, unknown> = {}) {
  const passwordHash = await bcrypt.hash('Passw0rd!', 10);
  const id = (overrides.id as string | undefined) ?? randomUUID();
  const [u] = seed('user', [{
    id,
    email: overrides.email ?? `${role.toLowerCase()}-${id.slice(0, 6)}@deliveriq.test`,
    fullName: `Test ${role}`,
    role,
    status: 'ACTIVE',
    departmentId: null,
    locale: 'id-ID',
    passwordHash,
    failedLoginCount: 0,
    lockedUntil: null,
    lastLoginAt: null,
    deletedAt: null,
    ...overrides,
  }]);
  return u as { id: string; email: string; role: TestRole; departmentId: string | null };
}

export function bearerFor(app: FastifyInstance, user: { id: string; email: string; role: TestRole; departmentId: string | null }): string {
  const token = app.jwt.sign(
    { sub: user.id, role: user.role, email: user.email, departmentId: user.departmentId, type: 'access' },
    { expiresIn: '15m' },
  );
  return `Bearer ${token}`;
}
