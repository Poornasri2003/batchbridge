import { seed } from "../src/domain.mjs";
export function memoryStore() {
  const docs = new Map();
  let queue = Promise.resolve();
  return {
    kind: "test-memory",
    async create(id) {
      if (!docs.has(id)) docs.set(id, seed());
    },
    async read(id) {
      return structuredClone(docs.get(id));
    },
    mutate(id, fn) {
      const task = queue.then(() => {
        const s = structuredClone(docs.get(id));
        const result = fn(s);
        docs.set(id, s);
        return structuredClone(result);
      });
      queue = task.catch(() => {});
      return task;
    },
    async close() {},
  };
}
export function fakePayPal() {
  const orders = new Map();
  let n = 0;
  const counts = { create: 0, capture: 0 };
  return {
    merchantId: "MERCHANT123",
    counts,
    orders,
    config: () => ({
      ai: { provider: "Test fake", configured: false },
      elastic: false,
      paypal: true,
    }),
    async createOrder(q) {
      counts.create++;
      let o = [...orders.values()].find(
        (o) => o.purchase_units[0].custom_id === q.id,
      );
      if (!o) {
        o = {
          id: "ORDER" + ++n,
          status: "CREATED",
          purchase_units: [
            {
              reference_id: q.id,
              custom_id: q.id,
              payee: { merchant_id: "MERCHANT123" },
              amount: {
                currency_code: "USD",
                value: (q.totalCents / 100).toFixed(2),
              },
            },
          ],
          links: [
            {
              rel: "payer-action",
              href:
                "https://www.sandbox.paypal.com/checkoutnow?token=ORDER" + n,
            },
          ],
        };
        orders.set(o.id, o);
      }
      return structuredClone(o);
    },
    async getOrder(id) {
      return structuredClone(orders.get(id));
    },
    async capture(q) {
      counts.capture++;
      const o = orders.get(q.orderId);
      o.status = "COMPLETED";
      o.purchase_units[0].payments = {
        captures: [
          {
            id: "CAPTURE" + q.orderId,
            status: "COMPLETED",
            amount: {
              currency_code: "USD",
              value: (q.totalCents / 100).toFixed(2),
            },
          },
        ],
      };
      return structuredClone(o);
    },
  };
}
