(function () {
  "use strict";

  if (document.body?.dataset.page !== "terminal") return;

  const state = {
    customers: [],
    context: {},
    currentIdempotencyKey: "",
    lastDocument: null,
  };

  function unwrap(value) {
    return value && Object.prototype.hasOwnProperty.call(value, "data") ? value.data : value;
  }

  function list(value) {
    const data = unwrap(value);
    if (Array.isArray(data)) return data;
    return data?.items || data?.records || data?.rows || [];
  }

  function option(value, label) {
    const node = document.createElement("option");
    node.value = value || "";
    node.textContent = label || value || "—";
    return node;
  }

  function activeRow(rows) {
    return (Array.isArray(rows) ? rows : []).find(function (row) {
      const status = String(row.status || "").toLowerCase();
      return row.isActive === true || row.active === true || ["open", "active", "started"].includes(status);
    }) || (Array.isArray(rows) ? rows[0] : null) || null;
  }

  function customerLabel(row) {
    const name = row.name || row.customerName || "Customer";
    const phone = row.phone || row.mobile || "";
    return phone ? name + " · " + phone : name;
  }

  function personLabel(row) {
    return row.name || row.fullName || row.email || row.code || "Salesperson";
  }

  async function loadReferenceData() {
    if (!window.AxtorAPI) throw new Error("Axtor API is not available");
    const values = await Promise.all([
      AxtorAPI.apiGet("/api/v1/customers?active=true&limit=500", { cache: false }).catch(function () { return []; }),
      AxtorAPI.apiGet("/api/v1/sales-documents/context", { cache: false }).catch(function () { return {}; }),
    ]);
    state.customers = list(values[0]);
    state.context = unwrap(values[1]) || {};
  }

  function replaceCustomerField(form) {
    const input = form.querySelector('[name="customerId"]');
    if (!input || input.tagName === "SELECT") return;
    const select = document.createElement("select");
    select.name = "customerId";
    select.id = "groceryCustomerSelect";
    select.appendChild(option("", "Walk-in Customer"));
    state.customers.forEach(function (row) {
      select.appendChild(option(row.id, customerLabel(row)));
    });
    input.replaceWith(select);
  }

  function addSalespersonField(form) {
    if (form.querySelector('[name="salesPersonId"]')) return;
    const wrap = document.createElement("div");
    const label = document.createElement("label");
    label.textContent = "Salesperson";
    const select = document.createElement("select");
    select.name = "salesPersonId";
    select.appendChild(option("", "Current cashier / none"));
    const people = state.context.salesPersons || state.context.salespeople || state.context.users || [];
    people.forEach(function (row) {
      select.appendChild(option(row.id || row.userId, personLabel(row)));
    });
    wrap.append(label, select);
    const payment = form.querySelector('[name="paymentMethod"]')?.closest("div");
    if (payment) payment.before(wrap);
    else form.prepend(wrap);
  }

  function addDueDateField(form) {
    if (form.querySelector('[name="dueDate"]')) return;
    const wrap = document.createElement("div");
    wrap.id = "groceryDueDateWrap";
    wrap.hidden = true;
    const label = document.createElement("label");
    label.textContent = "Credit due date";
    const input = document.createElement("input");
    input.name = "dueDate";
    input.type = "date";
    input.min = new Date().toISOString().slice(0, 10);
    wrap.append(label, input);
    const paid = form.querySelector('[name="paidAmount"]')?.closest("div");
    if (paid) paid.after(wrap);
    else form.append(wrap);
    const payment = form.querySelector('[name="paymentMethod"]');
    const sync = function () {
      const credit = payment?.value === "credit";
      wrap.hidden = !credit;
      input.required = credit;
      if (!credit) input.value = "";
    };
    payment?.addEventListener("change", sync);
    sync();
  }

  function addRegisterContext(form) {
    if (form.querySelector("#groceryRegisterContext")) return;
    const counter = activeRow(state.context.counters);
    const terminal = activeRow(state.context.terminals) || counter;
    const shift = activeRow(state.context.shifts);
    const panel = document.createElement("div");
    panel.id = "groceryRegisterContext";
    panel.className = "g-note";
    panel.dataset.counterId = counter?.id || "";
    panel.dataset.terminalId = terminal?.id || "";
    panel.dataset.shiftId = shift?.id || "";
    panel.textContent = "Counter: " + (counter?.name || counter?.code || "Not assigned")
      + " · Terminal: " + (terminal?.name || terminal?.code || "Not assigned")
      + " · Shift: " + (shift?.name || shift?.referenceNo || shift?.code || "Not open");
    form.prepend(panel);
  }

  function enhanceForm() {
    const form = document.getElementById("checkoutForm");
    if (!form || form.dataset.reconciled === "1") return false;
    replaceCustomerField(form);
    addSalespersonField(form);
    addDueDateField(form);
    addRegisterContext(form);
    form.dataset.reconciled = "1";
    return true;
  }

  function formState() {
    const form = document.getElementById("checkoutForm");
    const register = document.getElementById("groceryRegisterContext");
    if (!form) return {};
    const values = Object.fromEntries(new FormData(form).entries());
    return {
      customerId: values.customerId || null,
      salesPersonId: values.salesPersonId || null,
      dueDate: values.dueDate || null,
      counterId: register?.dataset.counterId || null,
      terminalId: register?.dataset.terminalId || null,
      shiftId: register?.dataset.shiftId || null,
    };
  }

  function validateCreditSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.id !== "checkoutForm") return;
    const payment = form.querySelector('[name="paymentMethod"]')?.value;
    const dueDate = form.querySelector('[name="dueDate"]')?.value;
    if (payment === "credit" && !dueDate) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const status = document.getElementById("checkoutStatus");
      if (status) {
        status.textContent = "Please select a due date for the credit invoice.";
        status.className = "g-status error";
      }
      form.querySelector('[name="dueDate"]')?.focus();
      return;
    }
    state.currentIdempotencyKey = "grocery-sale-" + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2));
  }

  function showPrintLink(documentData) {
    if (!documentData?.id && !documentData?.documentNo) return;
    state.lastDocument = documentData;
    window.setTimeout(function () {
      const status = document.getElementById("checkoutStatus");
      if (!status || status.querySelector("[data-grocery-created-print]")) return;
      const link = document.createElement("a");
      const url = new URL("invoice-view.html", location.href);
      if (documentData.id) url.searchParams.set("id", documentData.id);
      else url.searchParams.set("documentNo", documentData.documentNo);
      url.searchParams.set("industry", "grocery");
      link.href = url.toString();
      link.target = "_blank";
      link.rel = "noopener";
      link.dataset.groceryCreatedPrint = "1";
      link.className = "g-btn secondary";
      link.textContent = "View / Print " + (documentData.documentNo || "Invoice");
      status.append(document.createElement("br"), link);
    }, 150);
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const requestUrl = typeof input === "string" ? input : input?.url || "";
    const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    const isSale = method === "POST" && /\/api\/v1\/sales-documents(?:\?|$)/.test(requestUrl);
    if (!isSale) return nativeFetch(input, init);

    const next = Object.assign({}, init || {});
    const headers = new Headers(next.headers || (input instanceof Request ? input.headers : undefined));
    if (!headers.has("Idempotency-Key")) headers.set("Idempotency-Key", state.currentIdempotencyKey || ("grocery-sale-" + Date.now()));
    next.headers = headers;

    try {
      const raw = typeof next.body === "string" ? JSON.parse(next.body) : null;
      if (raw && raw.documentType === "invoice") {
        const extra = formState();
        Object.keys(extra).forEach(function (key) {
          if (extra[key]) raw[key] = extra[key];
        });
        next.body = JSON.stringify(raw);
      }
    } catch (_) {}

    const response = await nativeFetch(input, next);
    if (response.ok) {
      response.clone().json().then(function (json) {
        showPrintLink(unwrap(json));
      }).catch(function () {});
    }
    return response;
  };

  document.addEventListener("submit", validateCreditSubmit, true);
  document.addEventListener("DOMContentLoaded", function () {
    loadReferenceData().catch(function (error) {
      console.error("Grocery terminal reference data failed", error);
    }).finally(function () {
      let attempts = 0;
      const timer = setInterval(function () {
        attempts += 1;
        if (enhanceForm() || attempts > 100) clearInterval(timer);
      }, 100);
    });
  });
})();
