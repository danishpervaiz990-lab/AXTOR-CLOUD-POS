(function () {
  "use strict";

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

  function canReadSettings() {
    return Boolean(window.AxtorPaintRoleAwareSettings?.canReadSettings?.());
  }

  function restrictedShell() {
    const current = "paint-settings.html";
    const links = NAV.map(function (item) {
      return '<a class="' + (item[0] === current ? "active" : "") + '" href="' + esc(item[0]) + '">' + esc(item[1]) + "</a>";
    }).join("");
    document.body.innerHTML = '<div class="p-shell"><aside class="p-nav"><div class="p-brand"><span class="p-brand-symbol" aria-hidden="true">🎨</span><span class="p-brand-copy"><strong>AXTOR · PAINT</strong><small>FORMULA · MIX · QUALITY · DELIVERY</small></span></div>' + links + '</aside><main class="p-main"><section class="p-hero"><h1>Paint Settings</h1><p>Tenant branding, invoice and notification configuration</p></section><div id="app"><section id="paintSettingsRoleNotice" class="p-panel"><h2>Settings access</h2><p class="p-note">Your Paint role can use its assigned operational workspace. Tenant branding, invoice settings and notification rules are managed by the Owner, Admin, Paint Shop Manager or Accountant.</p></section></div></main></div>';
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
          reject(new Error("Paint settings application did not render " + selector));
        }
      }, 50);
    });
  }

  async function start() {
    await verifyPaintTenant();
    if (!canReadSettings()) {
      restrictedShell();
      return;
    }
    await loadScript("js/paint-isolation-branding-runtime.js?v=20260806-dom-ready1");
    await loadScript("js/paint-app.js?v=20260806-dom-ready1");
    activatePaintApp();
    await waitForElement("#ruleForm", 18000);
    await loadScript("js/paint-print-settings-backend.js?v=20260806-dom-ready1");
    await loadScript("js/paint-document-print-backend.js?v=20260806-dom-ready1");
  }

  start().catch(function (error) {
    console.error("Paint settings role loader failed", error);
    restrictedShell();
    const notice = document.getElementById("paintSettingsRoleNotice");
    if (notice) notice.insertAdjacentHTML("beforeend", '<p class="p-status error">' + esc(error.message || error) + "</p>");
  });

  window.AxtorPaintRoleAwareSettingsPage = { canReadSettings };
})();
