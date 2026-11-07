import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/server.mjs";
import { memoryStore, fakePayPal } from "./helpers.mjs";
test("HTTP flow: session isolation, source checks, approval gate and credential-free UI", async (t) => {
  const app = await createApp(
    { PORT: "0", APP_URL: "http://localhost", DEMO_MODE: "true" },
    { store: memoryStore(), providers: fakePayPal() },
  );
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => app.server.close(resolve)));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const call = async (path, body, cookie, origin) => {
    const r = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(cookie ? { cookie } : {}),
        ...(origin ? { origin } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
      status: r.status,
      data: await r.json(),
      cookie: r.headers.get("set-cookie")?.split(";")[0],
    };
  };
  assert.equal((await call("/healthz")).status, 200);
  assert.equal((await call("/api/state")).status, 401);
  const a = await call("/api/demo", {}),
    b = await call("/api/demo", {});
  assert.equal(a.status, 201);
  assert.notEqual(a.cookie, b.cookie);
  assert.equal(
    (
      await call(
        "/api/quotes",
        { lotId: "kraft-300", inquiryId: "oak" },
        a.cookie,
      )
    ).status,
    400,
  );
  const issued = await call(
    "/api/quotes",
    { lotId: "kraft-300", inquiryId: "north" },
    a.cookie,
  );
  assert.equal(issued.status, 201);
  const u = new URL(issued.data.url),
    ws = u.searchParams.get("workspace"),
    token = u.searchParams.get("quote"),
    path = `/api/quote/${ws}/${token}`;
  assert.equal((await call(path + "/checkout", {})).status, 409);
  assert.equal(
    (await call(path + "/approve", { approved: true, totalCents: 17200 }))
      .status,
    200,
  );
  const checkout = await call(path + "/checkout", {});
  assert.equal(checkout.status, 200);
  assert.equal(
    (await call("/api/state", undefined, b.cookie)).data.quotes.length,
    0,
  );
  assert.equal(
    (
      await call(
        "/api/search",
        { lotId: "kraft-300" },
        a.cookie,
        "https://attacker.example",
      )
    ).status,
    403,
  );
  const res = await fetch(base + "/");
  assert.equal(res.status, 200);
  assert.match(await res.text(), /BatchBridge/);
  assert.match(
    res.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
  const state = (await call("/api/state", undefined, a.cookie)).data;
  assert.equal(state.inventory[0].available, 40);
  assert.equal(JSON.stringify(state).includes("tokenHash"), false);
});
test("production refuses missing authentication or persistent database", async () => {
  await assert.rejects(
    () => createApp({ NODE_ENV: "production" }),
    /SESSION_SECRET/,
  );
  await assert.rejects(
    () =>
      createApp({
        NODE_ENV: "production",
        SESSION_SECRET: "a".repeat(40),
        ADMIN_EMAIL: "a@example.com",
        ADMIN_PASSWORD: "b".repeat(15),
      }),
    /PostgreSQL/,
  );
});
