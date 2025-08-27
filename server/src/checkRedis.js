import Redis from "ioredis";

function toBool(v) {
  if (typeof v === "boolean") return v;
  if (v == null) return undefined;
  const s = String(v).toLowerCase();
  if (["1", "true", "yes", "y"].includes(s)) return true;
  if (["0", "false", "no", "n"].includes(s)) return false;
  return undefined;
}

export async function checkRedis({
  redis: redisOptions,
  projectId,
  userId,
  expect = {},
}) {
  const client = new Redis({
    host: redisOptions.host,
    port: Number(redisOptions.port),
    password: redisOptions.password || undefined,
    tls: toBool(redisOptions.tls) ? {} : undefined,
  });
  try {
    const failures = [];
    const results = {};

    // Project hash
    const projKey = `project:${projectId}`;
    const proj = await client.hgetall(projKey);
    results.project = proj;
    if (expect.masterId && proj.masterId !== expect.masterId)
      failures.push(
        `masterId mismatch: ${proj.masterId} != ${expect.masterId}`
      );
    if (expect.name && proj.name !== expect.name)
      failures.push(`name mismatch: ${proj.name} != ${expect.name}`);
    if (expect.visibility && proj.visibility !== expect.visibility)
      failures.push(
        `visibility mismatch: ${proj.visibility} != ${expect.visibility}`
      );

    // Save JSON
    const saveKey = `project:${projectId}:save`;
    const saveStr = await client.get(saveKey);
    try {
      results.save = JSON.parse(saveStr);
    } catch {
      results.save = null;
    }
    if (
      expect.save &&
      JSON.stringify(results.save) !== JSON.stringify(expect.save)
    )
      failures.push(
        `save mismatch: ${saveStr} != ${JSON.stringify(expect.save)}`
      );

    // Followers
    const followersKey = `project:${projectId}:followers`;
    const followers = await client.smembers(followersKey);
    results.followers = followers;
    const expectFollowing = toBool(expect.following);
    if (expectFollowing !== undefined) {
      const has = followers.includes(userId);
      if (has !== expectFollowing)
        failures.push(
          `following mismatch: got ${has}, expected ${expectFollowing}`
        );
    }

    // Public projects
    const isPublic =
      (await client.sismember("projects:public", projectId)) === 1;
    results.public = isPublic;
    if (expect.visibility) {
      const shouldBePublic = expect.visibility === "public";
      if (isPublic !== shouldBePublic)
        failures.push(
          `public set mismatch: got ${isPublic}, expected ${shouldBePublic}`
        );
    }

    // User's followed projects
    const userProjects = await client.smembers(`user:${userId}:projects`);
    results.userProjects = userProjects;
    if (expectFollowing !== undefined) {
      const has = userProjects.includes(projectId);
      if (has !== expectFollowing)
        failures.push(
          `user projects mismatch: got ${has}, expected ${expectFollowing}`
        );
    }

    // Rate limiter keys (optional existence check)
    const [tokens, updatedAt] = await client.mget(
      `user:${userId}:tokens`,
      `user:${userId}:tokens_updated_at`
    );
    results.tokens = tokens;
    results.tokensUpdatedAt = updatedAt;

    return { ok: failures.length === 0, failures, results };
  } finally {
    try {
      await client.quit();
    } catch {}
  }
}
