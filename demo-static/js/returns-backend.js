/**
 * Axtor POS Cloud
 * Phase 5 — Sales Returns Backend Integration
 * Phase 5B — Real Backend Return Posting
 *
 * Full replace file.
 * Frontend only.
 * No backend/Railway changes.
 * Green theme safe.
 * Retro theme safe.
 */

(function () {
  "use strict";

  const API_BASE_URL = "https://axtor-cloud-pos-production.up.railway.app";
  const TOKEN_KEY = "axtorAuthToken";

  const state = {
    initialized: false,
    loading: false,
    posting: false,
    invoices: [],
    returns: [],
    selectedInvoice: null,
    returnItems: new Map(),
    searchText: "",
    lastReturnId: "",
    lastReturnNo: "",
    refundPosting: false,
    refundInvoice: null,
  };

  window.AxtorReturnsBackend = {
    exists: true,
    version: "20260710-phase5d-customer-refund-button-handler-fix",
    init,
    refresh: loadBackendInvoices,
    loadBackendInvoices,
    postBackendReturn,
    openRefundModal,
    postCustomerRefund,
    getState: function () {
      return state;
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  function init() {
    if (state.initialized) return;
    state.initialized = true;

    ensureStyles();
    ensureToastContainer();
    ensureReturnsPanel();
    bindEvents();
    loadBackendInvoices();
    loadReturnHistory();

    console.log("AxtorReturnsBackend loaded:", window.AxtorReturnsBackend.version);
  }

  function bindEvents() {
    document.addEventListener("input", function (e) {
      if (e.target && e.target.id === "axtorReturnInvoiceSearch") {
        state.searchText = e.target.value || "";
        renderInvoiceList();
        return;
      }

      if (e.target && e.target.matches("[data-return-qty]")) {
        const lineKey = e.target.getAttribute("data-return-qty");
        setReturnQty(lineKey, e.target.value);
        return;
      }

      if (e.target && e.target.id === "axtorReturnReason") {
        updateSummary();
        return;
      }
    });

    document.addEventListener("click", function (e) {
      const refreshBtn = e.target.closest("[data-returns-refresh]");
      if (refreshBtn) {
        e.preventDefault();
        loadBackendInvoices(true);
        loadReturnHistory();
        return;
      }

      const selectBtn = e.target.closest("[data-return-select-invoice]");
      if (selectBtn) {
        e.preventDefault();
        selectInvoice(selectBtn.getAttribute("data-return-select-invoice"));
        return;
      }

      const refundBtn = e.target.closest("[data-refund-invoice]");
      if (refundBtn) {
        e.preventDefault();
        e.stopPropagation();
        openRefundModal(refundBtn.getAttribute("data-refund-invoice"));
        return;
      }

      const refundSubmitBtn = e.target.closest("[data-refund-submit]");
      if (refundSubmitBtn) {
        e.preventDefault();
        postCustomerRefund();
        return;
      }

      const clearBtn = e.target.closest("[data-returns-clear]");
      if (clearBtn) {
        e.preventDefault();
        clearReturnPreview();
        return;
      }

      const previewBtn = e.target.closest("[data-returns-preview]");
      if (previewBtn) {
        e.preventDefault();
        previewReturnPayload();
        return;
      }

      const postBtn = e.target.closest("[data-returns-post]");
      if (postBtn) {
        e.preventDefault();
        postBackendReturn();
        return;
      }
    });
  }

  async function backendGet(path) {
    return backendRequest("GET", path);
  }

  async function backendPost(path, body) {
    return backendRequest("POST", path, body);
  }

  async function backendRequest(method, path, body) {
    if (window.AxtorAPI && typeof window.AxtorAPI.request === "function") {
      return window.AxtorAPI.request(method, path, body);
    }

    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      window.location.replace("login.html?reason=authentication-required");
      throw new Error("Authentication required. Redirecting to login.");
    }

    const res = await fetch(API_BASE_URL + path, {
      method: method,
      headers: {
        Accept: "application/json",
        ...(method === "GET" ? {} : { "Content-Type": "application/json" }),
        Authorization: "Bearer " + token,
      },
      ...(method === "GET" ? {} : { body: JSON.stringify(body || {}) }),
    });

    const data = await res.json().catch(function () {
      return null;
    });

    if (res.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      window.location.replace("login.html?reason=session-expired");
      throw new Error("Session expired. Redirecting to login.");
    }

    if (!res.ok) {
      throw new Error(data?.error?.message || data?.message || "Backend request failed");
    }

    return data;
  }

  async function loadBackendInvoices(manual) {
    ensureReturnsPanel();

    const tbody = document.getElementById("axtorReturnInvoicesTbody");
    const status = document.getElementById("axtorReturnsStatus");

    state.loading = true;

    if (status) {
      status.className = "small text-muted";
      status.innerHTML = inlineSpinner("Loading backend invoices...");
    }

    if (tbody) {
      tbody.innerHTML =
        '<tr><td colspan="7" class="text-center py-4 text-muted">' +
        inlineSpinner("Loading invoices...") +
        "</td></tr>";
    }

    try {
      const response = await backendGet("/api/v1/sales-documents");
      const docs = normalizeList(response);

      state.invoices = docs
        .filter(isInvoice)
        .sort(function (a, b) {
          return new Date(b.rawDate || 0).getTime() - new Date(a.rawDate || 0).getTime();
        });

      renderInvoiceList();

      if (status) {
        status.className = "small text-success";
        status.innerHTML = "Backend invoices loaded: <strong>" + state.invoices.length + "</strong>";
      }

      if (manual) {
        showToast("Invoices refreshed", state.invoices.length + " invoice(s) loaded.", "success");
      }
    } catch (err) {
      console.error("Returns backend invoice load failed:", err);

      if (status) {
        status.className = "small text-danger";
        status.textContent = err.message || "Failed to load invoices";
      }

      if (tbody) {
        tbody.innerHTML =
          '<tr><td colspan="7" class="text-center py-4 text-danger">Failed to load backend invoices.</td></tr>';
      }

      showToast("Invoice load failed", err.message || "Unable to load backend invoices.", "danger");
    } finally {
      state.loading = false;
    }
  }

  async function loadReturnHistory() {
    const body = document.getElementById("axtorReturnHistoryTbody");
    if (!body) return;

    try {
      const response = await backendGet("/api/v1/sales-returns");
      const data = unwrapData(response);
      const rows = Array.isArray(data)
        ? data
        : data?.items || data?.returns || data?.rows || data?.results || [];

      state.returns = rows.map(normalizeReturn).filter(function (row) {
        return !!row.id;
      });

      renderReturnHistory();
    } catch (err) {
      console.warn("Return history load skipped:", err);
      body.innerHTML =
        '<tr><td colspan="5" class="text-center py-3 text-muted">Return history unavailable or empty.</td></tr>';
    }
  }

  function renderInvoiceList() {
    const tbody = document.getElementById("axtorReturnInvoicesTbody");
    const count = document.getElementById("axtorReturnsCount");
    if (!tbody) return;

    const search = String(state.searchText || "").toLowerCase().trim();

    const rows = state.invoices.filter(function (doc) {
      if (!search) return true;
      return [
        doc.documentNoText,
        doc.customerText,
        doc.dateText,
        doc.statusText,
        doc.returnStatusText,
        doc.returnedAmount,
        doc.returnCount,
        doc.lpoText,
        doc.poText,
        doc.amount,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });

    if (count) count.textContent = rows.length + " shown";

    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="7" class="text-center py-4 text-muted">No backend invoices found.</td></tr>';
      return;
    }

    tbody.innerHTML = rows
      .map(function (doc) {
        const active =
          state.selectedInvoice && String(state.selectedInvoice.id) === String(doc.id);

        return `
          <tr class="${active ? "axtor-return-selected-row" : ""}">
            <td><strong>${escapeHtml(doc.documentNoText)}</strong></td>
            <td>${escapeHtml(doc.customerText)}</td>
            <td>${escapeHtml(doc.dateText)}</td>
            <td class="text-end"><strong>${money(doc.amount)}</strong></td>
            <td class="text-end">${money(doc.paidAmount)}</td>
            <td>
              ${statusBadge(doc.statusText)}
              ${returnBadge(doc)}
            </td>
            <td class="text-end">
              <button type="button" class="btn btn-sm ${isFullyReturned(doc) ? "btn-outline-secondary" : "btn-outline-success"}" data-return-select-invoice="${escapeAttr(
                doc.id
              )}" ${state.posting || isFullyReturned(doc) ? "disabled" : ""}>
                ${isFullyReturned(doc) ? "Fully Returned" : "Select"}
              </button>
              ${toNumber(doc.returnedAmount) > toNumber(doc.refundedAmount) && toNumber(doc.paidAmount) > toNumber(doc.refundedAmount) ? `<button type="button" class="btn btn-sm btn-warning ms-1" data-refund-invoice="${escapeAttr(doc.id)}">Refund Customer</button>` : ""}
            </td>
          </tr>
        `;
      })
      .join("");
  }

  async function selectInvoice(id) {
    const doc = state.invoices.find(function (x) {
      return String(x.id) === String(id);
    });

    if (!doc) {
      showToast("Invoice not found", "Please refresh and try again.", "danger");
      return;
    }

    if (isFullyReturned(doc)) {
      showToast("Fully returned", "This invoice is already fully returned.", "warning");
      return;
    }

    state.selectedInvoice = doc;
    state.returnItems.clear();

    const lines = Array.isArray(doc.lines) ? doc.lines : [];
    lines.forEach(function (line, index) {
      const key = line.id || line.productId || "line-" + index;
      state.returnItems.set(String(key), {
        key: String(key),
        productId: line.productId || "",
        salesDocumentItemId: line.id || null,
        name: line.name || "Item",
        sku: line.sku || "-",
        soldQty: toNumber(line.qty || line.quantity),
        returnQty: 0,
        rate: toNumber(line.rate || line.unitPrice),
        total: 0,
      });
    });

    renderInvoiceList();
    renderSelectedInvoice();
    updateSummary();

    showToast("Invoice selected", doc.documentNoText + " loaded for return.", "success");
  }

  function renderSelectedInvoice() {
    const box = document.getElementById("axtorReturnSelectedBox");
    const tbody = document.getElementById("axtorReturnItemsTbody");

    if (!box || !tbody) return;

    const doc = state.selectedInvoice;

    if (!doc) {
      box.innerHTML =
        '<div class="text-muted">Select backend invoice to return items.</div>';
      tbody.innerHTML =
        '<tr><td colspan="6" class="text-center py-4 text-muted">No invoice selected.</td></tr>';
      return;
    }

    box.innerHTML = `
      <div class="axtor-return-doc-grid">
        ${infoBox("Invoice", doc.documentNoText)}
        ${infoBox("Customer", doc.customerText)}
        ${infoBox("Date", doc.dateText)}
        ${infoBox("Amount", money(doc.amount))}
        ${infoBox("Paid", money(doc.paidAmount))}
        ${infoBox("Status", titleCase(doc.statusText))}
        ${infoBox("Return Status", doc.returnStatusText || "Not Returned")}
        ${infoBox("Returned Amount", money(doc.returnedAmount || 0))}
        ${infoBox("Return Count", String(doc.returnCount || 0))}
        ${infoBox("Refund Status", refundStatusLabel(doc.refundStatus))}
        ${infoBox("Refunded Amount", money(doc.refundedAmount || 0))}
        ${infoBox("Refund Balance", money(doc.refundBalance || 0))}
      </div>
    `;

    const items = Array.from(state.returnItems.values());

    if (!items.length) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="text-center py-4 text-muted">No items found on this invoice.</td></tr>';
      return;
    }

    tbody.innerHTML = items
      .map(function (item) {
        return `
          <tr>
            <td>
              <strong>${escapeHtml(item.name)}</strong>
              <div class="small text-muted">SKU: ${escapeHtml(item.sku || "-")}</div>
              <div class="small text-muted">Product ID: ${escapeHtml(item.productId || "-")}</div>
            </td>
            <td class="text-end">${formatQty(item.soldQty)}</td>
            <td class="text-end">${money(item.rate)}</td>
            <td class="text-end">
              <input type="number" min="0" max="${escapeAttr(item.soldQty)}" step="0.01"
                class="form-control form-control-sm text-end"
                value="${toNumber(item.returnQty).toFixed(2)}"
                data-return-qty="${escapeAttr(item.key)}"
                ${state.posting ? "disabled" : ""}>
            </td>
            <td class="text-end"><strong>${money(item.total)}</strong></td>
            <td>${item.returnQty > 0 ? '<span class="badge text-bg-warning">Return</span>' : '<span class="text-muted">No return</span>'}</td>
          </tr>
        `;
      })
      .join("");
  }

  function setReturnQty(key, value) {
    const item = state.returnItems.get(String(key));
    if (!item) return;

    const qty = Math.max(0, Math.min(toNumber(value), toNumber(item.soldQty)));
    item.returnQty = qty;
    item.total = roundMoney(qty * toNumber(item.rate));

    renderSelectedInvoice();
    updateSummary();
  }

  function updateSummary() {
    const items = Array.from(state.returnItems.values()).filter(function (item) {
      return toNumber(item.returnQty) > 0;
    });

    const totalQty = items.reduce(function (sum, item) {
      return sum + toNumber(item.returnQty);
    }, 0);

    const totalAmount = items.reduce(function (sum, item) {
      return sum + toNumber(item.total);
    }, 0);

    setText("axtorReturnTotalQty", formatQty(totalQty));
    setText("axtorReturnTotalAmount", money(totalAmount));

    const postBtn = document.querySelector("[data-returns-post]");
    const previewBtn = document.querySelector("[data-returns-preview]");

    if (previewBtn) previewBtn.disabled = !state.selectedInvoice || totalAmount <= 0 || state.posting;
    if (postBtn) {
      postBtn.disabled = !state.selectedInvoice || totalAmount <= 0 || state.posting;
      postBtn.title = postBtn.disabled ? "Select invoice and return quantity first." : "Post return to backend.";
    }
  }

  function previewReturnPayload() {
    try {
      const payload = buildReturnPayload();
      console.log("Axtor Return Phase 5B payload preview:", payload);

      showToast(
        "Return preview ready",
        "Payload printed in console. Total: " + money(payload.totalAmount),
        "info"
      );

      alert(
        "Return payload printed in console.\n\nInvoice: " +
          payload.documentNo +
          "\nItems: " +
          payload.items.length +
          "\nTotal: " +
          money(payload.totalAmount)
      );
    } catch (err) {
      showToast("Preview failed", err.message || "Unable to build return payload.", "danger");
    }
  }

  async function postBackendReturn() {
    if (state.posting) {
      showToast("Please wait", "Return is already being posted.", "warning");
      return;
    }

    let payload;
    try {
      payload = buildReturnPayload();
    } catch (err) {
      showToast("Return invalid", err.message || "Check return details.", "danger");
      return;
    }

    const ok = confirm(
      "Post backend sales return now?\n\nInvoice: " +
        payload.documentNo +
        "\nItems: " +
        payload.items.length +
        "\nTotal: " +
        money(payload.totalAmount)
    );

    if (!ok) return;

    state.posting = true;
    setPostButtonLoading(true);
    updateSummary();
    showToast("Posting return", "Saving return and increasing stock...", "info");

    try {
      console.log("Axtor Phase 5B return payload:", payload);
      const response = await backendPost("/api/v1/sales-returns", payload);
      const created = normalizeReturn(unwrapData(response));

      state.lastReturnId = created.id || "";
      state.lastReturnNo = created.returnNo || created.documentNo || "";

      showToast(
        "Return posted",
        (state.lastReturnNo ? state.lastReturnNo + " posted. " : "") +
          "Stock updated by backend.",
        "success"
      );

      clearReturnPreview(false);
      await loadBackendInvoices(false);
      await loadReturnHistory();
      refreshProductsIfAvailable();
      refreshSalesBackendIfAvailable();
    } catch (err) {
      console.error("Post sales return failed:", err);
      showToast("Return failed", err.message || "Unable to post return.", "danger");
    } finally {
      state.posting = false;
      setPostButtonLoading(false);
      updateSummary();
    }
  }

  function buildReturnPayload() {
    if (!state.selectedInvoice) {
      throw new Error("Select invoice first.");
    }

    const items = Array.from(state.returnItems.values())
      .filter(function (item) {
        return toNumber(item.returnQty) > 0;
      })
      .map(function (item) {
        return {
          salesDocumentItemId: item.salesDocumentItemId || null,
          productId: item.productId || null,
          productName: item.name,
          sku: item.sku || null,
          soldQty: item.soldQty,
          returnQty: item.returnQty,
          quantity: item.returnQty,
          qty: item.returnQty,
          rate: item.rate,
          unitPrice: item.rate,
          price: item.rate,
          lineTotal: item.total,
          total: item.total,
        };
      });

    if (!items.length) {
      throw new Error("Enter return quantity for at least one item.");
    }

    const reason =
      document.getElementById("axtorReturnReason")?.value ||
      "Customer return";

    const totalAmount = items.reduce(function (sum, item) {
      return sum + toNumber(item.lineTotal);
    }, 0);

    return {
      sourceSalesDocumentId: state.selectedInvoice.id,
      salesDocumentId: state.selectedInvoice.id,
      documentNo: state.selectedInvoice.documentNoText,
      customerId: state.selectedInvoice.customerId || null,
      customerName: state.selectedInvoice.customerText,
      reason: reason,
      notes: reason,
      totalAmount: totalAmount,
      grandTotal: totalAmount,
      items: items,
    };
  }

  function setPostButtonLoading(active) {
    const btn = document.querySelector("[data-returns-post]");
    if (!btn) return;

    btn.disabled = !!active;

    if (active) {
      btn.setAttribute("data-original-html", btn.innerHTML);
      btn.innerHTML =
        '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Posting Return...';
    } else {
      btn.innerHTML =
        btn.getAttribute("data-original-html") ||
        "Post Backend Return";
      btn.removeAttribute("data-original-html");
    }
  }

  function clearReturnPreview(showMessage) {
    state.selectedInvoice = null;
    state.returnItems.clear();

    const reason = document.getElementById("axtorReturnReason");
    if (reason) reason.value = "";

    renderInvoiceList();
    renderSelectedInvoice();
    updateSummary();

    if (showMessage !== false) {
      showToast("Return cleared", "Return preview has been cleared.", "info");
    }
  }

  function refreshSalesBackendIfAvailable() {
    try {
      if (
        window.AxtorSalesBackend &&
        typeof window.AxtorSalesBackend.loadSavedDocuments === "function"
      ) {
        window.AxtorSalesBackend.loadSavedDocuments({
          preserveSearch: true,
          preserveTab: true,
          manual: false,
        });
      } else if (
        window.AxtorSalesBackend &&
        typeof window.AxtorSalesBackend.refresh === "function"
      ) {
        window.AxtorSalesBackend.refresh();
      }
    } catch (err) {
      console.warn("Sales backend refresh skipped:", err);
    }
  }

  function refreshProductsIfAvailable() {
    try {
      if (
        window.AxtorSalesBackend &&
        typeof window.AxtorSalesBackend.loadBackendProducts === "function"
      ) {
        window.AxtorSalesBackend.loadBackendProducts();
      }
    } catch (err) {
      console.warn("Products refresh skipped:", err);
    }
  }

  function renderReturnHistory() {
    const body = document.getElementById("axtorReturnHistoryTbody");
    if (!body) return;

    if (!state.returns.length) {
      body.innerHTML =
        '<tr><td colspan="5" class="text-center py-3 text-muted">No backend returns yet.</td></tr>';
      return;
    }

    body.innerHTML = state.returns
      .slice(0, 10)
      .map(function (row) {
        const isNew = state.lastReturnId && String(row.id) === String(state.lastReturnId);
        return `
          <tr class="${isNew ? "axtor-return-selected-row" : ""}">
            <td><strong>${escapeHtml(row.returnNo || row.documentNo || "-")}</strong></td>
            <td>${escapeHtml(row.invoiceNo || row.sourceDocumentNo || "-")}</td>
            <td>${escapeHtml(row.customerName || "-")}</td>
            <td class="text-end"><strong>${money(row.totalAmount)}</strong></td>
            <td>${escapeHtml(formatDate(row.createdAt || row.returnDate || new Date()))}</td>
          </tr>
        `;
      })
      .join("");
  }

  function ensureReturnsPanel() {
    if (document.getElementById("axtorReturnsBackendPanel")) return;

    const root = findReturnsRoot() || document.querySelector("main") || document.body;

    const panel = document.createElement("div");
    panel.id = "axtorReturnsBackendPanel";
    panel.className = "card my-3 axtor-returns-backend-panel";

    panel.innerHTML = `
      <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div>
          <strong>Backend Sales Returns — Phase 5B</strong>
          <div id="axtorReturnsStatus" class="small text-muted">Ready</div>
        </div>
        <div class="d-flex flex-wrap align-items-center gap-2">
          <span id="axtorReturnsCount" class="badge text-bg-light">0 shown</span>
          <input id="axtorReturnInvoiceSearch" type="search" class="form-control form-control-sm"
            style="max-width:260px" placeholder="Search invoice / customer / LPO / PO">
          <button type="button" class="btn btn-sm btn-outline-success" data-returns-refresh="1">Refresh</button>
        </div>
      </div>

      <div class="card-body">
        <div class="table-responsive mb-3">
          <table class="table table-sm table-hover align-middle">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Date</th>
                <th class="text-end">Amount</th>
                <th class="text-end">Paid</th>
                <th>Status</th>
                <th class="text-end">Action</th>
              </tr>
            </thead>
            <tbody id="axtorReturnInvoicesTbody">
              <tr><td colspan="7" class="text-center py-4 text-muted">Waiting for backend invoices...</td></tr>
            </tbody>
          </table>
        </div>

        <div class="card axtor-return-preview-card mb-3">
          <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
            <strong>Return Posting</strong>
            <div class="d-flex flex-wrap gap-2">
              <button type="button" class="btn btn-sm btn-outline-secondary" data-returns-clear="1">Clear</button>
              <button type="button" class="btn btn-sm btn-outline-primary" data-returns-preview="1" disabled>Preview Payload</button>
              <button type="button" class="btn btn-sm btn-success" data-returns-post="1" disabled>Post Backend Return</button>
            </div>
          </div>
          <div class="card-body">
            <div id="axtorReturnSelectedBox" class="mb-3">
              <div class="text-muted">Select backend invoice to return items.</div>
            </div>

            <div class="mb-3">
              <label class="form-label small fw-bold">Return Reason</label>
              <input id="axtorReturnReason" class="form-control form-control-sm"
                placeholder="Example: damaged item, customer changed mind, wrong item">
            </div>

            <div class="table-responsive">
              <table class="table table-sm align-middle mb-0">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th class="text-end">Sold Qty</th>
                    <th class="text-end">Rate</th>
                    <th class="text-end">Return Qty</th>
                    <th class="text-end">Return Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody id="axtorReturnItemsTbody">
                  <tr><td colspan="6" class="text-center py-4 text-muted">No invoice selected.</td></tr>
                </tbody>
                <tfoot>
                  <tr>
                    <th colspan="3" class="text-end">Total Return</th>
                    <th id="axtorReturnTotalQty" class="text-end">0</th>
                    <th id="axtorReturnTotalAmount" class="text-end">QAR 0.00</th>
                    <th></th>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div class="alert alert-success mt-3 mb-0">
              <strong>Phase 5D:</strong> Return posts to backend; customer refunds are recorded separately for audit accuracy.
            </div>
          </div>
        </div>

        <div class="card axtor-return-preview-card">
          <div class="card-header">
            <strong>Backend Return History</strong>
          </div>
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-sm align-middle mb-0">
                <thead>
                  <tr>
                    <th>Return No</th>
                    <th>Invoice</th>
                    <th>Customer</th>
                    <th class="text-end">Amount</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody id="axtorReturnHistoryTbody">
                  <tr><td colspan="5" class="text-center py-3 text-muted">Loading return history...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;

    root.prepend(panel);
  }

  function findReturnsRoot() {
    const selectors = [
      "#sales-returns",
      "#returns",
      "#return",
      "#salesReturns",
      "#sales-return",
      '[data-section="sales-returns"]',
      '[data-section="returns"]',
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) return el;
    }

    return document.querySelector("main") || document.body;
  }

  function normalizeList(response) {
    const data = unwrapData(response);
    let list = [];

    if (Array.isArray(data)) list = data;
    else if (Array.isArray(data?.items)) list = data.items;
    else if (Array.isArray(data?.documents)) list = data.documents;
    else if (Array.isArray(data?.salesDocuments)) list = data.salesDocuments;
    else if (Array.isArray(data?.rows)) list = data.rows;
    else if (Array.isArray(data?.results)) list = data.results;

    return list.map(normalizeDocument).filter(function (doc) {
      return !!doc.id;
    });
  }

  function unwrapData(response) {
    if (response && typeof response === "object" && "data" in response) return response.data;
    return response;
  }

  function normalizeDocument(raw) {
    const doc = raw || {};
    const customer = doc.customer || doc.customerSnapshot || doc.customerData || {};
    const rawType = doc.documentType || doc.documentTypeRaw || doc.type || doc.docType || "";
    const rawDate = doc.documentDate || doc.date || doc.createdAt || doc.issueDate || "";
    const linesRaw = doc.items || doc.lines || doc.documentItems || doc.saleDocumentItems || [];

    const amount = toNumber(
      doc.grandTotal ?? doc.totalAmount ?? doc.netAmount ?? doc.amount ?? doc.total ?? 0
    );

    const paidAmount = toNumber(
      doc.paidAmount ?? doc.amountPaid ?? doc.receivedAmount ?? doc.paid ?? doc.cashAmount ?? 0
    );

    return {
      ...doc,
      id: doc.id || doc._id || doc.documentId || doc.salesDocumentId,
      documentNoText: doc.documentNo || doc.docNo || doc.invoiceNo || doc.number || "N/A",
      rawType: rawType,
      typeText: documentTypeLabel(rawType),
      customerId: doc.customerId || customer.id || "",
      customerText:
        doc.customerName ||
        customer.name ||
        customer.displayName ||
        customer.companyName ||
        doc.customerId ||
        "Walk-in / Unknown",
      rawDate: rawDate,
      dateText: formatDate(rawDate),
      lpoText: doc.lpoNo || doc.lpo || "",
      poText: doc.customerPoNo || doc.poNo || "",
      amount: amount,
      paidAmount: paidAmount,
      statusText:
        doc.status || doc.paymentStatus || doc.documentStatus || (doc.isPosted ? "posted" : "draft"),
      returnStatus:
        doc.returnStatus || doc.return_status || doc.returnState || "not_returned",
      returnStatusText: returnStatusLabel(
        doc.returnStatus || doc.return_status || doc.returnState || "not_returned"
      ),
      returnedAmount: toNumber(doc.returnedAmount ?? doc.return_amount ?? doc.totalReturned ?? 0),
      returnCount: toNumber(doc.returnCount ?? doc.returnsCount ?? doc.return_count ?? 0),
      refundedAmount: toNumber(doc.refundedAmount ?? doc.refund_amount ?? 0),
      refundStatus: doc.refundStatus || doc.refund_status || "not_refunded",
      refundBalance: toNumber(doc.refundBalance ?? Math.max(0, Math.min(doc.returnedAmount ?? 0, paidAmount) - (doc.refundedAmount ?? 0))),
      lines: Array.isArray(linesRaw) ? linesRaw.map(normalizeLine) : [],
    };
  }

  function normalizeLine(line, index) {
    const product = line.product || line.item || {};
    const qty = toNumber(line.qty ?? line.quantity ?? line.qtySold ?? 0);
    const rate = toNumber(line.rate ?? line.unitPrice ?? line.price ?? 0);

    return {
      id: line.id || line.lineId || "line-" + index,
      productId: line.productId || product.id || "",
      name: line.productName || line.itemName || line.name || product.name || "Item",
      sku: line.sku || line.productSku || product.sku || product.barcode || "-",
      qty: qty,
      quantity: qty,
      rate: rate,
      unitPrice: rate,
      total: toNumber(line.lineTotal ?? line.total ?? line.amount ?? qty * rate),
    };
  }

  function normalizeReturn(raw) {
    const row = raw || {};
    return {
      ...row,
      id: row.id || row._id || row.returnId || row.salesReturnId,
      returnNo: row.returnNo || row.documentNo || row.number || "RET",
      invoiceNo:
        row.invoiceNo ||
        row.sourceDocumentNo ||
        row.originalInvoiceNo ||
        row.salesDocument?.documentNo ||
        "",
      customerName:
        row.customerName ||
        row.customer?.name ||
        row.salesDocument?.customerName ||
        "",
      totalAmount: toNumber(row.totalAmount ?? row.grandTotal ?? row.amount ?? row.total ?? 0),
      createdAt: row.createdAt || row.returnDate || row.date || "",
    };
  }

  function isInvoice(doc) {
    const raw = String(doc.rawType || doc.typeText || "").toLowerCase();
    const no = String(doc.documentNoText || "").toLowerCase();

    if (raw.includes("quotation") || raw.includes("quote") || raw.includes("delivery")) return false;
    if (no.startsWith("quo") || no.startsWith("dn")) return false;

    return raw.includes("invoice") || raw.includes("sale") || no.startsWith("inv");
  }

  function documentTypeLabel(type) {
    const value = String(type || "").toLowerCase();

    if (value.includes("delivery") || value === "dn") return "Delivery Note";
    if (value.includes("quotation") || value.includes("quote") || value.includes("quo")) return "Quotation";
    if (value.includes("invoice") || value.includes("sale")) return "Sales Invoice";

    return type ? titleCase(String(type).replaceAll("_", " ")) : "Sales Document";
  }

  function infoBox(label, value) {
    return `
      <div class="axtor-return-info-box">
        <div class="axtor-return-info-label">${escapeHtml(label)}</div>
        <div class="axtor-return-info-value">${escapeHtml(value || "-")}</div>
      </div>
    `;
  }


  function returnStatusLabel(status) {
    const value = String(status || "not_returned").toLowerCase();

    if (value.includes("fully")) return "Fully Returned";
    if (value.includes("partial")) return "Partially Returned";
    if (value.includes("returned") && !value.includes("not")) return "Returned";

    return "Not Returned";
  }

  function isFullyReturned(doc) {
    const status = String(doc?.returnStatus || "").toLowerCase();
    return status.includes("fully");
  }

  function returnBadge(doc) {
    const status = String(doc?.returnStatus || "").toLowerCase();
    const amount = toNumber(doc?.returnedAmount || 0);
    const count = toNumber(doc?.returnCount || 0);

    if ((!status || status === "not_returned") && amount <= 0 && count <= 0) {
      return "";
    }

    let cls = "axtor-return-status-badge warning";
    let label = doc.returnStatusText || "Returned";

    if (status.includes("fully")) {
      cls = "axtor-return-status-badge danger";
      label = "Fully Returned";
    } else if (status.includes("partial")) {
      cls = "axtor-return-status-badge warning";
      label = "Partially Returned";
    }

    return `
      <div class="mt-1">
        <span class="${cls}">
          ${escapeHtml(label)} · ${money(amount)} · ${escapeHtml(count)} return(s)
        </span>
      </div>
    `;
  }

  function statusBadge(status) {
    const text = String(status || "-");
    const lower = text.toLowerCase();
    let cls = "axtor-return-status-badge";

    if (lower.includes("paid") || lower.includes("posted") || lower.includes("complete")) {
      cls += " success";
    } else if (lower.includes("partial")) {
      cls += " warning";
    } else {
      cls += " muted";
    }

    return `<span class="${cls}">${escapeHtml(titleCase(text))}</span>`;
  }


  function refundStatusLabel(status) {
    const value=String(status||"not_refunded").toLowerCase();
    if(value.includes("fully")) return "Fully Refunded";
    if(value.includes("partial")) return "Partially Refunded";
    return "Not Refunded";
  }

  function ensureRefundModal() {
    if(document.getElementById("axtorRefundModal")) return;
    const wrap=document.createElement("div");
    wrap.innerHTML=`<div class="modal fade" id="axtorRefundModal" tabindex="-1"><div class="modal-dialog"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">Refund Customer</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body"><div id="axtorRefundInvoiceInfo" class="alert alert-light"></div><label class="form-label">Refund amount</label><input id="axtorRefundAmount" type="number" min="0.01" step="0.01" class="form-control"><label class="form-label mt-2">Refund method</label><select id="axtorRefundMethod" class="form-select"><option>Cash</option><option>Card reversal</option><option>Bank transfer</option><option>Store credit</option><option>Wallet</option></select><label class="form-label mt-2">Reference number</label><input id="axtorRefundReference" class="form-control"><label class="form-label mt-2">Notes</label><textarea id="axtorRefundNotes" class="form-control" rows="2"></textarea></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button><button type="button" class="btn btn-warning" data-refund-submit>Post Refund</button></div></div></div></div>`;
    document.body.appendChild(wrap.firstElementChild);
  }

  function openRefundModal(id) {
    const doc=state.invoices.find(x=>String(x.id)===String(id));
    if(!doc) return showToast("Invoice not found","Refresh and try again.","danger");
    const max=roundMoney(Math.max(0,Math.min(toNumber(doc.returnedAmount),toNumber(doc.paidAmount))-toNumber(doc.refundedAmount)));
    if(max<=0) return showToast("Nothing to refund","No refundable balance remains.","warning");
    state.refundInvoice=doc; ensureRefundModal();
    document.getElementById("axtorRefundInvoiceInfo").innerHTML=`<strong>${escapeHtml(doc.documentNoText)}</strong><br>Returned: ${money(doc.returnedAmount)} · Paid: ${money(doc.paidAmount)} · Already refunded: ${money(doc.refundedAmount)} · <strong>Maximum: ${money(max)}</strong>`;
    document.getElementById("axtorRefundAmount").value=max.toFixed(2);
    document.getElementById("axtorRefundAmount").max=max.toFixed(2);
    document.getElementById("axtorRefundReference").value=""; document.getElementById("axtorRefundNotes").value="";
    bootstrap.Modal.getOrCreateInstance(document.getElementById("axtorRefundModal")).show();
  }

  async function postCustomerRefund() {
    if(state.refundPosting||!state.refundInvoice) return;
    const doc=state.refundInvoice; const amount=roundMoney(toNumber(document.getElementById("axtorRefundAmount")?.value));
    const max=roundMoney(Math.max(0,Math.min(toNumber(doc.returnedAmount),toNumber(doc.paidAmount))-toNumber(doc.refundedAmount)));
    if(amount<=0||amount>max) return showToast("Invalid refund",`Amount must be between QAR 0.01 and ${money(max)}.`,"danger");
    state.refundPosting=true; const btn=document.querySelector("[data-refund-submit]"); if(btn){btn.disabled=true;btn.textContent="Posting...";}
    try {
      const payload={salesDocumentId:doc.id,amount,refundMethod:document.getElementById("axtorRefundMethod")?.value,referenceNo:document.getElementById("axtorRefundReference")?.value,notes:document.getElementById("axtorRefundNotes")?.value,refundDate:new Date().toISOString(),idempotencyKey:`refund-${doc.id}-${amount}-${Date.now()}`};
      await backendPost("/api/v1/refunds",payload);
      bootstrap.Modal.getInstance(document.getElementById("axtorRefundModal"))?.hide();
      showToast("Refund posted",`${money(amount)} returned to customer via ${payload.refundMethod}.`,"success");
      state.refundInvoice=null; await loadBackendInvoices(true); await loadReturnHistory();
      if(window.AxtorSalesBackend&&typeof window.AxtorSalesBackend.loadBackendDocuments==="function") window.AxtorSalesBackend.loadBackendDocuments();
    } catch(err){ showToast("Refund failed",err.message||"Unable to post refund.","danger"); }
    finally {state.refundPosting=false;if(btn){btn.disabled=false;btn.textContent="Post Refund";}}
  }

  function ensureToastContainer() {
    if (document.getElementById("axtorReturnsToastContainer")) return;

    const box = document.createElement("div");
    box.id = "axtorReturnsToastContainer";
    box.className = "toast-container position-fixed top-0 end-0 p-3";
    box.style.zIndex = "1080";
    document.body.appendChild(box);
  }

  function showToast(title, message, type) {
    ensureToastContainer();

    const container = document.getElementById("axtorReturnsToastContainer");
    if (!container) return;

    const safeType = type || "info";
    const toast = document.createElement("div");
    toast.className = "toast axtor-return-toast axtor-return-toast-" + safeType;
    toast.setAttribute("role", "alert");
    toast.setAttribute("aria-live", "assertive");
    toast.setAttribute("aria-atomic", "true");

    toast.innerHTML = `
      <div class="toast-header">
        <strong class="me-auto">${escapeHtml(title || "Axtor POS")}</strong>
        <small>${escapeHtml(new Date().toLocaleTimeString("en-QA", { hour: "2-digit", minute: "2-digit" }))}</small>
        <button type="button" class="btn-close ms-2 mb-1" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
      <div class="toast-body">${escapeHtml(message || "")}</div>
    `;

    container.appendChild(toast);

    if (window.bootstrap && window.bootstrap.Toast) {
      const instance = window.bootstrap.Toast.getOrCreateInstance(toast, {
        autohide: true,
        delay: safeType === "danger" ? 6500 : 3500,
      });
      instance.show();
      toast.addEventListener("hidden.bs.toast", function () {
        toast.remove();
      });
      return;
    }

    toast.style.display = "block";
    setTimeout(function () {
      toast.remove();
    }, safeType === "danger" ? 6500 : 3500);
  }

  function ensureStyles() {
    if (document.getElementById("axtorReturnsBackendStyles")) return;

    const style = document.createElement("style");
    style.id = "axtorReturnsBackendStyles";
    style.textContent = `
      #axtorReturnsBackendPanel,
      .axtor-return-preview-card {
        border: 1px solid rgba(25, 135, 84, 0.24);
        background: rgba(255, 255, 255, 0.74);
        backdrop-filter: blur(10px);
      }

      #axtorReturnsBackendPanel .card-header,
      .axtor-return-preview-card .card-header {
        background: rgba(25, 135, 84, 0.08);
        border-bottom: 1px solid rgba(25, 135, 84, 0.16);
      }

      .axtor-return-selected-row {
        background: rgba(25, 135, 84, 0.08) !important;
      }

      .axtor-return-doc-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.75rem;
      }

      .axtor-return-info-box {
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 0.85rem;
        padding: 0.75rem;
        background: rgba(255, 255, 255, 0.72);
      }

      .axtor-return-info-label {
        font-size: 0.76rem;
        color: #6c757d;
        margin-bottom: 0.18rem;
      }

      .axtor-return-info-value {
        font-weight: 800;
      }

      .axtor-return-status-badge {
        display: inline-flex;
        border-radius: 999px;
        padding: 0.18rem 0.55rem;
        font-size: 0.78rem;
        font-weight: 700;
      }

      .axtor-return-status-badge.success {
        color: #146c43;
        background: rgba(25, 135, 84, 0.12);
      }

      .axtor-return-status-badge.warning {
        color: #7a5b00;
        background: rgba(255, 193, 7, 0.2);
      }

      .axtor-return-status-badge.danger {
        color: #842029;
        background: rgba(220, 53, 69, 0.14);
      }

      .axtor-return-status-badge.muted {
        color: #495057;
        background: rgba(108, 117, 125, 0.12);
      }

      .axtor-return-toast-success .toast-header {
        background: rgba(25, 135, 84, 0.12);
      }

      .axtor-return-toast-danger .toast-header {
        background: rgba(220, 53, 69, 0.12);
      }

      .axtor-return-toast-warning .toast-header {
        background: rgba(255, 193, 7, 0.18);
      }

      .axtor-return-toast-info .toast-header {
        background: rgba(13, 202, 240, 0.12);
      }

      body.retro-theme #axtorReturnsBackendPanel,
      body.retro-theme .axtor-return-preview-card,
      body.retro #axtorReturnsBackendPanel,
      body.retro .axtor-return-preview-card {
        backdrop-filter: none;
      }

      @media (max-width: 768px) {
        .axtor-return-doc-grid {
          grid-template-columns: 1fr;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function inlineSpinner(text) {
    return (
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>' +
      escapeHtml(text || "Loading...")
    );
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function roundMoney(value) {
    return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
  }

  function money(value) {
    return "QAR " + toNumber(value).toFixed(2);
  }

  function formatQty(value) {
    const number = toNumber(value);
    return Number.isInteger(number) ? String(number) : number.toFixed(2);
  }

  function formatDate(value) {
    if (!value) return "-";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleDateString("en-QA", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  }

  function titleCase(value) {
    return String(value || "")
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\w\S*/g, function (txt) {
        return txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase();
      });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replaceAll("`", "&#096;");
  }
})();
