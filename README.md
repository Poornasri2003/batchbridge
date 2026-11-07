# BatchBridge

Match surplus packaging stock to customer enquiries, review the evidence, issue an exact quote, and complete a PayPal sandbox checkout.

## Start locally

Node.js 24 LTS recommended (minimum 22.13). No Python, model download, or GPU required.

```powershell
npm ci --include=dev
npm run build
Copy-Item .env.example .env
npm start
```

Open http://localhost:3001 and click **Open demo workspace**. Sample inventory, qualification checks, quote creation, and customer approval work without service keys. Live AI, Elastic search and PayPal checkout do not silently simulate their APIs; missing configuration is shown explicitly. Startup may show Node's SQLite experimental warning; hosted storage uses PostgreSQL.

## Deploy

Read **START-HERE.md** for account setup and exact Render steps. The included `render.yaml` provisions a Node web service and PostgreSQL with paid plans. Review Render's prices/credits before applying. HF can be used for AI inference while Render hosts the application. The Dockerfile supports alternative container hosting, including Hugging Face Docker Spaces with external PostgreSQL and HTTPS APP_URL.

## AI provider

Choose one:

- Hugging Face: `AI_PROVIDER=huggingface`, `HF_TOKEN`, `HF_MODEL`. Select an inference provider/model supporting JSON-schema structured output; use an explicit `model:provider` identifier if required. Availability, gated-model access, and billing depend on the account/provider.
- Grok: `AI_PROVIDER=xai`, `XAI_API_KEY`, `XAI_MODEL`. Select a structured-output-capable model available to the key.

The server calls HTTPS APIs using native fetch. Keys never go to the browser. Enquiry text is transmitted to the configured provider only when AI extraction is requested. Output is structurally validated; every AI source quote must occur in the original text, and every non-null extracted field needs evidence. Source matching verifies provenance, not that an interpretation is correct; merchant review is required before quoting. Corrections are labelled merchant-entered.

## Elastic Cloud

Use a Search/Vector Database project with semantic inference enabled. Set `ELASTICSEARCH_URL` to the HTTPS Elasticsearch endpoint, `ELASTICSEARCH_API_KEY` to an API key permitted to create/write/search the app index, and optionally `ELASTIC_INFERENCE_ID` to an available semantic endpoint. Scope keys to the `batchbridge-inquiries` index where possible. The first Elastic search creates mappings and indexes enquiries as text and semantic_text, scoped by workspace. The query combines lexical and semantic clauses in a filtered bool query. Relevance scores are not probability or suitability. On failure, a clear error is displayed; the app does not relabel local matching as Elastic.

Search documents are derived from operational records. PostgreSQL, not Elastic, controls stock and payments. The demo reindexes up to 100 enquiries on search; this is intentionally small-scale and not an optimized production ingestion pipeline.

## PayPal sandbox

Create a sandbox business seller and separate sandbox personal buyer. Register a REST sandbox app for the seller. Set `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, and `PAYPAL_MERCHANT_ID` (seller's actual sandbox merchant account ID, not its client ID or email). USD demo fixtures and test accounts must be compatible. This is merchant checkout, not a personal-to-personal transfer. All calls are hard-coded to `api-m.sandbox.paypal.com`.

Customer approval precedes checkout. Creating checkout transactionally reserves inventory and stores stable request IDs. The server creates a PayPal Orders v2 CAPTURE order. After the buyer approves on PayPal, they return and click **Confirm approved PayPal payment**. The server captures and then independently reads the order, checking completed status, quote reference, merchant, currency and amount. Only then is stock allocated and the quote marked PAID.

Duplicate/uncertain requests use stable PayPal request IDs and recovery reads. A cancelled local checkout cannot capture via this app. An uncertain attempt keeps its reservation until resolved. No webhook or automatic refund support is claimed. Do not retry unknown attempts days later: PayPal idempotency retention is finite. Reconcile in PayPal and keep the reservation until the outcome is known.

## Data and access

Local runs use `data/batchbridge.sqlite`; production refuses to start without PostgreSQL, a >=32-character session secret, and merchant credentials with a >=12-character password. Hosted cookies are HttpOnly, Secure and SameSite=Lax. Browser POST requests are checked against APP_URL. Use the canonical configured URL.

Every demo workspace is isolated by a signed eight-hour session. Private quote links use high-entropy tokens, with only hashes stored server-side; link possession is the prototype's customer-access mechanism, not verified identity. Quoting does not email or otherwise message customers. Link copies are held only in the merchant tab's sessionStorage, not recovered as plaintext by the server. Keep the link at issuance. Quotes are immutable; issue a new quote for changed terms.

PostgreSQL stores one JSONB document per workspace, serialized under a row lock. This small demo design makes reservation transitions atomic across processes without holding transactions during external calls. It is not a high-volume inventory schema. PostgreSQL and SQLite adapters share transaction behavior. Demo workspaces are not automatically purged. Rate limits protect sessions and search, and persisted global/hourly AI quotas constrain provider spend. A production deployment needs broader abuse controls, retention policy, operational recovery tooling, real merchant onboarding, fulfillment and tax handling.

## Verification

```powershell
npm run check
npm test
npm run providers
```

`npm test` uses fake PayPal responses and local HTTP/SQLite checks. Those tests do not establish live API success. `npm run providers` sends a live AI request and indexes/queries fictional records in Elastic if configured. It can consume provider credits. A real sandbox buyer checkout is still required to validate PayPal end-to-end. A PostgreSQL adapter check is available via `npm run test:postgres` when `TEST_DATABASE_URL` points to a disposable test database.

See `VALIDATION.md` for actual checks run in this session and remaining verification.

## Tools actually implemented

- Hugging Face / xAI HTTP adapter, strict schema and evidence validation.
- Elasticsearch semantic_text ingestion and combined keyword/semantic query.
- PayPal OAuth, Orders create, capture and authoritative readback.
- AG Grid Community module, sorting, quick filtering and CSV export.
- Render Blueprint, PostgreSQL adapter, Dockerfile.
- Postman collection with environment placeholders; execution status recorded separately.

APIMatic and AG Studio have not been integrated. Do not claim their use or award readiness. Bryntum, Channel3, Kernel, Zapier and Astropods are outside the implemented MVP.

## License

MIT. Third-party packages retain their own licenses. All sample businesses, inventory, prices and requests are fictional. No real inventory, merchant income, environmental impact or customer adoption is claimed.
