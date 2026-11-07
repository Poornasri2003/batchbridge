import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../src/store.mjs";
test("SQLite transaction rolls back rejected edits and survives reopening", async () => {
  const name = `data/test-${process.pid}-${Date.now()}.sqlite`;
  let store = await createStore(null, name);
  await store.create("a");
  await store.mutate("a", (s) => {
    s.inventory[0].quantity = 123;
  });
  await assert.rejects(() =>
    store.mutate("a", (s) => {
      s.inventory[0].quantity = 0;
      throw Error("reject");
    }),
  );
  assert.equal((await store.read("a")).inventory[0].quantity, 123);
  await store.close();
  store = await createStore(null, name);
  assert.equal((await store.read("a")).inventory[0].quantity, 123);
  await store.close();
});
