import { AppError, check, available, stock, hash, audit } from "./domain.mjs";
export function verifyOrder(order, q, merchant, { paid = false } = {}) {
  check(order.id === q.orderId, "PayPal order ID mismatch.", 502);
  check(order.purchase_units?.length === 1, "Unexpected purchase units.", 502);
  const u = order.purchase_units[0];
  check(
    u.custom_id === q.id && u.reference_id === q.id,
    "PayPal quote reference mismatch.",
    502,
  );
  check(u.payee?.merchant_id === merchant, "PayPal merchant mismatch.", 502);
  check(
    u.amount?.currency_code === "USD" &&
      u.amount?.value === (q.totalCents / 100).toFixed(2),
    "PayPal amount mismatch.",
    502,
  );
  if (paid) {
    check(
      order.status === "COMPLETED",
      "PayPal has not confirmed completed payment.",
      409,
    );
    const captures = u.payments?.captures || [];
    check(
      captures.length === 1 && captures[0].status === "COMPLETED",
      "Capture is not completed.",
      409,
    );
    const c = captures[0];
    check(
      c.amount?.currency_code === "USD" &&
        c.amount?.value === (q.totalCents / 100).toFixed(2),
      "Capture amount mismatch.",
      502,
    );
    return c.id;
  }
}
export function publicQuote(s, q) {
  const lot = stock(s, q.lotId);
  return {
    id: q.id,
    customer: q.customer,
    lot: lot.name,
    sku: lot.sku,
    dimensionsMm: lot.dimensionsMm,
    quantity: q.quantity,
    unitCents: q.unitCents,
    shippingCents: q.shippingCents,
    totalCents: q.totalCents,
    currency: q.currency,
    status: q.status,
    expiresAt: q.expiresAt,
    approvedAt: q.approvedAt,
    orderId: q.orderId,
    captureId: q.captureId,
    approvalUrl: q.approvalUrl || null,
  };
}
export function createPayments(store, providers, appUrl, clock = Date.now) {
  const find = (s, token) => {
    const q = s.quotes.find((q) => q.tokenHash === hash(token));
    check(q, "Quote link not found.", 404);
    return q;
  };
  const finishPaid = async (workspace, q, order) => {
    const captureId = verifyOrder(order, q, providers.merchantId, {
      paid: true,
    });
    return store.mutate(workspace, (s) => {
      const current = s.quotes.find((x) => x.id === q.id);
      if (current.status === "PAID") return publicQuote(s, current);
      check(
        !s.quotes.some((x) => x.captureId === captureId),
        "Capture already allocated.",
        409,
      );
      const lot = stock(s, q.lotId);
      check(
        lot.quantity >= q.quantity,
        "Stock allocation requires manual reconciliation.",
        409,
      );
      lot.quantity -= q.quantity;
      current.status = "PAID";
      current.captureId = captureId;
      current.leaseUntil = 0;
      current.paidAt = clock();
      audit(
        s,
        "PAYMENT_VERIFIED",
        q.id,
        `PayPal capture ${captureId}; ${q.quantity} units allocated`,
      );
      return publicQuote(s, current);
    });
  };
  async function lock(workspace, token, action) {
    return store.mutate(workspace, (s) => {
      const q = find(s, token);
      if (q.status === "PAID") return { paid: true, q: structuredClone(q) };
      check(
        q.leaseUntil <= clock(),
        "Another payment operation is running. Retry shortly.",
        409,
      );
      check(
        !["CANCELLED"].includes(q.status),
        "This checkout has been cancelled.",
        409,
      );
      if (action === "create") {
        check(
          ["OPEN", "CREATING", "AWAITING_PAYMENT"].includes(q.status),
          "Reconcile the existing payment attempt before reopening checkout.",
          409,
        );
        check(
          clock() < q.expiresAt,
          "This quote has expired. Ask the merchant for a new quote.",
          410,
        );
        check(q.approvedAt, "Approve the exact quote before checkout.", 409);
        if (q.status === "OPEN") {
          check(
            available(s, q.lotId) >= q.quantity,
            "Stock has changed. Ask the merchant for a new quote.",
            409,
          );
          q.status = "CREATING";
          q.workspace = workspace;
        }
      } else
        check(q.orderId, "Create checkout before confirming payment.", 409);
      q.leaseUntil = clock() + 5 * 60000;
      if (action === "capture") {
        check(q.approvedAt, "Quote not approved.", 409);
        if (!["CAPTURING", "PAYMENT_UNCERTAIN"].includes(q.status))
          check(
            clock() < q.expiresAt,
            "Quote expired. Payment has not been captured; contact the merchant.",
            410,
          );
        q.status = "CAPTURING";
      }
      return { q: structuredClone(q), lot: structuredClone(stock(s, q.lotId)) };
    });
  }
  async function unlock(workspace, id, error) {
    await store.mutate(workspace, (s) => {
      const q = s.quotes.find((x) => x.id === id);
      q.leaseUntil = 0;
      if (q.status === "CAPTURING") q.status = "PAYMENT_UNCERTAIN";
      if (error)
        audit(
          s,
          "PAYMENT_REVIEW",
          id,
          "External operation not confirmed. Retry uses the same operation ID.",
        );
    });
  }
  return {
    async view(workspace, token) {
      const s = await store.read(workspace);
      check(s, "Quote not found.", 404);
      return publicQuote(s, find(s, token));
    },
    async approve(workspace, token, body) {
      return store.mutate(workspace, (s) => {
        const q = find(s, token);
        check(
          q.status === "OPEN",
          "Quote cannot be changed at this stage.",
          409,
        );
        check(clock() < q.expiresAt, "Quote expired.", 410);
        check(
          body.approved === true && body.totalCents === q.totalCents,
          "Explicit approval of this exact quote total is required.",
        );
        q.approvedAt = clock();
        audit(
          s,
          "CUSTOMER_APPROVED",
          q.id,
          "Approval recorded via private quote link. Link possession is not verified identity.",
        );
        return publicQuote(s, q);
      });
    },
    async create(workspace, token) {
      check(
        providers.config().paypal,
        "Configure PayPal sandbox credentials before checkout.",
        503,
      );
      const { q, lot, paid } = await lock(workspace, token, "create");
      if (paid) return this.view(workspace, token);
      try {
        let order = q.orderId
          ? await providers.getOrder(q.orderId)
          : await providers.createOrder(q, lot, appUrl, token);
        if (!q.orderId) {
          check(
            typeof order.id === "string" && /^[A-Z0-9]+$/.test(order.id),
            "Invalid PayPal order response.",
            502,
          );
          q.orderId = order.id;
          await store.mutate(workspace, (s) => {
            s.quotes.find((x) => x.id === q.id).orderId = order.id;
          });
        }
        verifyOrder(order, q, providers.merchantId);
        if (order.status === "COMPLETED")
          return await finishPaid(workspace, q, order);
        const approvalUrl = order.links?.find(
          (l) => l.rel === "payer-action" || l.rel === "approve",
        )?.href;
        check(
          !approvalUrl ||
            /^https:\/\/([a-z0-9-]+\.)*sandbox\.paypal\.com\//i.test(
              approvalUrl,
            ),
          "Unexpected payment approval host.",
          502,
        );
        await store.mutate(workspace, (s) => {
          const current = s.quotes.find((x) => x.id === q.id);
          current.status = "AWAITING_PAYMENT";
          current.approvalUrl = approvalUrl || current.approvalUrl || null;
          audit(s, "CHECKOUT_CREATED", q.id, `PayPal order ${q.orderId}`);
        });
        return await this.view(workspace, token);
      } catch (e) {
        await unlock(workspace, q.id, true);
        throw e;
      } finally {
        await unlock(workspace, q.id);
      }
    },
    async capture(workspace, token) {
      const { q, paid } = await lock(workspace, token, "capture");
      if (paid) return this.view(workspace, token);
      try {
        const before = await providers.getOrder(q.orderId);
        verifyOrder(before, q, providers.merchantId);
        if (before.status === "COMPLETED")
          return await finishPaid(workspace, q, before);
        check(
          before.status === "APPROVED",
          "Approve payment on PayPal first. No capture was attempted.",
          409,
        );
        await providers.capture(q);
        const after = await providers.getOrder(q.orderId);
        return await finishPaid(workspace, q, after);
      } catch (e) {
        await unlock(workspace, q.id, true);
        throw e;
      } finally {
        await unlock(workspace, q.id);
      }
    },
    async reconcile(workspace, token) {
      const { q, paid } = await lock(workspace, token, "refresh");
      if (paid) return this.view(workspace, token);
      try {
        const order = await providers.getOrder(q.orderId);
        verifyOrder(order, q, providers.merchantId);
        if (order.status === "COMPLETED")
          return await finishPaid(workspace, q, order);
        return {
          ...(await this.view(workspace, token)),
          providerStatus: order.status,
        };
      } finally {
        await unlock(workspace, q.id);
      }
    },
    async cancel(workspace, token) {
      const { q } = await lock(workspace, token, "refresh");
      try {
        const order = await providers.getOrder(q.orderId);
        verifyOrder(order, q, providers.merchantId);
        if (order.status === "COMPLETED")
          return await finishPaid(workspace, q, order);
        check(
          ["CREATED", "PAYER_ACTION_REQUIRED", "APPROVED", "VOIDED"].includes(
            order.status,
          ),
          "PayPal state is uncertain; keep stock reserved.",
          409,
        );
        return await store.mutate(workspace, (s) => {
          const current = s.quotes.find((x) => x.id === q.id);
          check(
            !["CAPTURING", "PAYMENT_UNCERTAIN", "PAID"].includes(
              current.status,
            ),
            "A capture may be pending. Reconcile before releasing stock.",
            409,
          );
          current.status = "CANCELLED";
          current.approvalUrl = null;
          audit(
            s,
            "CHECKOUT_CANCELLED",
            q.id,
            "No completed capture found. Local checkout closed; stale returns cannot capture.",
          );
          return publicQuote(s, current);
        });
      } finally {
        await unlock(workspace, q.id);
      }
    },
  };
}
