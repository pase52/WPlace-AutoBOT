import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function startServer(env = {}) {
  const serverPath = path.join(__dirname, "..", "..", "src", "index.js");
  const useReal =
    env.REDIS_MOCK != null
      ? String(env.REDIS_MOCK) === "0"
      : String(process.env.TEST_USE_REAL_REDIS || "0") === "1";
  const childEnv = {
    ...process.env,
    PORT: env.PORT || "8082",
    PUBLIC_ORIGINS: "*",
    // Allow caller to control redis; default to mock unless TEST_USE_REAL_REDIS=1
    REDIS_MOCK: useReal ? "0" : "1",
    // Do not override REDIS_*; server loads .env itself. Caller may still set these explicitly via env.
    REDIS_HOST: env.REDIS_HOST ?? process.env.REDIS_HOST,
    REDIS_PORT: env.REDIS_PORT ?? process.env.REDIS_PORT,
    REDIS_PASSWORD: env.REDIS_PASSWORD ?? process.env.REDIS_PASSWORD,
    REDIS_TLS: env.REDIS_TLS ?? process.env.REDIS_TLS,
  };
  const child = spawn(process.execPath, [serverPath], {
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let started = false;
  return new Promise((resolve, reject) => {
    const onData = (data) => {
      const s = data.toString();
      if (!started && s.includes("Server listening on")) {
        started = true;
        // Forward logs for debugging
        child.stdout.on("data", (buf) =>
          process.stdout.write(`[server] ${buf}`)
        );
        child.stderr.on("data", (buf) =>
          process.stderr.write(`[server-err] ${buf}`)
        );
        // Remove only the bootstrap listeners
        child.stdout.off("data", onData);
        child.stderr.off("data", onErr);
        child.off("exit", onExit);
        resolve({ child, url: `http://127.0.0.1:${env.PORT || "8082"}` });
      }
    };
    const onErr = (data) => {
      // Keep for debugging if needed
    };
    const onExit = (code) => {
      if (!started) reject(new Error(`server exited early ${code}`));
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onErr);
    child.on("exit", onExit);
  });
}

export async function stopServer(child) {
  if (!child) return;
  return new Promise((resolve) => {
    try {
      child.once("exit", () => resolve());
      child.kill();
    } catch {
      resolve();
    }
  });
}
