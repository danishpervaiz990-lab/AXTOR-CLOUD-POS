(function () {
  "use strict";

  function unwrap(value) {
    return value && Object.prototype.hasOwnProperty.call(value, "data") ? value.data : value;
  }

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function summaryValue(report, pattern) {
    const item = (report?.summary || []).find(function (entry) {
      return pattern.test(String(entry?.label || ""));
    });
    return item ? number(item.value) : null;
  }

  function sumRows(report, keys) {
    return (report?.rows || []).reduce(function (total, row) {
      const key = keys.find(function (candidate) { return row?.[candidate] !== undefined; });
      return total + (key ? number(row[key]) : 0);
    }, 0);
  }

  async function report(id, query) {
    const suffix = query ? "?" + query : "";
    return unwrap(await AxtorAPI.apiGet("/api/v1/reports/" + encodeURIComponent(id) + suffix, { cache: false })) || {};
  }

  async function batches() {
    return unwrap(await AxtorAPI.apiGet("/api/v1/industry/batches?limit=500", { cache: false })) || [];
  }

  function todayQuery() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const date = year + "-" + month + "-" + day;
    return "from=" + date + "&to=" + date;
  }

  function waitForApp() {
    return new Promise(function (resolve, reject) {
      let attempts = 0;
      const timer = window.setInterval(function () {
        attempts += 1;
        const app = document.getElementById("app");
        if (app && app.querySelector(".g-kpis")) {
          window.clearInterval(timer);
          resolve(app);
        } else if (attempts >= 100) {
          window.clearInterval(timer);
          reject(new Error("Grocery dashboard shell did not initialize"));
        }
      }, 100);
    });
  }

  async function reconcile() {
    const app = await waitForApp();
    const values = await Promise.all([
      report("daily-sales", todayQuery()),
      report("grocery-expiry-risk"),
      report("grocery-waste-share"),
      report("grocery-recall-share"),
      batches()
    ]);

    const daily = values[0];
    const expiry = values[1];
    const waste = values[2];
    const recalls = values[3];
    const batchRows = Array.isArray(values[4]) ? values[4] : [];

    const todaySales = summaryValue(daily, /sales|revenue|total/i) ?? sumRows(daily, ["sales", "total", "amount"]);
    const expiring = summaryValue(expiry, /expir|risk|batch|record/i) ?? (expiry.rows || []).length;
    const wasteRecords = summaryValue(waste, /record|entry|waste|movement/i) ?? (waste.rows || []).length;
    const openRecalls = (recalls.rows || []).filter(function (row) {
      return !["closed", "resolved", "completed"].includes(String(row?.status || "").toLowerCase());
    }).length;
    const blocked = batchRows.filter(function (row) {
      return ["expired", "quarantined", "recalled", "damaged", "blocked"].includes(String(row?.status || "").toLowerCase());
    }).length;

    app.innerHTML = '<div class="g-kpis">' +
      '<div class="g-kpi"><span>Today Sales</span><strong>QAR ' + todaySales.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</strong></div>' +
      '<div class="g-kpi"><span>Expiry Risk</span><strong>' + expiring.toLocaleString("en-US") + '</strong></div>' +
      '<div class="g-kpi"><span>Blocked Batches</span><strong>' + blocked.toLocaleString("en-US") + '</strong></div>' +
      '<div class="g-kpi"><span>Open Recalls</span><strong>' + openRecalls.toLocaleString("en-US") + '</strong></div>' +
      '</div><section class="g-panel"><h2>Fresh Stock Control</h2><p>Waste records: <strong>' + wasteRecords.toLocaleString("en-US") + '</strong></p>' +
      '<div class="g-note">Dashboard KPIs are reconciled from tenant-scoped PostgreSQL reports. Checkout continues to enforce FEFO and blocks expired, recalled, quarantined and damaged stock.</div></section>';
  }

  document.addEventListener("DOMContentLoaded", function () {
    reconcile().catch(function (error) {
      console.error("Grocery dashboard reconciliation failed", error);
      const app = document.getElementById("app");
      if (app) app.insertAdjacentHTML("beforeend", '<div class="g-status error">Dashboard reconciliation failed: ' + String(error.message || error) + '</div>');
    });
  });
})();
