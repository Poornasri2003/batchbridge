import { test } from "node:test";
import assert from "node:assert/strict";
import { newQuote, available } from "../src/domain.mjs";
import { createPayments, verifyOrder } from "../src/payments.mjs";
import { memoryStore, fakePayPal } from "./helpers.mjs";
async function fixture() {
  const store = memoryStore();
  await store.create("a");
  const provider = fakePayPal();
  let now = Date.now();
  const payments = createPayments(
    store,
    provider,
    "http://localhost",
    () => now,
  );
  const make = () =>
    store.mutate("a", (s) =>
      newQuote(s, { lotId: "kraft-300", inquiryId: "north" }, now),
    );
  return {
    store,
    provider,
    payments,
    make,
    advance(ms) {
      now += ms;
    },
  };
}
test("no checkout before approval, and approval must bind exact total", async () => {
  const f = await fixture(),
    { token } = await f.make();
  await assert.rejects(() => f.payments.create("a", token), /Approve/);
  await assert.rejects(
    () => f.payments.approve("a", token, { approved: true, totalCents: 1 }),
    /exact/,
  );
  assert.equal(f.provider.counts.create, 0);
});
test("end-to-end fake: approve, reserve, capture, readback, allocate exactly once", async () => {
  const f = await fixture(),
    { token } = await f.make();
  await f.payments.approve("a", token, { approved: true, totalCents: 17200 });
  const q = await f.payments.create("a", token);
  assert.equal(available(await f.store.read("a"), "kraft-300"), 40);
  await assert.rejects(() => f.payments.capture("a", token), /Approve payment/);
  f.provider.orders.get(q.orderId).status = "APPROVED";
  const paid = await f.payments.capture("a", token);
  assert.equal(paid.status, "PAID");
  assert.equal((await f.store.read("a")).inventory[0].quantity, 40);
  await f.payments.capture("a", token);
  assert.equal(f.provider.counts.capture, 1);
  assert.equal((await f.store.read("a")).inventory[0].quantity, 40);
});
test("competing approved quotes cannot oversell stock", async () => {
  const f = await fixture();
  const a = await f.make(),
    b = await f.make();
  for (const r of [a, b])
    await f.payments.approve("a", r.token, {
      approved: true,
      totalCents: 17200,
    });
  const results = await Promise.allSettled([
    f.payments.create("a", a.token),
    f.payments.create("a", b.token),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(f.provider.counts.create, 1);
});
test("uncertain capture retains stock, then readback resolves without another capture", async () => {
  const f = await fixture(),
    { token } = await f.make();
  await f.payments.approve("a", token, { approved: true, totalCents: 17200 });
  const q = await f.payments.create("a", token);
  f.provider.orders.get(q.orderId).status = "APPROVED";
  const original = f.provider.capture;
  f.provider.capture = async (q) => {
    await original(q);
    throw Error("response lost");
  };
  await assert.rejects(() => f.payments.capture("a", token), /response lost/);
  assert.equal(available(await f.store.read("a"), "kraft-300"), 40);
  assert.equal((await f.payments.view("a", token)).status, "PAYMENT_UNCERTAIN");
  assert.equal((await f.payments.reconcile("a", token)).status, "PAID");
  assert.equal(f.provider.counts.capture, 1);
});
test("unpaid cancellation releases stock, stale checkout cannot capture", async () => {
  const f = await fixture(),
    { token } = await f.make();
  await f.payments.approve("a", token, { approved: true, totalCents: 17200 });
  await f.payments.create("a", token);
  assert.equal((await f.payments.cancel("a", token)).status, "CANCELLED");
  assert.equal(available(await f.store.read("a"), "kraft-300"), 240);
  await assert.rejects(() => f.payments.capture("a", token), /cancelled/);
  await assert.rejects(() => f.payments.create("a", token), /cancelled/);
});
test("expired quote cannot begin payment", async () => {
  const f = await fixture(),
    { token } = await f.make();
  await f.payments.approve("a", token, { approved: true, totalCents: 17200 });
  f.advance(31 * 60000);
  await assert.rejects(() => f.payments.create("a", token), /expired/);
  assert.equal(f.provider.counts.create, 0);
});
test("merchant, amount, reference and currency are verified independently", async () => {
  const f = await fixture(),
    { token, quote } = await f.make();
  await f.payments.approve("a", token, { approved: true, totalCents: 17200 });
  const q = await f.payments.create("a", token),
    o = await f.provider.getOrder(q.orderId),
    record = { ...quote, orderId: q.orderId };
  for (const mutate of [
    (u) => (u.amount.value = "1.00"),
    (u) => (u.amount.currency_code = "EUR"),
    (u) => (u.payee.merchant_id = "OTHER"),
    (u) => (u.custom_id = "OTHER"),
  ]) {
    const altered = structuredClone(o);
    mutate(altered.purchase_units[0]);
    assert.throws(() => verifyOrder(altered, record, "MERCHANT123"));
  }
});
test("quote token cannot access another workspace", async () => {
  const f = await fixture();
  await f.store.create("b");
  const { token } = await f.make();
  await assert.rejects(() => f.payments.view("b", token), /not found/);
});
