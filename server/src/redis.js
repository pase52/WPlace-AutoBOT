import Redis from 'ioredis';
let MockRedis = null;
try { MockRedis = (await import('ioredis-mock')).default; } catch {}

const buildRedisOptions = () => {
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = parseInt(process.env.REDIS_PORT || '6379', 10);
  const password = process.env.REDIS_PASSWORD || undefined;
  const tls = String(process.env.REDIS_TLS || 'false').toLowerCase() === 'true' ? {} : undefined;
  return { host, port, password, tls, lazyConnect: true, maxRetriesPerRequest: null, enableReadyCheck: true, retryStrategy: (times) => Math.min(1000 * times, 5000) };
};

export const createRedis = () => {
  if (String(process.env.REDIS_MOCK || '0') === '1' && MockRedis) {
    return new MockRedis();
  }
  return new Redis(buildRedisOptions());
};

export const createPubSub = () => {
  if (String(process.env.REDIS_MOCK || '0') === '1' && MockRedis) {
    const pub = new MockRedis();
    const sub = new MockRedis();
    return { pub, sub };
  }
  const pub = new Redis(buildRedisOptions());
  const sub = new Redis(buildRedisOptions());
  return { pub, sub };
};

export const CHANNELS = {
  PIXEL_REQUEST: (projectId) => `project:${projectId}:pixel_requests`,
  SAVE_UPDATE: (projectId) => `project:${projectId}:save_updates`,
};

export const KEYS = {
  PROJECT: (projectId) => `project:${projectId}`, // hash: {id, name, masterId, visibility}
  PROJECT_SAVE: (projectId) => `project:${projectId}:save`, // string json
  PROJECT_FOLLOWERS: (projectId) => `project:${projectId}:followers`, // set of userIds
  PUBLIC_PROJECTS: 'projects:public', // set of projectIds
  USER_PROJECTS: (userId) => `user:${userId}:projects`, // set of projectIds followed
};
