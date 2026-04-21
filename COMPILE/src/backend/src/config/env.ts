import { z } from 'zod';
import { config } from 'dotenv';
import { resolve } from 'node:path';

// Load .env from project root (monorepo root)
config({ path: resolve(import.meta.dirname, '../../../../.env') });

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3600),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  BCRYPT_COST: z.coerce.number().int().min(10).max(15).default(12),

  CORS_ORIGINS: z.string().default('http://localhost:3601'),

  SEED_ADMIN_EMAIL: z.string().email().default('admin@deliveriq.local'),
  SEED_ADMIN_PASSWORD: z.string().min(8).default('ChangeMe!2026'),
  SEED_ADMIN_FULLNAME: z.string().default('System Administrator'),

  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('deliveriq'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),

  TZ: z.string().default('Asia/Jakarta'),
  MRC_HORIZON_MONTHS: z.coerce.number().int().positive().default(12),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;
export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('[env] invalid environment variables:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment variables');
  }
  cached = parsed.data;
  return cached;
}

export const env: Env = loadEnv();
