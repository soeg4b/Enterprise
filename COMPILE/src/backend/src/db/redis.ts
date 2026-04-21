import IORedis from 'ioredis';
import { env } from '../config/env.js';

let _redis: IORedis | null = null;

export function getRedis(): IORedis {
  if (_redis) return _redis;
  _redis = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  return _redis;
}
