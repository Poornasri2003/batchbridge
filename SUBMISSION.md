# BatchBridge — draft submission

## Tagline

Find the demand hiding behind surplus stock. Match with evidence, approve a quote, and close the sale through PayPal.

## Business problem

Small wholesalers can have unsold stock and customer requests in separate spreadsheets and messages. Matching needs by hand takes time, and a superficially similar request may fail quantity, dimensions, budget or delivery requirements. BatchBridge explores a focused way to connect that existing demand to the merchant's inventory.

## What it does

A merchant imports packaging inventory and customer enquiries. AI extracts requirements with source excerpts; the merchant reviews and corrects the fields. Elasticsearch retrieves matching enquiries by keywords and meaning. Deterministic checks evaluate quantity, dimensions, material, budget, lead time and missing special-condition evidence. A reviewed, qualified match becomes an exact private quote. The customer approves and pays using PayPal sandbox checkout. The server verifies the capture and allocates stock exactly once, with a transaction ledger.

## Tools

Document the actual configured and tested AI provider/model before submitting. The implementation supports Hugging Face Inference Providers and xAI/Grok, Elasticsearch semantic_text search, PayPal OAuth/Orders v2, AG Grid Community, Node.js, PostgreSQL/SQLite and Render deployment configuration. A Postman collection is included. Do not list an integration as live-tested if it was not run. APIMatic and AG Studio are not currently used.

## Distinctive focus

The merchant starts with surplus stock and asks which existing requests it can satisfy. Matching is followed by concrete qualification, approval and payment. Search similarity is never treated as proof of suitability, and an AI extraction is never permission to charge.

## Demo script — target 2:45

- 0:00–0:20: “A wholesaler has cartons sitting on the shelf and customer enquiries in another file. Which request can become an order today?” Show fictional stock.
- 0:20–0:55: Add a fresh enquiry and call the real AI provider. Review quantities and source excerpts; confirm extracted fields.
- 0:55–1:20: Run real Elastic search. Show a qualified request, a 500-unit request that fails stock, and a certification requirement that stays on hold.
- 1:20–1:45: Review the $172 quote, issue the private link, and approve it as the test customer.
- 1:45–2:20: Complete actual PayPal sandbox buyer approval; return and capture/verify. Show order and capture references without secrets.
- 2:20–2:45: Refresh merchant view: 40 cartons available and $172 sandbox paid order value. Explain fictional data, single merchant, no real fulfillment and next validation step.

Record only after all external steps really work. Never replace a failing API result with an unlabelled simulation. Avoid quantified savings, conversion, customer adoption or environmental claims without evidence.

## Submission checklist

- [ ] Confirm eligibility of all actual teammates and register on Devpost.
- [ ] Public source repository with MIT license and complete run instructions.
- [ ] Working demo access and appropriate test buyer instructions.
- [ ] Tested AI extraction and Elastic search.
- [ ] Verified actual PayPal sandbox payment; retain redacted evidence.
- [ ] English description and testing instructions.
- [ ] Public YouTube video under three minutes, showing the real flow.
- [ ] Honest tools statement and limitations.
- [ ] Demo services remain available through December 15, 2026.
- [ ] Submit by November 12 noon PST / November 13 1:30 a.m. IST; aim earlier.

Official rules: https://paypalaihackathon.devpost.com/rules
