(function () {
  "use strict";

  const REPORTS = [
    { id: "grocery-sales-category", label: "Sales by Category", basis: "Category sales ÷ total Grocery sales" },
    { id: "grocery-sales-brand", label: "Sales by Brand", basis: "Brand sales ÷ total Grocery sales" },
    { id: "grocery-payment-method", label: "Payment Method Summary", basis: "Payment-method sales ÷ total Grocery sales" },
    { id: "grocery-cashier-sales", label: "Cashier Sales", basis: "Cashier sales ÷ total Grocery sales" },
    { id: "grocery-terminal-sales", label: "Terminal / Counter Sales", basis: "Terminal sales ÷ total Grocery sales" }
  ];
  const REPORT_IDS = new Set(REPORTS.map(function (row) { return row.id; }));
  const MONEY_KEYS = new Set([
    "total", "paid", "balance", "sales", "cost", "profit", "amount", "subtotal", "tax", "cogs",
    "outstanding", "debit", "credit", "commission", "bonus", "payout", "averageTicket", "costImpact"
  ]);
  let lastReport = null;

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char];
    });
  }

  function num(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function money(value) {
    return "QAR " + num(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function isPercent(column) {
    return /pct$/i.test(column.key || "") || /%/.test(column.label || "");
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value == null ? "—" : value);
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit"
    }).format(date);
  }

  function formatCell(value, column) {
    if (isPercent(column)) return num(value).toFixed(2) + "%";
    if (column.key === "date" || /date$/i.test(column.key || "") || /At$/.test(column.key || "")) return formatDate(value);
    if (MONEY_KEYS.has(column.key)) return money(value);
    if (typeof value === "number") return value.toLocaleString("en-US", { maximumFractionDigits: 3 });
    return String(value == null ? "—" : value);
  }

  function selectedDefinition() {
    const select = document.getElementById("gReportSelect");
    return REPORTS.find(function (row) { return row.id === select?.value; }) || null;
  }

  function setFilterState(definition) {
    const filter = document.getElementById("gReportFilter");
    const basis = document.getElementById("gReportBasis");
    if (filter) {
      filter.disabled = true;
      filter.innerHTML = '<option value="">All records</option>';
    }
    if (basis) basis.textContent = "Percentage basis: " + definition.basis;
  }

  function renderSummary(report) {
    const target = document.getElementById("gReportSummary");
    if (!target) return;
    const countPattern = /invoices|cashiers|terminals|categories|brands|methods|rows|records|products/i;
    target.innerHTML = (report.summary || []).map(function (item) {
      let value;
      if (item.format === "percent" || /%/.test(item.label || "")) value = num(item.value).toFixed(2) + "%";
      else if (countPattern.test(item.label || "")) value = num(item.value).toLocaleString("en-US");
      else value = money(item.value);
      return '<div class="g-summary"><span>' + esc(item.label || "Total") + '</span><strong>' + esc(value) + '</strong></div>';
    }).join("") || '<div class="g-summary"><span>Rows</span><strong>' + num(report.rows?.length).toLocaleString("en-US") + '</strong></div>';
  }

  function renderReport(report, definition) {
    lastReport = report;
    const columns = Array.isArray(report.columns) ? report.columns : [];
    const rows = Array.isArray(report.rows) ? report.rows : [];
    const title = document.getElementById("gReportTitle");
    const basis = document.getElementById("gReportBasis");
    const count = document.getElementById("gReportCount");
    const head = document.getElementById("gReportHead");
    const body = document.getElementById("gReportBody");
    if (title) title.textContent = report.title || definition.label;
    if (basis) basis.textContent = "Percentage basis: " + definition.basis;
    if (count) count.textContent = rows.length.toLocaleString("en-US") + " row" + (rows.length === 1 ? "" : "s");
    if (head) head.innerHTML = "<tr>" + columns.map(function (column) {
      return "<th>" + esc(column.label || column.key) + "</th>";
    }).join("") + "</tr>";
    if (body) body.innerHTML = rows.length ? rows.map(function (row) {
      return "<tr>" + columns.map(function (column) {
        const value = formatCell(row[column.key], column);
        return isPercent(column)
          ? '<td><span class="g-percent">' + esc(value) + "</span></td>"
          : "<td>" + esc(value) + "</td>";
      }).join("") + "</tr>";
    }).join("") : '<tr><td colspan="' + Math.max(columns.length, 1) + '">No records found for this period.</td></tr>';
    renderSummary(report);
  }

  async function runReport(definition) {
    const button = document.getElementById("gRunReport");
    const status = document.getElementById("gReportStatus");
    const from = String(document.getElementById("gReportFrom")?.value || "").trim();
    const to = String(document.getElementById("gReportTo")?.value || "").trim();
    const query = new URLSearchParams();
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    if (button) {
      button.disabled = true;
      button.textContent = "Loading…";
    }
    if (status) {
      status.textContent = "Loading live PostgreSQL analytics…";
      status.className = "g-status";
    }
    try {
      const response = await AxtorAPI.apiGet("/api/v1/reports/" + encodeURIComponent(definition.id) + "?" + query.toString());
      const report = response && Object.prototype.hasOwnProperty.call(response, "data") ? response.data : response;
      renderReport(report || {}, definition);
      if (status) {
        status.textContent = "Report loaded successfully from live PostgreSQL tenant data.";
        status.className = "g-status ok";
      }
    } catch (error) {
      if (status) {
        status.textContent = error.message || "Report could not be loaded.";
        status.className = "g-status error";
      }
      const body = document.getElementById("gReportBody");
      if (body) body.innerHTML = '<tr><td class="g-error">' + esc(error.message || "Report failed") + "</td></tr>";
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Run Report";
      }
    }
  }

  function csvValue(value) {
    return '"' + String(value == null ? "" : value).replaceAll('"', '""') + '"';
  }

  function exportCsv() {
    if (!lastReport) return;
    const columns = lastReport.columns || [];
    const lines = [columns.map(function (column) { return csvValue(column.label || column.key); }).join(",")];
    (lastReport.rows || []).forEach(function (row) {
      lines.push(columns.map(function (column) { return csvValue(formatCell(row[column.key], column)); }).join(","));
    });
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = (lastReport.title || "grocery-report").toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".csv";
    document.body.appendChild(link);
    link.click();
    URL.revokeObjectURL(link.href);
    link.remove();
  }

  function install() {
    const select = document.getElementById("gReportSelect");
    const runButton = document.getElementById("gRunReport");
    const exportButton = document.getElementById("gExportReport");
    if (!select || !runButton) return false;

    REPORTS.forEach(function (definition) {
      if (!select.querySelector('option[value="' + definition.id + '"]')) {
        const option = document.createElement("option");
        option.value = definition.id;
        option.textContent = definition.label;
        select.appendChild(option);
      }
    });

    select.addEventListener("change", function (event) {
      const definition = selectedDefinition();
      if (!definition) return;
      event.stopImmediatePropagation();
      setFilterState(definition);
      runReport(definition);
    }, true);

    runButton.addEventListener("click", function (event) {
      const definition = selectedDefinition();
      if (!definition) return;
      event.stopImmediatePropagation();
      runReport(definition);
    }, true);

    if (exportButton) exportButton.addEventListener("click", function (event) {
      if (!REPORT_IDS.has(select.value)) return;
      event.stopImmediatePropagation();
      exportCsv();
    }, true);

    return true;
  }

  document.addEventListener("DOMContentLoaded", function () {
    let attempts = 0;
    const timer = window.setInterval(function () {
      attempts += 1;
      if (install() || attempts >= 60) window.clearInterval(timer);
    }, 100);
  });
})();
