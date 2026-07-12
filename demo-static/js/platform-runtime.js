(function () {
  "use strict";

  const EXACT_KEYS = {
    "Dashboard":"nav.dashboard","Terminal":"nav.terminal","Sales":"nav.sales","Shifts / Closing":"nav.shifts","Customers":"nav.customers","Salesmen & Commission":"nav.salesmen","Products":"nav.products","Inventory":"nav.inventory","Barcode Labels":"nav.barcode","Purchases":"nav.purchases","Branches":"nav.branches","Promotions":"nav.promotions","Loyalty":"nav.loyalty","Approvals":"nav.approvals","Reports":"nav.reports","Accounts":"nav.accounts","Expenses":"nav.expenses","Setup Wizard":"nav.setup","Notifications":"nav.notifications","Invoice Designer":"nav.invoiceDesigner","Settings":"nav.settings",
    "Save":"action.save","Add":"action.add","Cancel":"action.cancel","Edit":"action.edit","Delete":"action.delete","Print":"action.print","Search":"action.search","Save Invoice":"sales.saveInvoice","Add Product":"sales.addProduct","Select Customer":"sales.selectCustomer","Complete Sale":"sales.complete"
  };
  const PAGE_FEATURES = {
    "sales.html":"sales.invoices","terminal.html":"sales.invoices","purchase.html":"purchases.*","expenses.html":"expenses.*","accounts.html":"accounts.*","promotions.html":"promotions.basic","loyalty.html":"loyalty.basic","approvals.html":"approvals.basic","reports.html":"reports.daily_sales","branches.html":"core.products","barcode-labels.html":"barcode"
  };
  const NAV_FEATURES = {
    "purchase.html":"purchases.*","expenses.html":"expenses.*","accounts.html":"accounts.*","promotions.html":"promotions.basic","loyalty.html":"loyalty.basic","approvals.html":"approvals.basic","barcode-labels.html":"barcode"
  };
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
    for (let index = parts.length - 1; index > 0; index -= 1) if (access.permissions?.includes(parts.slice(0, index).join(".") + ".*")) return true;
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
  function applyFeatureAccess() {
    document.querySelectorAll(".nav-linkx[href]").forEach(link => { const file = (link.getAttribute("href") || "").split(/[?#]/)[0]; const key = NAV_FEATURES[file]; if (key && !hasFeature(key)) { link.hidden = true; link.setAttribute("aria-hidden", "true"); } });
    const page = location.pathname.split("/").pop() || "index.html"; const required = PAGE_FEATURES[page];
    if (required && !hasFeature(required)) { const block = document.createElement("div"); block.className = "axtor-plan-block"; block.innerHTML = `<div><div class="fs-1 mb-2">🔒</div><h3>${text("common.unavailablePlan", "Unavailable on your current plan")}</h3><p class="text-muted">${context?.plan?.name || "Current plan"}</p><a class="btn btn-brand" href="plans.html">${text("nav.plans", "Plans & Subscription")}</a></div>`; document.body.appendChild(block); }
    if (context?.readOnly) document.querySelectorAll("button:not([data-bs-dismiss]):not([data-search-open]),input[type=submit]").forEach(control => { control.disabled = true; control.title = text("status.readOnly", "Read-only"); });
  }
  function addPlanBanner() {
    const subscription = context?.subscription; if (!subscription) return;
    const end = subscription.trialEndsAt || subscription.currentPeriodEnd; const days = end ? Math.ceil((new Date(end).getTime() - Date.now()) / 86400000) : null;
    if (String(subscription.status).toUpperCase() === "TRIAL" || context.readOnly) { const banner = document.createElement("div"); banner.className = "axtor-plan-banner"; banner.textContent = context.readOnly ? `${text("status.readOnly", "Read-only")} — renew the subscription to post new transactions.` : `${text("status.trial", "Trial")}: ${Math.max(0, days || 0)} day(s) remaining · ${context.plan?.name || "Basic"}`; const main = document.querySelector(".main"); main?.insertBefore(banner, main.firstChild); }
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
      await loadDictionary(preferred); addLanguageSelector(); applyFeatureAccess(); addPlanBanner(); showVersion();
      window.dispatchEvent(new CustomEvent("axtor:platform-ready", { detail: context }));
    } catch (error) { console.error("Axtor platform context unavailable", error); await loadDictionary("en"); }
  }
  window.AxtorPlatform = { init, text, hasFeature, hasPermission, formatMoney, getContext: () => context, setLanguage: loadDictionary };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})();
