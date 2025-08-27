import { expect } from "chai";
import { io as Client } from "socket.io-client";
import request from "supertest";
import { startServer, stopServer } from "./helpers/server.js";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

describe("WebSocket flow", function () {
  this.timeout(20000);
  let child, base;
  before(async () => {
    const s = await startServer({ PORT: "8084" });
    child = s.child;
    base = s.url;
  });
  after(async () => {
    await stopServer(child);
  });

  it("routes pixel_request to master and broadcasts save_update", async () => {
    // Create project with master
    const createRes = await request(base)
      .post("/api/projects")
      .send({
        name: "WSProj",
        masterId: "M1",
        visibility: "public",
        initialSave: { count: 0 },
      });
    const projectId = createRes.body.id;

    // Master socket
    const master = Client(base, { transports: ["websocket"] });
    await new Promise((resolve) => master.on("connect", resolve));
    await new Promise((resolve) =>
      master.emit("identify", { userId: "M1", role: "master" }, resolve)
    );
    const joinMaster = await new Promise((resolve) =>
      master.emit("join_project", { projectId }, resolve)
    );
    expect(joinMaster.ok).to.eq(true);

    // Slave follows project (required to place pixels)
    await request(base)
      .post(`/api/projects/${projectId}/follow`)
      .send({ userId: "U1" });

    // Slave socket
    const slave = Client(base, { transports: ["websocket"] });
    await new Promise((resolve) => slave.on("connect", resolve));
    await new Promise((resolve) =>
      slave.emit("identify", { userId: "U1", role: "slave" }, resolve)
    );
    await new Promise((resolve) =>
      slave.emit("join_project", { projectId }, resolve)
    );

    // Capture pixel_request on master
    const pixelPromise = new Promise((resolve) => {
      master.once("pixel_request", (msg) => resolve(msg));
    });
    const ack = await new Promise((resolve) =>
      slave.emit(
        "pixel_request",
        { projectId, x: 1, y: 2, color: "#fff" },
        resolve
      )
    );
    expect(ack.ok).to.eq(true);
    const pixel = await pixelPromise;
    expect(pixel.userId).to.eq("U1");

    // Master publishes save update
    const saveUpdatePromise = new Promise((resolve) => {
      let seen = false;
      const handler = (data) => {
        if (!seen) {
          seen = true;
          resolve(data);
        }
      };
      master.on("save_update", handler);
      slave.on("save_update", handler);
    });
    const saveAck = await new Promise((resolve) =>
      master.emit("save_update", { projectId, save: { count: 1 } }, resolve)
    );
    expect(saveAck.ok).to.eq(true);
    const up = await saveUpdatePromise;
    expect(up.projectId).to.eq(projectId);
    expect(up.save).to.deep.eq({ count: 1 });

    master.close();
    slave.close();
    await delay(100);

    // Also validate Redis state via the checker CLI (using mock connection env exposed to child)
    // We don't assert here strictly because mock uses in-memory DB inside child process;
    // but we can still call the checker against real Redis when running real tests.
  });

  it("rejects pixel when user is not following", async () => {
    const createRes = await request(base)
      .post("/api/projects")
      .send({ name: "NoFollow", masterId: "M2" });
    const projectId = createRes.body.id;
    const master = Client(base, { transports: ["websocket"] });
    await new Promise((resolve) => master.on("connect", resolve));
    await new Promise((resolve) =>
      master.emit("identify", { userId: "M2", role: "master" }, resolve)
    );
    await new Promise((resolve) =>
      master.emit("join_project", { projectId }, resolve)
    );

    const slave = Client(base, { transports: ["websocket"] });
    await new Promise((resolve) => slave.on("connect", resolve));
    await new Promise((resolve) =>
      slave.emit("identify", { userId: "U2", role: "slave" }, resolve)
    );
    await new Promise((resolve) =>
      slave.emit("join_project", { projectId }, resolve)
    );

    const ack = await new Promise((resolve) =>
      slave.emit(
        "pixel_request",
        { projectId, x: 0, y: 0, color: "#000" },
        resolve
      )
    );
    expect(ack.ok).to.eq(false);
    expect(ack.error).to.match(/not following/i);
    master.close();
    slave.close();
  });

  it("prevents non-master from joining as master and rejects save_update from slave", async () => {
    const createRes = await request(base)
      .post("/api/projects")
      .send({ name: "JoinAuth", masterId: "M3" });
    const projectId = createRes.body.id;

    const fakeMaster = Client(base, { transports: ["websocket"] });
    await new Promise((resolve) => fakeMaster.on("connect", resolve));
    await new Promise((resolve) =>
      fakeMaster.emit(
        "identify",
        { userId: "not-master", role: "master" },
        resolve
      )
    );
    const joinRes = await new Promise((resolve) =>
      fakeMaster.emit("join_project", { projectId }, resolve)
    );
    expect(joinRes.ok).to.eq(false);

    const slave = Client(base, { transports: ["websocket"] });
    await new Promise((resolve) => slave.on("connect", resolve));
    await new Promise((resolve) =>
      slave.emit("identify", { userId: "U3", role: "slave" }, resolve)
    );
    await new Promise((resolve) =>
      slave.emit("join_project", { projectId }, resolve)
    );
    const saveAck = await new Promise((resolve) =>
      slave.emit("save_update", { projectId, save: { z: 1 } }, resolve)
    );
    expect(saveAck.ok).to.eq(false);
    expect(saveAck.error).to.match(/only master/i);
    fakeMaster.close();
    slave.close();
  });

  it("rate limits across followed projects (shared bucket)", async () => {
    // Same user follows two projects; total pixel budget shared across all
    const p1 = (
      await request(base)
        .post("/api/projects")
        .send({ name: "R1", masterId: "MR1" })
    ).body.id;
    const p2 = (
      await request(base)
        .post("/api/projects")
        .send({ name: "R2", masterId: "MR2" })
    ).body.id;
    const uid = `Urate_${Date.now()}`;
    await request(base)
      .post(`/api/projects/${p1}/follow`)
      .send({ userId: uid });
    await request(base)
      .post(`/api/projects/${p2}/follow`)
      .send({ userId: uid });

    const m1 = Client(base, { transports: ["websocket"] });
    const m2 = Client(base, { transports: ["websocket"] });
    await new Promise((r) => m1.on("connect", r));
    await new Promise((r) => m2.on("connect", r));
    await new Promise((r) =>
      m1.emit("identify", { userId: "MR1", role: "master" }, r)
    );
    await new Promise((r) =>
      m2.emit("identify", { userId: "MR2", role: "master" }, r)
    );
    await new Promise((r) => m1.emit("join_project", { projectId: p1 }, r));
    await new Promise((r) => m2.emit("join_project", { projectId: p2 }, r));

    const s = Client(base, { transports: ["websocket"] });
    await new Promise((r) => s.on("connect", r));
    await new Promise((r) =>
      s.emit("identify", { userId: uid, role: "slave" }, r)
    );
    await new Promise((r) => s.emit("join_project", { projectId: p1 }, r));
    await new Promise((r) => s.emit("join_project", { projectId: p2 }, r));

    // Consume CAP pixels across both projects, then ensure next is limited
    const acks = [];
    acks.push(
      await new Promise((r) =>
        s.emit("pixel_request", { projectId: p1, x: 1, y: 1, color: "#fff" }, r)
      )
    );
    acks.push(
      await new Promise((r) =>
        s.emit("pixel_request", { projectId: p2, x: 2, y: 2, color: "#fff" }, r)
      )
    );
    acks.push(
      await new Promise((r) =>
        s.emit("pixel_request", { projectId: p1, x: 3, y: 3, color: "#fff" }, r)
      )
    );
    // Next one should be rate limited
    const blocked = await new Promise((r) =>
      s.emit("pixel_request", { projectId: p2, x: 4, y: 4, color: "#fff" }, r)
    );
    expect(acks.every((a) => a.ok)).to.eq(true);
    expect(blocked.ok).to.eq(false);
    expect(blocked.error).to.match(/rate/i);
    m1.close();
    m2.close();
    s.close();
  });
});
