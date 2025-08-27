import { KEYS } from "./redis.js";

const RATE_MS = 30000; // 1 pixel per 30s
const CAP = 3; // allow short bursts

// Compute and update tokens for user; returns current tokens after accrual
export async function getAndAccrueTokens(redis, userId) {
  const tokensKey = `user:${userId}:tokens`;
  const updatedKey = `user:${userId}:tokens_updated_at`;
  const now = Date.now();
  const [tokensStr, updatedStr] = await redis.mget(tokensKey, updatedKey);
  // Initialize new users with a full bucket to allow immediate action
  let tokens = tokensStr == null ? CAP : parseFloat(tokensStr || "0");
  const last = parseInt(updatedStr || `${now}`, 10);
  const delta = Math.max(0, now - last);
  const earned = delta / RATE_MS;
  tokens = Math.min(CAP, tokens + earned);
  await redis.mset(tokensKey, tokens.toString(), updatedKey, now.toString());
  return tokens;
}

export async function tryConsume(redis, userId) {
  const tokensKey = `user:${userId}:tokens`;
  const updatedKey = `user:${userId}:tokens_updated_at`;
  const now = Date.now();
  // When running tests with ioredis-mock, WATCH isn't supported; use a simplified path.
  if (String(process.env.REDIS_MOCK || "0") === "1") {
    const [tokensStr, updatedStr] = await redis.mget(tokensKey, updatedKey);
    let tokens = tokensStr == null ? CAP : parseFloat(tokensStr || "0");
    const last = parseInt(updatedStr || `${now}`, 10);
    const delta = Math.max(0, now - last);
    const earned = delta / RATE_MS;
    tokens = Math.min(CAP, tokens + earned);
    if (tokens < 1) return { ok: false, tokens };
    tokens = tokens - 1;
    await redis.mset(tokensKey, tokens.toString(), updatedKey, now.toString());
    return { ok: true, tokens };
  }
  // Use a transaction (WATCH/MULTI) to avoid race conditions
  while (true) {
    try {
      await redis.watch(tokensKey, updatedKey);
      const [tokensStr, updatedStr] = await redis.mget(tokensKey, updatedKey);
      // Start with a full bucket for first-time users
      let tokens = tokensStr == null ? CAP : parseFloat(tokensStr || "0");
      const last = parseInt(updatedStr || `${now}`, 10);
      const delta = Math.max(0, now - last);
      const earned = delta / RATE_MS;
      tokens = Math.min(CAP, tokens + earned);
      if (tokens < 1) {
        await redis.unwatch();
        return { ok: false, tokens };
      }
      tokens = tokens - 1;
      const tx = redis.multi();
      tx.mset(tokensKey, tokens.toString(), updatedKey, now.toString());
      const res = await tx.exec();
      if (res === null) continue; // retry on race
      return { ok: true, tokens };
    } catch (e) {
      try {
        await redis.unwatch();
      } catch {}
      throw e;
    }
  }
}

export async function isFollowing(redis, userId, projectId) {
  const member = await redis.sismember(
    KEYS.PROJECT_FOLLOWERS(projectId),
    userId
  );
  // Coerce various possible return types from different clients/mocks
  if (member === true) return true;
  const n = typeof member === "string" ? parseInt(member, 10) : Number(member);
  return n === 1;
}
