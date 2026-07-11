/**
 * Axtor POS Cloud — Sales Production Upgrade
 * Iterations 1–3: returns summary integration, complete sale information,
 * permissions/audit-safe draft-post/edit workflow.
 */
(function () {
  "use strict";

  const state = {
    context: null,
    customers: [],
    submitting: false,
    dirty: false,
    editId: null,
    editStatus: null,
    originalCartSignature: "",
    idempotencyKey: null,
    lastDocument: null,
    cartObserver: null,
    stockObserver: null,
  };

  window.AxtorSalesProduction = {
    version: "20260710-all-three-iterations-production",
    init,
    openDocument,
    editDocument,
    buildPayload,
    getState: function () { return state; },
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  async function init() {
    const root = document.getElementById("new-sale");
    if (!root || document.getElementById("axtorSaleInformationPanel")) return;

    ensureStyles();
    injectSaleInformation(root);
    ensureDocumentModal();
    hideLegacySaleControls();
    bindEvents();
    observeCart();
    observeStockDisplays();
    setDefaultDates();

    await Promise.allSettled([loadContext(), loadCustomers()]);
    updatePaymentUI();
    updateSummary();
    refreshNumberPreview();
    console.log("AxtorSalesProduction loaded:", window.AxtorSalesProduction.version);
  }

  function request(method, path, body) {
    if (!window.AxtorAPI || typeof window.AxtorAPI.request !== "function") {
      return Promise.reject(new Error("Axtor API client is unavailable"));
    }
    return window.AxtorAPI.request(method, path, body);
  }

  function unwrap(response) {
    return response && typeof response === "object" && "data" in response ? response.data : response;
  }

  function injectSaleInformation(root) {
    const panel = document.createElement("div");
    panel.id = "axtorSaleInformationPanel";
    panel.className = "cardx mb-3 axtor-sale-information";
    panel.innerHTML = `
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div>
          <h5 class="cardx-title mb-1"><i class="bi bi-receipt-cutoff me-2"></i>Sale Information</h5>
          <div class="small text-muted">Official document number is generated safely by the backend when saved.</div>
        </div>
        <div class="d-flex flex-wrap gap-2 align-items-center">
          <span id="axtorSaleModeBadge" class="badge text-bg-success">New Document</span>
          <button id="axtorCancelEditBtn" type="button" class="btn btn-sm btn-outline-secondary d-none">Cancel Edit</button>
        </div>
      </div>

      <div id="axtorSaleValidation" class="alert alert-danger d-none" role="alert"></div>

      <div class="row g-3">
        <div class="col-12 col-md-6 col-xl-3">
          <label class="form-label fw-semibold">Document Type *</label>
          <select id="axtorDocumentType" class="form-select">
            <option value="invoice">Sales Invoice</option>
            <option value="quotation">Quotation</option>
            <option value="delivery_note">Delivery Note</option>
          </select>
        </div>
        <div class="col-12 col-md-6 col-xl-3">
          <label class="form-label fw-semibold">Document Number</label>
          <input id="axtorDocumentNumber" class="form-control" readonly value="Auto-generated on save">
        </div>
        <div class="col-12 col-md-6 col-xl-3">
          <label class="form-label fw-semibold">Document Date *</label>
          <input id="axtorDocumentDate" type="date" class="form-control">
        </div>
        <div class="col-12 col-md-6 col-xl-3">
          <label class="form-label fw-semibold">Document Status</label>
          <input id="axtorDocumentStatus" class="form-control" readonly value="New / Unsaved">
        </div>

        <div class="col-12 col-lg-6">
          <label class="form-label fw-semibold">Customer *</label>
          <input id="axtorCustomerSearch" list="axtorCustomerList" class="form-control" placeholder="Search name, phone, code, email or company" autocomplete="off">
          <datalist id="axtorCustomerList"></datalist>
          <input id="axtorCustomerId" type="hidden">
          <div id="axtorCustomerCreditInfo" class="small text-muted mt-1">Walk-in Customer</div>
        </div>
        <div class="col-12 col-lg-6">
          <label class="form-label fw-semibold">Sales Person *</label>
          <input id="axtorSalespersonSearch" list="axtorSalespersonList" class="form-control" placeholder="Search active sales person" autocomplete="off">
          <datalist id="axtorSalespersonList"></datalist>
          <input id="axtorSalespersonId" type="hidden">
        </div>

        <div class="col-12 col-md-6 col-xl-3">
          <label class="form-label fw-semibold">Payment Type *</label>
          <select id="axtorPaymentType" class="form-select">
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="credit">Credit</option>
            <option value="mixed">Mixed Payment</option>
            <option value="cheque">Cheque</option>
            <option value="wallet">Wallet</option>
          </select>
        </div>
        <div class="col-12 col-md-6 col-xl-3">
          <label class="form-label fw-semibold">Paid Amount</label>
          <input id="axtorPaidAmount" type="number" min="0" step="0.01" class="form-control" value="0">
        </div>
        <div class="col-12 col-md-6 col-xl-3">
          <label class="form-label fw-semibold">Payment Status Preview</label>
          <div id="axtorPaymentStatusPreview" class="form-control bg-light">Unpaid</div>
        </div>
        <div class="col-12 col-md-6 col-xl-3">
          <label class="form-label fw-semibold">Due Date</label>
          <input id="axtorDueDate" type="date" class="form-control">
        </div>

        <div id="axtorPaymentReferenceWrap" class="col-12">
          <div class="row g-3">
            <div class="col-12 col-md-4">
              <label class="form-label fw-semibold">Payment / Deposit Account</label>
              <input id="axtorDepositAccount" class="form-control" placeholder="Cash Account / CBQ Bank / Terminal">
            </div>
            <div class="col-12 col-md-4">
              <label class="form-label fw-semibold">Payment Reference</label>
              <input id="axtorPaymentReference" class="form-control" placeholder="Card approval / bank / cheque reference">
            </div>
            <div class="col-12 col-md-4">
              <label class="form-label fw-semibold">General Reference No</label>
              <input id="axtorReferenceNo" class="form-control" placeholder="External order / marketplace reference">
            </div>
          </div>
        </div>

        <div id="axtorMixedPaymentWrap" class="col-12 d-none">
          <div class="border rounded p-3 bg-light-subtle">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <strong>Mixed Payment Lines</strong>
              <button id="axtorAddPaymentLine" type="button" class="btn btn-sm btn-outline-success"><i class="bi bi-plus-lg"></i> Add Line</button>
            </div>
            <div id="axtorPaymentLines"></div>
            <div class="small text-muted">The total of all payment lines cannot exceed the document total.</div>
          </div>
        </div>

        <div class="col-12 col-md-6 col-xl-3">
          <label class="form-label fw-semibold">LPO No</label>
          <input id="axtorLpoNo" class="form-control" placeholder="Customer LPO number">
        </div>
        <div class="col-12 col-md-6 col-xl-3">
          <label class="form-label fw-semibold">Customer PO</label>
          <input id="axtorCustomerPoNo" class="form-control" placeholder="Customer purchase order">
        </div>
        <div class="col-12 col-md-6 col-xl-3">
          <label class="form-label fw-semibold">PO Number</label>
          <input id="axtorPoNo" class="form-control" placeholder="Internal / linked PO">
        </div>
        <div class="col-12 col-md-6 col-xl-3">
          <label class="form-label fw-semibold">Currency</label>
          <input id="axtorCurrency" class="form-control" value="QAR" readonly>
        </div>

        <div class="col-12 col-md-6 col-xl-3">
          <label class="form-label fw-semibold">Branch *</label>
          <select id="axtorBranch" class="form-select"></select>
        </div>
        <div class="col-12 col-md-6 col-xl-3">
          <label class="form-label fw-semibold">Warehouse / Stock Location *</label>
          <select id="axtorWarehouse" class="form-select"></select>
        </div>
        <div class="col-12 col-md-6 col-xl-3">
          <label class="form-label fw-semibold">Sales Channel</label>
          <select id="axtorSalesChannel" class="form-select">
            <option value="pos_counter">POS Counter</option>
            <option value="phone_order">Phone Order</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="online">Online</option>
            <option value="delivery">Delivery</option>
            <option value="wholesale">Wholesale</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="col-12 col-md-6 col-xl-3">
          <label class="form-label fw-semibold">Edit / Override Reason</label>
          <input id="axtorEditReason" class="form-control" placeholder="Required for protected changes">
        </div>

        <div id="axtorDeliveryFields" class="col-12 d-none">
          <div class="border rounded p-3">
            <strong class="d-block mb-2">Delivery Information</strong>
            <div class="row g-3">
              <div class="col-12 col-md-6"><label class="form-label">Delivery Address</label><input id="axtorDeliveryAddress" class="form-control"></div>
              <div class="col-12 col-md-3"><label class="form-label">Delivery Date</label><input id="axtorDeliveryDate" type="date" class="form-control"></div>
              <div class="col-12 col-md-3"><label class="form-label">Driver</label><input id="axtorDriver" class="form-control"></div>
              <div class="col-12 col-md-4"><label class="form-label">Vehicle Number</label><input id="axtorVehicleNumber" class="form-control"></div>
              <div class="col-12 col-md-8"><label class="form-label">Delivery Instructions</label><input id="axtorDeliveryInstructions" class="form-control"></div>
            </div>
          </div>
        </div>

        <div class="col-12 col-lg-6">
          <label class="form-label fw-semibold">Internal Notes</label>
          <textarea id="axtorInternalNotes" class="form-control" rows="2" placeholder="Internal only — never printed"></textarea>
        </div>
        <div class="col-12 col-lg-6">
          <label class="form-label fw-semibold">Customer Notes</label>
          <textarea id="axtorCustomerNotes" class="form-control" rows="2" placeholder="May appear on the printed document"></textarea>
        </div>
      </div>

      <div class="row g-3 mt-1">
        <div class="col-12 col-xl-7">
          <div class="axtor-document-summary p-3 rounded">
            <div class="row g-2 text-center">
              <div class="col-6 col-md"><span>Subtotal</span><strong id="axtorSummarySubtotal">QAR 0.00</strong></div>
              <div class="col-6 col-md"><span>Discount</span><strong id="axtorSummaryDiscount">QAR 0.00</strong></div>
              <div class="col-6 col-md"><span>Tax</span><strong id="axtorSummaryTax">QAR 0.00</strong></div>
              <div class="col-6 col-md"><span>Grand Total</span><strong id="axtorSummaryTotal">QAR 0.00</strong></div>
              <div class="col-6 col-md"><span>Paid</span><strong id="axtorSummaryPaid">QAR 0.00</strong></div>
              <div class="col-6 col-md"><span>Balance</span><strong id="axtorSummaryBalance">QAR 0.00</strong></div>
              <div class="col-6 col-md"><span>Returned</span><strong id="axtorSummaryReturned">QAR 0.00</strong></div>
              <div class="col-6 col-md"><span>Refunded</span><strong id="axtorSummaryRefunded">QAR 0.00</strong></div>
              <div class="col-6 col-md"><span>Net Retained</span><strong id="axtorSummaryNet">QAR 0.00</strong></div>
            </div>
          </div>
        </div>
        <div class="col-12 col-xl-5 d-flex align-items-stretch">
          <div class="d-flex flex-wrap gap-2 w-100 align-items-end justify-content-xl-end">
            <button id="axtorSaveDraft" type="button" class="btn btn-soft flex-grow-1"><i class="bi bi-file-earmark me-1"></i>Save Draft</button>
            <button id="axtorPostDocument" type="button" class="btn btn-brand flex-grow-1"><i class="bi bi-check2-circle me-1"></i>Post Document</button>
          </div>
        </div>
      </div>
      <div id="axtorSaleSubmitStatus" class="small text-muted mt-2">Ready.</div>
    `;
    root.prepend(panel);
    addPaymentLine("cash", 0);
    addPaymentLine("card", 0);
  }

  function bindEvents() {
    document.addEventListener("click", async function (event) {
      const target = event.target.closest("button, a");
      if (!target) return;

      if (target.id === "axtorSaveDraft") {
        event.preventDefault();
        await submitDocument("draft");
        return;
      }
      if (target.id === "axtorPostDocument") {
        event.preventDefault();
        await submitDocument("post");
        return;
      }
      if (target.id === "axtorAddPaymentLine") {
        event.preventDefault();
        addPaymentLine("cash", 0);
        updateSummary();
        return;
      }
      if (target.matches("[data-remove-payment-line]")) {
        event.preventDefault();
        target.closest(".axtor-payment-line")?.remove();
        updateSummary();
        markDirty();
        return;
      }
      if (target.id === "axtorCancelEditBtn") {
        event.preventDefault();
        resetForm();
        return;
      }
      if (target.matches("[data-sales-edit-id]")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        await editDocument(target.getAttribute("data-sales-edit-id"));
        return;
      }
      if (target.matches("[data-sales-view-id]")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        await openDocument(target.getAttribute("data-sales-view-id"));
        return;
      }
      if (target.id === "axtorPrintDocumentBtn") {
        event.preventDefault();
        printCurrentDocument();
        return;
      }
      if (target.id === "saveDraftBtn" || target.id === "completeSaleBtn" || target.matches("[data-sales-create-backend]")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        await submitDocument(target.id === "saveDraftBtn" ? "draft" : "post");
      }
    }, true);

    const panel = document.getElementById("axtorSaleInformationPanel");
    panel.addEventListener("input", function (event) {
      if (event.target.id === "axtorCustomerSearch") resolveCustomerInput();
      if (event.target.id === "axtorSalespersonSearch") resolveSalespersonInput();
      updateSummary();
      markDirty();
    });

    panel.addEventListener("change", function (event) {
      const id = event.target.id;
      if (id === "axtorDocumentType") {
        updateDocumentRules();
        refreshNumberPreview();
      }
      if (id === "axtorPaymentType") updatePaymentUI();
      if (id === "axtorBranch") {
        renderWarehouses();
        refreshNumberPreview();
      }
      if (id === "axtorWarehouse") decorateStockDetails();
      if (id === "axtorCustomerSearch") {
        resolveCustomerInput(true);
        autoDueDate();
      }
      if (id === "axtorSalespersonSearch") resolveSalespersonInput(true);
      if (id === "axtorDocumentDate") autoDueDate();
      if (id === "axtorSalesChannel") updateDeliveryFields();
      updateSummary();
      markDirty();
    });

    window.addEventListener("beforeunload", function (event) {
      if (!state.dirty || state.submitting) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  function hideLegacySaleControls() {
    const hide = function () {
      [
        document.getElementById("newSaleMetaRow"),
        document.getElementById("saveDraftBtn"),
        ...document.querySelectorAll('button[data-bs-target="#paymentModal"], [data-sales-create-backend], [data-sales-preview-payload]'),
      ].filter(Boolean).forEach(function (element) { element.classList.add("axtor-legacy-hidden"); });

      const oldSalesman = document.getElementById("newSaleSalesmanId");
      if (oldSalesman) oldSalesman.closest(".row")?.classList.add("axtor-legacy-hidden");
    };
    hide();
    new MutationObserver(hide).observe(document.body, { childList: true, subtree: true });
  }

  async function loadContext() {
    try {
      state.context = unwrap(await request("GET", "/api/v1/sales-documents/context"));
      const context = state.context || {};
      document.getElementById("axtorCurrency").value = context.business?.currency || "QAR";

      const branchSelect = document.getElementById("axtorBranch");
      branchSelect.innerHTML = (context.branches || []).map(function (branch) {
        return `<option value="${escapeAttr(branch.id)}">${escapeHtml(branch.name)}${branch.code ? " · " + escapeHtml(branch.code) : ""}</option>`;
      }).join("") || '<option value="">No active branch</option>';
      if (context.currentUser?.branchId) branchSelect.value = context.currentUser.branchId;

      const salespersonList = document.getElementById("axtorSalespersonList");
      salespersonList.innerHTML = (context.salesPersons || []).map(function (person) {
        return `<option value="${escapeAttr(person.name + " · " + person.email)}" data-id="${escapeAttr(person.id)}"></option>`;
      }).join("");
      const current = (context.salesPersons || []).find(function (person) { return person.id === context.currentUser?.id; });
      if (current) {
        document.getElementById("axtorSalespersonSearch").value = current.name + " · " + current.email;
        document.getElementById("axtorSalespersonId").value = current.id;
      }

      document.getElementById("axtorSalespersonSearch").disabled = !context.capabilities?.changeSalesperson;
      document.getElementById("axtorDocumentType").disabled = context.capabilities?.changeDocumentType === false;
      const dateInput = document.getElementById("axtorDocumentDate");
      if (!context.capabilities?.backdate) dateInput.min = today();
      renderWarehouses();
      decorateStockDetails();
      updateCustomerCreditInfo();
    } catch (error) {
      showValidation([error.message || "Failed to load sales permissions and branches"]);
    }
  }

  async function loadCustomers() {
    try {
      const response = await request("GET", "/api/v1/customers?active=true");
      const data = unwrap(response);
      state.customers = Array.isArray(data) ? data : (response.customers || data?.customers || []);
      const list = document.getElementById("axtorCustomerList");
      list.innerHTML = '<option value="Walk-in Customer"></option>' + state.customers.map(function (customer) {
        return `<option value="${escapeAttr(customerLabel(customer))}" data-id="${escapeAttr(customer.id)}"></option>`;
      }).join("");
      if (!document.getElementById("axtorCustomerSearch").value) document.getElementById("axtorCustomerSearch").value = "Walk-in Customer";
      resolveCustomerInput(true);
    } catch (error) {
      showValidation([error.message || "Failed to load customers"]);
    }
  }

  function renderWarehouses() {
    const select = document.getElementById("axtorWarehouse");
    if (!select) return;
    const branchId = value("axtorBranch");
    const warehouses = (state.context?.warehouses || []).filter(function (warehouse) {
      return !warehouse.branchId || !branchId || warehouse.branchId === branchId;
    });
    const currentValue = select.value;
    select.innerHTML = warehouses.map(function (warehouse) {
      return `<option value="${escapeAttr(warehouse.id)}">${escapeHtml(warehouse.name)}${warehouse.code ? " · " + escapeHtml(warehouse.code) : ""}</option>`;
    }).join("") || '<option value="">No active warehouse</option>';
    if (warehouses.some(function (warehouse) { return warehouse.id === currentValue; })) select.value = currentValue;
    decorateStockDetails();
  }

  async function refreshNumberPreview() {
    if (state.editId) return;
    const type = value("axtorDocumentType") || "invoice";
    const branchId = value("axtorBranch");
    const output = document.getElementById("axtorDocumentNumber");
    output.value = "Loading preview...";
    try {
      const query = new URLSearchParams({ documentType: type });
      if (branchId) query.set("branchId", branchId);
      const data = unwrap(await request("GET", "/api/v1/sales-documents/number-preview?" + query.toString()));
      output.value = data.preview + " (preview)";
    } catch (error) {
      output.value = prefixFor(type) + "-AUTO (generated on save)";
    }
  }

  function resolveCustomerInput(strict) {
    const input = document.getElementById("axtorCustomerSearch");
    const hidden = document.getElementById("axtorCustomerId");
    const text = input.value.trim();
    if (!text || text.toLowerCase() === "walk-in customer") {
      hidden.value = "";
      if (strict && !text) input.value = "Walk-in Customer";
      updateCustomerCreditInfo();
      return null;
    }

    const normalized = text.toLowerCase();
    const customer = state.customers.find(function (item) {
      return customerLabel(item).toLowerCase() === normalized || item.name?.toLowerCase() === normalized;
    });
    hidden.value = customer?.id || "";
    updateCustomerCreditInfo(customer || null);
    return customer || null;
  }

  function resolveSalespersonInput(strict) {
    const input = document.getElementById("axtorSalespersonSearch");
    const hidden = document.getElementById("axtorSalespersonId");
    const normalized = input.value.trim().toLowerCase();
    const person = (state.context?.salesPersons || []).find(function (item) {
      return (item.name + " · " + item.email).toLowerCase() === normalized || item.name.toLowerCase() === normalized;
    });
    hidden.value = person?.id || "";
    if (strict && !person && state.context?.currentUser) {
      const current = (state.context.salesPersons || []).find(function (item) { return item.id === state.context.currentUser.id; });
      if (current) {
        input.value = current.name + " · " + current.email;
        hidden.value = current.id;
      }
    }
    return person || null;
  }

  function customerLabel(customer) {
    return [customer.name, customer.company, customer.code, customer.phone, customer.email].filter(Boolean).join(" · ");
  }

  function updateCustomerCreditInfo(customer) {
    customer = customer || state.customers.find(function (item) { return item.id === value("axtorCustomerId"); });
    const box = document.getElementById("axtorCustomerCreditInfo");
    if (!customer) {
      box.className = "small text-muted mt-1";
      box.textContent = "Walk-in Customer — credit sale is not allowed.";
      return;
    }
    const balance = number(customer.balance);
    const limit = number(customer.creditLimit);
    const available = Math.max(0, limit - balance);
    box.className = "small mt-1 " + (available <= 0 && limit > 0 ? "text-danger" : "text-muted");
    box.textContent = `Current Balance: ${money(balance)} · Credit Limit: ${money(limit)} · Available Credit: ${money(available)} · Credit Days: ${number(customer.creditDays, 30)}`;
  }

  function updateDocumentRules() {
    const type = value("axtorDocumentType");
    const isInvoice = type === "invoice";
    document.getElementById("axtorPaymentType").disabled = !isInvoice;
    document.getElementById("axtorPaidAmount").disabled = !isInvoice;
    if (!isInvoice) {
      document.getElementById("axtorPaymentType").value = "cash";
      document.getElementById("axtorPaidAmount").value = "0";
    }
    updateDeliveryFields();
    updatePaymentUI();
  }

  function updatePaymentUI() {
    const type = value("axtorDocumentType");
    const method = value("axtorPaymentType");
    const total = cartTotal();
    const paidInput = document.getElementById("axtorPaidAmount");
    const mixedWrap = document.getElementById("axtorMixedPaymentWrap");
    const dueDate = document.getElementById("axtorDueDate");

    mixedWrap.classList.toggle("d-none", method !== "mixed" || type !== "invoice");
    dueDate.required = method === "credit" && type === "invoice";
    dueDate.disabled = method !== "credit" || type !== "invoice";

    if (type !== "invoice") paidInput.value = "0";
    else if (method === "credit") paidInput.value = "0";
    else if (method === "mixed") paidInput.value = String(paymentLinesTotal().toFixed(2));
    else if (!state.editId || !paidInput.dataset.userEdited) paidInput.value = String(total.toFixed(2));

    paidInput.readOnly = method === "credit" || method === "mixed" || type !== "invoice";
    autoDueDate();
    updateSummary();
  }

  function updateDeliveryFields() {
    const show = value("axtorDocumentType") === "delivery_note" || value("axtorSalesChannel") === "delivery";
    document.getElementById("axtorDeliveryFields").classList.toggle("d-none", !show);
  }

  function autoDueDate() {
    if (value("axtorPaymentType") !== "credit" || value("axtorDocumentType") !== "invoice") return;
    const customer = state.customers.find(function (item) { return item.id === value("axtorCustomerId"); });
    const start = new Date(value("axtorDocumentDate") + "T12:00:00");
    if (Number.isNaN(start.getTime())) return;
    start.setDate(start.getDate() + number(customer?.creditDays, 30));
    document.getElementById("axtorDueDate").value = start.toISOString().slice(0, 10);
  }

  function addPaymentLine(method, amount, referenceNo, depositAccount) {
    const wrap = document.getElementById("axtorPaymentLines");
    if (!wrap) return;
    const row = document.createElement("div");
    row.className = "row g-2 align-items-end mb-2 axtor-payment-line";
    row.innerHTML = `
      <div class="col-12 col-md-3"><label class="form-label small">Method</label><select class="form-select form-select-sm" data-payment-method><option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank</option><option value="wallet">Wallet</option><option value="cheque">Cheque</option></select></div>
      <div class="col-12 col-md-2"><label class="form-label small">Amount</label><input type="number" min="0" step="0.01" class="form-control form-control-sm" data-payment-amount value="${escapeAttr(number(amount).toFixed(2))}"></div>
      <div class="col-12 col-md-3"><label class="form-label small">Account / Terminal</label><input class="form-control form-control-sm" data-payment-account value="${escapeAttr(depositAccount || "")}"></div>
      <div class="col-10 col-md-3"><label class="form-label small">Reference</label><input class="form-control form-control-sm" data-payment-reference value="${escapeAttr(referenceNo || "")}"></div>
      <div class="col-2 col-md-1"><button type="button" class="btn btn-sm btn-outline-danger w-100" data-remove-payment-line title="Remove"><i class="bi bi-trash"></i></button></div>
    `;
    row.querySelector("[data-payment-method]").value = method || "cash";
    wrap.appendChild(row);
  }

  function getPaymentLines() {
    return Array.from(document.querySelectorAll(".axtor-payment-line")).map(function (row) {
      return {
        method: row.querySelector("[data-payment-method]").value,
        amount: number(row.querySelector("[data-payment-amount]").value),
        depositAccount: row.querySelector("[data-payment-account]").value.trim() || null,
        referenceNo: row.querySelector("[data-payment-reference]").value.trim() || null,
      };
    }).filter(function (line) { return line.amount > 0; });
  }

  function paymentLinesTotal() {
    return getPaymentLines().reduce(function (sum, line) { return sum + number(line.amount); }, 0);
  }

  function getBackendCart() {
    return window.AxtorSalesBackend?.getState?.().cart || [];
  }

  function cartTotal() {
    return round(getBackendCart().reduce(function (sum, item) { return sum + number(item.lineTotal ?? number(item.quantity) * number(item.unitPrice)); }, 0));
  }

  function cartSignature() {
    return JSON.stringify(getBackendCart().map(function (item) {
      return [item.productId, number(item.quantity), number(item.unitPrice), number(item.lineTotal)];
    }));
  }

  function updateSummary() {
    const total = cartTotal();
    const method = value("axtorPaymentType");
    const type = value("axtorDocumentType");
    let paid = type === "invoice" ? number(value("axtorPaidAmount")) : 0;
    if (method === "mixed" && type === "invoice") {
      paid = round(paymentLinesTotal());
      document.getElementById("axtorPaidAmount").value = paid.toFixed(2);
    }
    if (method === "credit" || type !== "invoice") paid = 0;
    paid = Math.min(Math.max(0, paid), total);
    const balance = type === "invoice" ? round(Math.max(0, total - paid)) : 0;
    const returned = number(state.lastDocument?.returnedAmount);
    const refunded = number(state.lastDocument?.refundedAmount);

    text("axtorSummarySubtotal", money(total));
    text("axtorSummaryDiscount", money(0));
    text("axtorSummaryTax", money(0));
    text("axtorSummaryTotal", money(total));
    text("axtorSummaryPaid", money(paid));
    text("axtorSummaryBalance", money(balance));
    text("axtorSummaryReturned", money(returned));
    text("axtorSummaryRefunded", money(refunded));
    text("axtorSummaryNet", money(Math.max(0, paid - refunded)));

    const status = paid <= 0 ? "Unpaid" : paid + 0.001 >= total ? "Paid" : "Partially Paid";
    const statusBox = document.getElementById("axtorPaymentStatusPreview");
    statusBox.textContent = type === "invoice" ? status : "Not Applicable";
    statusBox.className = "form-control " + (status === "Paid" ? "bg-success-subtle text-success" : status === "Partially Paid" ? "bg-warning-subtle text-warning-emphasis" : "bg-light");

    updateCustomerCreditWarning(balance);
  }

  function updateCustomerCreditWarning(projectedAddition) {
    const customer = state.customers.find(function (item) { return item.id === value("axtorCustomerId"); });
    if (!customer || value("axtorPaymentType") !== "credit") return updateCustomerCreditInfo(customer);
    const current = number(customer.balance);
    const limit = number(customer.creditLimit);
    const projected = current + projectedAddition;
    const box = document.getElementById("axtorCustomerCreditInfo");
    box.className = "small mt-1 " + (limit > 0 && projected > limit ? "text-danger fw-bold" : "text-muted");
    box.textContent = `Current Balance: ${money(current)} · Credit Limit: ${money(limit)} · Projected Balance: ${money(projected)} · ${limit > 0 && projected > limit ? "CREDIT LIMIT EXCEEDED — override permission required" : "Available After Sale: " + money(Math.max(0, limit - projected))}`;
  }

  function observeCart() {
    const attach = function () {
      const target = document.getElementById("axtorBackendCartTbody");
      if (!target || state.cartObserver) return;
      state.cartObserver = new MutationObserver(function () {
        updatePaymentUI();
        decorateStockDetails();
        if (cartSignature() !== state.originalCartSignature) markDirty();
      });
      state.cartObserver.observe(target, { childList: true, subtree: true, characterData: true });
    };
    attach();
    const waiter = setInterval(function () {
      attach();
      if (state.cartObserver) clearInterval(waiter);
    }, 250);
  }

  function observeStockDisplays() {
    const attach = function () {
      const grid = document.getElementById("axtorBackendProductGridBody");
      if (!grid || state.stockObserver) return;
      state.stockObserver = new MutationObserver(decorateStockDetails);
      state.stockObserver.observe(grid, { childList: true, subtree: true });
      decorateStockDetails();
    };
    attach();
    const waiter = setInterval(function () {
      attach();
      if (state.stockObserver) clearInterval(waiter);
    }, 250);
  }

  function decorateStockDetails() {
    const backendState = window.AxtorSalesBackend?.getState?.() || {};
    const products = Array.isArray(backendState.products) ? backendState.products : [];
    const warehouseId = value("axtorWarehouse");
    const warehouse = (state.context?.warehouses || []).find(function (item) { return item.id === warehouseId; });
    const inventory = Array.isArray(state.context?.inventoryStocks) ? state.context.inventoryStocks : [];

    document.querySelectorAll(".axtor-backend-product-card[data-product-id]").forEach(function (card) {
      const productId = card.getAttribute("data-product-id");
      const product = products.find(function (item) { return String(item.id) === String(productId); });
      const stock = inventory.find(function (item) {
        return String(item.productId) === String(productId) && String(item.warehouseId) === String(warehouseId);
      });
      const hasAnyWarehouseStock = inventory.some(function (item) { return String(item.productId) === String(productId); });
      const available = stock ? number(stock.available) : (hasAnyWarehouseStock ? 0 : number(product?.stock));
      const reserved = stock ? number(stock.qtyReserved) : 0;
      const availableBox = card.querySelector(".axtor-stock-available");
      const locationBox = card.querySelector(".axtor-stock-location");
      if (availableBox) availableBox.innerHTML = `Available Stock: <strong>${escapeHtml(formatQty(available))}</strong>`;
      if (locationBox) locationBox.textContent = stock
        ? `${warehouse?.name || "Selected warehouse"} · Reserved: ${formatQty(reserved)}`
        : hasAnyWarehouseStock
          ? `${warehouse?.name || "Selected warehouse"} · No stock allocated here`
          : `${warehouse?.name || "Selected warehouse"} · Legacy global stock will initialize this warehouse`;
    });

    document.querySelectorAll("#axtorBackendCartTbody tr").forEach(function (row) {
      const button = row.querySelector("[data-cart-qty]");
      const box = row.querySelector(".axtor-cart-stock");
      if (!button || !box) return;
      const productId = button.getAttribute("data-cart-qty");
      const product = products.find(function (item) { return String(item.id) === String(productId); });
      const stock = inventory.find(function (item) {
        return String(item.productId) === String(productId) && String(item.warehouseId) === String(warehouseId);
      });
      const hasAnyWarehouseStock = inventory.some(function (item) { return String(item.productId) === String(productId); });
      const available = stock ? number(stock.available) : (hasAnyWarehouseStock ? 0 : number(product?.stock));
      const reserved = stock ? number(stock.qtyReserved) : 0;
      box.textContent = stock
        ? `${warehouse?.name || "Selected warehouse"}: available ${formatQty(available)}, reserved ${formatQty(reserved)}`
        : hasAnyWarehouseStock
          ? `${warehouse?.name || "Selected warehouse"}: available 0, no stock allocated`
          : `${warehouse?.name || "Selected warehouse"}: legacy available ${formatQty(available)}`;
    });
  }

  function buildPayload(postingMode) {
    const total = cartTotal();
    const type = value("axtorDocumentType");
    const method = value("axtorPaymentType");
    const salesperson = resolveSalespersonInput(false);
    const customer = resolveCustomerInput(false);
    const paymentLines = method === "mixed" ? getPaymentLines() : [];
    let paidAmount = type === "invoice" ? number(value("axtorPaidAmount")) : 0;
    if (method === "mixed") paidAmount = paymentLinesTotal();
    if (method === "credit" || type !== "invoice") paidAmount = 0;

    return {
      postingMode,
      idempotencyKey: state.idempotencyKey,
      documentType: type,
      documentDate: value("axtorDocumentDate"),
      dueDate: value("axtorDueDate") || null,
      branchId: value("axtorBranch") || null,
      warehouseId: value("axtorWarehouse") || null,
      customerId: value("axtorCustomerId") || null,
      customerName: customer?.name || "Walk-in Customer",
      salesmanId: value("axtorSalespersonId") || salesperson?.id || null,
      salesmanName: salesperson?.name || state.context?.currentUser?.name || null,
      paymentMethod: method,
      paidAmount: round(paidAmount),
      paymentLines,
      depositAccount: value("axtorDepositAccount") || null,
      referenceNo: value("axtorReferenceNo") || null,
      paymentReferenceNo: value("axtorPaymentReference") || null,
      lpoNo: value("axtorLpoNo") || null,
      customerPoNo: value("axtorCustomerPoNo") || null,
      poNo: value("axtorPoNo") || null,
      salesChannel: value("axtorSalesChannel") || "pos_counter",
      internalNotes: value("axtorInternalNotes") || null,
      customerNotes: value("axtorCustomerNotes") || null,
      deliveryAddress: value("axtorDeliveryAddress") || null,
      deliveryDate: value("axtorDeliveryDate") || null,
      driver: value("axtorDriver") || null,
      vehicleNumber: value("axtorVehicleNumber") || null,
      deliveryInstructions: value("axtorDeliveryInstructions") || null,
      editReason: value("axtorEditReason") || null,
      creditOverrideReason: value("axtorEditReason") || null,
      grandTotal: total,
      items: getBackendCart().map(function (item) {
        return {
          productId: item.productId,
          sku: item.sku || null,
          barcode: item.barcode || null,
          qrCode: item.qrCode || null,
          name: item.productName,
          qty: number(item.quantity),
          quantity: number(item.quantity),
          unitPrice: number(item.unitPrice),
          rate: number(item.unitPrice),
          price: number(item.unitPrice),
          total: number(item.lineTotal),
        };
      }),
    };
  }

  function validatePayload(payload, postingMode) {
    const errors = [];
    if (!payload.documentType) errors.push("Document type is required.");
    if (!payload.documentDate) errors.push("Document date is required.");
    if (!payload.salesmanId) errors.push("Sales person is required.");
    if (!payload.branchId) errors.push("Branch is required.");
    if (payload.documentType === "invoice" && !payload.warehouseId && postingMode === "post") errors.push("Warehouse is required for posting an invoice.");
    if (!payload.items.length) errors.push("Cart is empty.");
    if (payload.items.some(function (item) { return !item.productId; })) errors.push("One or more cart items do not have a backend product ID.");
    if (payload.paymentMethod === "credit" && !payload.customerId) errors.push("Customer is required for a credit sale.");
    if (payload.paymentMethod === "credit" && !payload.dueDate) errors.push("Due date is required for a credit sale.");
    if (payload.paymentMethod === "mixed" && payload.paymentLines.length < 2) errors.push("Mixed Payment requires at least two payment lines.");
    const paid = payload.paymentMethod === "mixed" ? payload.paymentLines.reduce(function (sum, line) { return sum + number(line.amount); }, 0) : payload.paidAmount;
    if (paid > payload.grandTotal + 0.001) errors.push("Payment exceeds the document total.");
    if (payload.paymentMethod === "card" && !value("axtorPaymentReference") && postingMode === "post") errors.push("Card reference is required for a card payment.");
    if (payload.paymentMethod === "bank_transfer" && !value("axtorPaymentReference") && postingMode === "post") errors.push("Bank reference is required for a bank transfer.");
    if (state.context?.settings?.["sales.requireLpo"] === true && !payload.lpoNo) errors.push("LPO number is required by business policy.");
    return errors;
  }

  async function submitDocument(postingMode) {
    if (state.submitting) return;
    state.idempotencyKey = state.idempotencyKey || createKey();
    const payload = buildPayload(postingMode);
    const errors = validatePayload(payload, postingMode);
    if (errors.length) return showValidation(errors);
    showValidation([]);

    const actionText = state.editId ? (postingMode === "post" && state.editStatus === "draft" ? "update and post this draft" : "save changes to this document") : (postingMode === "draft" ? "save this document as draft" : "post this document");
    if (!window.confirm(`Confirm: ${actionText}?\n\nTotal: ${money(payload.grandTotal)}\nItems: ${payload.items.length}`)) return;

    state.submitting = true;
    setSubmitting(true, postingMode === "draft" ? "Saving draft..." : "Posting document...");
    try {
      let response;
      if (!state.editId) {
        response = await request("POST", "/api/v1/sales-documents", payload);
      } else if (state.editStatus === "draft") {
        const updatePayload = { ...payload };
        delete updatePayload.idempotencyKey;
        await request("PATCH", "/api/v1/sales-documents/" + encodeURIComponent(state.editId), updatePayload);
        response = postingMode === "post"
          ? await request("POST", "/api/v1/sales-documents/" + encodeURIComponent(state.editId) + "/post", payload)
          : await request("GET", "/api/v1/sales-documents/" + encodeURIComponent(state.editId));
      } else {
        const updatePayload = { ...payload };
        delete updatePayload.idempotencyKey;
        if (cartSignature() === state.originalCartSignature) delete updatePayload.items;
        response = await request("PATCH", "/api/v1/sales-documents/" + encodeURIComponent(state.editId), updatePayload);
      }

      const documentData = unwrap(response);
      setStatus(`${documentData.documentNo || "Document"} saved successfully.`, "success");
      state.dirty = false;
      state.idempotencyKey = null;
      window.AxtorSalesBackend?.refresh?.({ preserveSearch: true, preserveTab: true });
      window.AxtorSalesBackend?.refreshProducts?.();
      await openDocument(documentData.id || state.editId);
      resetForm();
    } catch (error) {
      // Keep the same idempotency key so a safe retry cannot create a duplicate after a network interruption.
      showValidation([error.message || "Unable to save document"]);
      setStatus(error.message || "Save failed", "danger");
    } finally {
      state.submitting = false;
      setSubmitting(false);
    }
  }

  async function editDocument(id) {
    if (!id) return;
    try {
      const doc = unwrap(await request("GET", "/api/v1/sales-documents/" + encodeURIComponent(id)));
      const status = String(doc.status || "").toLowerCase();
      const capabilities = state.context?.capabilities || {};
      const returned = number(doc.returnedAmount) > 0;
      const refunded = number(doc.refundedAmount) > 0;
      const allowed = status === "draft" ? capabilities.editDraft !== false :
        (status === "paid" || status === "partially_paid" ? capabilities.editPaid : capabilities.editPosted) &&
        (!returned || capabilities.editReturned) && (!refunded || capabilities.editRefunded);
      if (!allowed) {
        setStatus("This document is locked by role permissions. Opening read-only details instead.", "warning");
        return openDocument(id);
      }

      state.editId = doc.id;
      state.editStatus = status;
      state.lastDocument = doc;
      setValue("axtorDocumentType", doc.documentType || "invoice");
      setValue("axtorDocumentNumber", doc.documentNo || "");
      setValue("axtorDocumentDate", dateValue(doc.documentDate || doc.issuedAt || doc.createdAt));
      setValue("axtorDocumentStatus", title(doc.status));
      setValue("axtorCustomerId", doc.customerId || "");
      const customer = state.customers.find(function (item) { return item.id === doc.customerId; });
      setValue("axtorCustomerSearch", customer ? customerLabel(customer) : doc.customerName || "Walk-in Customer");
      setValue("axtorSalespersonId", doc.salesmanId || "");
      const salesperson = (state.context?.salesPersons || []).find(function (item) { return item.id === doc.salesmanId; });
      setValue("axtorSalespersonSearch", salesperson ? salesperson.name + " · " + salesperson.email : doc.salesmanName || "");
      setValue("axtorPaymentType", normalizeMethod(doc.paymentMethod));
      setValue("axtorPaidAmount", number(doc.paidAmount ?? doc.paid).toFixed(2));
      setValue("axtorDueDate", dateValue(doc.dueDate));
      setValue("axtorLpoNo", doc.lpoNo || "");
      setValue("axtorCustomerPoNo", doc.customerPoNo || "");
      setValue("axtorPoNo", doc.poNo || "");
      setValue("axtorBranch", doc.branchId || "");
      renderWarehouses();
      setValue("axtorWarehouse", doc.warehouseId || "");
      setValue("axtorSalesChannel", doc.salesChannel || "pos_counter");
      setValue("axtorReferenceNo", doc.referenceNo || "");
      setValue("axtorInternalNotes", doc.internalNotes || "");
      setValue("axtorCustomerNotes", doc.customerNotes || "");
      setValue("axtorDeliveryAddress", doc.delivery?.address || "");
      setValue("axtorDeliveryDate", dateValue(doc.delivery?.date));
      setValue("axtorDriver", doc.delivery?.driver || "");
      setValue("axtorVehicleNumber", doc.delivery?.vehicleNumber || "");
      setValue("axtorDeliveryInstructions", doc.delivery?.instructions || "");

      const cart = (doc.items || []).map(function (item) {
        return {
          productId: item.productId,
          productName: item.name,
          sku: item.sku,
          barcode: item.barcode,
          qrCode: item.qrCode,
          quantity: number(item.qty ?? item.quantity),
          unitPrice: number(item.rate ?? item.unitPrice),
          lineTotal: number(item.total ?? item.lineTotal),
        };
      });
      window.AxtorSalesBackend?.setCart?.(cart);
      state.originalCartSignature = cartSignature();

      const linesWrap = document.getElementById("axtorPaymentLines");
      linesWrap.innerHTML = "";
      (doc.paymentLines || []).forEach(function (line) { addPaymentLine(line.method, line.amount, line.referenceNo, line.depositAccount); });
      if (!linesWrap.children.length) { addPaymentLine("cash", 0); addPaymentLine("card", 0); }

      const badge = document.getElementById("axtorSaleModeBadge");
      badge.textContent = `Editing ${doc.documentNo} · ${title(status)}`;
      badge.className = "badge text-bg-warning";
      document.getElementById("axtorCancelEditBtn").classList.remove("d-none");
      document.getElementById("axtorSaveDraft").innerHTML = status === "draft" ? '<i class="bi bi-save me-1"></i>Save Draft Changes' : '<i class="bi bi-save me-1"></i>Save Header Changes';
      document.getElementById("axtorPostDocument").innerHTML = status === "draft" ? '<i class="bi bi-check2-circle me-1"></i>Post Draft' : '<i class="bi bi-save me-1"></i>Save Changes';
      if (status !== "draft") document.getElementById("axtorSaveDraft").classList.add("d-none");
      else document.getElementById("axtorSaveDraft").classList.remove("d-none");

      updateDocumentRules();
      updatePaymentUI();
      updateSummary();
      state.dirty = false;
      document.getElementById("new-sale").scrollIntoView({ behavior: "smooth", block: "start" });
      document.querySelector('[data-bs-target="#new-sale"]')?.click();
      setStatus(`Loaded ${doc.documentNo} for permission-safe editing.`, "success");
    } catch (error) {
      showValidation([error.message || "Unable to load document for editing"]);
    }
  }

  async function openDocument(id) {
    if (!id) return;
    try {
      const doc = unwrap(await request("GET", "/api/v1/sales-documents/" + encodeURIComponent(id)));
      state.lastDocument = doc;
      const modal = document.getElementById("axtorProductionDocumentModal");
      modal.querySelector(".modal-title").textContent = `${documentTypeLabel(doc.documentType)} ${doc.documentNo}`;
      modal.querySelector("[data-document-body]").innerHTML = renderDocument(doc);
      modal.dataset.documentId = doc.id;
      bootstrap.Modal.getOrCreateInstance(modal).show();
    } catch (error) {
      setStatus(error.message || "Unable to open document", "danger");
    }
  }

  function renderDocument(doc) {
    const items = (doc.items || []).map(function (item) {
      return `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.sku || "-")}</td><td class="text-end">${number(item.qty ?? item.quantity)}</td><td class="text-end">${money(item.rate ?? item.unitPrice)}</td><td class="text-end">${money(item.total ?? item.lineTotal)}</td></tr>`;
    }).join("");
    return `
      <div class="invoice-paper axtor-production-print" data-print-document>
        <div class="d-flex justify-content-between gap-3 flex-wrap">
          <div><h3 class="fw-bold mb-1">Axtor POS Cloud</h3><div>${escapeHtml(documentTypeLabel(doc.documentType))}</div></div>
          <div class="text-end"><h4 class="mb-1">${escapeHtml(doc.documentNo)}</h4><div>${escapeHtml(formatDate(doc.documentDate || doc.issuedAt || doc.createdAt))}</div><div>${statusBadgeText(doc.status)}</div></div>
        </div>
        <hr>
        <div class="row g-2 mb-3">
          ${info("Customer", doc.customerName)}${info("Sales Person", doc.salesmanName)}${info("Payment Type", title(doc.paymentMethod))}${info("LPO No", doc.lpoNo)}
          ${info("Customer PO", doc.customerPoNo)}${info("PO Number", doc.poNo)}${info("Due Date", formatDate(doc.dueDate))}${info("Branch", branchName(doc.branchId))}
          ${info("Warehouse", warehouseName(doc.warehouseId))}${info("Sales Channel", title(doc.salesChannel))}${info("Reference", doc.referenceNo)}${info("Currency", doc.currency || "QAR")}
        </div>
        <div class="table-responsive"><table class="table"><thead><tr><th>Item</th><th>SKU</th><th class="text-end">Qty</th><th class="text-end">Rate</th><th class="text-end">Total</th></tr></thead><tbody>${items || '<tr><td colspan="5">No items</td></tr>'}</tbody></table></div>
        <div class="row justify-content-end"><div class="col-md-6 col-lg-5">
          <div class="d-flex justify-content-between"><span>Subtotal</span><strong>${money(doc.subtotal)}</strong></div>
          <div class="d-flex justify-content-between"><span>Discount</span><strong>${money(doc.discount)}</strong></div>
          <div class="d-flex justify-content-between"><span>Tax</span><strong>${money(doc.tax)}</strong></div><hr>
          <div class="d-flex justify-content-between fs-5"><span>Grand Total</span><strong>${money(doc.grandTotal ?? doc.total)}</strong></div>
          <div class="d-flex justify-content-between"><span>Paid</span><strong>${money(doc.paidAmount ?? doc.paid)}</strong></div>
          <div class="d-flex justify-content-between"><span>Balance</span><strong>${money(doc.balance)}</strong></div>
          <div class="d-flex justify-content-between"><span>Returned</span><strong>${money(doc.returnedAmount)}</strong></div>
          <div class="d-flex justify-content-between"><span>Refunded</span><strong>${money(doc.refundedAmount)}</strong></div>
          <div class="d-flex justify-content-between"><span>Net Retained</span><strong>${money(doc.netRetained ?? number(doc.paid) - number(doc.refundedAmount))}</strong></div>
        </div></div>
        ${doc.customerNotes ? `<div class="mt-3"><strong>Customer Notes:</strong><div>${escapeHtml(doc.customerNotes)}</div></div>` : ""}
      </div>`;
  }

  function ensureDocumentModal() {
    if (document.getElementById("axtorProductionDocumentModal")) return;
    const wrap = document.createElement("div");
    wrap.innerHTML = `<div class="modal fade" id="axtorProductionDocumentModal" tabindex="-1"><div class="modal-dialog modal-xl"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">Sales Document</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body" data-document-body></div><div class="modal-footer no-print"><button type="button" class="btn btn-soft" data-bs-dismiss="modal">Close</button><button id="axtorPrintDocumentBtn" type="button" class="btn btn-brand"><i class="bi bi-printer me-1"></i>Print</button></div></div></div></div>`;
    document.body.appendChild(wrap.firstElementChild);
  }

  function printCurrentDocument() {
    const content = document.querySelector("#axtorProductionDocumentModal [data-print-document]");
    if (!content) return;
    const printWindow = window.open("", "_blank", "width=1000,height=800");
    if (!printWindow) return setStatus("Popup blocked. Allow popups to print.", "warning");
    printWindow.document.write(`<!doctype html><html><head><title>Print Sales Document</title><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet"><style>body{padding:24px;font-family:Arial,sans-serif}.invoice-paper{max-width:1000px;margin:auto}.table{width:100%}@media print{body{padding:0}}</style></head><body>${content.outerHTML}</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(function () { printWindow.print(); }, 400);
  }

  function resetForm() {
    state.editId = null;
    state.editStatus = null;
    state.lastDocument = null;
    state.originalCartSignature = "";
    state.idempotencyKey = null;
    state.dirty = false;
    document.getElementById("axtorSaleModeBadge").textContent = "New Document";
    document.getElementById("axtorSaleModeBadge").className = "badge text-bg-success";
    document.getElementById("axtorCancelEditBtn").classList.add("d-none");
    document.getElementById("axtorSaveDraft").classList.remove("d-none");
    document.getElementById("axtorSaveDraft").innerHTML = '<i class="bi bi-file-earmark me-1"></i>Save Draft';
    document.getElementById("axtorPostDocument").innerHTML = '<i class="bi bi-check2-circle me-1"></i>Post Document';
    setValue("axtorDocumentStatus", "New / Unsaved");
    setValue("axtorLpoNo", ""); setValue("axtorCustomerPoNo", ""); setValue("axtorPoNo", "");
    setValue("axtorReferenceNo", ""); setValue("axtorInternalNotes", ""); setValue("axtorCustomerNotes", ""); setValue("axtorEditReason", "");
    setValue("axtorCustomerSearch", "Walk-in Customer"); setValue("axtorCustomerId", "");
    window.AxtorSalesBackend?.setCart?.([]);
    setDefaultDates();
    refreshNumberPreview();
    updatePaymentUI();
    updateSummary();
    showValidation([]);
    setStatus("Ready.", "muted");
  }

  function setDefaultDates() {
    setValue("axtorDocumentDate", today());
    setValue("axtorDeliveryDate", today());
  }

  function setSubmitting(active, message) {
    ["axtorSaveDraft", "axtorPostDocument"].forEach(function (id) {
      const button = document.getElementById(id);
      if (button) button.disabled = active;
    });
    if (message) setStatus(message, "muted");
  }

  function showValidation(errors) {
    const box = document.getElementById("axtorSaleValidation");
    if (!box) return;
    if (!errors || !errors.length) {
      box.classList.add("d-none");
      box.innerHTML = "";
      return;
    }
    box.classList.remove("d-none");
    box.innerHTML = `<strong>Please correct the following:</strong><ul class="mb-0 mt-1">${errors.map(function (error) { return `<li>${escapeHtml(error)}</li>`; }).join("")}</ul>`;
    box.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function setStatus(message, type) {
    const box = document.getElementById("axtorSaleSubmitStatus");
    if (!box) return;
    box.className = "small mt-2 text-" + (type || "muted");
    box.textContent = message;
  }

  function markDirty() {
    if (!state.submitting) state.dirty = true;
  }

  function ensureStyles() {
    if (document.getElementById("axtorSalesProductionStyles")) return;
    const style = document.createElement("style");
    style.id = "axtorSalesProductionStyles";
    style.textContent = `
      .axtor-legacy-hidden{display:none!important}
      .axtor-sale-information{border:1px solid rgba(25,135,84,.2)}
      .axtor-document-summary{background:rgba(25,135,84,.07);border:1px solid rgba(25,135,84,.15)}
      .axtor-document-summary span{display:block;font-size:.72rem;text-transform:uppercase;letter-spacing:.03em;color:var(--bs-secondary-color)}
      .axtor-document-summary strong{display:block;margin-top:.2rem;white-space:nowrap}
      .axtor-payment-line{padding-bottom:.4rem;border-bottom:1px dashed rgba(0,0,0,.12)}
      #axtorSaleInformationPanel .form-control[readonly]{background-color:rgba(0,0,0,.035)}
      @media(max-width:767.98px){#axtorSaleInformationPanel .btn{min-height:42px}.axtor-document-summary .col-6{margin-bottom:.45rem}}
      @media print{body *{visibility:hidden!important}.axtor-production-print,.axtor-production-print *{visibility:visible!important}.axtor-production-print{position:absolute;left:0;top:0;width:100%}.no-print{display:none!important}}
    `;
    document.head.appendChild(style);
  }

  function createKey() {
    if (window.crypto?.randomUUID) return "sale-" + window.crypto.randomUUID();
    return "sale-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function value(id) { return document.getElementById(id)?.value?.trim?.() || ""; }
  function setValue(id, val) { const element = document.getElementById(id); if (element) element.value = val == null ? "" : String(val); }
  function text(id, val) { const element = document.getElementById(id); if (element) element.textContent = val; }
  function number(input, fallback) { const n = Number(input); return Number.isFinite(n) ? n : (fallback || 0); }
  function round(input) { return Math.round((number(input) + Number.EPSILON) * 100) / 100; }
  function money(input) { return "QAR " + number(input).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function formatQty(input) { const result = number(input); return Number.isInteger(result) ? String(result) : result.toFixed(3).replace(/0+$/, "").replace(/\.$/, ""); }
  function today() { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" }); }
  function dateValue(input) { if (!input) return ""; const date = new Date(input); return Number.isNaN(date.getTime()) ? String(input).slice(0, 10) : date.toISOString().slice(0, 10); }
  function formatDate(input) { if (!input) return "-"; const date = new Date(input); return Number.isNaN(date.getTime()) ? escapeHtml(input) : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  function title(input) { return String(input || "-").replace(/_/g, " ").replace(/\b\w/g, function (letter) { return letter.toUpperCase(); }); }
  function prefixFor(type) { return type === "quotation" ? "QUO" : type === "delivery_note" ? "DN" : "INV"; }
  function documentTypeLabel(type) { return type === "quotation" ? "Quotation" : type === "delivery_note" ? "Delivery Note" : "Sales Invoice"; }
  function normalizeMethod(method) { const raw = String(method || "cash").toLowerCase().replace(/\s+/g, "_"); return raw === "customer_credit" ? "credit" : raw === "bank" ? "bank_transfer" : raw === "cash/card" ? "mixed" : raw; }
  function branchName(id) { return state.context?.branches?.find(function (item) { return item.id === id; })?.name || id || "-"; }
  function warehouseName(id) { return state.context?.warehouses?.find(function (item) { return item.id === id; })?.name || id || "-"; }
  function info(label, val) { return `<div class="col-6 col-md-3"><div class="small text-muted">${escapeHtml(label)}</div><strong>${escapeHtml(val || "-")}</strong></div>`; }
  function statusBadgeText(status) { const value = title(status); return `<span class="badge text-bg-light">${escapeHtml(value)}</span>`; }
  function escapeHtml(input) { return String(input == null ? "" : input).replace(/[&<>"]/g, function (char) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]; }); }
  function escapeAttr(input) { return escapeHtml(input).replace(/'/g, "&#39;"); }
})();
