(function () {
  "use strict";

  if (document.body.dataset.retailTerminalCertification === "ready") return;
  document.body.dataset.retailTerminalCertification = "ready";

  function api() {
    if (!window.AxtorAPI) throw new Error("Authenticated API runtime is unavailable");
    return window.AxtorAPI;
  }

  function unwrap(value) {
    if (!value) return value;
    if (Object.prototype.hasOwnProperty.call(value, "data")) return value.data;
    return value;
  }

  function list(value) {
    const data = unwrap(value) || [];
    return Array.isArray(data) ? data : (data.items || data.customers || data.users || []);
  }

  function option(value, text) {
    const item = document.createElement("option");
    item.value = value || "";
    item.textContent = text;
    return item;
  }

  function selectedValue(select) {
    return select ? String(select.value || "") : "";
  }

  function fillCustomers(rows) {
    const select = document.getElementById("terminalCustomer");
    if (!select) return;
    const selected = selectedValue(select);
    select.replaceChildren(option("", "Walk-in Customer"));
    rows.filter(function (row) { return row && row.id && row.active !== false; }).forEach(function (row) {
      select.appendChild(option(row.id, row.name + (row.phone ? " — " + row.phone : "")));
    });
    if ([...select.options].some(function (row) { return row.value === selected; })) select.value = selected;
  }

  function fillSalespeople(rows) {
    const select = document.getElementById("saleSmId");
    if (!select) return;
    const selected = selectedValue(select);
    select.replaceChildren(option("", "— Select Salesman (optional) —"));
    rows.filter(function (row) { return row && row.id && row.active !== false; }).forEach(function (row) {
      select.appendChild(option(row.id, row.name || row.email || "Salesperson"));
    });
    if ([...select.options].some(function (row) { return row.value === selected; })) select.value = selected;
  }

  function ensureDueDate() {
    const credit = document.getElementById("terminalPayCredit");
    const cart = document.querySelector(".terminal-cart .cardx");
    if (!credit || !cart) return null;
    let wrap = document.getElementById("terminalDueDateWrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "terminalDueDateWrap";
      wrap.className = "mt-3 d-none";
      wrap.innerHTML = '<label class="form-label fw-bold" for="terminalDueDate">Credit due date</label><input class="form-control" id="terminalDueDate" type="date"><div class="form-text">Required whenever any amount remains on credit.</div>';
      credit.closest(".pay-grid").insertAdjacentElement("afterend", wrap);
    }
    const input = document.getElementById("terminalDueDate");
    const sync = function () {
      const required = Number(credit.value || 0) > 0;
      wrap.classList.toggle("d-none", !required);
      input.required = required;
      if (required && !input.value) {
        const due = new Date();
        due.setDate(due.getDate() + 30);
        input.value = due.toISOString().slice(0, 10);
      }
    };
    credit.addEventListener("input", sync);
    sync();
    return input;
  }

  function repairCounterMarkup(context) {
    const select = document.getElementById("terminalCounterSelect");
    if (!select) return;
    const rows = context.counters || [];
    const selected = selectedValue(select) || context.operationalContext?.counterId || context.currentShift?.counterId || "";
    select.replaceChildren();
    if (!rows.length) select.appendChild(option("", "No active counter"));
    rows.forEach(function (row) {
      select.appendChild(option(row.id, row.name + (row.code ? " (" + row.code + ")" : "")));
    });
    if ([...select.options].some(function (row) { return row.value === selected; })) select.value = selected;
    select.disabled = Boolean(context.currentShift?.counterId);
  }

  function operationalWarning(context) {
    const target = document.getElementById("terminalCreditWarning");
    const complete = document.getElementById("completeTerminalSaleBtn");
    if (!target || !complete) return;
    const counterId = selectedValue(document.getElementById("terminalCounterSelect")) || context.operationalContext?.counterId || context.currentShift?.counterId;
    const required = Boolean(context.settings?.["terminal.openShiftRequired"]?.value ?? context.settings?.["terminal.openShiftRequired"] ?? false);
    const shift = context.currentShift || null;
    const unavailable = !counterId || (required && !shift);
    complete.disabled = unavailable;
    if (!counterId) target.innerHTML = '<div class="alert alert-danger py-2 mb-0">No active counter is available. Configure a counter before posting sales.</div>';
    else if (required && !shift) target.innerHTML = '<div class="alert alert-warning py-2 mb-0">An open shift is required. <a class="alert-link" href="shifts.html">Open a shift</a> before posting sales.</div>';
  }

  async function refresh() {
    const results = await Promise.all([
      api().apiGet("/api/v1/customers?active=true&limit=500", { cache: false }),
      api().apiGet("/api/v1/sales-documents/context", { cache: false })
    ]);
    const customers = list(results[0]);
    const context = unwrap(results[1]) || {};
    fillCustomers(customers);
    fillSalespeople(context.salesPersons || []);
    repairCounterMarkup(context);
    operationalWarning(context);
    ensureDueDate();
    document.body.dataset.retailTerminalCertified = "true";
  }

  document.addEventListener("DOMContentLoaded", function () {
    window.setTimeout(function () {
      refresh().catch(function (error) {
        console.error("Retail terminal certification adapter failed", error);
        const target = document.getElementById("terminalCreditWarning");
        if (target) target.innerHTML = '<div class="alert alert-danger py-2 mb-0">Terminal context failed to load. Reload the page before posting a sale.</div>';
        const complete = document.getElementById("completeTerminalSaleBtn");
        if (complete) complete.disabled = true;
      });
    }, 0);
  });
})();
