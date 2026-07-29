/* Axtor POS Cloud — canonical General Retail dashboard/report synchronization. */
(function () {
  "use strict";

  var state = {
    loading: false,
    summary: null,
    charts: {},
    detailed: null,
    refreshTimer: 0
  };

  function q(selector, root) { return (root || document).querySelector(selector); }
  function qa(selector, root) { return Array.from((root || document).querySelectorAll(selector)); }
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }
  function unwrap(response) {
    return response && typeof response === "object" && Object.prototype.hasOwnProperty.call(response, "data")
      ? response.data
      : response;
  }
  function apiGet(path) {
    if (!window.AxtorAPI || typeof window.AxtorAPI.request !== "function") {
      return Promise.reject(new Error("Axtor API client is unavailable."));
    }
    return window.AxtorAPI.request("GET", path);
  }
  function amount(value) { return Number(value || 0); }
  function money(value, currency) {
    try {
      return new Intl.NumberFormat("en-QA", {
        style: "currency",
        currency: currency || state.summary?.currency || "QAR",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount(value));
    } catch (_) {
      return (currency || "QAR") + " " + amount(value).toFixed(2);
    }
  }
  function qty(value) { return amount(value).toLocaleString("en-QA", { maximumFractionDigits: 3 }); }
  function localIso(date) {
    var offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  }
  function defaultDates() {
    var from = q("#retailReportFrom");
    var to = q("#retailReportTo");
    if (!from || !to) return;
    var now = new Date();
    if (!from.value) from.value = localIso(new Date(now.getFullYear(), now.getMonth(), 1));
    if (!to.value) to.value = localIso(now);
  }
  function queryString() {
    var from = q("#retailReportFrom")?.value || "";
    var to = q("#retailReportTo")?.value || "";
    var params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return params.toString();
  }
  function status(message, type) {
    ["#retailReportingStatus", "#salesOverviewLiveStatus"].forEach(function (selector) {
      var element = q(selector);
      if (!element) return;
      element.className = "small mt-2 text-" + (type || "muted");
      element.textContent = message;
    });
  }
  function loadChartJs() {
    if (window.Chart) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var existing = q('script[data-axtor-chartjs="1"]');
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", function () { reject(new Error("Chart library failed to load.")); }, { once: true });
        return;
      }
      var script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/chart.js";
      script.async = true;
      script.dataset.axtorChartjs = "1";
      script.onload = resolve;
      script.onerror = function () { reject(new Error("Chart library failed to load.")); };
      document.head.appendChild(script);
    });
  }
  function destroyChart(key) {
    var chart = state.charts[key];
    if (chart && typeof chart.destroy === "function") chart.destroy();
    state.charts[key] = null;
  }
  function chart(key, canvas, config) {
    if (!canvas || !window.Chart) return;
    destroyChart(key);
    var old = typeof window.Chart.getChart === "function" ? window.Chart.getChart(canvas) : null;
    if (old) old.destroy();
    state.charts[key] = new window.Chart(canvas, config);
  }
  function monthLabel(value) {
    var parts = String(value || "").split("-");
    if (parts.length !== 2) return value || "";
    return new Date(Number(parts[0]), Number(parts[1]) - 1, 1).toLocaleDateString("en-QA", { month: "short", year: "2-digit" });
  }
  function setText(id, value) { var element = q("#" + id); if (element) element.textContent = value; }

  function ensureSalesOverview() {
    var root = q("#sales-overview");
    if (!root) return;
    var values = qa(".kpi-value", root);
    if (values[0]) values[0].id = "salesOverviewGross";
    if (values[1]) values[1].id = "salesOverviewPaid";
    if (values[2]) values[2].id = "salesOverviewCredit";
    if (values[3]) values[3].id = "salesOverviewReturns";
    values.forEach(function (element) { element.textContent = "Loading…"; });

    if (!q("#salesOverviewLiveStatus", root)) {
      var live = document.createElement("div");
      live.id = "salesOverviewLiveStatus";
      live.className = "small mt-2 text-muted";
      live.textContent = "Loading live database totals…";
      root.prepend(live);
    }

    if (!q("#salesOverviewTopProducts", root)) {
      var card = document.createElement("div");
      card.id = "salesOverviewTopProducts";
      card.className = "cardx mt-3";
      card.innerHTML =
        '<div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">' +
          '<div><h5 class="cardx-title mb-1">Top products</h5><p class="text-muted mb-0">Uses the same invoice and return totals as Reports.</p></div>' +
          '<a class="btn btn-soft btn-sm" href="reports.html">Open full reports</a>' +
        '</div>' +
        '<div class="table-wrap"><table class="table">' +
          '<thead><tr><th>SKU</th><th>Product</th><th>Category</th><th class="text-end">Net Qty</th><th class="text-end">Net Sales</th><th class="text-end">Profit</th></tr></thead>' +
          '<tbody id="salesOverviewTopProductsBody"><tr><td colspan="6" class="text-muted text-center py-3">Loading…</td></tr></tbody>' +
        '</table></div>';
      root.appendChild(card);
    }
  }

  function renderSalesOverview(data) {
    var overview = data.salesOverview || {};
    setText("salesOverviewGross", money(overview.grossSales));
    setText("salesOverviewPaid", String(overview.paidInvoiceCount || 0));
    setText("salesOverviewCredit", money(overview.creditSales));
    setText("salesOverviewReturns", money(overview.returns));
    var topBody = q("#salesOverviewTopProductsBody");
    if (topBody) {
      var rows = (data.topProducts || []).slice(0, 8);
      topBody.innerHTML = rows.length ? rows.map(function (row) {
        return "<tr>" +
          "<td>" + esc(row.sku || "-") + "</td>" +
          "<td><strong>" + esc(row.product || "Product") + "</strong></td>" +
          "<td>" + esc(row.category || "Uncategorized") + "</td>" +
          '<td class="text-end">' + qty(row.netQty) + "</td>" +
          '<td class="text-end"><strong>' + money(row.netSales) + "</strong></td>" +
          '<td class="text-end">' + money(row.profit) + "</td>" +
        "</tr>";
      }).join("") : '<tr><td colspan="6" class="text-muted text-center py-3">No posted invoice data for this period.</td></tr>';
    }
  }

  function renderCharts(data) {
    var months = data.monthlySales || [];
    var payment = data.paymentMix || [];
    var monthlyConfig = {
      type: "line",
      data: {
        labels: months.map(function (row) { return monthLabel(row.month); }),
        datasets: [
          { label: "Gross sales", data: months.map(function (row) { return amount(row.grossSales); }), tension: 0.25, fill: false },
          { label: "Net sales", data: months.map(function (row) { return amount(row.netSales); }), tension: 0.25, fill: false }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, scales: { y: { beginAtZero: true } } }
    };
    var paymentConfig = {
      type: "doughnut",
      data: { labels: payment.map(function (row) { return row.method; }), datasets: [{ data: payment.map(function (row) { return amount(row.total); }) }] },
      options: { responsive: true, maintainAspectRatio: false }
    };
    chart("sales-monthly", q("#salesTrendChart"), monthlyConfig);
    chart("sales-payment", q("#paymentMixChart"), paymentConfig);
    chart("reports-monthly", q("#retailMonthlySalesChart"), monthlyConfig);
    chart("reports-payment", q("#retailPaymentMixChart"), paymentConfig);
  }

  function renderReports(data) {
    if (!q("#retailReportsRoot")) return;
    var overview = data.salesOverview || {};
    setText("reportGrossSales", money(overview.grossSales));
    setText("reportNetSales", money(overview.netSales));
    setText("reportInvoices", String(overview.invoiceCount || 0));
    setText("reportPaidInvoices", String(overview.paidInvoiceCount || 0));
    setText("reportCollected", money(overview.collected));
    setText("reportOutstanding", money(overview.outstanding));
    setText("reportReturns", money(overview.returns));
    setText("reportRefunds", money(overview.refunds));
    setText("reportPeriod", (data.period?.from || "-") + " to " + (data.period?.to || "-"));

    var topBody = q("#retailTopProductsBody");
    if (topBody) {
      topBody.innerHTML = (data.topProducts || []).length ? data.topProducts.map(function (row) {
        return "<tr>" +
          "<td>" + esc(row.sku || "-") + "</td>" +
          "<td><strong>" + esc(row.product || "Product") + "</strong></td>" +
          "<td>" + esc(row.category || "Uncategorized") + "</td>" +
          '<td class="text-end">' + qty(row.soldQty) + "</td>" +
          '<td class="text-end">' + qty(row.returnedQty) + "</td>" +
          '<td class="text-end"><strong>' + qty(row.netQty) + "</strong></td>" +
          '<td class="text-end">' + money(row.netSales) + "</td>" +
          '<td class="text-end">' + money(row.cost) + "</td>" +
          '<td class="text-end"><strong>' + money(row.profit) + "</strong></td>" +
        "</tr>";
      }).join("") : '<tr><td colspan="9" class="text-muted text-center py-4">No product sales for this period.</td></tr>';
    }

    var reconciliationBody = q("#retailReconciliationBody");
    if (reconciliationBody) {
      reconciliationBody.innerHTML = (data.reconciliation || []).map(function (row) {
        var pass = String(row.result).toUpperCase() === "PASS";
        return "<tr>" +
          "<td>" + esc(row.metric) + "</td>" +
          '<td class="text-end">' + money(row.transactionTotal) + "</td>" +
          '<td class="text-end">' + money(row.reportTotal) + "</td>" +
          '<td class="text-end">' + money(row.difference) + "</td>" +
          '<td><span class="badge-soft ' + (pass ? "badge-paid" : "badge-danger-soft") + '">' + esc(row.result) + "</span></td>" +
        "</tr>";
      }).join("");
    }
  }

  async function refreshSummary(manual) {
    if (state.loading) return;
    state.loading = true;
    ensureSalesOverview();
    status("Loading synchronized live sales and report totals…", "muted");
    try {
      var suffix = queryString();
      var response = await apiGet("/api/v1/dashboard/summary" + (suffix ? "?" + suffix : ""));
      var data = unwrap(response) || {};
      state.summary = data;
      renderSalesOverview(data);
      renderReports(data);
      try {
        await loadChartJs();
        renderCharts(data);
      } catch (chartError) {
        status("Totals loaded, but charts could not be displayed: " + chartError.message, "warning");
        state.loading = false;
        return;
      }
      var stamp = data.generatedAt ? new Date(data.generatedAt).toLocaleString("en-QA") : new Date().toLocaleString("en-QA");
      status("Live database totals synchronized with Reports. Updated " + stamp + ".", "success");
      void manual;
    } catch (error) {
      console.error("Retail reporting refresh failed:", error);
      status("Unable to load live reporting data. " + (error.message || "Please retry."), "danger");
      ["salesOverviewGross", "salesOverviewPaid", "salesOverviewCredit", "salesOverviewReturns"].forEach(function (id) {
        var element = q("#" + id);
        if (element) element.textContent = "Unavailable";
      });
    } finally {
      state.loading = false;
    }
  }

  function detailedValue(value, key) {
    if (value == null) return "";
    if (typeof value === "number" && /(amount|total|sales|paid|balance|cost|profit|tax|debit|credit|value|payout|commission)/i.test(key)) return money(value);
    if (typeof value === "object") return esc(JSON.stringify(value));
    if (/date/i.test(key) && !Number.isNaN(new Date(value).getTime())) return esc(new Date(value).toLocaleString("en-QA"));
    return esc(value);
  }

  async function runDetailedReport() {
    var reportId = q("#retailDetailedReport")?.value || "daily-sales";
    var body = q("#retailDetailedBody");
    var head = q("#retailDetailedHead");
    var summary = q("#retailDetailedSummary");
    if (body) body.innerHTML = '<tr><td class="text-muted text-center py-4">Loading report…</td></tr>';
    try {
      var suffix = queryString();
      var response = await apiGet("/api/v1/reports/" + encodeURIComponent(reportId) + (suffix ? "?" + suffix : ""));
      var data = unwrap(response) || {};
      state.detailed = data;
      setText("retailDetailedTitle", data.title || "Detailed Report");
      var columns = Array.isArray(data.columns) ? data.columns : [];
      var rows = Array.isArray(data.rows) ? data.rows : [];
      if (head) head.innerHTML = "<tr>" + columns.map(function (column) { return "<th>" + esc(column.label || column.key) + "</th>"; }).join("") + "</tr>";
      if (body) {
        body.innerHTML = rows.length ? rows.map(function (row) {
          return "<tr>" + columns.map(function (column) { var key = column.key || ""; return "<td>" + detailedValue(row[key], key) + "</td>"; }).join("") + "</tr>";
        }).join("") : '<tr><td colspan="' + Math.max(columns.length, 1) + '" class="text-muted text-center py-4">No records for this period.</td></tr>';
      }
      if (summary) {
        summary.innerHTML = (data.summary || []).map(function (item) {
          var value = typeof item.value === "number" ? money(item.value) : esc(item.value);
          return '<span class="badge-soft badge-paid me-2 mb-2">' + esc(item.label) + ": " + value + "</span>";
        }).join("");
      }
    } catch (error) {
      console.error("Detailed report failed:", error);
      if (body) body.innerHTML = '<tr><td class="text-danger text-center py-4">' + esc(error.message || "Report failed.") + "</td></tr>";
    }
  }

  function exportDetailedCsv() {
    var data = state.detailed;
    if (!data || !Array.isArray(data.columns) || !Array.isArray(data.rows)) return;
    function csv(value) { return '"' + String(value == null ? "" : value).replace(/"/g, '""') + '"'; }
    var lines = [data.columns.map(function (column) { return csv(column.label || column.key); }).join(",")];
    data.rows.forEach(function (row) { lines.push(data.columns.map(function (column) { return csv(row[column.key]); }).join(",")); });
    var blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = (data.title || "axtor-report").toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".csv";
    document.body.appendChild(link);
    link.click();
    URL.revokeObjectURL(link.href);
    link.remove();
  }

  function scheduleRefresh() {
    clearTimeout(state.refreshTimer);
    state.refreshTimer = window.setTimeout(function () { refreshSummary(false); }, 2500);
    window.setTimeout(function () { refreshSummary(false); }, 6500);
  }

  function bind() {
    q("#runRetailReportBtn")?.addEventListener("click", function () { refreshSummary(true); });
    q("#runDetailedReportBtn")?.addEventListener("click", runDetailedReport);
    q("#exportDetailedReportBtn")?.addEventListener("click", exportDetailedCsv);
    q("#printRetailReportBtn")?.addEventListener("click", function () { window.print(); });
    document.addEventListener("shown.bs.tab", function (event) {
      if (event.target?.getAttribute("data-bs-target") === "#sales-overview") refreshSummary(false);
    });
    document.addEventListener("click", function (event) {
      if (event.target.closest("[data-sales-create-backend], #saveCustomerPaymentBtn, [data-returns-post], [data-refund-submit], #completeSaleBtn")) scheduleRefresh();
    });
    window.addEventListener("focus", function () { refreshSummary(false); });
    document.addEventListener("visibilitychange", function () { if (!document.hidden) refreshSummary(false); });
  }

  function init() {
    if (!q("#sales-overview") && !q("#retailReportsRoot")) return;
    defaultDates();
    ensureSalesOverview();
    bind();
    refreshSummary(false);
    if (q("#retailDetailedReport")) runDetailedReport();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.AxtorRetailReporting = { refresh: refreshSummary, runDetailedReport: runDetailedReport };
})();
