# Validation record

Updated November 7, 2026.

## Passed

- Frontend build with esbuild and installed AG Grid Community.
- JavaScript syntax checks.
- 17 automated tests: qualification, unknown requirements, price floor, source excerpts, merchant review gate, exact customer approval, overselling prevention, duplicate capture allocation, uncertain capture reconciliation, cancellation, expired checkout, PayPal amount/merchant/reference validation, workspace token isolation, HTTP session/origin checks, SQLite rollback and restart persistence, production startup guards.
- HTTP integration tests run with local socket permission. The sandbox's initial EACCES failure was an environment restriction; the same tests passed with socket access.
- Actual browser walkthrough: open isolated sample workspace, inspect AG Grid rows and stock, prepare $172 quote, generate private link, open customer quote and record exact approval. PayPal button was correctly disabled because credentials were absent.
- Desktop dashboard screenshot captured in the parent outputs folder.
- Public Render deployment reached Live at https://batchbridge-5e6h.onrender.com. Verified hosted demo entry, AG Grid display, $172 quote creation, private customer quote loading, customer approval and quote persistence after browser reload.
- Render PostgreSQL read-only inspection confirmed one stored quote in the app's workspaces table. This verifies actual hosted basic reads/writes, not full load or failure-recovery testing.
- Public MIT source: https://github.com/Poornasri2003/batchbridge. Optional CI is saved under ci/ because the current publishing token lacks workflow-writing permission.

## Not yet verified

- A real Hugging Face or xAI model call (no credentials configured).
- Elastic Cloud ingestion, inference and semantic search (no credentials configured).
- PayPal sandbox create, buyer approval, capture and readback against actual PayPal (no credentials configured). Fake-provider tests are not live payment tests.
- PostgreSQL full rollback/concurrency smoke script against a disposable actual database. Basic hosted reads/writes have passed.
- Docker image build/runtime.
- Persistence across an actual Render restart/redeploy. Browser reload persistence and hosted walkthrough have passed.
- Postman collection execution in Postman.
- Mobile browser layout and keyboard/screen-reader audit.
- APIMatic and AG Studio: not implemented, no usage claimed.

The included implementation and deployment configuration are not a claim of production readiness. Complete provider and hosted verification before recording a successful end-to-end submission demo.
