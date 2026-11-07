import { randomUUID } from "node:crypto";
import { createStore } from "../src/store.mjs";
import assert from "node:assert/strict";
if (!process.env.TEST_DATABASE_URL)
  throw Error(
    "Set TEST_DATABASE_URL to a disposable PostgreSQL database. This script creates a test workspace and leaves it for inspection.",
  );
const store = await createStore(process.env.TEST_DATABASE_URL),
  id = "smoke-" + randomUUID();
try {
  await store.create(id);
  await store.mutate(id, (s) => {
    s.inventory[0].quantity = 123;
  });
  await assert.rejects(() =>
    store.mutate(id, (s) => {
      s.inventory[0].quantity = 0;
      throw Error("intentional rollback");
    }),
  );
  assert.equal((await store.read(id)).inventory[0].quantity, 123);
  await Promise.all(
    Array.from({ length: 10 }, () =>
      store.mutate(id, (s) => {
        s.inventory[0].quantity--;
      }),
    ),
  );
  assert.equal((await store.read(id)).inventory[0].quantity, 113);
  console.log(
    "PostgreSQL persisted reads, rollback, and concurrent row-locked updates: PASS. Workspace:",
    id,
  );
} finally {
  await store.close();
}
