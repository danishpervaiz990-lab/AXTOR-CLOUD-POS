(function () {
  "use strict";

  function unwrap(value) {
    return value && Object.prototype.hasOwnProperty.call(value, "data") ? value.data : value;
  }

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function money(value) {
    return "QAR " + number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function localDate(date) {
    const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return shifted.toISOString().slice(0, 10);
  }

  function monthWindow() {
    const now = new Date();
    return {
      from: localDate(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: localDate(now),
      label: new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(now)
    };
  }

  function reportPath(id, from, to) {
    const params = new URLSearchParams({ from: from, to: to });
    return "/api/v1/reports/" + encodeURIComponent(id) + "?" + params.toString();
  }

  function summaryValue(report, label) {
    const item = (report?.summary || []).find(function (entry) { return String(entry.label || "").toLowerCase() === label.toLowerCase(); });
    return number(item?.value);
  }

  function setText(id, value) {
    const target = document.getElementById(id);
    if (target) target.textContent = value;
  }

  function renderTopProducts(report) {
    const body = document.getElementById("topProductsBody");
    if (!body) return;
    const rows = (report?.rows || []).slice().sort(function (a, b) { return number(b.sales) - number(a.sales); }).slice(0, 10);
    setText("topProductCount", String((report?.rows || []).length));
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="5">No product sales found for this month.</td></tr>';
      return;
    }
    body.innerHTML = rows.map(function (row) {
      return "<tr>" +
        "<td><strong>" + String(row.product || "-").replace(/[&<>"']/g, function (char) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]; }) + "</strong><small>" + String(row.sku || "-") + "</small></td>" +
        "<td>" + number(row.qty).toLocaleString("en-US", { maximumFractionDigits: 3 }) + "</td>" +
        "<td>" + money(row.sales) + "</td>" +
        "<td>" + money(row.profit) + "</td>" +
        '<td><span class="retail-percent">' + number(row.marginPct).toFixed(2) + "%</span></td>" +
        "</tr>";
    }).join("");
  }

  async function verifyTenant() {
    const registry = unwrap(await window.AxtorAPI.apiGet("/api/v1/industry/registry")) || {};
    const code = String(registry.selection?.code || registry.selected?.code || "").toLowerCase();
    if (code && code !== "retail") throw new Error("This application is available only to General Retail tenants.");
  }

  async function load() {
    const status = document.getElementById("retailStatus");
    try {
      if (!window.AxtorAPI || typeof window.AxtorAPI.apiGet !== "function") throw new Error("Axtor API helper is unavailable.");
      await verifyTenant();
      const period = monthWindow();
      const today = localDate(new Date());
      const values = await Promise.all([
        window.AxtorAPI.apiGet(reportPath("daily-sales", today, today)),
        window.AxtorAPI.apiGet(reportPath("daily-sales", period.from, period.to)),
        window.AxtorAPI.apiGet(reportPath("sale-products", period.from, period.to)),
        window.AxtorAPI.apiGet(reportPath("profit-loss", period.from, period.to)),
        window.AxtorAPI.apiGet("/api/v1/dashboard/summary"),
        window.AxtorAPI.apiGet("/api/v1/products?active=true"),
        window.AxtorAPI.apiGet("/api/v1/customers?active=true")
      ]);

      const todayReport = unwrap(values[0]) || {};
      const monthReport = unwrap(values[1]) || {};
      const productReport = unwrap(values[2]) || {};
      const profitReport = unwrap(values[3]) || {};
      const summary = unwrap(values[4]) || {};
      const products = values[5]?.products || unwrap(values[5]) || [];
      const customers = values[6]?.customers || unwrap(values[6]) || [];
      const profitRow = (profitReport.rows || []).find(function (row) { return row.line === "Gross Profit"; }) || {};
      const grossProfit = summaryValue(profitReport, "Gross Profit") || number(profitRow.amount);
      const grossMargin = summaryValue(profitReport, "Gross Margin %") || number(profitRow.salesPct);

      setText("todaySales", money(summaryValue(todayReport, "Sales")));
      setText("invoiceCount", String(summaryValue(todayReport, "Invoices")));
      setText("monthlySalesLabel", period.label + " Sales");
      setText("monthlySales", money(summaryValue(monthReport, "Sales")));
      setText("monthlyGrossProfit", money(grossProfit));
      setText("monthlyGrossMargin", grossMargin.toFixed(2) + "%");
      setText("productCount", String(products.length));
      setText("customerCount", String(customers.length));
      setText("lowStock", String(summary.inventory?.lowStockCount || 0));
      setText("receivables", money(summary.receivables?.outstanding || 0));
      setText("reportPeriod", period.from + " to " + period.to);
      setText("dashboardSyncText", "Synced with Reports · " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      renderTopProducts(productReport);
      status.textContent = "Dashboard and Reports are reconciled from the same invoice-only report endpoints.";
      status.className = "retail-status success";
    } catch (error) {
      setText("dashboardSyncText", "Report synchronization failed");
      status.textContent = error?.message || "Retail dashboard could not be loaded";
      status.className = "retail-status error";
      const body = document.getElementById("topProductsBody");
      if (body) body.innerHTML = '<tr><td colspan="5">Dashboard report data could not be loaded.</td></tr>';
    }
  }

  document.addEventListener("DOMContentLoaded", load);
})();
