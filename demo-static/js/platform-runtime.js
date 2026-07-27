(function () {
  "use strict";

  const EXACT_KEYS = {
    "Dashboard":"nav.dashboard","Terminal":"nav.terminal","Sales":"nav.sales","Shifts / Closing":"nav.shifts","Customers":"nav.customers","Salesmen & Commission":"nav.salesmen","Products":"nav.products","Inventory":"nav.inventory","Barcode Labels":"nav.barcode","Purchases":"nav.purchases","Branches":"nav.branches","Promotions":"nav.promotions","Loyalty":"nav.loyalty","Approvals":"nav.approvals","Reports":"nav.reports","Accounts":"nav.accounts","Expenses":"nav.expenses","Setup Wizard":"nav.setup","Notifications":"nav.notifications","Invoice Designer":"nav.invoiceDesigner","Industry Workspace":"nav.industry","Settings":"nav.settings",
    "Save":"action.save","Add":"action.add","Cancel":"action.cancel","Edit":"action.edit","Delete":"action.delete","Print":"action.print","Search":"action.search","Save Invoice":"sales.saveInvoice","Add Product":"sales.addProduct","Select Customer":"sales.selectCustomer","Complete Sale":"sales.complete"
  };
  const PAGE_FEATURES = {
    "sales.html":"sales.invoices","terminal.html":"sales.invoices","purchase.html":"purchases.*","expenses.html":"expenses.*","accounts.html":"accounts.*","promotions.html":"promotions.basic","loyalty.html":"loyalty.basic","approvals.html":"approvals.basic","reports.html":"reports.daily_sales","branches.html":"core.products","barcode-labels.html":"barcode"
  };
  const NAV_FEATURES = {
    "purchase.html":"purchases.*","expenses.html":"expenses.*","accounts.html":"accounts.*","promotions.html":"promotions.basic","loyalty.html":"loyalty.basic","approvals.html":"approvals.basic","barcode-labels.html":"barcode"
  };

  const CORE_POS_NAV = [
    ["Dashboard", "index.html", "bi-speedometer2"],
    ["Terminal", "terminal.html", "bi-upc-scan"],
    ["Sales", "sales.html", "bi-cart-check"],
    ["Shifts / Closing", "shifts.html", "bi-clock-history"],
    ["Customers", "customer.html", "bi-people"],
    ["Products", "products.html", "bi-box-seam"],
    ["Inventory", "inventory.html", "bi-boxes"],
    ["Purchases", "purchase.html", "bi-bag-plus"],
    ["Reports", "reports.html", "bi-graph-up-arrow"],
    ["Settings", "settings.html", "bi-gear"]
  ];

  const INDUSTRY_NAV = {
    retail: CORE_POS_NAV,
    grocery: [
      ["Grocery Dashboard", "industry-dashboard.html", "bi-speedometer2"],
      ["Checkout Terminal", "terminal.html", "bi-upc-scan"],
      ["Sales", "sales.html", "bi-cart-check"],
      ["Products", "products.html", "bi-box-seam"],
      ["Batch & Expiry", "industry.html?module=batches", "bi-calendar-x"],
      ["Stock & Reorder", "inventory.html", "bi-boxes"],
      ["Suppliers & Purchases", "purchase.html", "bi-bag-plus"],
      ["Customers", "customer.html", "bi-people"],
      ["Grocery Reports", "reports.html", "bi-graph-up-arrow"],
      ["Settings", "settings.html", "bi-gear"]
    ],
    pharmacy: [
      ["Pharmacy Dashboard", "industry-dashboard.html", "bi-speedometer2"],
      ["Pharmacy Terminal", "terminal.html", "bi-capsule-pill"],
      ["Prescriptions", "industry.html?module=prescriptions", "bi-file-medical"],
      ["Medicines", "products.html", "bi-capsule"],
      ["Batches & Expiry", "industry.html?module=batches", "bi-calendar2-x"],
      ["Patients / Customers", "customer.html", "bi-people"],
      ["Sales & Billing", "sales.html", "bi-receipt"],
      ["Inventory", "inventory.html", "bi-boxes"],
      ["Suppliers & Purchases", "purchase.html", "bi-bag-plus"],
      ["Pharmacy Reports", "reports.html", "bi-graph-up-arrow"],
      ["Settings", "settings.html", "bi-gear"]
    ],
    gym: [
      ["Gym Dashboard", "industry-dashboard.html", "bi-speedometer2"],
      ["Members", "industry.html?module=members", "bi-people"],
      ["Membership Plans", "industry.html?module=membership_plans", "bi-card-checklist"],
      ["Memberships", "industry.html?module=memberships", "bi-person-badge"],
      ["Check-ins", "industry.html?module=checkins", "bi-qr-code-scan"],
      ["Trainers", "industry.html?module=trainers", "bi-person-arms-up"],
      ["Classes & Programs", "industry.html?module=classes", "bi-calendar3"],
      ["Facilities & Lockers", "industry.html?module=facilities", "bi-building"],
      ["Payments", "sales.html", "bi-cash-coin"],
      ["Gym Reports", "reports.html", "bi-graph-up-arrow"],
      ["Settings", "settings.html", "bi-gear"]
    ],
    school: [
      ["School Dashboard", "industry-dashboard.html", "bi-speedometer2"],
      ["Admissions", "industry.html?module=admissions", "bi-person-plus"],
      ["Students", "industry.html?module=students", "bi-mortarboard"],
      ["Guardians", "industry.html?module=guardians", "bi-people"],
      ["Classes & Sections", "industry.html?module=classes", "bi-diagram-3"],
      ["Attendance", "industry.html?module=attendance", "bi-calendar-check"],
      ["Timetable", "industry.html?module=timetable", "bi-calendar3"],
      ["Assessments & Results", "industry.html?module=assessments", "bi-journal-check"],
      ["Fees & Payments", "industry.html?module=fees", "bi-cash-stack"],
      ["School Reports", "reports.html", "bi-graph-up-arrow"],
      ["Settings", "settings.html", "bi-gear"]
    ],
    clinic: [
      ["Clinic Dashboard", "industry-dashboard.html", "bi-speedometer2"],
      ["Patients", "industry.html?module=patients", "bi-people"],
      ["Practitioners", "industry.html?module=practitioners", "bi-person-vcard"],
      ["Appointments", "industry.html?module=appointments", "bi-calendar2-check"],
      ["Queue & Check-in", "industry.html?module=queue", "bi-person-lines-fill"],
      ["Encounters", "industry.html?module=encounters", "bi-clipboard2-pulse"],
      ["Medications", "industry.html?module=medications", "bi-capsule"],
      ["Billing & Payments", "sales.html", "bi-receipt"],
      ["Clinic Reports", "reports.html", "bi-graph-up-arrow"],
      ["Settings", "settings.html", "bi-gear"]
    ],
    restaurant: [
      ["Restaurant Dashboard", "industry-dashboard.html", "bi-speedometer2"],
      ["Tables & Areas", "industry.html?module=tables", "bi-grid-3x3-gap"],
      ["Reservations", "industry.html?module=reservations", "bi-calendar2-event"],
      ["Orders", "industry.html?module=orders", "bi-receipt-cutoff"],
      ["Kitchen Display", "industry.html?module=kitchen_tickets", "bi-display"],
      ["Menu & Modifiers", "industry.html?module=menu_items", "bi-menu-button-wide"],
      ["Recipes & Ingredients", "industry.html?module=recipes", "bi-journal-text"],
      ["Inventory & Wastage", "inventory.html", "bi-boxes"],
      ["Settlement", "sales.html", "bi-cash-coin"],
      ["Restaurant Reports", "reports.html", "bi-graph-up-arrow"],
      ["Settings", "settings.html", "bi-gear"]
    ],
    hardware: [
      ["Hardware Dashboard", "industry-dashboard.html", "bi-speedometer2"],
      ["Trade Terminal", "terminal.html", "bi-upc-scan"],
      ["Products & Units", "products.html", "bi-tools"],
      ["Trade Pricing", "industry.html?module=trade_pricing", "bi-tags"],
      ["Quotations", "industry.html?module=quotations", "bi-file-earmark-text"],
      ["Deliveries & Backorders", "industry.html?module=deliveries", "bi-truck"],
      ["Rentals & Warranties", "industry.html?module=rentals", "bi-shield-check"],
      ["Inventory", "inventory.html", "bi-boxes"],
      ["Customers & Projects", "customer.html", "bi-people"],
      ["Hardware Reports", "reports.html", "bi-graph-up-arrow"],
      ["Settings", "settings.html", "bi-gear"]
    ],
    paint: [
      ["Paint Dashboard", "industry-dashboard.html", "bi-speedometer2"],
      ["Paint Terminal", "terminal.html", "bi-palette2"],
      ["Brands & Product Lines", "industry.html?module=brands", "bi-box-seam"],
      ["Colors", "industry.html?module=colors", "bi-palette"],
      ["Formulas & Revisions", "industry.html?module=formulas", "bi-bezier2"],
      ["Mix Jobs", "industry.html?module=mix_jobs", "bi-droplet-half"],
      ["Quality Checks", "industry.html?module=quality_checks", "bi-clipboard-check"],
      ["Component Stock", "inventory.html", "bi-boxes"],
      ["Sales & Billing", "sales.html", "bi-receipt"],
      ["Paint Reports", "reports.html", "bi-graph-up-arrow"],
      ["Settings", "settings.html", "bi-gear"]
    ],
    hardware_paint: null,
    furniture: [
      ["Furniture Dashboard", "industry-dashboard.html", "bi-speedometer2"],
      ["Products & Catalogue", "products.html", "bi-lamp"],
      ["Custom Orders", "industry.html?module=custom_orders", "bi-rulers"],
      ["Measurements", "industry.html?module=measurements", "bi-bounding-box"],
      ["Production Stages", "industry.html?module=production_stages", "bi-kanban"],
      ["Procurement", "purchase.html", "bi-bag-plus"],
      ["Deliveries", "industry.html?module=deliveries", "bi-truck"],
      ["Installations", "industry.html?module=installations", "bi-house-gear"],
      ["Warranties & Claims", "industry.html?module=warranties", "bi-shield-check"],
      ["Furniture Reports", "reports.html", "bi-graph-up-arrow"],
      ["Settings", "settings.html", "bi-gear"]
    ],
    workshop: [
      ["Workshop Dashboard", "industry-dashboard.html", "bi-speedometer2"],
      ["Vehicles", "industry.html?module=vehicles", "bi-car-front"],
      ["Inspections", "industry.html?module=inspections", "bi-clipboard-check"],
      ["Estimates", "industry.html?module=estimates", "bi-file-earmark-text"],
      ["Job Cards", "industry.html?module=job_cards", "bi-card-checklist"],
      ["Technicians & Bays", "industry.html?module=technicians", "bi-person-gear"],
      ["Parts & Inventory", "inventory.html", "bi-tools"],
      ["Quality Checks", "industry.html?module=quality_checks", "bi-patch-check"],
      ["Invoices & Payments", "sales.html", "bi-receipt"],
      ["Service Reminders", "industry.html?module=service_reminders", "bi-bell"],
      ["Workshop Reports", "reports.html", "bi-graph-up-arrow"],
      ["Settings", "settings.html", "bi-gear"]
    ],
    wholesale: [
      ["Wholesale Dashboard", "industry-dashboard.html", "bi-speedometer2"],
      ["Customers & Credit", "customer.html", "bi-people"],
      ["Price Lists", "industry.html?module=price_lists", "bi-tags"],
      ["Sales Orders", "industry.html?module=sales_orders", "bi-file-earmark-text"],
      ["Pick Lists", "industry.html?module=pick_lists", "bi-list-check"],
      ["Packing & Dispatch", "industry.html?module=dispatches", "bi-box-seam"],
      ["Routes & Delivery", "industry.html?module=routes", "bi-truck"],
      ["Backorders", "industry.html?module=backorders", "bi-hourglass-split"],
      ["Collections", "industry.html?module=collections", "bi-cash-coin"],
      ["Inventory", "inventory.html", "bi-boxes"],
      ["Wholesale Reports", "reports.html", "bi-graph-up-arrow"],
      ["Settings", "settings.html", "bi-gear"]
    ],
    manufacturing: [
      ["Manufacturing Dashboard", "industry-dashboard.html", "bi-speedometer2"],
      ["Products & BOM", "industry.html?module=bills_of_materials", "bi-diagram-3"],
      ["Work Orders", "industry.html?module=work_orders", "bi-clipboard-data"],
      ["Material Issue", "industry.html?module=material_issue", "bi-box-arrow-up"],
      ["Work in Progress", "industry.html?module=work_in_progress", "bi-hourglass-split"],
      ["Finished Goods", "industry.html?module=finished_goods", "bi-box-seam"],
      ["Inventory", "inventory.html", "bi-boxes"],
      ["Purchases", "purchase.html", "bi-bag-plus"],
      ["Production Reports", "reports.html", "bi-graph-up-arrow"],
      ["Settings", "settings.html", "bi-gear"]
    ]
  };
  INDUSTRY_NAV.hardware_paint = INDUSTRY_NAV.paint;

  let dictionary = {};
  let context = null;
  let language = "en";

  function unwrap(response) { return response && Object.prototype.hasOwnProperty.call(response, "data") ? response.data : response; }
  function text(key, fallback) { return dictionary[key] || fallback || key; }
  function hasFeature(key) {
    const features = context?.features || {};
    if (features["*"]?.enabled) return true;
    if (features[key]?.enabled) return true;
    const parts = String(key || "").split(".");
    for (let index = parts.length - 1; index > 0; index -= 1) if (features[parts.slice(0, index).join(".") + ".*"]?.enabled) return true;
    return false;
  }
  function hasPermission(permission) {
    const access = context?.access;
    if (!access) return false;
    if (access.isOwner || access.isAdmin || access.permissions?.includes("*")) return true;
    if (access.permissions?.includes(permission)) return true;
    const parts = String(permission || "").split(".");
    for (let index = parts.length - 1; index > 0; index -= 1) if (access.permissions?.includes(parts.slice(0, index).join(".") + ".*") ) return true;
    return false;
  }
  function formatMoney(amount, currencyCode) {
    const code = currencyCode || context?.business?.currency || "QAR";
    const locale = context?.locale?.numberLocale || context?.business?.numberLocale || (language === "ar" ? "ar-QA" : "en-QA");
    try { return new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(Number(amount || 0)); } catch (_) { return `${code} ${Number(amount || 0).toFixed(2)}`; }
  }
  function applyTranslations(root) {
    (root || document).querySelectorAll("[data-i18n]").forEach(element => { const key = element.dataset.i18n; if (key && dictionary[key]) element.textContent = dictionary[key]; });
    (root || document).querySelectorAll(".nav-linkx span,button,.btn").forEach(element => {
      if (element.children.length) return;
      const key = EXACT_KEYS[element.textContent.trim()];
      if (key && dictionary[key]) element.textContent = dictionary[key];
    });
    document.documentElement.lang = language;
    document.documentElement.dir = ["ar", "ur"].includes(language) ? "rtl" : "ltr";
    document.body.classList.toggle("axtor-rtl", document.documentElement.dir === "rtl");
  }
  async function loadDictionary(code) {
    const safe = ["en","ar","zh-CN","hi","ur","hinglish","sw","fr","es","pt"].includes(code) ? code : "en";
    const response = await fetch(`i18n/${safe}.json`, { cache: "no-cache" });
    if (!response.ok) throw new Error("Translation file unavailable");
    dictionary = await response.json(); language = safe; sessionStorage.setItem("axtorDisplayLanguage", safe); applyTranslations(document);
  }
  function addStyles() {
    const style = document.createElement("style");
    style.textContent = ".axtor-cloud-status{position:fixed;left:16px;bottom:16px;z-index:1085;border-radius:999px;padding:7px 12px;font-size:12px;font-weight:800;box-shadow:0 8px 22px rgba(0,0,0,.16)}.axtor-cloud-status.online{background:#e8fff7;color:#087052}.axtor-cloud-status.offline{background:#fff1f1;color:#a4262c}.axtor-plan-banner{margin:0;padding:9px 18px;text-align:center;background:#fff7d6;color:#684d00;font-size:13px;font-weight:700}.axtor-plan-block{position:fixed;inset:0;z-index:1100;background:rgba(7,24,20,.72);display:grid;place-items:center;padding:20px}.axtor-plan-block>div{max-width:520px;background:white;border-radius:22px;padding:30px;text-align:center}.axtor-lang{min-width:112px}.axtor-rtl .app-shell{direction:rtl}.axtor-rtl .sidebar{right:0;left:auto}.axtor-rtl .main{direction:rtl}.axtor-rtl table,.axtor-rtl input,.axtor-rtl select,.axtor-rtl textarea{text-align:right}@media(max-width:1199.98px){.axtor-rtl .sidebar{transform:translateX(110%)}.axtor-rtl .app-shell.sidebar-open .sidebar{transform:translateX(0)}}";
    document.head.appendChild(style);
  }
  function addLanguageSelector() {
    const topbar = document.querySelector(".topbar"); if (!topbar || topbar.querySelector(".axtor-lang")) return;
    const select = document.createElement("select"); select.className = "form-select form-select-sm axtor-lang"; select.setAttribute("aria-label", text("common.language", "Language"));
    for (const item of context?.languages || []) { const option = document.createElement("option"); option.value = item.code; option.textContent = item.name; option.selected = item.code === language; select.appendChild(option); }
    select.addEventListener("change", async () => { select.disabled = true; try { await loadDictionary(select.value); await window.AxtorAPI.apiPut("/api/v1/commercial/preferences", { language: select.value }); } catch (error) { console.error(error); } finally { select.disabled = false; } });
    const user = topbar.querySelector(".user-chip"); topbar.insertBefore(select, user || null);
  }
  function normalizedIndustryCode() {
    const raw = context?.industry?.industry?.code || context?.business?.industryCode || context?.business?.industry || "retail";
    return String(raw).trim().toLowerCase().replace(/[\s-]+/g, "_");
  }
  function currentLocationKey() {
    const file = location.pathname.split("/").pop() || "index.html";
    const module = new URLSearchParams(location.search).get("module");
    return file === "industry.html" && module ? `${file}?module=${module}` : file;
  }
  function navItemHtml(item, currentKey) {
    const [label, href, icon] = item;
    const targetFile = href.split(/[?#]/)[0];
    const currentFile = currentKey.split(/[?#]/)[0];
    const exactModule = currentKey === href;
    const active = exactModule || (!href.includes("?module=") && targetFile === currentFile);
    return `<a class="nav-linkx${active ? " active" : ""}" href="${href}"><i class="bi ${icon}"></i><span>${label}</span></a>`;
  }
  function renderIndustryNavigation() {
    const nav = document.querySelector(".nav-menu"); if (!nav) return;
    const selected = context?.industry?.industry;
    const code = normalizedIndustryCode();
    const items = INDUSTRY_NAV[code] || CORE_POS_NAV;
    nav.innerHTML = items.map(item => navItemHtml(item, currentLocationKey())).join("");
    nav.dataset.industryCode = code;

    const brand = document.querySelector(".sidebar .brand");
    if (brand) brand.href = code === "retail" ? "index.html" : "industry-dashboard.html";
    const subtitle = document.querySelector(".sidebar .brand span");
    if (subtitle) subtitle.textContent = code === "retail" ? "Retail POS System" : `${selected?.name || code.replaceAll("_", " ")} Management System`;
    const footer = document.querySelector(".sidebar-footer");
    if (footer) {
      const label = selected?.name || code.replaceAll("_", " ");
      footer.innerHTML = `<span class="status-dot"></span>${label} cloud mode<br><small>Tenant-scoped PostgreSQL records</small>`;
    }
  }
  function normalizeModule(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  }
  function moduleCandidates(value) {
    const normalized = normalizeModule(value);
    const values = new Set([normalized]);
    if (normalized.endsWith("ies")) values.add(normalized.slice(0, -3) + "y");
    if (normalized.endsWith("s")) values.add(normalized.slice(0, -1)); else values.add(normalized + "s");
    return [...values].filter(Boolean);
  }
  function activateIndustryModule() {
    if ((location.pathname.split("/").pop() || "") !== "industry.html") return;
    const requested = new URLSearchParams(location.search).get("module");
    if (!requested) return;
    const candidates = moduleCandidates(requested);
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      const select = document.querySelector("#industryEntitySelect");
      if (select && select.options.length && ![...select.options].some(option => option.value === "Loading…")) {
        const option = [...select.options].find(item => {
          const value = normalizeModule(item.value);
          const label = normalizeModule(item.textContent);
          return candidates.some(candidate => value === candidate || label === candidate || value.endsWith(`_${candidate}`) || label.endsWith(`_${candidate}`));
        });
        if (option) {
          select.value = option.value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
        }
        clearInterval(timer);
      } else if (attempts >= 40) clearInterval(timer);
    }, 100);
  }
  function applyFeatureAccess() {
    document.querySelectorAll(".nav-linkx[href]").forEach(link => { const file = (link.getAttribute("href") || "").split(/[?#]/)[0]; const key = NAV_FEATURES[file]; if (key && !hasFeature(key)) { link.hidden = true; link.setAttribute("aria-hidden", "true"); } });
    const page = location.pathname.split("/").pop() || "index.html"; const required = PAGE_FEATURES[page];
    if (required && !hasFeature(required)) { const block = document.createElement("div"); block.className = "axtor-plan-block"; block.innerHTML = `<div><div class="fs-1 mb-2">🔒</div><h3>${text("common.unavailablePlan", "Unavailable on your current plan")}</h3><p class="text-muted">${context?.plan?.name || "Current plan"}</p><a class="btn btn-brand" href="plans.html">${text("nav.plans", "Plans & Subscription")}</a></div>`; document.body.appendChild(block); }
    if (context?.readOnly) document.querySelectorAll("button:not([data-bs-dismiss]):not([data-search-open]),input[type=submit]").forEach(control => { control.disabled = true; control.title = text("status.readOnly", "Read-only"); });
  }
  function addPlanBanner() {
    const subscription = context?.subscription; if (!subscription) return;
    const planCode = String(context?.plan?.code || "").toLowerCase();
    const trial = String(subscription.status).toUpperCase() === "TRIAL" && planCode !== "enterprise";
    const end = subscription.trialEndsAt || subscription.currentPeriodEnd; const days = end ? Math.ceil((new Date(end).getTime() - Date.now()) / 86400000) : null;
    if (trial || context.readOnly) { const banner = document.createElement("div"); banner.className = "axtor-plan-banner"; banner.textContent = context.readOnly ? `${text("status.readOnly", "Read-only")} — renew the subscription to post new transactions.` : `${text("status.trial", "Trial")}: ${Math.max(0, days || 0)} day(s) remaining · ${context.plan?.name || "Basic"}`; const main = document.querySelector(".main"); main?.insertBefore(banner, main.firstChild); }
  }
  function showVersion() { const footer = document.querySelector('.sidebar-footer'); if (!footer || !context?.platform) return; const line = document.createElement('div'); line.className = 'small text-muted mt-2'; line.textContent = `v${context.platform.version} · ${context.platform.environment}`; footer.appendChild(line); }
  function addNetworkStatus() {
    const badge = document.createElement("div"); badge.className = "axtor-cloud-status"; document.body.appendChild(badge);
    const update = () => { const online = navigator.onLine; badge.className = `axtor-cloud-status ${online ? "online" : "offline"}`; badge.textContent = online ? `● ${text("status.online", "Online")}` : `● ${text("status.offline", "Offline")}`; };
    addEventListener("online", () => { update(); window.AxtorAPI?.clearResponseCache?.(); }); addEventListener("offline", update); update();
  }
  async function init() {
    addStyles(); addNetworkStatus();
    if (!window.AxtorAPI?.getToken?.()) { await loadDictionary("en"); return; }
    try {
      context = unwrap(await window.AxtorAPI.apiGet("/api/v1/commercial/context"));
      const preferred = context?.user?.preferredLanguage || context?.business?.defaultLanguage || sessionStorage.getItem("axtorDisplayLanguage") || "en";
      await loadDictionary(preferred); addLanguageSelector(); renderIndustryNavigation(); activateIndustryModule(); applyFeatureAccess(); addPlanBanner(); showVersion();
      window.dispatchEvent(new CustomEvent("axtor:platform-ready", { detail: context }));
    } catch (error) { console.error("Axtor platform context unavailable", error); await loadDictionary("en"); }
  }
  window.AxtorPlatform = { init, text, hasFeature, hasPermission, formatMoney, getContext: () => context, setLanguage: loadDictionary, renderIndustryNavigation };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})();