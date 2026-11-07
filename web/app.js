import {
  createGrid,
  ModuleRegistry,
  AllCommunityModule,
  themeQuartz,
} from "ag-grid-community";
ModuleRegistry.registerModules([AllCommunityModule]);
const $ = (s) => document.querySelector(s),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const usd = (n) => `$${(n / 100).toFixed(2)}`;
const icon = (name, size = 18) => {
  const shapes = {
    box: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="M3 8v9l9 5 9-5V8M12 13v9M7 5.8l9 5"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    spark:
      '<path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3Z"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
    upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
    receipt:
      '<path d="M6 3h12v19l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    link: '<path d="m10 13 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 2 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    settings:
      '<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
    logout: '<path d="M9 4H4v16h5m5-4 5-4-5-4m-6 4h11"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name] || shapes.box}</svg>`;
};
const brand = () =>
  `<div class="brand"><div class="brandmark">${icon("box", 20)}</div>Batch<span>Bridge</span></div>`;
let config,
  state,
  tab = "matches",
  selectedLot = "kraft-300",
  candidates = [],
  selectedInquiry,
  searchMode = "All enquiries · local qualification (not semantic search)",
  grid,
  toastTimer;
function toast(text, error = false) {
  $("#toast").textContent = text;
  $("#toast").className = error ? "error" : "";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(
    () => {
      $("#toast").textContent = "";
    },
    error ? 16000 : 7000,
  );
}
async function api(path, body) {
  let r;
  try {
    r = await fetch(
      path,
      body === undefined
        ? {}
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
    );
  } catch {
    throw Error("Cannot reach BatchBridge. Check the server and try again.");
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(d.error || `Request failed (${r.status})`);
  return d;
}
async function run(button, fn) {
  if (button?.disabled) return;
  const old = button?.innerHTML;
  if (button) {
    button.disabled = true;
    button.textContent = "Working…";
  }
  try {
    await fn();
  } catch (e) {
    toast(e.message, true);
  } finally {
    if (button?.isConnected) {
      button.disabled = false;
      button.innerHTML = old;
    }
  }
}
function on(id, fn) {
  const e = $(id);
  if (e) e.onclick = (event) => run(event.currentTarget, fn);
}
function modal(title, html) {
  $("#modal").innerHTML =
    `<div class="modal-title"><h2>${esc(title)}</h2><button class="quiet" id="close-modal" aria-label="Close">${icon("close")}</button></div>${html}`;
  $("#close-modal").onclick = () => $("#modal").close();
  $("#modal").showModal();
}
const badge = (s, text = s) =>
  `<span class="badge ${String(s).toLowerCase()}">${esc(text)}</span>`;
function auth() {
  grid?.destroy();
  grid = null;
  $("#app").innerHTML =
    `<div class="auth"><section>${brand()}<span class="pill"><span class="dot"></span> THE WHOLESALE RECOVERY WORKSPACE</span><h1>Your surplus stock.<br>Someone’s next order.</h1><p class="intro">Find the demand hiding in your customer enquiries. Match with evidence, quote with confidence, and close the sale with PayPal.</p><div class="auth-feature"><span>✓</span> AI-assisted requirements, reviewed by you</div><div class="auth-feature"><span>✓</span> Stock and budget checks before checkout</div><div class="auth-feature"><span>✓</span> PayPal-confirmed payment records</div></section><section class="auth-card"><h2>See a batch find its buyer.</h2><p>Explore a private demo workspace with fictional packaging stock and customer enquiries. Your records are separate from other visitors.</p>${config.demoEnabled ? '<button class="primary" id="enter-demo">Open demo workspace ' + icon("arrow") + "</button>" : ""}<p>Sample records are labelled. Live AI, semantic search, and payments require configured services. All payments use PayPal sandbox.</p><div class="divider">MERCHANT SIGN IN</div><form id="login-form"><label for="email">Email</label><input id="email" type="email" autocomplete="username" required placeholder="you@business.com"><label for="password">Password</label><input id="password" type="password" autocomplete="current-password" required minlength="12" placeholder="Your merchant password"><button type="submit">Sign in to your workspace ${icon("arrow")}</button></form></section></div>`;
  on("#enter-demo", async () => {
    await api("/api/demo", {});
    await init();
  });
  $("#login-form").onsubmit = (e) => {
    e.preventDefault();
    run(e.submitter, async () => {
      await api("/api/login", {
        email: $("#email").value,
        password: $("#password").value,
      });
      await init();
    });
  };
}
async function load() {
  state = await api("/api/state");
  if (!state.inventory.some((l) => l.id === selectedLot))
    selectedLot = state.inventory[0]?.id;
}
function calculateLocal() {
  const lot = state.inventory.find((l) => l.id === selectedLot);
  if (!lot) {
    candidates = [];
    return;
  } // Same checks are authoritative on the server; local view is loaded from the API.
  return api("/api/search", { lotId: selectedLot, mode: "local" }).then((r) => {
    candidates = r.candidates;
    searchMode = r.mode;
    selectedInquiry =
      candidates.find((c) => c.id === selectedInquiry?.id) || candidates[0];
  });
}
function stats() {
  const units = state.inventory.reduce((n, l) => n + l.available, 0),
    value = state.inventory.reduce((n, l) => n + l.available * l.priceCents, 0),
    paid = state.quotes.filter((q) => q.status === "PAID");
  return `<div class="stats">${[
    [
      "Available stock value",
      usd(value),
      "Listed unit prices · excludes delivery",
      "box",
    ],
    [
      "Customer enquiries",
      String(state.inquiries.length),
      "Sample and imported requests",
      "spark",
    ],
    [
      "Paid order value",
      usd(paid.reduce((n, q) => n + q.totalCents, 0)),
      "Verified PayPal sandbox captures",
      "receipt",
    ],
    [
      "Available units",
      units.toLocaleString(),
      "Excludes pending checkout reservations",
      "grid",
    ],
  ]
    .map(
      ([label, value, note, i]) =>
        `<div class="stat"><div class="stat-label">${label}<span class="stat-icon">${icon(i, 16)}</span></div><div class="stat-value">${value}</div><div class="stat-note">${note}</div></div>`,
    )
    .join("")}</div>`;
}
function connections() {
  return `<div class="connections"><div class="step-label">SERVICE CONNECTIONS</div>${[
    [config.ai.provider, config.ai.configured],
    ["Elastic search", config.elastic],
    ["PayPal sandbox", config.paypal],
    [state ? "Persistent " + config.storage : config.storage, true],
  ]
    .map(
      ([name, ready]) =>
        `<div class="connection"><span>${esc(name)}</span><b class="${ready ? "ready" : ""}">${ready ? "● Configured" : "○ Needs setup"}</b></div>`,
    )
    .join(
      "",
    )}<p class="muted" style="font-size:9px;line-height:1.7">Configured means keys are present, not that a live request has passed.</p></div>`;
}
function shell() {
  grid?.destroy();
  grid = null;
  $("#app").innerHTML =
    `<div class="layout"><aside class="sidebar">${brand()}<div class="workspace-label">WORKSPACE</div><nav class="nav">${[
      ["matches", "grid", "Recovery desk"],
      ["inventory", "box", "Inventory"],
      ["orders", "receipt", "Quotes & orders"],
      ["activity", "clock", "Activity"],
      ["setup", "settings", "Setup guide"],
    ]
      .map(
        ([id, i, name]) =>
          `<button data-tab="${id}" class="${tab === id ? "active" : ""}">${icon(i)}${name}</button>`,
      )
      .join(
        "",
      )}</nav><div class="sidebar-bottom"><div class="workspace-card"><div class="avatar">${state.demo ? "DM" : "PO"}</div><div><strong>${state.demo ? "Demo workspace" : "Merchant workspace"}</strong><small>${state.demo ? "Fictional business records" : "Private operations"}</small></div></div><button class="quiet" id="logout">${icon("logout", 15)} Leave workspace</button></div></aside><main class="main"><header class="topbar"><div class="breadcrumb">Workspace <span> / </span> <b>${esc({ matches: "Recovery desk", inventory: "Inventory", orders: "Quotes & orders", activity: "Activity", setup: "Setup guide" }[tab])}</b></div><div class="top-actions"><span class="sandbox">SANDBOX · USD</span><button class="quiet" id="refresh" aria-label="Refresh workspace">${icon("clock", 16)}</button><div class="avatar">${state.demo ? "DM" : "PO"}</div></div></header><div id="page"></div><div class="footer-note"><span>BatchBridge · Match the need. Move the batch.</span><span>Fictional sample business · No real funds or fulfillment</span></div></main></div>`;
  document.querySelectorAll("[data-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        tab = b.dataset.tab;
        render();
      }),
  );
  on("#logout", async () => {
    await api("/api/logout", {});
    await init();
  });
  on("#refresh", async () => {
    await load();
    await calculateLocal();
    render();
    toast(
      "Workspace refreshed. Payment status changes require PayPal verification.",
    );
  });
}
function render() {
  shell();
  if (tab === "matches") matches();
  if (tab === "inventory") inventory();
  if (tab === "orders") orders();
  if (tab === "activity") activity();
  if (tab === "setup") setup();
}
function heading(title, subtitle, actions = "") {
  return `<div class="heading"><div><div class="eyebrow">LESS IDLE STOCK. MORE OPPORTUNITY.</div><h1>${title}</h1><p>${subtitle}</p></div><div class="heading-actions">${actions}</div></div>`;
}
function lotCards() {
  return state.inventory
    .map(
      (l) =>
        `<button class="lot ${l.id === selectedLot ? "active" : ""}" data-lot="${esc(l.id)}"><div class="lot-top"><div class="box-art">${icon("box", 34)}</div>${badge("hold", l.ageDays ? `${l.ageDays} DAYS IN STOCK` : "IMPORTED LOT")}</div><strong>${esc(l.name)}</strong><small>${esc(l.sku)} · ${l.dimensionsMm.join(" × ")} mm</small><div class="lot-bottom"><span>${l.available} units available</span><span>${usd(l.priceCents)} / unit</span></div></button>`,
    )
    .join("");
}
function matches() {
  const all = candidates.length,
    pass = candidates.filter((x) => x.qualification.verdict === "PASS").length;
  $("#page").innerHTML =
    heading(
      "Give your stock a next chapter.",
      "Find the right enquiry. Check the fit. Turn an approved quote into an order.",
      `<button id="add-inquiry">${icon("plus", 15)} Add enquiry</button><button class="primary" id="run-elastic">${icon("spark", 15)} Find demand with Elastic</button>`,
    ) +
    stats() +
    `<div class="content-grid"><section><div class="panel"><div class="panel-head"><div><div class="step-label">01 / SELECT A SURPLUS LOT</div><h2 style="margin-top:8px">Ready for a new home</h2></div><button class="quiet" id="view-stock">View all ${icon("arrow", 13)}</button></div><div class="lots">${lotCards()}</div></div><div class="panel section-gap"><div class="panel-head"><div><div class="step-label">02 / MATCH & QUALIFY</div><h2 style="margin-top:8px">Customer demand</h2><p id="search-mode">${esc(searchMode)}</p></div>${badge("pass", `${pass} QUALIFIED`)}</div><div class="grid-toolbar"><div class="search">${icon("search", 14)}<input id="quick-filter" aria-label="Search enquiries" placeholder="Search customer enquiries…"></div><button id="export">${icon("upload", 13)} Export CSV</button></div><div id="demand-grid" class="grid"></div><div class="table-foot"><span>${all} enquiries · Click a row to inspect the evidence</span><span>AI suggests. Business rules qualify.</span></div></div><div class="banner">${icon("receipt", 17)}<span><strong>A match isn’t a sale yet.</strong> Quotes require merchant review and customer approval. Stock is reserved only when checkout starts; payment must be confirmed by PayPal.</span></div></section><aside class="panel"><div id="match-detail"></div>${connections()}</aside></div>`;
  document.querySelectorAll("[data-lot]").forEach(
    (b) =>
      (b.onclick = () =>
        run(b, async () => {
          selectedLot = b.dataset.lot;
          selectedInquiry = null;
          await calculateLocal();
          render();
        })),
  );
  on("#view-stock", async () => {
    tab = "inventory";
    render();
  });
  on("#add-inquiry", addInquiry);
  on("#run-elastic", async () => {
    const r = await api("/api/search", { lotId: selectedLot, mode: "elastic" });
    candidates = r.candidates;
    searchMode = r.mode;
    selectedInquiry = candidates[0];
    render();
    toast("Live Elastic keyword and semantic search completed.");
  });
  grid = createGrid($("#demand-grid"), {
    theme: themeQuartz.withParams({
      fontFamily: "inherit",
      fontSize: 11,
      headerFontSize: 10,
      headerBackgroundColor: "#f8f9fb",
      headerTextColor: "#8b94a3",
      borderColor: "#edf0f4",
      rowHoverColor: "#fff9f5",
      selectedRowBackgroundColor: "#fff2e9",
      accentColor: "#e76d36",
      cellHorizontalPadding: 17,
    }),
    rowData: candidates,
    rowHeight: 59,
    headerHeight: 39,
    defaultColDef: { sortable: true, resizable: true },
    columnDefs: [
      { headerName: "Customer", field: "customer", flex: 1.5, minWidth: 150 },
      { headerName: "Units", field: "requirements.quantity", width: 75 },
      {
        headerName: "Delivered",
        field: "qualification.totalCents",
        width: 100,
        valueFormatter: (p) => (p.value === null ? "—" : usd(p.value)),
      },
      {
        headerName: "Fit",
        field: "qualification.verdict",
        width: 95,
        cellRenderer: (p) => {
          const span = document.createElement("span");
          span.className = "badge " + p.value.toLowerCase();
          span.textContent =
            p.value === "PASS"
              ? "QUALIFIED"
              : p.value === "HOLD"
                ? "REVIEW"
                : "NO FIT";
          return span;
        },
      },
      {
        headerName: "Source",
        field: "source",
        width: 95,
        valueFormatter: (p) =>
          p.value === "seed"
            ? "Sample"
            : p.data.reviewed
              ? "Reviewed AI"
              : "AI draft",
      },
    ],
    onRowClicked: (e) => {
      selectedInquiry = e.data;
      renderDetail();
    },
    getRowId: (p) => p.data.id,
  });
  $("#quick-filter").oninput = (e) =>
    grid.setGridOption("quickFilterText", e.target.value);
  on("#export", async () =>
    grid.exportDataAsCsv({
      fileName: "batchbridge-demand.csv",
      processCellCallback: (p) => {
        const v = String(p.value ?? "");
        return /^[=+@\-]/.test(v) ? "'" + v : v;
      },
    }),
  );
  renderDetail();
}
function renderDetail() {
  const i = selectedInquiry;
  if (!i) {
    $("#match-detail").innerHTML =
      '<div class="empty">No results yet. Add an enquiry or select another lot.</div>';
    return;
  }
  const q = i.qualification;
  $("#match-detail").innerHTML =
    `<div class="detail"><div class="step-label">03 / REVIEW THE FIT</div><h3>${esc(i.customer)}</h3><p class="muted">${esc(i.text)}</p>${badge(q.verdict, q.verdict === "PASS" ? "QUALIFIED MATCH" : q.verdict === "HOLD" ? "NEEDS EVIDENCE" : "NOT A FIT")}<hr><div class="checks">${q.checks.map((c) => `<div class="check ${c.status}"><span class="check-icon">${c.status === "PASS" ? "✓" : c.status === "FAIL" ? "×" : "?"}</span><div><strong>${esc(c.name)}</strong><small>${esc(c.detail)}</small></div></div>`).join("")}</div><div class="quote-total"><span>Proposed delivered total</span><strong>${q.totalCents === null ? "—" : usd(q.totalCents)}</strong></div>${i.source === "ai" && !i.reviewed ? '<button id="review-ai">Review extracted requirements</button>' : ""}<button class="primary" id="prepare-quote" ${q.verdict !== "PASS" || (i.source === "ai" && !i.reviewed) ? "disabled" : ""}>Prepare customer quote ${icon("arrow", 14)}</button><p class="small-note">${i.source === "seed" ? "Pre-reviewed sample requirements." : "AI extraction requires your review."}<br>Prices and specifications are seller-entered.</p></div>`;
  on("#prepare-quote", () => prepareQuote(i));
  on("#review-ai", () => reviewInquiry(i));
}
function addInquiry() {
  modal(
    "Add a customer enquiry",
    `<p class="guide">Paste an enquiry you are permitted to process. It will be sent to ${esc(config.ai.provider)}. AI extraction never sends a quote or starts payment.</p><form id="inquiry-form"><label>Customer / business name<input id="customer-name" required maxlength="100" placeholder="North & Pine Studio"></label><label>Original enquiry<textarea id="inquiry-text" rows="7" required minlength="30" maxlength="12000" placeholder="We need 200 corrugated cardboard cartons, exactly 300 x 200 x 150 mm, under $200 delivered, within 5 business days. No special requirements."></textarea></label><div class="modal-actions"><button class="primary" type="submit">${icon("spark", 15)} Extract requirements with AI</button></div></form>`,
  );
  $("#inquiry-form").onsubmit = (e) => {
    e.preventDefault();
    run(e.submitter, async () => {
      const i = await api("/api/inquiries", {
        customer: $("#customer-name").value,
        text: $("#inquiry-text").value,
      });
      await load();
      await calculateLocal();
      $("#modal").close();
      render();
      reviewInquiry(i);
    });
  };
}
function reviewInquiry(i) {
  const p = i.requirements;
  modal(
    "Review the AI extraction",
    `<div class="source">${esc(i.text)}</div><p class="guide">Confirm or correct each value. Unknown fields block qualification. Corrections are recorded as merchant-entered facts; source excerpts remain the original AI evidence.</p><form id="review-form"><div class="field-row"><label>Category<select id="r-category">${["carton", "mailer", "unknown"].map((v) => `<option ${p.category === v ? "selected" : ""}>${v}</option>`).join("")}</select></label><label>Quantity<input id="r-quantity" type="number" value="${p.quantity ?? ""}"></label></div><label>Dimensions in mm (length, width, height)<input id="r-dimensions" placeholder="300, 200, 150" value="${p.dimensionsMm?.join(", ") || ""}"></label><div class="field-row"><label>Allowed tolerance in mm<input id="r-tolerance" type="number" min="0" value="${p.toleranceMm ?? ""}"></label><label>Material<select id="r-material">${["unknown", "corrugated-cardboard", "kraft-paper"].map((v) => `<option ${p.material === v ? "selected" : ""}>${v}</option>`).join("")}</select></label><label>Delivered USD budget<input id="r-budget" type="number" step=".01" value="${p.budgetCents === null ? "" : (p.budgetCents / 100).toFixed(2)}"></label><label>Maximum lead time (business days)<input id="r-lead" type="number" value="${p.maxLeadDays ?? ""}"></label></div><label>Additional requirements (one per line)<textarea id="r-special" rows="3">${esc(p.specialRequirements.join("\n"))}</textarea></label><h3 style="font-size:12px">AI source excerpts</h3>${p.evidence.map((e) => `<div class="evidence"><strong>${esc(e.field)}</strong><br>“${esc(e.quote)}”</div>`).join("")}<label><input id="r-confirm" type="checkbox" required>I checked the requirements against the customer’s request.</label><div class="modal-actions"><button class="primary" type="submit">Confirm reviewed requirements</button></div></form>`,
  );
  $("#review-form").onsubmit = (e) => {
    e.preventDefault();
    run(e.submitter, async () => {
      const num = (id) => ($(id).value === "" ? null : Number($(id).value));
      const dimensions = $("#r-dimensions").value.trim();
      await api("/api/inquiries/review", {
        id: i.id,
        confirmed: $("#r-confirm").checked,
        requirements: {
          category: $("#r-category").value,
          quantity: num("#r-quantity"),
          dimensionsMm: dimensions
            ? dimensions.split(",").map((v) => Number(v.trim()))
            : null,
          toleranceMm: num("#r-tolerance"),
          material: $("#r-material").value,
          budgetCents:
            num("#r-budget") === null
              ? null
              : Math.round(num("#r-budget") * 100),
          maxLeadDays: num("#r-lead"),
          specialRequirements: $("#r-special")
            .value.split("\n")
            .map((x) => x.trim())
            .filter(Boolean),
          evidence: p.evidence,
        },
      });
      await load();
      await calculateLocal();
      $("#modal").close();
      render();
      toast(
        "Requirements reviewed. The server will recheck eligibility before quoting.",
      );
    });
  };
}
function prepareQuote(i) {
  const l = state.inventory.find((x) => x.id === selectedLot);
  modal(
    "Prepare an exact customer quote",
    `<p class="guide">${esc(i.customer)} · ${i.requirements.quantity} × ${esc(l.name)}<br>Customer budget: ${usd(i.requirements.budgetCents)}. This quote expires in 30 minutes. Prices use USD; the fictional demo tax is $0.</p><form id="quote-form"><label>Unit price in USD<input id="quote-price" type="number" step="0.01" required min="${l.floorCents / 100}" max="${l.priceCents / 100}" value="${(l.priceCents / 100).toFixed(2)}"></label><p class="guide">Merchant floor: ${usd(l.floorCents)} · Delivery: ${usd(l.shippingCents)}<br>No stock is held until the customer starts checkout.</p><label><input id="quote-confirm" type="checkbox" required>I reviewed availability, specifications, lead time, price, and customer requirements.</label><div class="modal-actions"><button type="submit" class="primary">Issue private quote link ${icon("arrow", 15)}</button></div></form>`,
  );
  $("#quote-form").onsubmit = (e) => {
    e.preventDefault();
    run(e.submitter, async () => {
      const r = await api("/api/quotes", {
        lotId: selectedLot,
        inquiryId: i.id,
        quantity: i.requirements.quantity,
        unitCents: Math.round(Number($("#quote-price").value) * 100),
      });
      sessionStorage.setItem("quote:" + r.quote, r.url);
      await load();
      $("#modal").close();
      showQuoteLink(r.url);
      render();
    });
  };
}
function showQuoteLink(url) {
  modal(
    "Your customer quote is ready",
    `<p class="guide">Open the customer view to review and approve this exact quote. Anyone holding this private link can view it; it is not independently verified customer identity.</p><label>Private customer link<input id="quote-link" readonly value="${esc(url)}"></label><div class="modal-actions"><button id="copy-link">Copy link</button><a class="primary-link" target="_blank" rel="noopener noreferrer" href="${esc(url)}">Open customer view ↗</a></div>`,
  );
  on("#copy-link", async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast("Private quote link copied.");
    } catch {
      $("#quote-link").select();
      toast("Select and copy the quote link.");
    }
  });
}
function inventory() {
  $("#page").innerHTML =
    heading(
      "Every batch, accounted for.",
      "Seller-entered specifications and prices. Reserved stock is excluded from availability.",
      `<button id="import-csv">${icon("upload", 15)} Import inventory CSV</button>`,
    ) +
    stats() +
    `<div class="panel"><div class="panel-head"><h2>Inventory lots</h2>${badge("hold", "SAMPLE + IMPORTED")}</div><div class="lots">${lotCards()}</div></div><div class="banner">${icon("box", 17)}<span>Stock records are maintained by this app. Certifications and specifications are seller-entered, not independently certified. CSV import adds new lots; it does not overwrite stock involved in checkout.</span></div>`;
  on("#import-csv", importCsv);
  document.querySelectorAll("[data-lot]").forEach(
    (b) =>
      (b.onclick = () =>
        run(b, async () => {
          selectedLot = b.dataset.lot;
          tab = "matches";
          await calculateLocal();
          render();
        })),
  );
}
function csvParse(text) {
  const rows = [];
  let row = [],
    field = "",
    quoted = false;
  for (let n = 0; n < text.length; n++) {
    const c = text[n];
    if (c === '"') {
      if (quoted && text[n + 1] === '"') {
        field += '"';
        n++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[n + 1] === "\n") n++;
      row.push(field);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw Error("Unclosed quote in CSV.");
  row.push(field);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}
function importCsv() {
  modal(
    "Import new inventory lots",
    `<p class="guide">Use the supplied <code>sample-inventory.csv</code> as a template. Prices are integer USD cents; dimensions are millimeters. Import adds new SKUs only.</p><form id="csv-form"><label>CSV file<input type="file" id="csv-file" accept=".csv,text/csv" required></label><div class="modal-actions"><button type="submit" class="primary">Validate and import</button></div></form>`,
  );
  $("#csv-form").onsubmit = (e) => {
    e.preventDefault();
    run(e.submitter, async () => {
      const file = $("#csv-file").files[0];
      if (file.size > 150000) throw Error("CSV must be smaller than 150 KB.");
      const [headers, ...data] = csvParse(
        (await file.text()).replace(/^\uFEFF/, ""),
      );
      const names = headers.map((x) => x.trim());
      const needed = [
        "name",
        "sku",
        "category",
        "material",
        "lengthMm",
        "widthMm",
        "heightMm",
        "quantity",
        "priceCents",
        "floorCents",
        "shippingCents",
        "leadDays",
        "description",
      ];
      if (needed.some((k) => !names.includes(k)))
        throw Error(
          "CSV is missing required headers. Use sample-inventory.csv.",
        );
      const rows = data.map((row) => {
        const r = Object.fromEntries(names.map((k, i) => [k, row[i] ?? ""]));
        for (const k of [
          "quantity",
          "priceCents",
          "floorCents",
          "shippingCents",
          "leadDays",
        ])
          r[k] = Number(r[k]);
        r.dimensionsMm = ["lengthMm", "widthMm", "heightMm"].map((k) =>
          Number(r[k]),
        );
        return r;
      });
      const r = await api("/api/inventory/import", { rows });
      await load();
      $("#modal").close();
      render();
      toast(`${r.imported} inventory lots imported.`);
    });
  };
}
function orders() {
  $("#page").innerHTML =
    heading(
      "From quote to confirmed order.",
      "Payment is recorded only after an authoritative PayPal verification.",
    ) +
    stats() +
    `<div class="panel full-panel"><div class="panel-head"><h2>Quotes & orders</h2>${badge("hold", `${state.quotes.length} RECORDS`)}</div>${
      state.quotes.length
        ? state.quotes
            .slice()
            .reverse()
            .map(
              (q) =>
                `<div class="quote-row"><div><h3>${esc(q.customer)}</h3><small>${q.quantity} × ${esc(q.lot)} · ${esc(q.id.slice(0, 8))}</small>${q.captureId ? `<p class="receipt-id">Capture: ${esc(q.captureId)}</p>` : ""}</div><div><div class="amount">${usd(q.totalCents)}</div><p>${badge(q.status, q.status.replaceAll("_", " "))}</p></div><div><button data-order="${q.id}">View details ${icon("arrow", 13)}</button></div></div>`,
            )
            .join("")
        : '<div class="empty">No quotes yet. Find a qualified enquiry in the recovery desk to issue your first quote.</div>'
    }</div><div class="banner">${icon("clock", 17)}<span>Payment attempts with an uncertain result retain their stock reservation. Reopen the original customer link and check PayPal status before taking further action.</span></div>`;
  document.querySelectorAll("[data-order]").forEach(
    (b) =>
      (b.onclick = () => {
        const q = state.quotes.find((q) => q.id === b.dataset.order),
          link = sessionStorage.getItem("quote:" + q.id);
        modal(
          "Quote & payment record",
          `<div class="guide"><strong>${esc(q.customer)}</strong><br>${q.quantity} × ${esc(q.lot)}<br>Total: ${usd(q.totalCents)}<br>Status: ${esc(q.status)}<br>Quote: <span class="receipt-id">${esc(q.id)}</span><br>PayPal order: <span class="receipt-id">${esc(q.orderId || "Not created")}</span><br>Capture: <span class="receipt-id">${esc(q.captureId || "Not verified")}</span></div>${link ? `<div class="modal-actions"><a class="primary-link" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Open customer quote ↗</a></div>` : '<p class="guide">The private quote link was shown when issued. Use the original link held by the customer; it is not stored as plaintext on the server.</p>'}`,
        );
      }),
  );
}
function activity() {
  $("#page").innerHTML =
    heading(
      "A clear trail, at every step.",
      "Recorded application events and verified payment references.",
    ) +
    `<div class="panel full-panel"><div class="panel-head"><h2>Workspace activity</h2>${badge("hold", "LATEST 250 EVENTS")}</div><div class="events">${state.events.length ? state.events.map((e) => `<div class="event"><span class="event-dot"></span><div><strong>${esc(e.event.replaceAll("_", " "))}</strong><p>${esc(e.detail)}</p><time>${esc(new Date(e.at).toLocaleString())} · ${esc(e.reference)}</time></div></div>`).join("") : '<div class="empty">Your workspace activity appears here as you review enquiries, issue quotes, and verify payments.</div>'}</div></div>`;
}
function setup() {
  $("#page").innerHTML =
    heading(
      "One app. Services with a clear job.",
      "Configure secrets on the server or in Render’s Environment settings.",
    ) +
    `<div class="content-grid"><div class="panel"><div class="detail guide"><h3>1. AI through Hugging Face or Grok</h3><p>Hugging Face: set <code>AI_PROVIDER=huggingface</code>, <code>HF_TOKEN</code> and <code>HF_MODEL</code>. Use a hosted inference model/provider that supports structured JSON output.</p><p>Grok: set <code>AI_PROVIDER=xai</code>, <code>XAI_API_KEY</code> and <code>XAI_MODEL</code>. No model download is needed. A token must have inference access and sufficient provider balance.</p><h3>2. Elastic Cloud</h3><p>Set <code>ELASTICSEARCH_URL</code> and <code>ELASTICSEARCH_API_KEY</code>. Your project needs semantic inference access. The first search creates and populates the index; it may take longer. Local qualification is explicitly labelled and does not call Elastic.</p><h3>3. PayPal sandbox</h3><p>Set <code>PAYPAL_CLIENT_ID</code>, <code>PAYPAL_CLIENT_SECRET</code>, and <code>PAYPAL_MERCHANT_ID</code> from your sandbox business account/app. Use a separate personal sandbox account to pay. All API calls are fixed to PayPal sandbox.</p><h3>4. Render hosting</h3><p>The supplied Render Blueprint creates a Node service and PostgreSQL database. Configure your merchant email, strong password, and provider keys privately. Set the final HTTPS <code>APP_URL</code> if a custom domain is used.</p><h3>A reliable walkthrough</h3><p>Open a demo → select the kraft cartons → inspect the 200-unit sample match and the failed 500-unit request → run Elastic → add and review a live AI enquiry → issue a quote → open customer view → approve → pay in PayPal sandbox → verify capture → refresh the merchant workspace.</p><p>For honest results, sample records, local matching, live service requests, and confirmed payments remain visibly distinct.</p></div></div><aside class="panel">${connections()}</aside></div>`;
}
async function customerView() {
  grid?.destroy();
  grid = null;
  const params = new URLSearchParams(location.search),
    token = params.get("quote"),
    workspace = params.get("workspace"),
    base = `/api/quote/${encodeURIComponent(workspace)}/${encodeURIComponent(token)}`;
  let result;
  try {
    result = await api(base);
  } catch (e) {
    $("#app").innerHTML =
      `<main class="customer">${brand()}<div class="banner">${esc(e.message)}</div><a href="/">Return to merchant workspace</a></main>`;
    return;
  }
  const q = result.quote,
    paid = q.status === "PAID",
    expired = Date.now() > q.expiresAt;
  $("#app").innerHTML =
    `<main class="customer"><header>${brand()}<span class="sandbox">PAYPAL SANDBOX</span></header><div class="customer-card"><div class="customer-top"><div class="eyebrow">PRIVATE CUSTOMER QUOTE</div><h1>${paid ? "Your payment is confirmed." : "A clear quote. Ready when you are."}</h1><p class="muted" style="font-size:13px">Prepared for ${esc(q.customer)}</p>${badge(q.status, q.status.replaceAll("_", " "))}</div><div class="customer-body"><h3>${esc(q.lot)}</h3><p class="muted" style="font-size:12px">${esc(q.sku)} · ${q.dimensionsMm.join(" × ")} mm</p><div class="line-item"><span>${q.quantity} units × ${usd(q.unitCents)}</span><strong>${usd(q.quantity * q.unitCents)}</strong></div><div class="line-item"><span>Demo delivery charge</span><strong>${usd(q.shippingCents)}</strong></div><div class="line-item"><span>Tax (fictional test scenario)</span><strong>$0.00</strong></div><div class="line-item total"><span>Total USD</span><span>${usd(q.totalCents)}</span></div>${paid ? `<div class="banner">${icon("check", 18)}<span>PayPal reports a completed capture. This is a sandbox test; no real funds moved.</span></div><p class="receipt-id">Order: ${esc(q.orderId)}<br>Capture: ${esc(q.captureId)}</p>` : `<p class="customer-note">Valid until ${new Date(q.expiresAt).toLocaleString()}. This is a fictional demo transaction, not a real shipment. Link possession permits quote access; customer identity is not independently verified.</p><div class="customer-actions">${q.status === "OPEN" && !expired ? `${!q.approvedAt ? '<label><input id="customer-approval" type="checkbox">I approve these items, quantities, and the exact total shown.</label><button id="approve-customer" class="primary">Approve this quote</button>' : '<div class="banner">Quote approved. Stock will be checked and reserved when checkout starts.</div>'}` : ""}${!["CANCELLED", "PAID", "PAYMENT_UNCERTAIN", "CAPTURING"].includes(q.status) && q.approvedAt && !expired ? `<button id="start-checkout" class="primary" ${!result.paypal ? "disabled" : ""}>${q.orderId ? "Reopen PayPal checkout" : "Continue to PayPal sandbox"} ${icon("arrow", 15)}</button>` : ""}${q.orderId && !["CANCELLED", "PAID"].includes(q.status) ? `<button id="confirm-payment" class="dark">Confirm approved PayPal payment</button><button id="check-payment">Check PayPal status</button>${!["PAYMENT_UNCERTAIN", "CAPTURING"].includes(q.status) ? '<button id="cancel-checkout">Cancel unpaid checkout & release stock</button>' : ""}` : ""}${expired ? '<div class="banner">This quote has expired. No new payment can begin. An existing uncertain payment can still be reconciled.</div>' : ""}${!result.paypal ? '<div class="banner">PayPal is not configured yet. Merchant setup is required before checkout.</div>' : ""}${params.get("checkout") === "approved" ? '<div class="banner">Returned from PayPal. Confirm the payment above; returning alone is not proof of payment.</div>' : ""}${params.get("checkout") === "cancelled" ? '<div class="banner">You returned without completing checkout. No payment success has been assumed.</div>' : ""}</div>`}<p class="customer-note">Powered by BatchBridge · Payments processed by PayPal sandbox.<br>Fulfillment and merchant specifications are outside this prototype’s verification.</p><a href="/" style="font-size:12px">Return to merchant workspace</a></div></div></main>`;
  on("#approve-customer", async () => {
    if (!$("#customer-approval").checked)
      throw Error("Approve the exact quote first.");
    await api(base + "/approve", { approved: true, totalCents: q.totalCents });
    await customerView();
  });
  on("#start-checkout", async () => {
    const r = await api(base + "/checkout", {});
    if (r.quote.status === "PAID") {
      await customerView();
      return;
    }
    if (!r.quote.approvalUrl)
      throw Error(
        "PayPal did not return an approval link. Check payment status before retrying.",
      );
    location.assign(r.quote.approvalUrl);
  });
  on("#confirm-payment", async () => {
    await api(base + "/capture", {});
    await customerView();
    toast("Payment read back and verified against PayPal.");
  });
  on("#check-payment", async () => {
    const r = await api(base + "/refresh", {});
    await customerView();
    if (r.quote.providerStatus)
      toast(`PayPal status: ${r.quote.providerStatus}.`);
  });
  on("#cancel-checkout", async () => {
    await api(base + "/cancel", {});
    await customerView();
  });
}
async function init() {
  $("#app").innerHTML = '<div class="loading">Opening BatchBridge…</div>';
  try {
    config = await api("/api/config");
    if (new URLSearchParams(location.search).has("quote"))
      return await customerView();
    if (!config.session) return auth();
    await load();
    await calculateLocal();
    render();
  } catch (e) {
    $("#app").innerHTML =
      `<div class="customer"><h1>Couldn’t open the workspace.</h1><p>${esc(e.message)}</p><button id="retry">Try again</button></div>`;
    on("#retry", init);
  }
}
init();
