/**
 * Axtor POS Cloud
 * Phase 4 — Receive Payment Backend Integration
 * Phase 4B — Real Backend Payment Posting
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
    documents: [],
    invoices: [],
    selected: new Map(),
    searchText: "",
    loading: false,
    saving: false,
    lastReceiptNo: "",
    lastPaymentId: "",
  };

  window.AxtorReceivePaymentBackend = {
    exists: true,
    version: "20260626-phase4b-receive-payment-posting-full",
    init,
    refresh: loadBackendInvoices,
    loadBackendInvoices,
    saveBackendPayment,
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
    prepareReceivePaymentUI();
    bindEvents();
    loadBackendInvoices();

    console.log("AxtorReceivePaymentBackend loaded:", window.AxtorReceivePaymentBackend.version);
  }

  function bindEvents() {
    document.addEventListener("input", function (e) {
      if (e.target && e.target.id === "customerPaymentSearch") {
        state.searchText = e.target.value || "";
        renderInvoices();
        return;
      }

      if (e.target && e.target.id === "customerReceivedTotal") {
        updateSummary();
        return;
      }

      if (e.target && e.target.matches("[data-rp-receive-now]")) {
        const id = e.target.getAttribute("data-rp-receive-now");
        setReceiveAmount(id, e.target.value);
        return;
      }
    });

    document.addEventListener("change", function (e) {
      if (e.target && e.target.matches("[data-rp-select]")) {
        const id = e.target.getAttribute("data-rp-select");
        if (e.target.checked) selectInvoice(id);
        else unselectInvoice(id);
        return;
      }

      if (e.target && e.target.id === "customerPaymentCustomer") {
        state.searchText = e.target.value === "__all__" ? "" : e.target.value || "";
        const search = document.getElementById("customerPaymentSearch");
        if (search) search.value = state.searchText;
        renderInvoices();
        return;
      }
    });

    document.addEventListener("click", function (e) {
      const clearBtn = e.target.closest("#clearCustomerPaymentSearch");
      if (clearBtn) {
        e.preventDefault();
        clearSearch();
        return;
      }

      const refreshBtn = e.target.closest("[data-rp-refresh]");
      if (refreshBtn) {
        e.preventDefault();
        loadBackendInvoices(true);
        return;
      }

      const autoBtn = e.target.closest("#customerAutoAllocateBtn");
      if (autoBtn) {
        e.preventDefault();
        autoAllocateOldestFirst();
        return;
      }

      const saveBtn = e.target.closest("#saveCustomerPaymentBtn");
      if (saveBtn) {
        e.preventDefault();
        saveBackendPayment();
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
    prepareReceivePaymentUI();

    const tbody = document.getElementById("customerPaymentInvoicesBody");
    const status = document.getElementById("axtorReceivePaymentStatus");

    state.loading = true;

    if (status) {
      status.className = "small text-muted";
      status.innerHTML = inlineSpinner("Loading backend invoices...");
    }

    if (tbody) {
      tbody.innerHTML =
        '<tr><td colspan="7" class="text-center py-4 text-muted">' +
        inlineSpinner("Loading backend open invoices...") +
        "</td></tr>";
    }

    try {
      const response = await backendGet("/api/v1/sales-documents");
      const docs = normalizeList(response);

      state.documents = docs;
      state.invoices = docs
        .filter(function (doc) {
          return isInvoice(doc);
        })
        .map(function (doc) {
          return {
            ...doc,
            balance: Math.max(0, toNumber(doc.amount) - toNumber(doc.paidAmount)),
          };
        })
       .filter(function (doc) {
  const status = String(
    doc.statusText ||
    doc.status ||
    doc.paymentStatus ||
    doc.documentStatus ||
    ""
  ).toLowerCase();

  if (status === "paid") {
    return false;
  }

  return doc.balance > 0.0001;
})
        .sort(function (a, b) {
          return new Date(a.rawDate || 0).getTime() - new Date(b.rawDate || 0).getTime();
        });

      removeSelectionsNotInList();
      populateCustomerFilter();
      renderInvoices();
      updateSummary();

      if (status) {
        status.className = "small text-success";
        status.innerHTML = "Backend open invoices loaded: <strong>" + state.invoices.length + "</strong>";
      }

      if (manual) {
        showToast("Invoices refreshed", state.invoices.length + " open invoice(s) loaded.", "success");
      }
    } catch (err) {
      console.error("Receive Payment backend load failed:", err);

      if (status) {
        status.className = "small text-danger";
        status.textContent = err.message || "Failed to load backend invoices";
      }

      if (tbody) {
        tbody.innerHTML =
          '<tr><td colspan="7" class="text-center py-4 text-danger">Failed to load backend invoices.</td></tr>';
      }

      showToast("Backend invoices failed", err.message || "Unable to load invoices.", "danger");
    } finally {
      state.loading = false;
    }
  }

  function renderInvoices() {
    const tbody = document.getElementById("customerPaymentInvoicesBody");
    if (!tbody) return;

    const search = String(state.searchText || "").toLowerCase().trim();

    const rows = state.invoices.filter(function (doc) {
      if (!search) return true;
      return [
        doc.documentNoText,
        doc.customerText,
        doc.dateText,
        doc.dueDateText,
        doc.lpoText,
        doc.poText,
        doc.statusText,
        doc.amount,
        doc.paidAmount,
        doc.balance,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });

    const count = document.getElementById("axtorReceivePaymentCount");
    if (count) count.textContent = rows.length + " shown";

    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="7" class="text-center py-4 text-muted">No open backend invoices found.</td></tr>';
      return;
    }

    tbody.innerHTML = rows
      .map(function (doc) {
        const selected = state.selected.has(String(doc.id));
        const allocated = selected ? state.selected.get(String(doc.id)).amount : 0;

        return `
          <tr data-rp-invoice-row="${escapeAttr(doc.id)}" class="${selected ? "axtor-rp-selected-row" : ""}">
            <td class="text-center">
              <input class="form-check-input" type="checkbox" data-rp-select="${escapeAttr(doc.id)}" ${selected ? "checked" : ""}>
            </td>
            <td>
              <strong>${escapeHtml(doc.documentNoText)}</strong>
              <div class="small text-muted">${escapeHtml(doc.customerText)}</div>
              <div class="small text-muted">LPO: ${escapeHtml(doc.lpoText || "-")} | PO: ${escapeHtml(doc.poText || "-")}</div>
            </td>
            <td>${escapeHtml(doc.dueDateText || doc.dateText)}</td>
            <td class="text-end"><strong>${money(doc.amount)}</strong></td>
            <td class="text-end">${money(doc.paidAmount)}</td>
            <td class="text-end"><strong>${money(doc.balance)}</strong></td>
            <td>
              <input class="form-control form-control-sm text-end" type="number" min="0" step="0.01" max="${escapeAttr(doc.balance)}" value="${selected ? toNumber(allocated).toFixed(2) : "0.00"}" data-rp-receive-now="${escapeAttr(doc.id)}" ${state.saving ? "disabled" : ""}>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function selectInvoice(id) {
    const doc = findInvoice(id);
    if (!doc) return;

    const currentInput = document.querySelector('[data-rp-receive-now="' + cssEscape(id) + '"]');
    const inputAmount = currentInput ? toNumber(currentInput.value) : 0;
    const amount = inputAmount > 0 ? Math.min(inputAmount, doc.balance) : doc.balance;

    state.selected.set(String(id), {
      id: doc.id,
      customerId: doc.customerId || "",
      salesDocumentId: doc.id,
      documentNo: doc.documentNoText,
      customerName: doc.customerText,
      balance: doc.balance,
      amount: amount,
    });

    renderInvoices();
    updateSummary();
  }

  function unselectInvoice(id) {
    state.selected.delete(String(id));
    renderInvoices();
    updateSummary();
  }

  function setReceiveAmount(id, value) {
    const doc = findInvoice(id);
    if (!doc) return;

    const amount = Math.max(0, Math.min(toNumber(value), doc.balance));

    if (amount > 0) {
      state.selected.set(String(id), {
        id: doc.id,
        customerId: doc.customerId || "",
        salesDocumentId: doc.id,
        documentNo: doc.documentNoText,
        customerName: doc.customerText,
        balance: doc.balance,
        amount: amount,
      });
    } else {
      state.selected.delete(String(id));
    }

    updateSummary();
  }

  function autoAllocateOldestFirst() {
    const totalInput = document.getElementById("customerReceivedTotal");
    let remaining = toNumber(totalInput?.value || 0);

    if (remaining <= 0) {
      showToast("Enter amount", "Add Total Received before auto allocation.", "warning");
      return;
    }

    state.selected.clear();

    state.invoices.forEach(function (doc) {
      if (remaining <= 0) return;

      const amount = Math.min(doc.balance, remaining);
      if (amount > 0) {
        state.selected.set(String(doc.id), {
          id: doc.id,
          customerId: doc.customerId || "",
          salesDocumentId: doc.id,
          documentNo: doc.documentNoText,
          customerName: doc.customerText,
          balance: doc.balance,
          amount: amount,
        });
        remaining -= amount;
      }
    });

    renderInvoices();
    updateSummary();
    showToast("Auto allocation ready", "Oldest backend invoices selected.", "success");
  }

  async function saveBackendPayment() {
    if (state.saving) {
      showToast("Please wait", "Payment is already being saved.", "warning");
      return;
    }

    const selectedRows = Array.from(state.selected.values()).filter(function (row) {
      return toNumber(row.amount) > 0;
    });

    if (!selectedRows.length) {
      showToast("No invoice selected", "Select at least one invoice and enter payment amount.", "warning");
      return;
    }

    const totalAllocated = selectedRows.reduce(function (sum, row) {
      return sum + toNumber(row.amount);
    }, 0);

    const totalReceivedInput = document.getElementById("customerReceivedTotal");
    const totalReceived = toNumber(totalReceivedInput?.value || 0);

    if (totalReceived <= 0) {
      showToast("Enter received amount", "Total Received must be greater than zero.", "warning");
      return;
    }

    if (totalAllocated <= 0) {
      showToast("Invalid allocation", "Allocated payment amount must be greater than zero.", "warning");
      return;
    }

    if (totalAllocated - totalReceived > 0.01) {
      showToast("Allocation exceeds received", "Allocated amount cannot be more than Total Received.", "danger");
      return;
    }

    const paymentDate =
      document.getElementById("customerPaymentDate")?.value || new Date().toISOString().slice(0, 10);

    const paymentMethod =
      document.getElementById("customerPaymentMethod")?.value ||
      document.getElementById("paymentMethod")?.value ||
      "cash";

    const depositAccount =
      document.getElementById("customerDepositAccount")?.value ||
      document.getElementById("depositAccount")?.value ||
      "cash";

    const referenceNo =
      document.getElementById("customerPaymentRef")?.value ||
      document.getElementById("customerReferenceNo")?.value ||
      "";

    const notes =
      document.getElementById("customerPaymentNotes")?.value ||
      document.getElementById("customerNotes")?.value ||
      "";

    const ok = confirm(
      "Save backend payment now?\n\nInvoices: " +
        selectedRows.length +
        "\nAllocated: " +
        money(totalAllocated)
    );

    if (!ok) return;

    state.saving = true;
    setSaveButtonLoading(true);
    showToast("Saving payment", "Posting payment to backend...", "info");

    try {
      const results = [];

      for (const row of selectedRows) {
        const payload = {
          customerId: row.customerId || null,
          salesDocumentId: row.salesDocumentId || row.id,
          paymentDate: paymentDate,
          amount: toNumber(row.amount),
          paymentMethod: paymentMethod,
          depositAccount: depositAccount,
          referenceNo: referenceNo || null,
          notes: notes || null,
        };

        console.log("Axtor Phase 4B payment payload:", payload);
        const response = await backendPost("/api/v1/payments", payload);
        results.push(unwrapData(response) || response);
      }

      const last = results[results.length - 1] || {};
      state.lastPaymentId = last.id || last.paymentId || "";
      state.lastReceiptNo =
        last.receiptNo ||
        last.receiptNumber ||
        last.data?.receiptNo ||
        last.payment?.receiptNo ||
        "";

      showToast(
        "Payment saved",
        (state.lastReceiptNo ? "Receipt: " + state.lastReceiptNo + ". " : "") +
          "Backend invoice balance updated.",
        "success"
      );

      clearPaymentAfterSave();

      await loadBackendInvoices(false);

      refreshSalesBackendIfAvailable();
      renderPaymentHistory(results);
    } catch (err) {
      console.error("Backend payment save failed:", err);
      showToast("Payment save failed", err.message || "Unable to save payment.", "danger");
    } finally {
      state.saving = false;
      setSaveButtonLoading(false);
      updateSummary();
    }
  }

  function setSaveButtonLoading(active) {
    const saveBtn = document.getElementById("saveCustomerPaymentBtn");
    if (!saveBtn) return;

    saveBtn.disabled = !!active;

    if (active) {
      saveBtn.setAttribute("data-original-html", saveBtn.innerHTML);
      saveBtn.innerHTML =
        '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Saving Payment...';
    } else {
      saveBtn.innerHTML =
        saveBtn.getAttribute("data-original-html") ||
        '<i class="bi bi-check2-circle"></i> Save Payment & Receipt';
      saveBtn.removeAttribute("data-original-html");
    }
  }

  function clearPaymentAfterSave() {
    state.selected.clear();

    const totalInput = document.getElementById("customerReceivedTotal");
    if (totalInput) totalInput.value = "0.00";

    const ref = document.getElementById("customerPaymentRef") || document.getElementById("customerReferenceNo");
    if (ref) ref.value = "";

    const notes = document.getElementById("customerPaymentNotes") || document.getElementById("customerNotes");
    if (notes) notes.value = "";
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

  function renderPaymentHistory(results) {
    const body = document.getElementById("customerPaymentHistoryBody");
    if (!body) return;

    const rows = Array.isArray(results) ? results : [];

    if (!rows.length) {
      body.innerHTML =
        '<tr><td colspan="5" class="text-center py-4 text-muted">No backend payment result returned.</td></tr>';
      return;
    }

    body.innerHTML = rows
      .map(function (payment) {
        const p = payment.payment || payment;
        const invoice =
          payment.invoice ||
          payment.salesDocument ||
          payment.updatedInvoice ||
          payment.document ||
          {};

        return `
          <tr>
            <td>${escapeHtml(formatDate(p.paymentDate || new Date()))}</td>
            <td><strong>${escapeHtml(p.receiptNo || p.receiptNumber || state.lastReceiptNo || "-")}</strong></td>
            <td>${escapeHtml(invoice.documentNo || invoice.documentNoText || p.salesDocumentId || "-")}</td>
            <td class="text-end"><strong>${money(p.amount)}</strong></td>
            <td>${escapeHtml(p.paymentMethod || "-")}</td>
          </tr>
        `;
      })
      .join("");
  }

  function updateSummary() {
    const customerBalance = state.invoices.reduce(function (sum, doc) {
      return sum + toNumber(doc.balance);
    }, 0);

    const allocated = Array.from(state.selected.values()).reduce(function (sum, row) {
      return sum + toNumber(row.amount);
    }, 0);

    const totalReceived = toNumber(document.getElementById("customerReceivedTotal")?.value || 0);
    const unallocated = Math.max(0, totalReceived - allocated);
   const selectedBalance = Array.from(state.selected.values()).reduce(function (sum, row) {
  return sum + toNumber(row.balance);
}, 0);

const balanceAfter = Math.max(0, selectedBalance - allocated);

    setText("customerCurrentBalance", money(customerBalance));
    setText("customerAllocatedTotal", money(allocated));
    setText("customerUnallocated", money(unallocated));
    setText("customerBalanceAfter", money(balanceAfter));

    const saveBtn = document.getElementById("saveCustomerPaymentBtn");
    if (saveBtn && !state.saving) {
      saveBtn.disabled = allocated <= 0 || totalReceived <= 0 || allocated - totalReceived > 0.01;
      saveBtn.title = saveBtn.disabled
        ? "Select invoice and enter valid Total Received."
        : "Save payment to backend.";
      if (!saveBtn.getAttribute("data-original-html")) {
        saveBtn.innerHTML = '<i class="bi bi-check2-circle"></i> Save Payment & Receipt';
      }
    }

    if (!state.lastReceiptNo && !state.lastPaymentId) {
      renderHistoryPlaceholder();
    }
  }

  function renderHistoryPlaceholder() {
    const body = document.getElementById("customerPaymentHistoryBody");
    if (!body) return;

    body.innerHTML =
      '<tr><td colspan="5" class="text-center py-4 text-muted">Backend payment history will appear here after saving a receipt.</td></tr>';
  }

  function clearSearch() {
    state.searchText = "";

    const search = document.getElementById("customerPaymentSearch");
    if (search) search.value = "";

    const customer = document.getElementById("customerPaymentCustomer");
    if (customer) customer.value = "__all__";

    renderInvoices();
  }

  function prepareReceivePaymentUI() {
    const section = document.getElementById("receive-payment");
    if (!section) return;

    const title = section.querySelector(".cardx-title");
    if (title && !document.getElementById("axtorReceivePaymentStatus")) {
      const status = document.createElement("div");
      status.id = "axtorReceivePaymentStatus";
      status.className = "small text-muted";
      status.textContent = "Backend receive payment ready.";
      title.insertAdjacentElement("afterend", status);
    }

    const search = document.getElementById("customerPaymentSearch");
    if (search) {
      search.placeholder = "Search invoice no, customer, LPO, PO, amount, date...";
    }

    const table = document.getElementById("customerPaymentInvoicesBody")?.closest("table");
    if (table) {
      const head = table.querySelector("thead tr");
      if (head) {
        head.innerHTML =
          "<th>Select</th><th>Invoice / Customer</th><th>Due Date</th><th class='text-end'>Total</th><th class='text-end'>Paid</th><th class='text-end'>Balance</th><th>Receive Now</th>";
      }
    }

    const wrap = document.getElementById("customerPaymentInvoicesBody")?.closest(".table-wrap");
    if (wrap && !document.getElementById("axtorReceivePaymentToolbar")) {
      const toolbar = document.createElement("div");
      toolbar.id = "axtorReceivePaymentToolbar";
      toolbar.className = "d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2";
      toolbar.innerHTML = `
        <div class="small text-muted">Phase 4B: Real backend open invoices + payment posting.</div>
        <div class="d-flex flex-wrap align-items-center gap-2">
          <span id="axtorReceivePaymentCount" class="badge text-bg-light">0 shown</span>
          <button type="button" class="btn btn-sm btn-outline-success" data-rp-refresh="1">Refresh Backend Invoices</button>
        </div>
      `;
      wrap.insertAdjacentElement("beforebegin", toolbar);
    }

    const saveBtn = document.getElementById("saveCustomerPaymentBtn");
    if (saveBtn && !state.saving) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="bi bi-check2-circle"></i> Save Payment & Receipt';
      saveBtn.title = "Select invoice and enter valid Total Received.";
    }

    const date = document.getElementById("customerPaymentDate");
    if (date && !date.value) date.value = new Date().toISOString().slice(0, 10);
  }

  function populateCustomerFilter() {
    const select = document.getElementById("customerPaymentCustomer");
    if (!select) return;

    const current = select.value || "__all__";
    const names = Array.from(
      new Set(
        state.invoices
          .map(function (doc) {
            return doc.customerText || "Walk-in / Unknown";
          })
          .filter(Boolean)
      )
    ).sort();

    select.innerHTML =
      '<option value="__all__">All backend customers</option>' +
      names
        .map(function (name) {
          return '<option value="' + escapeAttr(name) + '">' + escapeHtml(name) + "</option>";
        })
        .join("");

    if (names.includes(current)) select.value = current;
    else select.value = "__all__";
  }

  function removeSelectionsNotInList() {
    const ids = new Set(
      state.invoices.map(function (doc) {
        return String(doc.id);
      })
    );

    Array.from(state.selected.keys()).forEach(function (id) {
      if (!ids.has(String(id))) state.selected.delete(String(id));
    });
  }

  function findInvoice(id) {
    return state.invoices.find(function (doc) {
      return String(doc.id) === String(id);
    });
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

    const amount = toNumber(
      doc.grandTotal ?? doc.totalAmount ?? doc.netAmount ?? doc.amount ?? doc.total ?? 0
    );

    const paidAmount = toNumber(
      doc.paidAmount ?? doc.amountPaid ?? doc.receivedAmount ?? doc.cashAmount ?? 0
    );

    const lpo = doc.lpoNo || doc.lpo || "";
    const po = doc.customerPoNo || doc.poNo || "";

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
      dueDateText: formatDate(doc.dueDate || doc.paymentDueDate || rawDate),
      lpoText: lpo,
      poText: po,
      amount: amount,
      paidAmount: paidAmount,
      statusText:
        doc.status || doc.paymentStatus || doc.documentStatus || (doc.isPosted ? "posted" : "draft"),
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

  function ensureToastContainer() {
    if (document.getElementById("axtorReceiveToastContainer")) return;

    const box = document.createElement("div");
    box.id = "axtorReceiveToastContainer";
    box.className = "toast-container position-fixed top-0 end-0 p-3";
    box.style.zIndex = "1080";
    document.body.appendChild(box);
  }

  function showToast(title, message, type) {
    ensureToastContainer();

    const container = document.getElementById("axtorReceiveToastContainer");
    if (!container) return;

    const safeType = type || "info";
    const toast = document.createElement("div");
    toast.className = "toast axtor-rp-toast axtor-rp-toast-" + safeType;
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
    if (document.getElementById("axtorReceivePaymentBackendStyles")) return;

    const style = document.createElement("style");
    style.id = "axtorReceivePaymentBackendStyles";
    style.textContent = `
      #receive-payment .cardx {
        border-color: rgba(25, 135, 84, 0.18);
      }

      .axtor-rp-selected-row {
        background: rgba(25, 135, 84, 0.08) !important;
      }

      .axtor-rp-toast-success .toast-header {
        background: rgba(25, 135, 84, 0.12);
      }

      .axtor-rp-toast-danger .toast-header {
        background: rgba(220, 53, 69, 0.12);
      }

      .axtor-rp-toast-warning .toast-header {
        background: rgba(255, 193, 7, 0.18);
      }

      .axtor-rp-toast-info .toast-header {
        background: rgba(13, 202, 240, 0.12);
      }

      body.retro-theme #receive-payment .cardx,
      body.retro #receive-payment .cardx {
        backdrop-filter: none;
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

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(String(value));
    }

    return String(value).replace(/["\\]/g, "\\$&");
  }

  function toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function money(value) {
    return "QAR " + toNumber(value).toFixed(2);
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
