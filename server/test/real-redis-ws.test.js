import { expect } from "chai";
import { io as Client } from "socket.io-client";
import request from "supertest";
import { startServer, stopServer } from "./helpers/server.js";

const enabled = String(process.env.TEST_USE_REAL_REDIS || "0") === "1";
const maybe = enabled ? describe : describe.skip;

maybe("Real Redis WebSocket", function () {
  this.timeout(25000);
  let child, base;
  before(async () => {
    const s = await startServer({ PORT: "8100", REDIS_MOCK: 0 });
    child = s.child;
    base = s.url;
  });
  after(async () => {
    await stopServer(child);
  });

  it("routes pixel to master and broadcasts save via real Redis", async () => {
    const createRes = await request(base)
      .post("/api/projects")
      .send({
        name: "RR-WS",
        masterId: "RR-M",
        visibility: "public",
        initialSave: { c: 0 },
      });
    expect(createRes.status).to.eq(200);
    const projectId = createRes.body.id;

    await request(base)
      .post(`/api/projects/${projectId}/follow`)
      .send({ userId: "RR-U" });

    const master = Client(base, { transports: ["websocket"] });
    await new Promise((r) => master.on("connect", r));
    await new Promise((r) =>
      master.emit("identify", { userId: "RR-M", role: "master" }, r)
    );
    const j1 = await new Promise((r) =>
      master.emit("join_project", { projectId }, r)
    );
    expect(j1.ok).to.eq(true);

    const slave = Client(base, { transports: ["websocket"] });
    await new Promise((r) => slave.on("connect", r));
    await new Promise((r) =>
      slave.emit("identify", { userId: "RR-U", role: "slave" }, r)
    );
    await new Promise((r) => slave.emit("join_project", { projectId }, r));

    const pixelPromise = new Promise((resolve) =>
      master.once("pixel_request", resolve)
    );
    const ack = await new Promise((r) =>
      slave.emit("pixel_request", { projectId, x: 7, y: 8, color: "#abc" }, r)
    );
    expect(ack.ok).to.eq(true);
    const pixel = await pixelPromise;
    expect(pixel.userId).to.eq("RR-U");

    const savePromise = new Promise((resolve) => {
      let seen = false;
      const h = (d) => {
        if (!seen) {
          seen = true;
          resolve(d);
        }
      };
      master.on("save_update", h);
      slave.on("save_update", h);
    });
    const saveAck = await new Promise((r) =>
      master.emit("save_update", { projectId, save: { c: 1 } }, r)
    );
    expect(saveAck.ok).to.eq(true);
    const up = await savePromise;
    expect(up.projectId).to.eq(projectId);
    expect(up.save).to.deep.eq({ c: 1 });

    master.close();
    slave.close();
  });
});
