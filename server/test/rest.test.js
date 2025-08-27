import { expect } from "chai";
import request from "supertest";
import { startServer, stopServer } from "./helpers/server.js";

describe("REST API", function () {
  this.timeout(15000);
  let child, base;

  before(async () => {
    const started = await startServer({ PORT: "8083" });
    child = started.child;
    base = started.url;
  });
  after(async () => {
    await stopServer(child);
  });

  it("health works", async () => {
    const res = await request(base).get("/health");
    expect(res.status).to.eq(200);
    expect(res.body.ok).to.eq(true);
  });

  it("creates project and enforces visibility auth", async () => {
    // create
    const createRes = await request(base)
      .post("/api/projects")
      .send({
        name: "Proj",
        masterId: "master-1",
        visibility: "public",
        initialSave: { a: 1 },
      });
    expect(createRes.status).to.eq(200);
    const { id } = createRes.body;
    expect(id).to.be.a("string");

    // get
    const getRes = await request(base).get(`/api/projects/${id}`);
    expect(getRes.status).to.eq(200);
    expect(getRes.body.name).to.eq("Proj");
    expect(getRes.body.save).to.deep.eq({ a: 1 });

    // list public
    const listRes = await request(base).get("/api/projects");
    expect(listRes.status).to.eq(200);
    expect(listRes.body.find((p) => p.id === id)).to.exist;

    // visibility: forbidden when not master
    const visForbidden = await request(base)
      .post(`/api/projects/${id}/visibility`)
      .send({ userId: "not-master", visibility: "private" });
    expect(visForbidden.status).to.eq(403);

    // visibility: allowed for master
    const visOk = await request(base)
      .post(`/api/projects/${id}/visibility`)
      .send({ userId: "master-1", visibility: "private" });
    expect(visOk.status).to.eq(200);

    // now not in public list
    const listRes2 = await request(base).get("/api/projects");
    expect(listRes2.status).to.eq(200);
    expect(listRes2.body.find((p) => p.id === id)).to.not.exist;
  });

  it("follow/unfollow and my projects", async () => {
    const createRes = await request(base)
      .post("/api/projects")
      .send({ name: "Proj2", masterId: "m2", visibility: "public" });
    const { id } = createRes.body;

    const u = "userA";
    const f1 = await request(base)
      .post(`/api/projects/${id}/follow`)
      .send({ userId: u });
    expect(f1.status).to.eq(200);

    const mine = await request(base).get(`/api/users/${u}/projects`);
    expect(mine.status).to.eq(200);
    expect(mine.body.find((p) => p.id === id)).to.exist;

    const unf = await request(base)
      .post(`/api/projects/${id}/unfollow`)
      .send({ userId: u });
    expect(unf.status).to.eq(200);
    const mine2 = await request(base).get(`/api/users/${u}/projects`);
    expect(mine2.body.find((p) => p.id === id)).to.not.exist;
  });

  it("quota endpoint returns tokens", async () => {
    const res = await request(base).get("/api/users/u1/quota");
    expect(res.status).to.eq(200);
    expect(res.body).to.have.property("tokens");
    expect(res.body).to.have.property("nextInMs");
  });
});
