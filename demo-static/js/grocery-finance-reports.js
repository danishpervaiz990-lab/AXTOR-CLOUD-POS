(function () {
  "use strict";
  if (document.body?.dataset.page !== "reports") return;

  const REPORTS = [
    { id: "grocery-customer-statement", label: "Customer Statement Summary", filter: "customerId" },
    { id: "grocery-supplier-statement", label: "Supplier Statement Summary", filter: "supplierId" },
    { id: "grocery-refund-impact", label: "Returns & Refunds Financial Impact", filter: "" },
    { id: "grocery-finance-summary", label: "Finance Reconciliation Summary", filter: "" }
  ];
  const MONEY = new Set([
    "invoiced", "paid", "returned", "refunded", "periodOutstanding", "currentBalance",
    "creditLimit", "purchased", "periodPayable", "invoiceTotal", "retainedRevenue", "amount"
  ]);

  let options = {};
  let lastReport = null;
  let remountTimer = null;
  let initialized = false;

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char];
    });
  }

  function unwrap(value) {
    return value && Object.prototype.hasOwnProperty.call(value, "data") ? value.data : value;
  }

  function money(value) {
    if (window.AxtorLocale?.money) return window.AxtorLocale.money(value);
    return "QAR " + Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function monthStart() {
    const date = new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10);
  }

  function wait(ms) {
    return new Promise(function (resolve) { window.setTimeout(resolve, ms); });
  }

  async function waitForStableCoreWorkspace() {
    let lastSignature = "";
    let stableTicks = 0;
    let fallbackApp = null;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const app = document.getElementById("app");
      if (app) {
        fallbackApp = app;
        const coreReady = Boolean(document.getElementById("gReportSelect"));
        const signature = `${app.childElementCount}:${app.textContent.length}:${coreReady}`;
        if (signature === lastSignature) stableTicks += 1;
        else stableTicks = 0;
        lastSignature = signature;
        if (coreReady && stableTicks >= 4) return app;
      }
      await wait(100);
    }
    if (fallbackApp) return fallbackApp;
    throw new Error("Grocery report workspace did not initialize");
  }

  function sectionMarkup() {
    return '<div class="g-panel-head"><div><h2>Finance Reconciliation</h2><p class="g-note">PostgreSQL-backed customer, supplier, returns/refunds and finance summary reports.</p></div></div>' +
      '<div class="g-form"><div><label>Report</label><select id="gfReport">' + REPORTS.map(function (report) {
        return '<option value="' + esc(report.id) + '">' + esc(report.label) + '</option>';
      }).join("") + '</select></div><div><label>From</label><input id="gfFrom" type="date"></div><div><label>To</label><input id="gfTo" type="date"></div><div><label>Customer / Supplier</label><select id="gfEntity"><option value="">All records</option></select></div></div>' +
      '<div class="g-actions"><button id="gfRun" class="g-btn" type="button">Run Finance Report</button><button id="gfCsv" class="g-btn secondary" type="button">Export CSV</button><button id="gfPrint" class="g-btn secondary" type="button">Print</button></div>' +
      '<div id="gfStatus" class="g-status"></div><div id="gfSummary" class="g-kpis"></div><div class="g-table-wrap"><table class="g-table"><thead id="gfHead"></thead><tbody id="gfBody"></tbody></table></div>';
  }

  function ensureMounted() {
    const app = document.getElementById("app");
    if (!app) return null;
    let section = document.getElementById("gFinanceReports");
    if (!section || !app.contains(section)) {
      section = document.createElement("section");
      section.className = "g-panel";
      section.id = "gFinanceReports";
      section.innerHTML = sectionMarkup();
      app.appendChild(section);
    }
    return section;
  }

  function controls() {
    const section = ensureMounted();
    if (!section) return null;
    const result = {
      section,
      report: section.querySelector("#gfReport"),
      from: section.querySelector("#gfFrom"),
      to: section.querySelector("#gfTo"),
      entity: section.querySelector("#gfEntity"),
      run: section.querySelector("#gfRun"),
      csv: section.querySelector("#gfCsv"),
      print: section.querySelector("#gfPrint"),
      status: section.querySelector("#gfStatus"),
      summary: section.querySelector("#gfSummary"),
      head: section.querySelector("#gfHead"),
      body: section.querySelector("#gfBody")
    };
    return Object.values(result).every(Boolean) ? result : null;
  }

  function definition(current) {
    const value = current?.report?.value || REPORTS[0].id;
    return REPORTS.find(function (report) { return report.id === value; }) || REPORTS[0];
  }

  function refreshEntity(current) {
    current = current || controls();
    if (!current) return false;
    const report = definition(current);
    const rows = report.filter === "customerId"
      ? (options.customers || [])
      : report.filter === "supplierId"
        ? (options.suppliers || [])
        : [];
    current.entity.disabled = !report.filter;
    current.entity.innerHTML = '<option value="">All records</option>' + rows.map(function (row) {
      return '<option value="' + esc(row.id) + '">' + esc(row.name || row.id) + '</option>';
    }).join("");
    return true;
  }

  function format(value, column) {
    if (/Pct$/.test(column.key) || /%/.test(column.label)) return Number(value || 0).toFixed(2) + "%";
    if (MONEY.has(column.key)) return money(value);
    return typeof value === "number"
      ? value.toLocaleString("en-US", { maximumFractionDigits: 3 })
      : esc(value ?? "—");
  }

  function render(report, current) {
    current = current || controls();
    if (!current) throw new Error("Finance report controls were replaced before rendering");
    lastReport = report;
    current.summary.innerHTML = (report.summary || []).map(function (item) {
      const value = item.format === "percent" ? Number(item.value || 0).toFixed(2) + "%" : money(item.value);
      return '<div class="g-kpi"><span>' + esc(item.label) + '</span><strong>' + value + '</strong></div>';
    }).join("");
    current.head.innerHTML = '<tr>' + (report.columns || []).map(function (column) {
      return '<th>' + esc(column.label) + '</th>';
    }).join("") + '</tr>';
    current.body.innerHTML = (report.rows || []).map(function (row) {
      return '<tr>' + (report.columns || []).map(function (column) {
        return '<td>' + format(row[column.key], column) + '</td>';
      }).join("") + '</tr>';
    }).join("") || '<tr><td colspan="99">No records found.</td></tr>';
  }

  async function run() {
    const current = controls();
    if (!current) throw new Error("Finance report workspace is unavailable");
    const report = definition(current);
    const query = new URLSearchParams({ from: current.from.value, to: current.to.value });
    if (report.filter && current.entity.value) query.set(report.filter, current.entity.value);
    current.status.className = "g-status";
    current.status.textContent = "Loading finance report…";
    try {
      const response = unwrap(await AxtorAPI.apiGet('/api/v1/reports/' + encodeURIComponent(report.id) + '?' + query.toString(), { cache: false }));
      render(response || {}, current);
      current.status.className = "g-status ok";
      current.status.textContent = "Finance report reconciled from PostgreSQL.";
    } catch (error) {
      const latest = controls();
      if (latest) {
        latest.status.className = "g-status error";
        latest.status.textContent = error.message || "Finance report failed";
      }
      throw error;
    }
  }

  function exportCsv() {
    if (!lastReport) return;
    const columns = lastReport.columns || [];
    const rows = [columns.map(function (column) { return column.label; })].concat(
      (lastReport.rows || []).map(function (row) { return columns.map(function (column) { return row[column.key]; }); })
    );
    const text = rows.map(function (row) {
      return row.map(function (value) { return '"' + String(value ?? '').replace(/"/g, '""') + '"'; }).join(',');
    }).join('\n');
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    anchor.download = (lastReport.title || 'grocery-finance-report').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.csv';
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  function bind(current) {
    if (!current || current.section.dataset.bound === "true") return;
    current.section.dataset.bound = "true";
    current.report.addEventListener("change", function () { refreshEntity(controls()); });
    current.run.addEventListener("click", function () { run().catch(function () {}); });
    current.csv.addEventListener("click", exportCsv);
    current.print.addEventListener("click", function () { window.print(); });
  }

  async function configureAndRun() {
    const current = controls();
    if (!current) return;
    current.from.value = current.from.value || monthStart();
    current.to.value = current.to.value || today();
    refreshEntity(current);
    bind(current);
    await run().catch(function () {});
  }

  function scheduleRemount() {
    if (!initialized || remountTimer || document.getElementById("gFinanceReports")) return;
    remountTimer = window.setTimeout(function () {
      remountTimer = null;
      configureAndRun().catch(function (error) { console.error("Grocery finance report remount failed", error); });
    }, 150);
  }

  async function init() {
    await waitForStableCoreWorkspace();
    ensureMounted();
    options = unwrap(await AxtorAPI.apiGet('/api/v1/reports/options', { cache: false })) || {};
    await configureAndRun();
    initialized = true;
    const observer = new MutationObserver(scheduleRemount);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function start() {
    window.setTimeout(function () {
      init().catch(function (error) { console.error("Grocery finance reports failed", error); });
    }, 100);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
