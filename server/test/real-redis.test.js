import { expect } from "chai";
import request from "supertest";
import { startServer, stopServer } from "./helpers/server.js";
import { spawn } from "child_process";

const hasReal = String(process.env.TEST_USE_REAL_REDIS || "0") === "1";

const maybe = hasReal ? describe : describe.skip;

maybe("Real Redis integration", function () {
  this.timeout(20000);
  let child, base;

  before(async () => {
    const s = await startServer({ PORT: "8099", REDIS_MOCK: 0 });
    child = s.child;
    base = s.url;
  });

  after(async () => {
    await stopServer(child);
  });

  it("creates project, follows, persists save", async () => {
    const createRes = await request(base)
      .post("/api/projects")
      .send({
        name: "RealProj",
        masterId: "R-MASTER",
        visibility: "public",
        initialSave: { v: 1 },
      });
    expect(createRes.status).to.eq(200);
    const id = createRes.body.id;

    // follow
    const f = await request(base)
      .post(`/api/projects/${id}/follow`)
      .send({ userId: "R-USER" });
    expect(f.status).to.eq(200);

    // get
    const getRes = await request(base).get(`/api/projects/${id}`);
    expect(getRes.status).to.eq(200);
    expect(getRes.body.save).to.deep.eq({ v: 1 });

    // update save via REST-like flow (use WS normally, but here we directly hit save_update via HTTP fallback if needed)
    // We'll call quota to touch rate code path as well
    const q = await request(base).get("/api/users/R-USER/quota");
    expect(q.status).to.eq(200);

    // Now verify Redis contains the expected values via the checker CLI
    const env = {
      ...process.env,
      CR_PROJECT_ID: id,
      CR_USER_ID: "R-USER",
      CR_EXPECT_NAME: "RealProj",
      CR_EXPECT_MASTER: "R-MASTER",
      CR_EXPECT_VISIBILITY: "public",
      CR_EXPECT_FOLLOWING: "true",
      CR_EXPECT_SAVE: JSON.stringify({ v: 1 }),
    };
    const proc = spawn(process.execPath, ["scripts/check-redis.mjs"], {
      cwd: process.cwd(),
      env,
    });
    const out = await new Promise((resolve, reject) => {
      let buf = "";
      proc.stdout.on("data", (d) => {
        buf += d.toString();
      });
      proc.stderr.on("data", (d) => {
        buf += d.toString();
      });
      proc.on("exit", (code) =>
        code === 0 ? resolve(buf) : reject(new Error(buf))
      );
    });
    expect(out).to.include("[check-redis] OK");
  });
});
