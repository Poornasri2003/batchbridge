# Poorna: start and deploy BatchBridge

The app code is built. To enable live services, you need your own accounts. Do not send passwords, payment details or API secrets in chat.

**Your preview is deployed:** https://batchbridge-5e6h.onrender.com. Click Open demo workspace. Source is at https://github.com/Poornasri2003/batchbridge. Hosting setup below is retained for reference; do not create duplicate Render resources. Add keys to the existing service's Environment settings instead.

## Recommended setup

- **Render** hosts the Node app and PostgreSQL database.
- **Hugging Face Inference Providers** runs AI via API. You do not download a model. Grok/xAI is an alternative; you only need one AI provider.
- **Elastic Cloud** performs keyword + semantic matching.
- **PayPal sandbox** performs test checkout with no real money.
- **GitHub** stores public source code and feeds deployments.

This setup does not need a GPU server. A Hugging Face Space can also host the supplied Docker image, but it still needs persistent external PostgreSQL, environment secrets and a canonical public APP_URL. Render's public preview and PostgreSQL basic reads/writes have been verified; live AI, Elastic and payment credentials remain to be configured and tested.

## Step 1 — try the local app

If the preview started by the agent is still running, visit http://localhost:3002. Otherwise open a terminal in this folder and run:

```powershell
npm ci --include=dev
npm run build
npm start
```

Open http://localhost:3001. Click Open demo workspace. Select the cartons. Click Oak Market to see insufficient stock; click Morrow Goods to see missing certification evidence; click North & Pine Studio to prepare the $172 quote. Open the customer quote link and approve. Payment remains disabled until sandbox credentials are configured.

## Step 2 — create the AI token

1. Sign in or create an account at https://huggingface.co.
2. Open https://huggingface.co/settings/tokens. Create a fine-grained token with permission to call Inference Providers. Keep the token private.
3. Open https://huggingface.co/playground and select a model/provider available to your account that supports JSON-schema structured output. Provider availability changes. Check gated-model access and available inference credits/billing.
4. Set AI_PROVIDER to huggingface, HF_TOKEN to the token, and HF_MODEL to the exact model/provider identifier.
5. In local use, copy .env.example to .env and edit it in your editor. In Render, use the service's Environment settings.
6. Run `npm run providers` to validate extraction and evidence. If the provider rejects the schema or model, choose an explicitly supported provider/model. There is no silent lower-quality fallback.

Alternative Grok: use https://console.x.ai, create an API key, choose an available structured-output-capable model, and set AI_PROVIDER=xai, XAI_API_KEY and XAI_MODEL. Do not confuse Grok (xAI) with Groq (a separate inference provider).

## Step 3 — create Elastic project

1. Start from the hackathon offer at https://paypalaihackathon.devpost.com/details/elastic.
2. Create a Search or Vector Search / Vector Database project.
3. Copy the Elasticsearch HTTPS endpoint and create an API key with app-index create/write/read permissions.
4. Set ELASTICSEARCH_URL and ELASTICSEARCH_API_KEY. Use the default app index name unless you intentionally change it.
5. Ensure semantic inference works in the project. Set ELASTIC_INFERENCE_ID only if your cluster requires an explicit available endpoint.
6. Click Find demand with Elastic. The first call creates the index and embeds sample enquiries. This may consume credits and take longer than later queries.

The sponsor page describes a 14-day trial and an extension request. Arrange service availability through December 15; a trial ending before judging is not sufficient.

## Step 4 — configure PayPal test accounts

1. Sign into https://developer.paypal.com/dashboard.
2. Open Testing Tools → Sandbox Accounts. Create or use a Business seller and a different Personal buyer.
3. Under Apps & Credentials, select Sandbox and create a REST app for the business seller.
4. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET from that sandbox app.
5. Find the business seller's sandbox Merchant ID / account ID and set PAYPAL_MERCHANT_ID. It is not the email and not the client ID.
6. Retain the personal test buyer's email and password for sandbox checkout. Never enter your real payment credentials into a demo recording.
7. Use account country/currency settings supported by your sandbox flow. If dashboard login or an API is blocked, record the exact error and ask PayPal's hackathon support; do not assume another account fixes eligibility or permissions.

The normal test is personal buyer → business seller. Casual-sale or personal-to-personal toggles are not required for this checkout. Official guide: https://developer.paypal.com/sandbox-testing/accounts.

## Step 5 — publish code to GitHub

The repository root must contain package.json, render.yaml, README.md, LICENSE, src/, web/, scripts/, test/ and package-lock.json. Do not upload node_modules/, data/, dist/ or .env.

If GitHub integration is connected in chat, the agent can help publish. Otherwise create a new repository named batchbridge, then upload the source files or use Git in your editor. Keep it public and MIT-licensed for submission. The downloadable ZIP excludes secrets and runtime records.

## Step 6 — deploy on Render

1. Sign into https://dashboard.render.com (GitHub sign-in is convenient).
2. Connect the repository. Choose New → Blueprint and select batchbridge with render.yaml at the repository root.
3. Review the plan. **render.yaml uses free plans for an initial preview.** The database expires after 30 days; arrange a lasting database before judging. render.judging.yaml is the paid-plan alternative and requires a price/credit review. Nothing in the local source creates a paid account automatically.
4. The free preview generates SESSION_SECRET and a merchant password. Start with Open demo workspace. In Render Environment, set your own ADMIN_EMAIL and ADMIN_PASSWORD privately if you want merchant login. Add the AI, Elastic and PayPal secrets there; blank defaults leave those integrations explicitly unconfigured. If setting up with render.judging.yaml, enter its requested merchant login/provider values and review prices first.
5. Review and apply the plan. Wait for the service deployment to report Live.
6. The database connection is injected automatically. Render supplies PORT and RENDER_EXTERNAL_URL. With a custom domain, add APP_URL=https://your-domain and redeploy.
7. Open the HTTPS app URL in a fresh browser and repeat the walkthrough. Make sure the health path /healthz reports ok. Check logs for startup failures without sharing secret values.

Manual setup if you do not use Blueprints: create PostgreSQL, then a Node web service in the same region. Set DATABASE_URL to its internal connection string. Build command: `npm ci --include=dev && npm run build`. Start command: `npm start`. Set NODE_VERSION=24, NODE_ENV=production, SESSION_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD and service keys from .env.example. Health check: /healthz.

Render free web apps sleep when idle; free PostgreSQL expires after 30 days. A free database created November 7 would expire before December 15 judging ends. Use sufficient sponsor credits or a suitable non-expiring plan/database. Do not leave a public demo dependent on expired trials.

## Step 7 — verify the real demo

1. Add a fresh enquiry and run AI extraction, then review and confirm each requirement.
2. Run Elastic search. Confirm the page identifies live Elastic search and fails honestly if its API is unavailable.
3. Issue the customer quote and open it.
4. Approve the exact quote. Continue to PayPal sandbox and pay as the separate test buyer.
5. Return and click Confirm approved PayPal payment. Verify PAID plus the capture ID.
6. Refresh merchant workspace. For the sample carton order, stock becomes 40 units. Paid order value becomes $172.
7. Repeat confirmation and reload to verify stock is not deducted twice. Restart/redeploy and confirm records persist.
8. Record an English video under three minutes, publish it publicly on YouTube, and add repo/demo/video links to Devpost. Keep the live demo usable through judging.

## What still requires your action

Account sign-in, provider tokens and sandbox configuration must come from you. The agent can prepare deployment changes and inspect build failures once access is connected. Do not claim successful live integrations, deployment, Postman execution, APIMatic usage or real customers until actually verified.

## References

- HF inference: https://huggingface.co/docs/inference-providers/tasks/chat-completion
- HF structured output: https://huggingface.co/docs/inference-providers/guides/structured-output
- Render deployment: https://render.com/docs/deploy-node-express-app
- Render free limits: https://render.com/docs/free
- Official rules: https://paypalaihackathon.devpost.com/rules
