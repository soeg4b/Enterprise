import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { svc: 'deliveriq-api' },
  redact: {
    // SEC-FIX (Sec stage): expanded redaction paths to cover token fields,
    // bcrypt hashes, refresh-token jti, and S3 secret keys so they cannot
    // accidentally surface in structured logs (A09: Logging Failures).
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-api-key"]',
      'res.headers["set-cookie"]',
      'password',
      '*.password',
      '*.passwordHash',
      '*.tokenHash',
      '*.accessToken',
      '*.refreshToken',
      '*.token',
      'body.password',
      'body.refreshToken',
      'body.accessToken',
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
      'S3_SECRET_KEY',
      'SEED_ADMIN_PASSWORD',
    ],
    censor: '[REDACTED]',
  },
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
      : undefined,
});
