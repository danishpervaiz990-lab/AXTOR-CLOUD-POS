(function () {
  "use strict";

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char];
    });
  }

  function unwrap(value) {
    return value && Object.prototype.hasOwnProperty.call(value, "data") ? value.data : value;
  }

  async function verifyTenant() {
    const registry = unwrap(await AxtorAPI.apiGet("/api/v1/industry/registry", { cache: false })) || {};
    const code = String(registry.selection?.code || registry.selected?.code || "").toLowerCase();
    if (code !== "retail") throw new Error("This application is available only to General Retail tenants.");
  }

  async function load() {
    try {
      await verifyTenant();
      const values = await Promise.all([
        AxtorAPI.apiGet("/api/v1/dashboard/summary", { cache: false }),
        AxtorAPI.apiGet("/api/v1/products?active=true", { cache: false }),
        AxtorAPI.apiGet("/api/v1/customers?active=true", { cache: false })
      ]);
      const summary = unwrap(values[0]) || {};
      const products = values[1]?.products || unwrap(values[1]) || [];
      const customers = values[2]?.customers || unwrap(values[2]) || [];
      document.getElementById("todaySales").textContent = Number(summary.today?.sales || summary.todaySales || 0).toFixed(2);
      document.getElementById("invoiceCount").textContent = String(summary.today?.invoices || summary.invoiceCount || 0);
      document.getElementById("productCount").textContent = String(products.length);
      document.getElementById("customerCount").textContent = String(customers.length);
      document.getElementById("lowStock").textContent = String(summary.inventory?.lowStockCount || 0);
      document.getElementById("receivables").textContent = Number(summary.receivables?.outstanding || summary.outstandingReceivables || 0).toFixed(2);
    } catch (error) {
      const status = document.getElementById("retailStatus");
      status.textContent = error.message || "Retail dashboard could not be loaded";
      status.className = "retail-status error";
    }
  }

  document.addEventListener("DOMContentLoaded", load);
})();
