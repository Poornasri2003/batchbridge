import { randomUUID, createHash } from "node:crypto";
export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export const check = (ok, message, status = 400) => {
  if (!ok) throw new AppError(message, status);
};
export const hash = (s) => createHash("sha256").update(String(s)).digest("hex");
export const money = (c) => `$${(c / 100).toFixed(2)}`;
export function stock(s, id) {
  const x = s.inventory.find((x) => x.id === id);
  check(x, "Inventory lot not found", 404);
  return x;
}
export function available(s, id) {
  return (
    stock(s, id).quantity -
    s.quotes
      .filter(
        (q) =>
          q.lotId === id &&
          [
            "CREATING",
            "AWAITING_PAYMENT",
            "CAPTURING",
            "PAYMENT_UNCERTAIN",
          ].includes(q.status),
      )
      .reduce((n, q) => n + q.quantity, 0)
  );
}
export function qualify(lot, request, qtyAvailable) {
  const checks = [];
  const add = (name, status, detail) => checks.push({ name, status, detail });
  add(
    "Category",
    request.category === lot.category ? "PASS" : "FAIL",
    `${request.category || "Unknown"} requested; ${lot.category} in stock`,
  );
  add(
    "Quantity",
    Number.isInteger(request.quantity) && request.quantity > 0
      ? request.quantity <= qtyAvailable
        ? "PASS"
        : "FAIL"
      : "UNKNOWN",
    `${request.quantity ?? "Unknown"} requested; ${qtyAvailable} available`,
  );
  add(
    "Dimensions",
    Array.isArray(request.dimensionsMm) && request.dimensionsMm.length === 3
      ? request.dimensionsMm.every(
          (v, i) =>
            Math.abs(v - lot.dimensionsMm[i]) <= (request.toleranceMm ?? 0),
        )
        ? "PASS"
        : "FAIL"
      : "UNKNOWN",
    `Stock ${lot.dimensionsMm.join(" × ")} mm; requested ${request.dimensionsMm?.join(" × ") || "unknown"} mm`,
  );
  add(
    "Material",
    request.material
      ? request.material === lot.material
        ? "PASS"
        : "FAIL"
      : "UNKNOWN",
    `${request.material || "Unknown"} requested; ${lot.material} recorded by seller`,
  );
  const cents = Number.isInteger(request.quantity)
    ? request.quantity * lot.priceCents + lot.shippingCents
    : null;
  add(
    "Delivered budget",
    Number.isInteger(request.budgetCents) && cents !== null
      ? cents <= request.budgetCents
        ? "PASS"
        : "FAIL"
      : "UNKNOWN",
    `Quote ${cents === null ? "unknown" : money(cents)}; budget ${Number.isInteger(request.budgetCents) ? money(request.budgetCents) : "unknown"}`,
  );
  add(
    "Lead time",
    Number.isInteger(request.maxLeadDays)
      ? lot.leadDays <= request.maxLeadDays
        ? "PASS"
        : "FAIL"
      : "UNKNOWN",
    `${lot.leadDays} business days; allowed ${request.maxLeadDays ?? "unknown"}`,
  );
  add(
    "Additional requirements",
    request.specialRequirements?.length ? "UNKNOWN" : "PASS",
    request.specialRequirements?.length
      ? `Manual evidence required: ${request.specialRequirements.join("; ")}`
      : "No additional requirements declared",
  );
  return {
    verdict: checks.some((x) => x.status === "FAIL")
      ? "FAIL"
      : checks.some((x) => x.status === "UNKNOWN")
        ? "HOLD"
        : "PASS",
    checks,
    totalCents: cents,
  };
}
export function validateExtraction(p, raw, requireEvidence = true) {
  check(p && typeof p === "object", "AI returned no requirements.");
  check(
    ["carton", "mailer", "unknown"].includes(p.category),
    "Invalid category.",
  );
  check(
    p.quantity === null ||
      (Number.isInteger(p.quantity) && p.quantity > 0 && p.quantity <= 100000),
    "Invalid quantity.",
  );
  check(
    p.dimensionsMm === null ||
      (Array.isArray(p.dimensionsMm) &&
        p.dimensionsMm.length === 3 &&
        p.dimensionsMm.every(
          (n) => Number.isInteger(n) && n > 0 && n <= 10000,
        )),
    "Invalid dimensions.",
  );
  check(
    p.toleranceMm === null ||
      (Number.isInteger(p.toleranceMm) &&
        p.toleranceMm >= 0 &&
        p.toleranceMm <= 1000),
    "Invalid tolerance.",
  );
  check(
    p.budgetCents === null ||
      (Number.isInteger(p.budgetCents) &&
        p.budgetCents > 0 &&
        p.budgetCents <= 10000000),
    "Invalid budget.",
  );
  check(
    p.maxLeadDays === null ||
      (Number.isInteger(p.maxLeadDays) &&
        p.maxLeadDays > 0 &&
        p.maxLeadDays <= 365),
    "Invalid lead time.",
  );
  check(
    [null, "kraft-paper", "corrugated-cardboard", "unknown"].includes(
      p.material,
    ),
    "Invalid material.",
  );
  check(
    Array.isArray(p.specialRequirements) &&
      p.specialRequirements.every((x) => typeof x === "string"),
    "Invalid additional requirements.",
  );
  const keys = [
    "category",
    "quantity",
    "dimensionsMm",
    "toleranceMm",
    "budgetCents",
    "maxLeadDays",
    "material",
  ];
  check(
    Array.isArray(p.evidence) &&
      p.evidence.every(
        (e) =>
          keys.includes(e.field) &&
          typeof e.quote === "string" &&
          e.quote.length > 0 &&
          raw.includes(e.quote),
      ),
    "AI evidence did not match your original enquiry. Review the text and try again.",
  );
  if (requireEvidence)
    for (const key of keys)
      if (p[key] !== null && p[key] !== "unknown")
        check(
          p.evidence.some((e) => e.field === key),
          `AI did not supply source evidence for ${key}.`,
        );
  return p;
}
export function newQuote(s, body, now = Date.now()) {
  const lot = stock(s, body.lotId),
    inquiry = s.inquiries.find((x) => x.id === body.inquiryId);
  check(inquiry, "Enquiry not found", 404);
  check(
    inquiry.source === "seed" || inquiry.reviewed === true,
    "Review and confirm the AI extraction before issuing a quote.",
  );
  const result = qualify(lot, inquiry.requirements, available(s, lot.id));
  check(
    result.verdict === "PASS",
    "Resolve failed or unknown requirements before issuing a quote.",
  );
  const qty = body.quantity ?? inquiry.requirements.quantity;
  check(
    Number.isInteger(qty) && qty === inquiry.requirements.quantity,
    "Quote quantity must match the reviewed customer request.",
  );
  const unit = body.unitCents ?? lot.priceCents;
  check(
    Number.isInteger(unit) && unit >= lot.floorCents && unit <= lot.priceCents,
    "Unit price must be between the merchant price floor and listed price.",
  );
  const total = unit * qty + lot.shippingCents;
  check(
    total <= inquiry.requirements.budgetCents,
    "Quote exceeds the customer budget.",
  );
  const token = randomUUID() + randomUUID();
  const q = {
    id: randomUUID(),
    lotId: lot.id,
    inquiryId: inquiry.id,
    customer: inquiry.customer,
    quantity: qty,
    unitCents: unit,
    shippingCents: lot.shippingCents,
    totalCents: total,
    currency: "USD",
    status: "OPEN",
    tokenHash: hash(token),
    createdAt: now,
    expiresAt: now + 30 * 60000,
    createRequestId: randomUUID(),
    captureRequestId: randomUUID(),
    approvedAt: null,
    orderId: null,
    captureId: null,
    leaseUntil: 0,
  };
  s.quotes.push(q);
  audit(s, "QUOTE_ISSUED", q.id, `${qty} units · ${money(total)}`);
  return { quote: q, token };
}
export function audit(s, event, reference, detail) {
  s.events.unshift({
    id: randomUUID(),
    at: new Date().toISOString(),
    event,
    reference,
    detail,
  });
  s.events = s.events.slice(0, 250);
}
export function seed() {
  const base = {
    category: "carton",
    quantity: 200,
    dimensionsMm: [300, 200, 150],
    toleranceMm: 0,
    material: "corrugated-cardboard",
    budgetCents: 20000,
    maxLeadDays: 5,
    specialRequirements: [],
    evidence: [],
  };
  return {
    inventory: [
      {
        id: "kraft-300",
        name: "Plain kraft shipping cartons",
        sku: "BX-300-K",
        category: "carton",
        material: "corrugated-cardboard",
        dimensionsMm: [300, 200, 150],
        quantity: 240,
        priceCents: 80,
        floorCents: 65,
        shippingCents: 1200,
        leadDays: 2,
        ageDays: 96,
        description:
          "Unprinted kraft corrugated cardboard shipping boxes for dry non-hazardous goods. Seller-entered dimensions 300 × 200 × 150 mm. No special certifications documented.",
      },
      {
        id: "mailer-250",
        name: "Paper shipping mailers",
        sku: "PM-250",
        category: "mailer",
        material: "kraft-paper",
        dimensionsMm: [250, 180, 30],
        quantity: 600,
        priceCents: 45,
        floorCents: 35,
        shippingCents: 900,
        leadDays: 3,
        ageDays: 72,
        description:
          "Plain kraft paper postal envelopes, 250 × 180 × 30 mm. No water resistance or certification claims.",
      },
    ],
    inquiries: [
      {
        id: "north",
        customer: "North & Pine Studio",
        text: "We need 200 unprinted corrugated cardboard shipping cartons, exactly 300 x 200 x 150 mm, under $200 including delivery. Delivery within 5 business days. No extra certifications needed.",
        requirements: { ...base },
        source: "seed",
      },
      {
        id: "oak",
        customer: "Oak Market",
        text: "Need 500 corrugated cardboard cartons, 300 x 200 x 150 mm, within 5 business days. Budget $450 delivered. No extra certifications.",
        requirements: { ...base, quantity: 500, budgetCents: 45000 },
        source: "seed",
      },
      {
        id: "morrow",
        customer: "Morrow Goods",
        text: "Need 100 corrugated cardboard boxes, exactly 300 x 200 x 150 mm. $120 delivered, within 5 business days. Must carry a documented FSC certification.",
        requirements: {
          ...base,
          quantity: 100,
          budgetCents: 12000,
          specialRequirements: ["Documented FSC certification"],
        },
        source: "seed",
      },
      {
        id: "atlas",
        customer: "Atlas Prints",
        text: "Need 300 kraft paper postal mailers, exactly 250 x 180 x 30 mm. Budget $160 delivered, within 4 business days. No extra certifications needed.",
        requirements: {
          ...base,
          category: "mailer",
          quantity: 300,
          dimensionsMm: [250, 180, 30],
          material: "kraft-paper",
          budgetCents: 16000,
          maxLeadDays: 4,
        },
        source: "seed",
      },
    ],
    quotes: [],
    events: [],
    usage: {},
  };
}
