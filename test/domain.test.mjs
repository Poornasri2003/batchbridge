import { test } from "node:test";
import assert from "node:assert/strict";
import {
  seed,
  qualify,
  newQuote,
  available,
  validateExtraction,
} from "../src/domain.mjs";
test("qualifies exact sample at $172, rejects excess quantity and holds missing certification", () => {
  const s = seed(),
    l = s.inventory[0];
  assert.equal(qualify(l, s.inquiries[0].requirements, 240).totalCents, 17200);
  assert.equal(qualify(l, s.inquiries[0].requirements, 240).verdict, "PASS");
  assert.equal(qualify(l, s.inquiries[1].requirements, 240).verdict, "FAIL");
  assert.equal(qualify(l, s.inquiries[2].requirements, 240).verdict, "HOLD");
});
test("missing dimensions or budget cannot silently qualify", () => {
  const s = seed(),
    r = s.inquiries[0].requirements;
  for (const key of [
    "dimensionsMm",
    "budgetCents",
    "quantity",
    "maxLeadDays",
    "material",
  ]) {
    const changed = { ...r, [key]: null };
    assert.notEqual(qualify(s.inventory[0], changed, 240).verdict, "PASS");
  }
});
test("quote amounts are computed by server, floor enforced, and token stored as hash", () => {
  const s = seed();
  assert.throws(() =>
    newQuote(s, { lotId: "kraft-300", inquiryId: "north", unitCents: 1 }),
  );
  const { quote, token } = newQuote(s, {
    lotId: "kraft-300",
    inquiryId: "north",
    totalCents: 1,
  });
  assert.equal(quote.totalCents, 17200);
  assert.notEqual(quote.tokenHash, token);
  assert.equal(available(s, "kraft-300"), 240);
  quote.status = "AWAITING_PAYMENT";
  assert.equal(available(s, "kraft-300"), 40);
});
test("AI requirements must be reviewed before quoting", () => {
  const s = seed();
  s.inquiries[0].source = "ai";
  assert.throws(
    () => newQuote(s, { lotId: "kraft-300", inquiryId: "north" }),
    /Review/,
  );
});
test("fabricated evidence and missing evidence are rejected", () => {
  const p = { ...seed().inquiries[0].requirements };
  assert.throws(
    () =>
      validateExtraction(
        { ...p, evidence: [{ field: "quantity", quote: "invented" }] },
        "Need 200 cartons",
      ),
    /evidence/,
  );
  assert.throws(
    () => validateExtraction(p, "Need 200 cartons"),
    /source evidence/,
  );
});
test("material and lead time mismatches fail even if descriptions match", () => {
  const s = seed(),
    r = s.inquiries[0].requirements;
  assert.equal(
    qualify(s.inventory[0], { ...r, material: "kraft-paper" }, 240).verdict,
    "FAIL",
  );
  assert.equal(
    qualify(s.inventory[0], { ...r, maxLeadDays: 1 }, 240).verdict,
    "FAIL",
  );
});
