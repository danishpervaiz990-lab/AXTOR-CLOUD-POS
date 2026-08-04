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

  function roleFamily(value) {
    const role = String(value || "").trim().toLowerCase();
    if (role.includes("owner")) return "owner";
    if (role.includes("admin")) return "admin";
    if (role.includes("manager") || role.includes("supervisor")) return "manager";
    if (role.includes("accountant") || role.includes("finance")) return "accountant";
    if (role.includes("auditor") || role === "audit") return "auditor";
    if (role.includes("storekeeper") || role.includes("warehouse")) return "storekeeper";
    if (role.includes("cashier") || role.includes("till operator")) return "cashier";
    if (role.includes("salesperson") || role.includes("salesman") || role.includes("sales representative") || role.includes("van sales")) return "salesperson";
    return role;
  }

  function roleFamilies(session) {
    const user = session?.user || {};
    return [user.role].concat(Array.isArray(user.roles) ? user.roles : [])
      .filter(Boolean)
      .map(roleFamily);
  }

  function canViewFinancialReports(session) {
    return roleFamilies(session).some(function (role) {
      return ["owner", "admin", "manager", "accountant", "auditor"].includes(role);
    });
  }

  function canViewCustomers(session) {
    return roleFamilies(session).some(function (role) {
      return ["owner", "admin", "manager", "accountant", "auditor", "cashier", "salesperson"].includes(role);
    });
  }

  function currentRoleLabel(session) {
    const user = session?.user || {};
    return String(user.role || (Array.isArray(user.roles) ? user.roles[0] : "") || "this role");
  }

  function setReportVisibility(allowed) {
    document.querySelectorAll("[data-report-access='required']").forEach(function (element) {
      element.hidden = !allowed;
      element.setAttribute("aria-hidden", allowed ? "false" : "true");
    });
  }

  function setCustomerVisibility(allowed) {
    document.querySelectorAll("[data-customer-access='required']").forEach(function (element) {
      element.hidden = !allowed;
      element.setAttribute("aria-hidden", allowed ? "false" : "true");
    });
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

  async function loadOperationalDashboard(session) {
    const customerAccess = canViewCustomers(session);
    const values = await Promise.all([
      window.AxtorAPI.apiGet("/api/v1/dashboard/summary"),
      window.AxtorAPI.apiGet("/api/v1/products?active=true"),
      customerAccess
        ? window.AxtorAPI.apiGet("/api/v1/customers?active=true")
        : Promise.resolve({ customers: [] })
    ]);
    return {
      summary: unwrap(values[0]) || {},
      products: values[1]?.products || unwrap(values[1]) || [],
      customers: values[2]?.customers || unwrap(values[2]) || [],
      customerAccess: customerAccess
    };
  }

  function renderOperationalValues(operational) {
    setText("productCount", String(operational.products.length));
    setCustomerVisibility(operational.customerAccess);
    if (operational.customerAccess) setText("customerCount", String(operational.customers.length));
    setText("lowStock", String(operational.summary.inventory?.lowStockCount || 0));
  }

  function renderRestrictedDashboard(session, operational) {
    setReportVisibility(false);
    renderOperationalValues(operational);
    setText("reportPeriod", "Restricted");
    setText("topProductCount", "Restricted");
    setText("dashboardSyncText", "Operational dashboard loaded · Financial reports restricted");
    const status = document.getElementById("retailStatus");
    status.textContent = currentRoleLabel(session) + " can use permitted Retail operations. Requests outside this role's permissions were not sent.";
    status.className = "retail-status success";
  }

  async function renderReportDashboard(operational) {
    setReportVisibility(true);
    const period = monthWindow();
    const today = localDate(new Date());
    const values = await Promise.all([
      window.AxtorAPI.apiGet(reportPath("daily-sales", today, today)),
      window.AxtorAPI.apiGet(reportPath("daily-sales", period.from, period.to)),
      window.AxtorAPI.apiGet(reportPath("sale-products", period.from, period.to)),
      window.AxtorAPI.apiGet(reportPath("profit-loss", period.from, period.to))
    ]);

    const todayReport = unwrap(values[0]) || {};
    const monthReport = unwrap(values[1]) || {};
    const productReport = unwrap(values[2]) || {};
    const profitReport = unwrap(values[3]) || {};
    const profitRow = (profitReport.rows || []).find(function (row) { return row.line === "Gross Profit"; }) || {};
    const grossProfit = summaryValue(profitReport, "Gross Profit") || number(profitRow.amount);
    const grossMargin = summaryValue(profitReport, "Gross Margin %") || number(profitRow.salesPct);

    renderOperationalValues(operational);
    setText("todaySales", money(summaryValue(todayReport, "Sales")));
    setText("invoiceCount", String(summaryValue(todayReport, "Invoices")));
    setText("monthlySalesLabel", period.label + " Sales");
    setText("monthlySales", money(summaryValue(monthReport, "Sales")));
    setText("monthlyGrossProfit", money(grossProfit));
    setText("monthlyGrossMargin", grossMargin.toFixed(2) + "%");
    setText("receivables", money(operational.summary.receivables?.outstanding || 0));
    setText("reportPeriod", period.from + " to " + period.to);
    setText("dashboardSyncText", "Synced with Reports · " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    renderTopProducts(productReport);
    const status = document.getElementById("retailStatus");
    status.textContent = "Dashboard and Reports are reconciled from the same invoice-only report endpoints.";
    status.className = "retail-status success";
  }

  async function load() {
    const status = document.getElementById("retailStatus");
    try {
      if (!window.AxtorAPI || typeof window.AxtorAPI.apiGet !== "function") throw new Error("Axtor API helper is unavailable.");
      await verifyTenant();
      const session = unwrap(await window.AxtorAPI.apiGet("/api/v1/auth/me")) || {};
      const operational = await loadOperationalDashboard(session);
      if (canViewFinancialReports(session)) {
        await renderReportDashboard(operational);
      } else {
        renderRestrictedDashboard(session, operational);
      }
    } catch (error) {
      setText("dashboardSyncText", "Dashboard synchronization failed");
      status.textContent = error?.message || "Retail dashboard could not be loaded";
      status.className = "retail-status error";
      const body = document.getElementById("topProductsBody");
      if (body) body.innerHTML = '<tr><td colspan="5">Dashboard data could not be loaded.</td></tr>';
    }
  }

  document.addEventListener("DOMContentLoaded", load);
})();
