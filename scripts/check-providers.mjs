import { createProviders } from "../src/providers.mjs";
import { seed } from "../src/domain.mjs";
const providers = createProviders();
const c = providers.config();
console.log(
  "Provider readiness (no secret values printed):",
  JSON.stringify(c, null, 2),
);
let failed = false;
if (c.ai.configured) {
  try {
    const r = await providers.extract(
      "We need 200 unprinted corrugated cardboard shipping cartons, exactly 300 x 200 x 150 mm, under $200 including delivery. Delivery within 5 business days. No extra certifications needed.",
    );
    console.log(
      "AI extraction + source evidence: PASS; extracted quantity",
      r.quantity,
    );
  } catch (e) {
    failed = true;
    console.log("AI: FAIL —", e.message);
  }
} else {
  failed = true;
  console.log("AI: NOT CONFIGURED");
}
if (c.elastic) {
  try {
    const workspace = "provider-check";
    await providers.indexWorkspace(workspace, seed());
    const r = await providers.search(workspace, seed().inventory[0]);
    console.log("Elastic keyword + semantic query: PASS; results", r.length);
  } catch (e) {
    failed = true;
    console.log("Elastic: FAIL —", e.message);
  }
} else {
  failed = true;
  console.log("Elastic: NOT CONFIGURED");
}
console.log(
  "PayPal: complete a real sandbox buyer checkout in the UI to verify create/capture/readback. Presence of keys alone is not a passed payment test.",
);
if (!c.paypal) failed = true;
process.exitCode = failed ? 1 : 0;
