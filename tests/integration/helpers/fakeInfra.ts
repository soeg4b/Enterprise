// Fake redis + queue + cache for integration tests.

import { vi } from 'vitest';

type RedisStore = Map<string, { value: string; expiresAt: number | null }>;
const redisStore: RedisStore = new Map();

export function resetFakeRedis(): void {
  redisStore.clear();
  queueAddCalls.length = 0;
}

export const fakeRedis = {
  async get(k: string) {
    const e = redisStore.get(k);
    if (!e) return null;
    if (e.expiresAt && Date.now() > e.expiresAt) { redisStore.delete(k); return null; }
    return e.value;
  },
  async set(k: string, v: string, _mode?: string, ttl?: number) {
    const expiresAt = ttl ? Date.now() + ttl * 1000 : null;
    redisStore.set(k, { value: v, expiresAt });
    return 'OK';
  },
  async del(...keys: string[]) {
    let n = 0;
    for (const k of keys) if (redisStore.delete(k)) n++;
    return n;
  },
  async ping() { return 'PONG'; },
  async scan(_cursor: string, ..._args: unknown[]) {
    return ['0', Array.from(redisStore.keys())];
  },
  async incr(k: string) {
    const cur = Number((await this.get(k)) ?? 0) + 1;
    await this.set(k, String(cur));
    return cur;
  },
  async expire(_k: string, _s: number) { return 1; },
};

// ---- queue ----
export const queueAddCalls: Array<{ name: string; data: unknown; opts: unknown }> = [];

export const fakeMilestoneQueue = {
  add: vi.fn(async (name: string, data: unknown, opts: unknown) => {
    queueAddCalls.push({ name, data, opts });
    return { id: 'fake-job-' + queueAddCalls.length };
  }),
};

export const fakeImportQueue = {
  add: vi.fn(async () => ({ id: 'fake-import-job' })),
};

export const fakeNotificationQueue = {
  add: vi.fn(async () => ({ id: 'fake-notif-job' })),
};

export const QUEUE_NAMES = {
  milestoneRecompute: 'milestone:recompute',
  importParse: 'import:parse',
  notificationFanout: 'notification:fanout',
} as const;
