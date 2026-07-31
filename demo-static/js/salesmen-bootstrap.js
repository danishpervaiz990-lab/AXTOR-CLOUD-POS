/* Axtor POS Cloud — one-time migration of legacy browser salesmen to PostgreSQL. */
(function () {
  "use strict";
  var key = "axtor-salesmen-postgres-migration-v1";

  function api(method, path, body) {
    if (!window.AxtorAPI?.request) return Promise.reject(new Error("Axtor API client is unavailable"));
    return window.AxtorAPI.request(method, path, body);
  }
  function data(response) { return response && typeof response === "object" && "data" in response ? response.data : response; }
  function legacyRows() {
    try {
      var source = JSON.parse(localStorage.getItem("axtorAdvancedDemoDB") || "{}");
      return Array.isArray(source.salesmen) ? source.salesmen : [];
    } catch (_) { return []; }
  }
  function clean(value) { return String(value == null ? "" : value).trim(); }

  async function migrate() {
    if (sessionStorage.getItem(key) === "done") return;
    var rows = legacyRows().filter(function (row) { return clean(row.name) && row.active !== false; });
    if (!rows.length) { sessionStorage.setItem(key, "done"); return; }
    var existing = data(await api("GET", "/api/v1/salesmen?month=" + new Date().toISOString().slice(0, 7))) || [];
    var names = new Set(existing.map(function (item) { var salesman = item.salesman || item; return clean(salesman.name).toLowerCase(); }));
    var created = false;
    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i];
      if (names.has(clean(row.name).toLowerCase())) continue;
      await api("POST", "/api/v1/salesmen", { name: clean(row.name), phone: clean(row.phone) || null, email: clean(row.email) || null, branchId: clean(row.branchId) || null, commissionType: row.commissionType || "percentage", commissionRate: Number(row.commissionRate || 0), active: true });
      names.add(clean(row.name).toLowerCase());
      created = true;
    }
    sessionStorage.setItem(key, "done");
    if (created) window.dispatchEvent(new CustomEvent("axtor:salesmen-migrated"));
  }

  function loadRetailReporting() {
    if (!document.getElementById("sales-overview") || window.AxtorRetailReporting || document.querySelector('script[data-axtor-retail-reporting="1"]')) return;
    var script = document.createElement("script");
    script.src = "js/retail-reporting-backend.js?v=20260730-retail-report-qatar3";
    script.async = false;
    script.dataset.axtorRetailReporting = "1";
    script.onerror = function () {
      var root = document.getElementById("sales-overview");
      if (!root || document.getElementById("salesOverviewLiveStatus")) return;
      var status = document.createElement("div");
      status.id = "salesOverviewLiveStatus";
      status.className = "small text-danger mb-2";
      status.textContent = "Live sales reporting module failed to load. Please refresh the page.";
      root.prepend(status);
    };
    document.head.appendChild(script);
  }

  function loadSavedInvoiceTemplatePrint() {
    if (!document.getElementById("saved-invoices") || window.AxtorModernSavedInvoicePrint || document.querySelector('script[data-axtor-modern-saved-print="1"]')) return;
    var script = document.createElement("script");
    script.src = "js/retail-modern-a4-saved-print.js?v=20260731-modern-a4-all-saved-print-v2";
    script.async = false;
    script.dataset.axtorModernSavedPrint = "1";
    script.onerror = function () {
      console.error("Retail saved-invoice template print module failed to load.");
    };
    document.head.appendChild(script);
  }

  migrate().catch(function (error) { console.warn("Axtor legacy salesman migration skipped:", error?.message || error); });
  loadRetailReporting();
  loadSavedInvoiceTemplatePrint();
})();
