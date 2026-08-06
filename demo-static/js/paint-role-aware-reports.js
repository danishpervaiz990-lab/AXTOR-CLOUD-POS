(function () {
  "use strict";

  const REPORT_ROLES = new Set([
    "owner", "admin", "administrator", "manager", "paint manager", "paint shop manager", "accountant", "auditor"
  ]);
  const RESTRICTED_REPORT_ROLES = new Set([
    "paint salesperson", "salesperson", "colorist", "colourist", "paint storekeeper", "storekeeper", "paint quality inspector", "quality inspector"
  ]);
  const NAV = [
    ["paint-dashboard.html", "Dashboard"],
    ["paint-catalogue.html", "Colour Catalogue"],
    ["paint-formulas.html", "Formulas"],
    ["paint-formula-revisions.html", "Formula Revisions"],
    ["paint-mix-jobs.html", "Mix Jobs"],
    ["paint-component-stock.html", "Component Stock"],
    ["paint-consumption.html", "Consumption"],
    ["paint-quality.html", "Quality Check"],
    ["paint-labels.html", "Mix Labels"],
    ["paint-deliveries.html", "Delivery & Reversal"],
    ["paint-reports.html", "Reports"],
    ["paint-settings.html", "Settings"]
  ];

  function normalize(value) {
    if (value && typeof value === "object") return String(value.name || value.role || value.code || "").trim().toLowerCase();
    return String(value || "").trim().toLowerCase();
  }

  function storedRoles() {
    if (window.AxtorPaintRoleAwareSettings?.roles) return window.AxtorPaintRoleAwareSettings.roles();
    let user = {};
    for (const key of ["currentUser", "axtorCurrentUser"]) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || "null");
        if (parsed && typeof parsed === "object") { user = parsed; break; }
      } catch (_) {}
    }
    return [user.role, user.roleName, ...(Array.isArray(user.roles) ? user.roles : [])].map(normalize).filter(Boolean);
  }

  function isExplicitlyRestricted() {
    return storedRoles().some(function (role) { return RESTRICTED_REPORT_ROLES.has(role); });
  }

  function canReadReports() {
    const roles = storedRoles();
    return !roles.some(function (role) { return RESTRICTED_REPORT_ROLES.has(role); })
      && roles.some(function (role) { return REPORT_ROLES.has(role); });
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char];
    });
  }

  async function verifyPaintTenant() {
    const response = await window.AxtorAPI.apiGet("/api/v1/industry/registry", { cache: false });
    const registry = response?.data ?? response ?? {};
    const code = String(registry.selection?.code || registry.selected?.code || "").trim().toLowerCase();
    if (code !== "paint") {
      sessionStorage.removeItem("axtorAuthReturnUrl");
      location.replace("/router.html?reason=paint-industry-isolation");
      throw new Error("Paint frontend rejected a non-Paint tenant");
    }
  }

  function restrictedShell() {
    const current = "paint-reports.html";
    const links = NAV.map(function (item) {
      return '<a class="' + (item[0] === current ? "active" : "") + '" href="' + esc(item[0]) + '">' + esc(item[1]) + "</a>";
    }).join("");
    document.body.innerHTML = '<div class="p-shell"><aside class="p-nav"><div class="p-brand"><span class="p-brand-symbol" aria-hidden="true">🎨</span><span class="p-brand-copy"><strong>AXTOR · PAINT</strong><small>FORMULA · MIX · QUALITY · DELIVERY</small></span></div>' + links + '</aside><main class="p-main"><section class="p-hero"><h1>Paint Reports</h1><p>Role-based financial and operational reporting</p></section><div id="app"><section id="paintReportsRoleNotice" class="p-panel"><h2>Reports access</h2><p class="p-note">Your Paint role can use its assigned operational workspace. Financial, margin and executive reports are available to the Owner, Admin, Paint Shop Manager, Accountant and Auditor.</p></section></div></main></div>';
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = function () { reject(new Error("Unable to load " + src)); };
      document.body.appendChild(script);
    });
  }

  function activatePaintApp() {
    if (document.readyState !== "loading") {
      document.dispatchEvent(new Event("DOMContentLoaded"));
    }
  }

  function waitForElement(selector, timeout) {
    return new Promise(function (resolve, reject) {
      const started = Date.now();
      const timer = setInterval(function () {
        const element = document.querySelector(selector);
        if (element) {
          clearInterval(timer);
          resolve(element);
          return;
        }
        if (Date.now() - started >= timeout) {
          clearInterval(timer);
          reject(new Error("Paint reports application did not render " + selector));
        }
      }, 50);
    });
  }

  async function start() {
    await verifyPaintTenant();
    if (!canReadReports()) {
      restrictedShell();
      return;
    }
    await loadScript("js/paint-isolation-branding-runtime.js?v=20260806-dom-ready1");
    await loadScript("js/paint-app.js?v=20260806-dom-ready1");
    activatePaintApp();
    await waitForElement("#reportForm", 18000);
  }

  start().catch(function (error) {
    console.error("Paint reports role loader failed", error);
    restrictedShell();
    const notice = document.getElementById("paintReportsRoleNotice");
    if (notice) notice.insertAdjacentHTML("beforeend", '<p class="p-status error">' + esc(error.message || error) + "</p>");
  });

  window.AxtorPaintRoleAwareReports = { roles: storedRoles, canReadReports, isExplicitlyRestricted };
})();
