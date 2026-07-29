/* Axtor POS Cloud — canonical General Retail dashboard/report synchronization. */
(function () {
  "use strict";

  var state = {
    loading: false,
    summary: null,
    charts: {},
    refreshTimer: 0,
    reportPeriodInitialized: false,
    reportRangeReplayScheduled: false
  };

  function q(selector, root) { return (root || document).querySelector(selector); }
  function qa(selector, root) { return Array.from((root || document).querySelectorAll(selector)); }
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }
  function unwrap(response) {
    return response && typeof response === "object" && Object.prototype.hasOwnProperty.call(response, "data") ? response.data : response;
  }
  function apiGet(path) {
    if (!window.AxtorAPI) return Promise.reject(new Error("Axtor API client is unavailable."));
    if (typeof window.AxtorAPI.request === "function") return window.AxtorAPI.request("GET", path);
    if (typeof window.AxtorAPI.apiGet === "function") return window.AxtorAPI.apiGet(path);
    return Promise.reject(new Error("Axtor API GET helper is unavailable."));
  }
  function number(value) { var parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
  function money(value) {
    var currency = state.summary?.currency || "QAR";
    try {
      return new Intl.NumberFormat("en-QA", { style: "currency", currency: currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number(value));
    } catch (_) { return currency + " " + number(value).toFixed(2); }
  }
  function qty(value) { return number(value).toLocaleString("en-QA", { maximumFractionDigits: 3 }); }
  function dateValue(primary, fallback) { return String(q(primary)?.value || q(fallback)?.value || "").trim(); }
  function queryString() {
    if (q("#reportTable") && !state.reportPeriodInitialized) return "";
    var params = new URLSearchParams();
    var from = dateValue("#retailReportFrom", "#reportFrom");
    var to = dateValue("#retailReportTo", "#reportTo");
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return params.toString();
  }
  function synchronizeReportPeriod(data) {
    if (!q("#reportTable") || state.reportPeriodInitialized) return false;
    var from = q("#reportFrom");
    var to = q("#reportTo");
    var serverFrom = String(data?.period?.from || "").trim();
    var serverTo = String(data?.period?.to || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(serverFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(serverTo)) {
      throw new Error("Backend reporting period is unavailable or invalid.");
    }
    if (from) from.value = serverFrom;
    if (to) to.value = serverTo;
    state.reportPeriodInitialized = true;
    if (state.reportRangeReplayScheduled) return false;
    state.reportRangeReplayScheduled = true;
    return true;
  }
  function replayReportWithServerPeriod() {
    var button = q("#runReportBtn");
    if (button) button.click();
  }
  function status(message, type) {
    ["#retailReportingStatus", "#salesOverviewLiveStatus"].forEach(function (selector) {
      var target = q(selector);
      if (!target) return;
      target.className = "small mt-2 text-" + (type || "muted");
      target.textContent = message;
    });
  }
  function setText(id, value) { var target = q("#" + id); if (target) target.textContent = value; }
  function monthLabel(value) {
    var parts = String(value || "").split("-");
    if (parts.length !== 2) return value || "";
    return new Date(Number(parts[0]), Number(parts[1]) - 1, 1).toLocaleDateString("en-QA", { month: "short", year: "2-digit" });
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
    var existing = state.charts[key];
    if (existing && typeof existing.destroy === "function") existing.destroy();
    state.charts[key] = null;
  }
  function drawChart(key, canvas, config) {
    if (!canvas || !window.Chart) return;
    destroyChart(key);
    var prior = typeof window.Chart.getChart === "function" ? window.Chart.getChart(canvas) : null;
    if (prior) prior.destroy();
    state.charts[key] = new window.Chart(canvas, config);
  }

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
      card.innerHTML = '<div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3"><div><h5 class="cardx-title mb-1">Top products</h5><p class="text-muted mb-0">Uses the same posted invoices and returns as Reports.</p></div><a class="btn btn-soft btn-sm" href="reports.html">Open full reports</a></div><div class="table-wrap"><table class="table"><thead><tr><th>SKU</th><th>Product</th><th>Category</th><th class="text-end">Net Qty</th><th class="text-end">Net Sales</th><th class="text-end">Profit</th></tr></thead><tbody id="salesOverviewTopProductsBody"><tr><td colspan="6" class="text-muted text-center py-3">Loading…</td></tr></tbody></table></div>';
      root.appendChild(card);
    }
  }

  function ensureReportsOverview() {
    if (!q("#reportTable") || q("#retailLiveOverview")) return;
    var controls = q(".report-controls");
    if (!controls) return;
    var section = document.createElement("section");
    section.id = "retailLiveOverview";
    section.className = "mb-3";
    section.innerHTML = '<div class="cardx mb-3"><div class="d-flex flex-wrap justify-content-between gap-2 align-items-start"><div><h5 class="cardx-title mb-1"><i class="bi bi-database-check me-2"></i>Live Retail Overview</h5><p class="text-muted mb-0">Sales Overview and Reports use one tenant-scoped backend calculation.</p><div id="retailReportingStatus" class="small mt-2 text-muted">Loading synchronized totals…</div></div><span class="badge-soft badge-paid">QAR 0.01 tolerance</span></div></div>' +
      '<div class="row g-3 mb-3"><div class="col-md-6 col-xl-3"><div class="cardx h-100"><div class="smallcaps">Gross sales</div><div id="reportGrossSales" class="kpi-value">Loading…</div><small class="text-muted">Posted invoices only</small></div></div><div class="col-md-6 col-xl-3"><div class="cardx h-100"><div class="smallcaps">Net sales</div><div id="reportNetSales" class="kpi-value">Loading…</div><small class="text-muted">Gross less returns</small></div></div><div class="col-md-6 col-xl-3"><div class="cardx h-100"><div class="smallcaps">Paid invoices</div><div id="reportPaidInvoices" class="kpi-value">0</div><small class="text-muted">No remaining balance</small></div></div><div class="col-md-6 col-xl-3"><div class="cardx h-100"><div class="smallcaps">Outstanding</div><div id="reportOutstanding" class="kpi-value">Loading…</div><small class="text-muted">Customer credit</small></div></div><div class="col-md-6 col-xl-3"><div class="cardx h-100"><div class="smallcaps">Invoices</div><div id="reportInvoices" class="kpi-value">0</div></div></div><div class="col-md-6 col-xl-3"><div class="cardx h-100"><div class="smallcaps">Collected</div><div id="reportCollected" class="kpi-value">Loading…</div></div></div><div class="col-md-6 col-xl-3"><div class="cardx h-100"><div class="smallcaps">Returns</div><div id="reportReturns" class="kpi-value">Loading…</div></div></div><div class="col-md-6 col-xl-3"><div class="cardx h-100"><div class="smallcaps">Refunds</div><div id="reportRefunds" class="kpi-value">Loading…</div></div></div></div>' +
      '<div class="row g-3 mb-3"><div class="col-xl-8"><div class="cardx h-100"><h5 class="cardx-title">Monthly sales</h5><div style="height:320px"><canvas id="retailMonthlySalesChart"></canvas></div></div></div><div class="col-xl-4"><div class="cardx h-100"><h5 class="cardx-title">Payment mix</h5><div style="height:320px"><canvas id="retailPaymentMixChart"></canvas></div></div></div></div>' +
      '<div class="cardx mb-3"><h5 class="cardx-title mb-1">Top products</h5><p class="text-muted">Return-adjusted quantity, sales, cost and profit for the selected date range.</p><div class="table-wrap"><table class="table"><thead><tr><th>SKU</th><th>Product</th><th>Category</th><th class="text-end">Sold</th><th class="text-end">Returned</th><th class="text-end">Net Qty</th><th class="text-end">Net Sales</th><th class="text-end">Cost</th><th class="text-end">Profit</th></tr></thead><tbody id="retailTopProductsBody"><tr><td colspan="9" class="text-muted text-center py-3">Loading…</td></tr></tbody></table></div></div>' +
      '<div class="cardx mb-3"><h5 class="cardx-title mb-1">Automatic reconciliation</h5><p class="text-muted">A failed row blocks launch readiness until corrected.</p><div class="table-wrap"><table class="table"><thead><tr><th>Metric</th><th class="text-end">Transaction Total</th><th class="text-end">Report Total</th><th class="text-end">Difference</th><th>Result</th></tr></thead><tbody id="retailReconciliationBody"><tr><td colspan="5" class="text-muted text-center py-3">Loading…</td></tr></tbody></table></div></div>';
    controls.parentNode.insertBefore(section, controls);
  }

  function renderSalesOverview(data) {
    var overview = data.salesOverview || {};
    setText("salesOverviewGross", money(overview.grossSales));
    setText("salesOverviewPaid", String(overview.paidInvoiceCount || 0));
    setText("salesOverviewCredit", money(overview.creditSales));
    setText("salesOverviewReturns", money(overview.returns));
    var body = q("#salesOverviewTopProductsBody");
    if (!body) return;
    var rows = (data.topProducts || []).slice(0, 8);
    body.innerHTML = rows.length ? rows.map(function (row) {
      return "<tr><td>" + esc(row.sku || "-") + "</td><td><strong>" + esc(row.product || "Product") + "</strong></td><td>" + esc(row.category || "Uncategorized") + '</td><td class="text-end">' + qty(row.netQty) + '</td><td class="text-end"><strong>' + money(row.netSales) + '</strong></td><td class="text-end">' + money(row.profit) + "</td></tr>";
    }).join("") : '<tr><td colspan="6" class="text-muted text-center py-3">No posted invoice data for this period.</td></tr>';
  }

  function renderReports(data) {
    if (!q("#retailLiveOverview")) return;
    var overview = data.salesOverview || {};
    setText("reportGrossSales", money(overview.grossSales)); setText("reportNetSales", money(overview.netSales));
    setText("reportPaidInvoices", String(overview.paidInvoiceCount || 0)); setText("reportOutstanding", money(overview.outstanding));
    setText("reportInvoices", String(overview.invoiceCount || 0)); setText("reportCollected", money(overview.collected));
    setText("reportReturns", money(overview.returns)); setText("reportRefunds", money(overview.refunds));
    var top = q("#retailTopProductsBody");
    if (top) {
      var rows = data.topProducts || [];
      top.innerHTML = rows.length ? rows.map(function (row) {
        return "<tr><td>" + esc(row.sku || "-") + "</td><td><strong>" + esc(row.product || "Product") + "</strong></td><td>" + esc(row.category || "Uncategorized") + '</td><td class="text-end">' + qty(row.soldQty) + '</td><td class="text-end">' + qty(row.returnedQty) + '</td><td class="text-end"><strong>' + qty(row.netQty) + '</strong></td><td class="text-end">' + money(row.netSales) + '</td><td class="text-end">' + money(row.cost) + '</td><td class="text-end"><strong>' + money(row.profit) + "</strong></td></tr>";
      }).join("") : '<tr><td colspan="9" class="text-muted text-center py-3">No product sales for this period.</td></tr>';
    }
    var reconciliation = q("#retailReconciliationBody");
    if (reconciliation) {
      reconciliation.innerHTML = (data.reconciliation || []).map(function (row) {
        var pass = String(row.result).toUpperCase() === "PASS";
        return "<tr><td>" + esc(row.metric) + '</td><td class="text-end">' + money(row.transactionTotal) + '</td><td class="text-end">' + money(row.reportTotal) + '</td><td class="text-end">' + money(row.difference) + '</td><td><span class="badge-soft ' + (pass ? "badge-paid" : "badge-danger-soft") + '">' + esc(row.result) + "</span></td></tr>";
      }).join("");
    }
  }

  function renderCharts(data) {
    var months = data.monthlySales || [];
    var payments = data.paymentMix || [];
    var monthly = { type: "line", data: { labels: months.map(function (row) { return monthLabel(row.month); }), datasets: [{ label: "Gross sales", data: months.map(function (row) { return number(row.grossSales); }), tension: 0.25, fill: false }, { label: "Net sales", data: months.map(function (row) { return number(row.netSales); }), tension: 0.25, fill: false }] }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, scales: { y: { beginAtZero: true } } } };
    var mix = { type: "doughnut", data: { labels: payments.map(function (row) { return row.method; }), datasets: [{ data: payments.map(function (row) { return number(row.total); }) }] }, options: { responsive: true, maintainAspectRatio: false } };
    drawChart("sales-monthly", q("#salesTrendChart"), monthly); drawChart("sales-payment", q("#paymentMixChart"), mix);
    drawChart("reports-monthly", q("#retailMonthlySalesChart"), monthly); drawChart("reports-payment", q("#retailPaymentMixChart"), mix);
  }

  async function refresh() {
    if (state.loading) return;
    state.loading = true;
    var replayReport = false;
    ensureSalesOverview(); ensureReportsOverview(); status("Loading synchronized live sales and report totals…", "muted");
    try {
      var suffix = queryString();
      var data = unwrap(await apiGet("/api/v1/dashboard/summary" + (suffix ? "?" + suffix : ""))) || {};
      state.summary = data;
      replayReport = synchronizeReportPeriod(data);
      renderSalesOverview(data); renderReports(data); await loadChartJs(); renderCharts(data);
      var stamp = data.generatedAt ? new Date(data.generatedAt).toLocaleString("en-QA") : new Date().toLocaleString("en-QA");
      status("Live database totals synchronized. Updated " + stamp + ".", "success");
    } catch (error) {
      console.error("Retail reporting refresh failed:", error);
      status("Unable to load synchronized reporting data. " + (error?.message || "Please retry."), "danger");
      ["salesOverviewGross", "salesOverviewPaid", "salesOverviewCredit", "salesOverviewReturns"].forEach(function (id) { var target = q("#" + id); if (target) target.textContent = "Unavailable"; });
    } finally {
      state.loading = false;
      if (replayReport) window.setTimeout(replayReportWithServerPeriod, 0);
    }
  }

  function scheduleRefresh() { clearTimeout(state.refreshTimer); state.refreshTimer = window.setTimeout(refresh, 2500); window.setTimeout(refresh, 6500); }
  function bind() {
    q("#runReportBtn")?.addEventListener("click", function () { window.setTimeout(refresh, 100); });
    document.addEventListener("shown.bs.tab", function (event) { if (event.target?.getAttribute("data-bs-target") === "#sales-overview") refresh(); });
    document.addEventListener("click", function (event) { if (event.target.closest("[data-sales-create-backend], #saveCustomerPaymentBtn, [data-returns-post], [data-refund-submit], #completeSaleBtn")) scheduleRefresh(); });
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) refresh(); });
  }
  function init() { if (!q("#sales-overview") && !q("#reportTable")) return; ensureSalesOverview(); ensureReportsOverview(); bind(); refresh(); }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  window.AxtorRetailReporting = { refresh: refresh };
})();
