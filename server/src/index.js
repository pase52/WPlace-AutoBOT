import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", ".env") });
import express from "express";
import cors from "cors";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import { createRedis, createPubSub, KEYS, CHANNELS } from "./redis.js";
import { newId, assertString, safeJSON } from "./util.js";
import { tryConsume, getAndAccrueTokens, isFollowing } from "./rate.js";

const app = express();
const server = http.createServer(app);

// Compute a safe CORS origin option for both Express and Socket.IO
function computeCorsOrigin() {
  const raw = process.env.PUBLIC_ORIGINS;
  if (!raw || raw.trim() === "*") {
    // Reflect request origin (allows credentials without '*')
    return (origin, callback) => callback(null, true);
  }
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : (origin, callback) => callback(null, false);
}

const corsOrigin = computeCorsOrigin();

const io = new SocketIOServer(server, {
  cors: {
    origin: corsOrigin,
    credentials: true,
  },
});

const corsOptions = {
  origin: corsOrigin,
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

// Preflight helper (adds Private Network header for local testing when needed)
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    res.header("Access-Control-Allow-Private-Network", "true");
  }
  next();
});

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "1mb" }));

const redis = createRedis();
const { pub, sub } = createPubSub();

// Only call connect() when needed. ioredis-mock is already connected and will throw on connect().
async function connectIfNeeded(client) {
  try {
    const status = client?.status;
    if (
      status === "wait" ||
      status === "end" ||
      typeof status === "undefined"
    ) {
      // real ioredis with lazyConnect will be in 'wait'; some clients may not expose status
      if (typeof client.connect === "function") await client.connect();
    }
  } catch {}
}

await Promise.all([
  connectIfNeeded(redis),
  connectIfNeeded(pub),
  connectIfNeeded(sub),
]);

// Data model helpers
async function createProject({
  name,
  masterId,
  visibility = "public",
  initialSave = {},
}) {
  const id = newId();
  const key = KEYS.PROJECT(id);
  await redis.hset(key, {
    id,
    name: assertString(name, "name", 100),
    masterId: assertString(masterId, "masterId", 64),
    visibility: visibility === "private" ? "private" : "public",
    createdAt: Date.now().toString(),
  });
  await redis.set(KEYS.PROJECT_SAVE(id), safeJSON.stringify(initialSave));
  if (visibility !== "private") await redis.sadd(KEYS.PUBLIC_PROJECTS, id);
  return { id };
}

async function getProject(id) {
  const data = await redis.hgetall(KEYS.PROJECT(id));
  if (!data || !data.id) return null;
  const save = safeJSON.parse(await redis.get(KEYS.PROJECT_SAVE(id)), {});
  const followers = await redis.scard(KEYS.PROJECT_FOLLOWERS(id));
  return { ...data, followers, save };
}

async function setVisibility(id, visibility) {
  const key = KEYS.PROJECT(id);
  const exists = await redis.exists(key);
  if (!exists) return false;
  visibility = visibility === "private" ? "private" : "public";
  await redis.hset(key, { visibility });
  if (visibility === "public") await redis.sadd(KEYS.PUBLIC_PROJECTS, id);
  else await redis.srem(KEYS.PUBLIC_PROJECTS, id);
  return true;
}

async function followProject(userId, projectId) {
  const ok = await redis.sadd(KEYS.PROJECT_FOLLOWERS(projectId), userId);
  if (ok) await redis.sadd(KEYS.USER_PROJECTS(userId), projectId);
  return !!ok;
}

async function unfollowProject(userId, projectId) {
  const ok = await redis.srem(KEYS.PROJECT_FOLLOWERS(projectId), userId);
  if (ok) await redis.srem(KEYS.USER_PROJECTS(userId), projectId);
  return !!ok;
}

// REST API
app.post("/api/projects", async (req, res) => {
  try {
    const { name, masterId, visibility, initialSave } = req.body || {};
    const result = await createProject({
      name,
      masterId,
      visibility,
      initialSave,
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/api/projects/:id", async (req, res) => {
  const p = await getProject(req.params.id);
  if (!p) return res.status(404).json({ error: "Not found" });
  res.json(p);
});

app.post("/api/projects/:id/visibility", async (req, res) => {
  try {
    const userId = assertString(req.body?.userId, "userId", 64);
    const project = await getProject(req.params.id);
    if (!project) return res.status(404).json({ error: "Not found" });
    if (project.masterId !== userId)
      return res.status(403).json({ error: "forbidden" });
    const ok = await setVisibility(req.params.id, req.body?.visibility);
    if (!ok) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/projects/:id/follow", async (req, res) => {
  try {
    const userId = assertString(req.body?.userId, "userId", 64);
    const ok = await followProject(userId, req.params.id);
    res.json({ ok });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/projects/:id/unfollow", async (req, res) => {
  try {
    const userId = assertString(req.body?.userId, "userId", 64);
    const ok = await unfollowProject(userId, req.params.id);
    res.json({ ok });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/api/projects", async (req, res) => {
  const ids = await redis.smembers(KEYS.PUBLIC_PROJECTS);
  const all = await Promise.all(ids.map(getProject));
  res.json(all.filter(Boolean));
});

// List projects followed by a user
app.get("/api/users/:userId/projects", async (req, res) => {
  try {
    const userId = assertString(req.params.userId, "userId", 64);
    const ids = await redis.smembers(KEYS.USER_PROJECTS(userId));
    const projects = await Promise.all(ids.map(getProject));
    res.json(projects.filter(Boolean));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/health", (req, res) => res.json({ ok: true }));

// Check user quota
app.get("/api/users/:userId/quota", async (req, res) => {
  try {
    const userId = assertString(req.params.userId, "userId", 64);
    const tokens = await getAndAccrueTokens(redis, userId);
    const nextInMs = tokens >= 1 ? 0 : Math.ceil((1 - tokens) * 30000);
    res.json({ tokens, nextInMs });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Socket.IO events
// Rooms: project:<id>
// Roles: master or slave (client emits identify with role and userId)
const masters = new Map(); // projectId -> socket.id

io.on("connection", (socket) => {
  let userId = null;
  let role = "slave";
  const joinedProjects = new Set();

  socket.on("identify", async (payload = {}, ack) => {
    try {
      userId = assertString(payload.userId, "userId", 64);
      role = payload.role === "master" ? "master" : "slave";
      if (typeof ack === "function") ack({ ok: true });
    } catch (e) {
      if (typeof ack === "function") ack({ ok: false, error: e.message });
    }
  });

  socket.on("join_project", async ({ projectId }, ack) => {
    try {
      assertString(projectId, "projectId");
      const project = await getProject(projectId);
      if (!project) throw new Error("project not found");
      // Only allow the project master to join as master
      if (role === "master") {
        if (!userId) throw new Error("identify first");
        if (project.masterId !== userId) throw new Error("not project master");
      }
      await socket.join(`project:${projectId}`);
      joinedProjects.add(projectId);
      if (role === "master") masters.set(projectId, socket.id);
      if (typeof ack === "function") ack({ ok: true, project });
    } catch (e) {
      if (typeof ack === "function") ack({ ok: false, error: e.message });
    }
  });

  socket.on("leave_project", async ({ projectId }, ack) => {
    try {
      await socket.leave(`project:${projectId}`);
      joinedProjects.delete(projectId);
      if (role === "master" && masters.get(projectId) === socket.id)
        masters.delete(projectId);
      if (typeof ack === "function") ack({ ok: true });
    } catch (e) {
      if (typeof ack === "function") ack({ ok: false, error: e.message });
    }
  });

  // From slaves: request to place a pixel => relay to master via Redis pub
  socket.on("pixel_request", async ({ projectId, x, y, color }, ack) => {
    try {
      assertString(projectId, "projectId");
      if (!userId) throw new Error("identify first");
      const following = await isFollowing(redis, userId, projectId);
      if (!following) throw new Error("not following project");
      const rate = await tryConsume(redis, userId);
      if (!rate.ok) throw new Error("rate_limited");
      const msg = { userId, x, y, color, ts: Date.now() };
      await pub.publish(CHANNELS.PIXEL_REQUEST(projectId), JSON.stringify(msg));
      // Also try to deliver directly to master if connected on this node
      const masterSocketId = masters.get(projectId);
      if (masterSocketId)
        io.to(masterSocketId).emit("pixel_request", { projectId, ...msg });
      if (typeof ack === "function") ack({ ok: true });
    } catch (e) {
      try {
        console.warn("pixel_request error", e?.message || e);
      } catch {}
      if (typeof ack === "function") ack({ ok: false, error: e.message });
    }
  });

  // From master: after applying pixel, update save
  socket.on("save_update", async ({ projectId, save }, ack) => {
    try {
      if (role !== "master") throw new Error("only master can update");
      assertString(projectId, "projectId");
      await redis.set(KEYS.PROJECT_SAVE(projectId), safeJSON.stringify(save));
      await pub.publish(
        CHANNELS.SAVE_UPDATE(projectId),
        JSON.stringify({ projectId, save, ts: Date.now() })
      );
      if (typeof ack === "function") ack({ ok: true });
    } catch (e) {
      if (typeof ack === "function") ack({ ok: false, error: e.message });
    }
  });

  socket.on("disconnect", () => {
    for (const projectId of joinedProjects) {
      if (role === "master" && masters.get(projectId) === socket.id)
        masters.delete(projectId);
    }
  });
});

// Subscribe to Redis and broadcast to socket rooms
sub.on("message", (channel, message) => {
  try {
    if (channel.includes(":save_updates")) {
      const data = JSON.parse(message);
      const room = `project:${data.projectId}`;
      io.to(room).emit("save_update", data);
    } else if (channel.includes(":pixel_requests")) {
      const data = JSON.parse(message);
      const { projectId } = data;
      const masterSocketId = masters.get(projectId);
      if (masterSocketId) io.to(masterSocketId).emit("pixel_request", data);
    }
  } catch {}
});

// dynamic subscriptions when sockets join
async function ensureSubscriptions(projectId) {
  try {
    await sub.subscribe(CHANNELS.SAVE_UPDATE(projectId));
    await sub.subscribe(CHANNELS.PIXEL_REQUEST(projectId));
  } catch {}
}

io.of("/").adapter.on("join-room", (room, id) => {
  if (room.startsWith("project:")) {
    const projectId = room.split(":")[1];
    ensureSubscriptions(projectId);
  }
});

const PORT = parseInt(process.env.PORT || "8010", 10);
server.listen(PORT, () => {
  console.log(`Server listening on :${PORT}`);
});
