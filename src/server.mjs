import http from "node:http";
import { readFile } from "node:fs/promises";
import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { pathToFileURL } from "node:url";
import { createStore } from "./store.mjs";
import { createProviders } from "./providers.mjs";
import { createPayments, publicQuote } from "./payments.mjs";
import {
  AppError,
  check,
  hash,
  stock,
  available,
  qualify,
  newQuote,
  audit,
  validateExtraction,
} from "./domain.mjs";
const root = new URL("../", import.meta.url);
const equal = (a, b) =>
  timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
export async function createApp(env = process.env, options = {}) {
  const production = env.NODE_ENV === "production";
  if (production) {
    check(
      env.SESSION_SECRET?.length >= 32,
      "Hosting requires SESSION_SECRET with at least 32 characters.",
    );
    check(
      env.ADMIN_EMAIL && env.ADMIN_PASSWORD?.length >= 12,
      "Hosting requires ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters.",
    );
    check(
      env.DATABASE_URL || options.store,
      "Hosting requires persistent PostgreSQL DATABASE_URL.",
    );
  }
  const secret = env.SESSION_SECRET || randomBytes(32).toString("hex");
  const appUrl = (
    env.APP_URL ||
    env.RENDER_EXTERNAL_URL ||
    `http://localhost:${env.PORT || 3001}`
  ).replace(/\/$/, "");
  if (production)
    check(appUrl.startsWith("https://"), "Hosted APP_URL must use HTTPS.");
  const store = options.store || (await createStore(env.DATABASE_URL));
  const providers = options.providers || createProviders(env);
  const payments = createPayments(store, providers, appUrl);
  await store.create("merchant");
  await store.create("system");
  const sign = (s) =>
    createHmac("sha256", secret).update(s).digest("base64url");
  const session = (req) => {
    try {
      const raw = (req.headers.cookie || "")
        .split(";")
        .map((x) => x.trim())
        .find((x) => x.startsWith("bb_session="))
        ?.slice(11);
      if (!raw) return null;
      const [payload, sig] = raw.split(".");
      if (!sig || !equal(sig, sign(payload))) return null;
      const s = JSON.parse(Buffer.from(payload, "base64url").toString());
      return s.exp > Date.now() ? s : null;
    } catch {
      return null;
    }
  };
  const cookie = (res, s) => {
    const payload = Buffer.from(
      JSON.stringify({ ...s, exp: Date.now() + 8 * 3600000 }),
    ).toString("base64url");
    res.setHeader(
      "Set-Cookie",
      `bb_session=${payload}.${sign(payload)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${production ? "; Secure" : ""}`,
    );
  };
  const limits = new Map();
  const limit = (key, n, ms) => {
    const now = Date.now();
    let item = limits.get(key);
    if (!item || item.until < now) {
      item = { count: 0, until: now + ms };
      limits.set(key, item);
    }
    check(
      ++item.count <= n,
      "Too many attempts. Please wait and try again.",
      429,
    );
    if (limits.size > 10000)
      for (const [k, v] of limits) if (v.until < now) limits.delete(k);
  };
  const files = {
    "/": ["dist/index.html", "text/html; charset=utf-8"],
    "/app.js": ["dist/app.js", "text/javascript; charset=utf-8"],
    "/style.css": ["dist/style.css", "text/css; charset=utf-8"],
  };
  const server = http.createServer(async (req, res) => {
    const send = (status, data) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(data));
    };
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    try {
      const url = new URL(req.url, appUrl),
        path = url.pathname;
      if (req.method === "GET" && path === "/healthz") {
        await store.read("system");
        return send(200, {
          status: "ok",
          app: "BatchBridge",
          storage: store.kind,
        });
      }
      if (req.method === "GET" && files[path]) {
        const [file, type] = files[path];
        res.writeHead(200, {
          "Content-Type": type,
          "Cache-Control": "no-cache",
        });
        return res.end(await readFile(new URL(file, root)));
      }
      check(path.startsWith("/api/"), "Not found", 404);
      const sess = session(req),
        ip = req.socket.remoteAddress;
      limit("all:" + ip, 240, 60000);
      let body = {};
      if (req.method === "POST") {
        if (req.headers.origin)
          check(req.headers.origin === appUrl, "Request origin rejected.", 403);
        check(
          req.headers["content-type"]?.startsWith("application/json"),
          "Send JSON request bodies.",
          415,
        );
        let text = "";
        for await (const chunk of req) {
          text += chunk;
          if (text.length > 250000)
            throw new AppError("Request too large.", 413);
        }
        try {
          body = JSON.parse(text || "{}");
        } catch {
          throw new AppError("Invalid JSON request.");
        }
      }
      if (req.method === "GET" && path === "/api/config")
        return send(200, {
          ...providers.config(),
          session: sess ? { demo: sess.demo, workspace: sess.workspace } : null,
          demoEnabled: env.DEMO_MODE !== "false",
          storage: store.kind,
          local: !production,
        });
      if (req.method === "POST" && path === "/api/demo") {
        check(env.DEMO_MODE !== "false", "Public demo is disabled.", 403);
        limit("demo:" + ip, 8, 3600000);
        const workspace = randomUUID();
        await store.create(workspace);
        cookie(res, { workspace, demo: true });
        return send(201, { ok: true });
      }
      if (req.method === "POST" && path === "/api/login") {
        limit("login:" + ip, 8, 15 * 60000);
        check(
          env.ADMIN_PASSWORD &&
            equal(body.email || "", env.ADMIN_EMAIL || "") &&
            equal(body.password || "", env.ADMIN_PASSWORD),
          "Invalid merchant login.",
          401,
        );
        cookie(res, { workspace: "merchant", demo: false });
        return send(200, { ok: true });
      }
      if (req.method === "POST" && path === "/api/logout") {
        res.setHeader(
          "Set-Cookie",
          "bb_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
        );
        return send(200, { ok: true });
      }
      const publicPath = path.match(
        /^\/api\/quote\/([\w-]+)\/([\w-]+)(?:\/(approve|checkout|capture|refresh|cancel))?$/,
      );
      if (publicPath) {
        const [, workspace, token, action] = publicPath;
        limit("quote:" + hash(token), 50, 60000);
        if (req.method === "GET" && !action)
          return send(200, {
            quote: await payments.view(workspace, token),
            paypal: providers.config().paypal,
          });
        check(req.method === "POST" && action, "Not found.", 404);
        const handlers = {
          approve: () => payments.approve(workspace, token, body),
          checkout: () => payments.create(workspace, token),
          capture: () => payments.capture(workspace, token),
          refresh: () => payments.reconcile(workspace, token),
          cancel: () => payments.cancel(workspace, token),
        };
        return send(200, { quote: await handlers[action]() });
      }
      check(sess, "Open a demo workspace or sign in first.", 401);
      const ws = sess.workspace;
      if (req.method === "GET" && path === "/api/state") {
        const s = await store.read(ws);
        return send(200, {
          inventory: s.inventory.map((l) => ({
            ...l,
            available: available(s, l.id),
          })),
          inquiries: s.inquiries,
          quotes: s.quotes.map((q) => publicQuote(s, q)),
          events: s.events,
          demo: sess.demo,
        });
      }
      if (req.method === "POST" && path === "/api/inquiries") {
        check(
          typeof body.customer === "string" &&
            body.customer.trim().length > 0 &&
            body.customer.length <= 100,
          "Enter a customer name (max 100 characters).",
        );
        check(
          typeof body.text === "string" &&
            body.text.length >= 30 &&
            body.text.length <= 12000,
          "Enquiry text must be 30–12,000 characters.",
        );
        // Persist both global and workspace quotas before invoking a billable model.
        const quota = Number(env.MAX_AI_CALLS_PER_HOUR || 30);
        check(
          Number.isInteger(quota) && quota >= 1 && quota <= 10000,
          "Invalid model quota configuration.",
          500,
        );
        for (const id of ["system", ws])
          await store.mutate(id, (s) => {
            const hour = new Date().toISOString().slice(0, 13);
            if (s.usage.hour !== hour) s.usage = { hour, count: 0 };
            check(
              s.usage.count < quota,
              "AI hourly quota reached. Try later.",
              429,
            );
            s.usage.count++;
          });
        const requirements = await providers.extract(body.text);
        const inquiry = {
          id: randomUUID(),
          customer: body.customer.trim(),
          text: body.text,
          requirements,
          source: "ai",
          provider: providers.config().ai.provider,
          createdAt: new Date().toISOString(),
        };
        await store.mutate(ws, (s) => {
          check(
            s.inquiries.length < 100,
            "Demo workspace enquiry limit reached.",
          );
          s.inquiries.push(inquiry);
          audit(
            s,
            "AI_EXTRACTED",
            inquiry.id,
            "Requirements extracted; source quotes validated. Semantic interpretation still requires merchant review.",
          );
        });
        return send(201, inquiry);
      }
      if (req.method === "POST" && path === "/api/search") {
        const s = await store.read(ws),
          lot = stock(s, body.lotId);
        let ranked, mode;
        if (body.mode === "elastic") {
          limit("elastic:" + ws, 10, 3600000);
          await providers.indexWorkspace(ws, s);
          ranked = await providers.search(ws, lot);
          mode = "Elastic keyword + semantic search";
        } else {
          ranked = s.inquiries.map((i) => ({ id: i.id, score: 0 }));
          mode = "All enquiries · local qualification (not semantic search)";
        }
        const candidates = ranked
          .map((r) => {
            const i = s.inquiries.find((i) => i.id === r.id);
            if (!i) return null;
            return {
              ...i,
              score: r.score,
              qualification: qualify(lot, i.requirements, available(s, lot.id)),
            };
          })
          .filter(Boolean);
        return send(200, { mode, candidates });
      }
      if (req.method === "POST" && path === "/api/inquiries/review") {
        const result = await store.mutate(ws, (s) => {
          const i = s.inquiries.find((i) => i.id === body.id);
          check(i, "Enquiry not found.", 404);
          check(body.confirmed === true, "Confirm your reviewed requirements.");
          const requirements = validateExtraction(
            body.requirements,
            i.text,
            false,
          );
          i.requirements = requirements;
          i.reviewed = true;
          i.reviewedAt = new Date().toISOString();
          i.editedByMerchant = true;
          audit(
            s,
            "REQUIREMENTS_REVIEWED",
            i.id,
            "Merchant reviewed and confirmed extracted fields. Corrections are merchant-entered, not independently verified.",
          );
          return i;
        });
        return send(200, result);
      }
      if (req.method === "POST" && path === "/api/quotes") {
        const r = await store.mutate(ws, (s) => newQuote(s, body));
        return send(201, {
          quote: r.quote.id,
          url: `${appUrl}/?quote=${encodeURIComponent(r.token)}&workspace=${ws}`,
        });
      }
      if (req.method === "POST" && path === "/api/inventory/import") {
        check(
          Array.isArray(body.rows) &&
            body.rows.length > 0 &&
            body.rows.length <= 100,
          "Import 1–100 inventory rows.",
        );
        const rows = body.rows.map((r) => {
          check(
            typeof r.name === "string" && r.name.trim() && r.name.length <= 120,
            "Each lot needs a name.",
          );
          check(
            typeof r.sku === "string" && /^[\w-]{1,40}$/.test(r.sku),
            "SKU must use letters, numbers, hyphens or underscores.",
          );
          check(
            ["carton", "mailer"].includes(r.category),
            "Category must be carton or mailer.",
          );
          check(
            ["kraft-paper", "corrugated-cardboard"].includes(r.material),
            "Unsupported material.",
          );
          for (const key of [
            "quantity",
            "priceCents",
            "floorCents",
            "shippingCents",
            "leadDays",
          ])
            check(
              Number.isInteger(r[key]) && r[key] >= 0 && r[key] <= 1000000,
              `Invalid ${key}.`,
            );
          check(
            r.priceCents > 0 &&
              r.floorCents > 0 &&
              r.floorCents <= r.priceCents,
            "Invalid price floor.",
          );
          check(
            Array.isArray(r.dimensionsMm) &&
              r.dimensionsMm.length === 3 &&
              r.dimensionsMm.every(
                (x) => Number.isInteger(x) && x > 0 && x <= 10000,
              ),
            "Enter three dimensions in mm.",
          );
          check(
            typeof r.description === "string" && r.description.length <= 2000,
            "Description max 2000 characters.",
          );
          return { ...r, id: randomUUID(), ageDays: 0 };
        });
        await store.mutate(ws, (s) => {
          check(
            s.inventory.length + rows.length <= 200,
            "Inventory limit reached.",
          );
          for (const r of rows)
            check(
              !s.inventory.some((x) => x.sku === r.sku),
              "SKU already exists. Import new lots with unique SKUs.",
            );
          check(
            new Set(rows.map((r) => r.sku)).size === rows.length,
            "Duplicate SKU in import.",
          );
          s.inventory.push(...rows);
          audit(s, "INVENTORY_IMPORTED", "CSV", `${rows.length} lots`);
        });
        return send(201, { imported: rows.length });
      }
      throw new AppError("Not found.", 404);
    } catch (e) {
      if (!e.status) console.error("Application failure:", e.name);
      send(e.status || 500, {
        error: e.status
          ? e.message
          : "Unexpected server error. Check server logs and retry.",
      });
    }
  });
  return { server, store, providers, appUrl };
}
if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const app = await createApp();
  const port = Number(process.env.PORT || 3001);
  app.server.listen(port, "0.0.0.0", () =>
    console.log(`BatchBridge listening on ${port} · ${app.store.kind}`),
  );
  for (const sig of ["SIGINT", "SIGTERM"])
    process.on(sig, () =>
      app.server.close(async () => {
        await app.store.close();
        process.exit(0);
      }),
    );
}
