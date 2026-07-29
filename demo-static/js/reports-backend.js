(function () {
  "use strict";

  const REPORTS_PATH = "/api/v1/reports";
  const REPORTS = [
    { id: "daily-sales", label: "Daily Sales", filter: "customer", basis: "Paid amount ÷ invoice total" },
    { id: "sale-products", label: "Sales by Product", filter: "product", basis: "Gross profit ÷ product sales" },
    { id: "sale-customer", label: "Sales by Customer", filter: "customer", basis: "Amount paid ÷ customer sales" },
    { id: "sales-return", label: "Sales Returns", filter: "customer", basis: "Return amount ÷ total return amount" },
    { id: "stock-valuation", label: "Stock Valuation", filter: "warehouse", basis: "Item stock value ÷ total stock value" },
    { id: "purchase-report", label: "Purchases", filter: "supplier", basis: "Amount paid ÷ purchase total" },
    { id: "tax-report", label: "Tax", filter: "none", basis: "Tax amount ÷ taxable subtotal" },
    { id: "expense-report", label: "Expenses", filter: "branch", basis: "Expense amount ÷ total expenses" },
    { id: "profit-loss", label: "Profit & Loss", filter: "none", basis: "Each line ÷ net sales; Gross Profit is the gross margin" },
    { id: "trial-balance", label: "Trial Balance", filter: "none", basis: "Account value ÷ total debit or credit side" },
    { id: "balance-sheet", label: "Balance Sheet", filter: "none", basis: "Line amount ÷ total assets" },
    { id: "general-ledger", label: "General Ledger", filter: "none", basis: "Row movement ÷ total ledger movement" },
    { id: "salesman-commission", label: "Salesman Commission", filter: "salesman", basis: "Payout ÷ salesman sales; Achievement % is also shown" },
    { id: "customer-profit-loss", label: "Customer Profit / Loss", filter: "customer", basis: "Customer profit ÷ customer sales" }
  ];

  const MONEY_KEYS = new Set(["total", "paid", "balance", "sales", "cost", "profit", "amount", "stockValue", "retailValue", "subtotal", "tax", "cogs", "outstanding", "debit", "credit", "commission", "bonus", "payout"]);
  const COUNT_LABEL = /invoices|customers|entries|products|returns|count/i;
  let reportOptions = {};
  let lastReport = null;

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char];
    });
  }

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

  function reportDefinition() {
    const selected = document.getElementById("reportSelect")?.value || REPORTS[0].id;
    return REPORTS.find(function (item) { return item.id === selected; }) || REPORTS[0];
  }

  function message(text, type) {
    const target = document.getElementById("reportStatus");
    if (!target) return;
    target.innerHTML = text ? '<div class="alert alert-' + esc(type || "info") + ' py-2 mb-0">' + esc(text) + "</div>" : "";
  }

  function localDate(date) {
    const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return shifted.toISOString().slice(0, 10);
  }

  function setDefaultDates() {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    document.getElementById("reportFrom").value = localDate(first);
    document.getElementById("reportTo").value = localDate(now);
  }

  function populateReportSelect() {
    document.getElementById("reportSelect").innerHTML = REPORTS.map(function (item) {
      return '<option value="' + esc(item.id) + '">' + esc(item.label) + "</option>";
    }).join("");
  }

  function listForFilter(filter) {
    if (filter === "branch") return reportOptions.branches || [];
    if (filter === "customer") return reportOptions.customers || [];
    if (filter === "product") return reportOptions.products || [];
    if (filter === "supplier") return reportOptions.suppliers || [];
    if (filter === "salesman") return reportOptions.salesmen || [];
    if (filter === "warehouse") return reportOptions.warehouses || [];
    return [];
  }

  function refreshEntityFilter() {
    const definition = reportDefinition();
    const target = document.getElementById("reportEntityFilter");
    const rows = listForFilter(definition.filter);
    target.disabled = definition.filter === "none";
    target.innerHTML = '<option value="">All records</option>' + rows.map(function (row) {
      const name = definition.filter === "product" && row.sku ? row.sku + " — " + row.name : row.name;
      return '<option value="' + esc(row.id) + '">' + esc(name || row.id) + "</option>";
    }).join("");
    document.getElementById("reportBasis").textContent = "Percentage basis: " + definition.basis;
  }

  function buildPath(definition) {
    const params = new URLSearchParams();
    const from = String(document.getElementById("reportFrom").value || "").trim();
    const to = String(document.getElementById("reportTo").value || "").trim();
    const entity = String(document.getElementById("reportEntityFilter").value || "").trim();
    if (definition.id === "salesman-commission") {
      params.set("month", (from || localDate(new Date())).slice(0, 7));
    } else {
      if (from) params.set("from", from);
      if (to) params.set("to", to);
    }
    if (entity && definition.filter !== "none") params.set(definition.filter + "Id", entity);
    return REPORTS_PATH + "/" + encodeURIComponent(definition.id) + "?" + params.toString();
  }

  function isPercentColumn(column) {
    return /pct$/i.test(column.key || "") || /%/.test(column.label || "");
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value ?? "-");
    return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
  }

  function formatCell(value, column) {
    if (isPercentColumn(column)) return number(value).toFixed(2) + "%";
    if (column.key === "date" || /date$/i.test(column.key || "")) return formatDate(value);
    if (MONEY_KEYS.has(column.key)) return money(value);
    if (typeof value === "number") return value.toLocaleString("en-US", { maximumFractionDigits: 3 });
    return String(value ?? "-");
  }

  function renderSummary(report) {
    const target = document.getElementById("reportSummary");
    const summary = Array.isArray(report.summary) ? report.summary : [];
    target.innerHTML = summary.map(function (item) {
      let value;
      if (item.format === "percent" || /%/.test(item.label || "")) value = number(item.value).toFixed(2) + "%";
      else if (COUNT_LABEL.test(item.label || "")) value = number(item.value).toLocaleString("en-US");
      else value = money(item.value);
      return '<div class="report-kpi"><div class="smallcaps">' + esc(item.label || "Total") + '</div><strong>' + esc(value) + "</strong></div>";
    }).join("");
  }

  function renderReport(report, definition) {
    lastReport = report;
    const columns = Array.isArray(report.columns) ? report.columns : [];
    const rows = Array.isArray(report.rows) ? report.rows : [];
    document.getElementById("reportTitle").textContent = report.title || definition.label;
    document.getElementById("reportBasis").textContent = "Percentage basis: " + definition.basis;
    document.getElementById("reportRowCount").textContent = rows.length.toLocaleString("en-US") + " row" + (rows.length === 1 ? "" : "s");
    document.getElementById("reportTableHead").innerHTML = "<tr>" + columns.map(function (column) {
      return "<th>" + esc(column.label || column.key) + "</th>";
    }).join("") + "</tr>";
    const body = document.getElementById("reportTableBody");
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="' + Math.max(columns.length, 1) + '" class="text-muted">No records found for this period.</td></tr>';
    } else {
      body.innerHTML = rows.map(function (row) {
        return "<tr>" + columns.map(function (column) {
          const display = formatCell(row[column.key], column);
          return isPercentColumn(column)
            ? '<td class="percentage-cell"><span class="percentage-badge">' + esc(display) + "</span></td>"
            : "<td>" + esc(display) + "</td>";
        }).join("") + "</tr>";
      }).join("");
    }
    renderSummary(report);
  }

  async function runReport() {
    const definition = reportDefinition();
    const button = document.getElementById("runReportBtn");
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Loading';
    message("Loading live report data...", "info");
    try {
      const response = await window.AxtorAPI.apiGet(buildPath(definition));
      renderReport(unwrap(response) || {}, definition);
      message("Report loaded from PostgreSQL successfully.", "success");
    } catch (error) {
      document.getElementById("reportTableBody").innerHTML = '<tr><td class="text-danger">' + esc(error?.message || "Report could not be loaded") + "</td></tr>";
      message(error?.message || "Report could not be loaded.", "danger");
    } finally {
      button.disabled = false;
      button.innerHTML = '<i class="bi bi-play-fill me-1"></i>Run Report';
    }
  }

  function csvValue(value) {
    return '"' + String(value ?? "").replaceAll('"', '""') + '"';
  }

  function exportCsv() {
    if (!lastReport) { message("Run a report before exporting.", "warning"); return; }
    const columns = lastReport.columns || [];
    const lines = [columns.map(function (column) { return csvValue(column.label || column.key); }).join(",")];
    (lastReport.rows || []).forEach(function (row) {
      lines.push(columns.map(function (column) { return csvValue(formatCell(row[column.key], column)); }).join(","));
    });
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = (lastReport.title || "axtor-report").toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".csv";
    document.body.appendChild(link);
    link.click();
    URL.revokeObjectURL(link.href);
    link.remove();
  }

  async function init() {
    if (!window.AxtorAPI || typeof window.AxtorAPI.apiGet !== "function") {
      message("Backend API helper is unavailable.", "danger");
      return;
    }
    populateReportSelect();
    setDefaultDates();
    try {
      const registry = unwrap(await window.AxtorAPI.apiGet("/api/v1/industry/registry")) || {};
      const code = String(registry.selection?.code || registry.selected?.code || "").toLowerCase();
      if (code && code !== "retail") throw new Error("This reports centre is available only to General Retail tenants.");
      reportOptions = unwrap(await window.AxtorAPI.apiGet(REPORTS_PATH + "/options")) || {};
      refreshEntityFilter();
      document.getElementById("reportSelect").addEventListener("change", function () { refreshEntityFilter(); runReport(); });
      document.getElementById("runReportBtn").addEventListener("click", runReport);
      document.getElementById("exportReportBtn").addEventListener("click", exportCsv);
      document.getElementById("printReportBtn").addEventListener("click", function () { window.print(); });
      await runReport();
    } catch (error) {
      message(error?.message || "Reports could not be initialized.", "danger");
      document.getElementById("reportTableBody").innerHTML = '<tr><td class="text-danger">' + esc(error?.message || "Initialization failed") + "</td></tr>";
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
