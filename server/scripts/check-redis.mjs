#!/usr/bin/env node
import { checkRedis } from "../src/checkRedis.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Load server/.env so REDIS_* are available by default
dotenv.config({ path: path.join(__dirname, "..", ".env") });

function env(name, fallback) {
  return process.env[name] ?? fallback;
}

async function main() {
  const projectId = env("CR_PROJECT_ID");
  const userId = env("CR_USER_ID");
  if (!projectId || !userId) {
    console.error(
      "Usage: set env CR_PROJECT_ID and CR_USER_ID, optional CR_EXPECT_* and IT_REDIS_*"
    );
    process.exit(2);
  }
  const payload = {
    redis: {
      host: env("REDIS_HOST", "127.0.0.1"),
      port: env("REDIS_PORT", "6379"),
      password: env("REDIS_PASSWORD", ""),
      tls: env("REDIS_TLS", "false"),
    },
    projectId,
    userId,
    expect: {
      name: env("CR_EXPECT_NAME"),
      masterId: env("CR_EXPECT_MASTER"),
      visibility: env("CR_EXPECT_VISIBILITY"),
      following: env("CR_EXPECT_FOLLOWING"), // true/false
      save: (() => {
        const s = env("CR_EXPECT_SAVE");
        if (!s) return undefined;
        try {
          return JSON.parse(s);
        } catch {
          return undefined;
        }
      })(),
    },
  };

  const res = await checkRedis(payload);
  if (!res.ok) {
    console.error("[check-redis] FAIL");
    for (const f of res.failures) console.error(" -", f);
    console.log(JSON.stringify(res.results, null, 2));
    process.exit(1);
  } else {
    console.log("[check-redis] OK");
    console.log(JSON.stringify(res.results, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
