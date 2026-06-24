/**
 * Axtor POS Cloud
 * Phase 3 — Sales Backend Integration
 * Sales Step 2B ProductId Fix
 */

(function () {
  "use strict";

  const API_BASE_URL = "https://axtor-cloud-pos-production.up.railway.app";
  const TOKEN_KEY = "axtorAuthToken";

  const PATCH_DISABLED_MESSAGE =
    "Backend update/save is disabled until PATCH /api/v1/sales-documents/:id is added.";

  const state = {
    initialized: false,
    docs: [],
    cache: new Map(),
    activeEditPreview: null,
    searchText: "",
    creating: false,
  };

  window.AxtorSalesBackend = {
    exists: true,
    version: "20260624-phase3-sales2b-productidfix-full",
    init,
    refresh: loadSavedDocuments,
    loadSavedDocuments,
    viewDocument,
    editPreviewDocument,
    exitEditPreview,
    createBackendDocumentFromPage,
    buildCreatePayloadFromPage,
    buildCreatePayloadFromPageWithProductIds,
    getState: () => state,
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
    ensureModal();
    ensureBackendPanel();
    ensureCreateToolbar();
    bindEvents();
    loadSavedDocuments();

    console.log("AxtorSalesBackend loaded:", window.AxtorSalesBackend.version);
  }

  function bindEvents() {
    document.addEventListener("click", function (e) {
      const viewBtn = e.target.closest("[data-sales-view-id]");
      if (viewBtn) {
        e.preventDefault();
        viewDocument(viewBtn.dataset.salesViewId);
        return;
      }

      const editBtn = e.target.closest("[data-sales-edit-id]");
      if (editBtn) {
        e.preventDefault();
        editPreviewDocument(editBtn.dataset.salesEditId);
        return;
      }

      const refreshBtn = e.target.closest("[data-sales-refresh]");
      if (refreshBtn) {
        e.preventDefault();
        loadSavedDocuments();
        return;
      }

      const createBtn = e.target.closest("[data-sales-create-backend]");
      if (createBtn) {
        e.preventDefault();
        createBackendDocumentFromPage();
        return;
      }

      const previewBtn = e.target.closest("[data-sales-preview-payload]");
      if (previewBtn) {
        e.preventDefault();
        previewCreatePayload();
        return;
      }

      const exitBtn = e.target.closest("[data-exit-edit-preview]");
      if (exitBtn) {
        e.preventDefault();
        exitEditPreview();
      }
    });

    document.addEventListener("input", function (e) {
      if (e.target && e.target.id === "axtorSalesBackendSearch") {
        state.searchText = e.target.value || "";
        renderSavedDocuments();
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
    const token = localStorage.getItem(TOKEN_KEY);

    if (!token) {
      throw new Error("Authentication required. Please login again first.");
    }

    const res = await fetch(API_BASE_URL + path, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      ...(method === "GET" ? {} : { body: JSON.stringify(body || {}) }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(data?.error?.message || data?.message || "Backend request failed");
    }

    return data;
  }

  async function loadSavedDocuments() {
    ensureBackendPanel();

    const tbody = document.getElementById("axtorSalesBackendTbody");
    const status = document.getElementById("axtorSalesBackendStatus");

    if (status) {
      status.className = "small text-muted";
      status.textContent = "Loading backend saved documents...";
    }

    if (tbody) {
      tbody.innerHTML =
        '<tr><td colspan="8" class="text-center py-4 text-muted">Loading...</td></tr>';
    }

    try {
      const response = await backendGet("/api/v1/sales-documents");
      const docs = normalizeList(response);

      state.docs = docs;
      state.cache.clear();

      docs.forEach((doc) => {
        if (doc.id) state.cache.set(String(doc.id), doc);
      });

      renderSavedDocuments();

      if (status) {
        status.className = "small text-success";
        status.innerHTML = "Backend documents loaded: <strong>" + docs.length + "</strong>";
      }
    } catch (err) {
      console.error("Sales backend load error:", err);

      if (status) {
        status.className = "small text-danger";
        status.textContent = err.message || "Failed to load backend saved documents";
      }

      if (tbody) {
        tbody.innerHTML =
          '<tr><td colspan="8" class="text-center py-4 text-danger">Failed to load backend saved documents.</td></tr>';
      }
    }
  }

  function renderSavedDocuments() {
    const tbody = document.getElementById("axtorSalesBackendTbody");
    const count = document.getElementById("axtorSalesBackendCount");
    if (!tbody) return;

    const search = String(state.searchText || "").toLowerCase().trim();

    const docs = state.docs.filter((doc) => {
      if (!search) return true;
      return [
        doc.documentNoText,
        doc.typeText,
        doc.customerText,
        doc.dateText,
        doc.statusText,
        doc.lpoText,
        doc.poText,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });

    if (count) count.textContent = docs.length + " shown";

    if (!docs.length) {
      tbody.innerHTML =
        '<tr><td colspan="8" class="text-center py-4 text-muted">No backend saved documents found.</td></tr>';
      return;
    }

    tbody.innerHTML = docs
      .map(
        (doc) => `
          <tr>
            <td><strong>${escapeHtml(doc.documentNoText)}</strong></td>
            <td>${escapeHtml(doc.typeText)}</td>
            <td>${escapeHtml(doc.customerText)}</td>
            <td>${escapeHtml(doc.dateText)}</td>
            <td class="text-end"><strong>${money(doc.amount)}</strong></td>
            <td class="text-end">${money(doc.paidAmount)}</td>
            <td>${statusBadge(doc.statusText)}</td>
            <td class="text-end text-nowrap">
              <button type="button" class="btn btn-sm btn-outline-primary me-1" data-sales-view-id="${escapeAttr(doc.id)}">View</button>
              <button type="button" class="btn btn-sm btn-outline-warning me-1" data-sales-edit-id="${escapeAttr(doc.id)}">Edit</button>
              <button type="button" class="btn btn-sm btn-outline-secondary" onclick="alert('Print placeholder only')">Print</button>
            </td>
          </tr>
        `
      )
      .join("");
  }

  async function fetchDocumentDetail(id) {
    if (!id) throw new Error("Missing document ID");

    try {
      const response = await backendGet("/api/v1/sales-documents/" + encodeURIComponent(id));
      const doc = normalizeDocument(unwrapData(response));
      if (doc.id) state.cache.set(String(doc.id), doc);
      return doc;
    } catch (err) {
      const cached = state.cache.get(String(id));
      if (cached) return cached;
      throw err;
    }
  }

  async function viewDocument(id) {
    const modal = ensureModal();
    const title = document.getElementById("axtorSalesDocModalTitle");
    const body = document.getElementById("axtorSalesDocModalBody");

    if (title) title.textContent = "Loading document...";
    if (body) {
      body.innerHTML =
        '<div class="text-center py-5 text-muted">Loading backend document details...</div>';
    }

    showModal(modal);

    try {
      const doc = await fetchDocumentDetail(id);

      if (title) title.textContent = doc.documentNoText + " — " + doc.typeText;

      if (body) {
        body.innerHTML = `
          <div class="axtor-doc-grid mb-3">
            ${infoBox("Document No", doc.documentNoText)}
            ${infoBox("Type", doc.typeText)}
            ${infoBox("Customer", doc.customerText)}
            ${infoBox("Date", doc.dateText)}
            ${infoBox("LPO No", doc.lpoText || "-")}
            ${infoBox("PO / Customer PO", doc.poText || "-")}
            ${infoBox("Amount", money(doc.amount))}
            ${infoBox("Paid Amount", money(doc.paidAmount))}
            ${infoBox("Status", doc.statusText || "-")}
          </div>

          <div class="table-responsive">
            <table class="table table-sm table-hover align-middle">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Item</th>
                  <th>SKU</th>
                  <th class="text-end">Qty</th>
                  <th class="text-end">Rate</th>
                  <th class="text-end">Total</th>
                </tr>
              </thead>
              <tbody>${renderLines(doc.lines)}</tbody>
            </table>
          </div>

          <div class="alert alert-warning mb-0">
            <strong>Edit Preview Only:</strong> ${escapeHtml(PATCH_DISABLED_MESSAGE)}
          </div>
        `;
      }
    } catch (err) {
      if (title) title.textContent = "Document load failed";
      if (body) {
        body.innerHTML =
          '<div class="alert alert-danger mb-0">' +
          escapeHtml(err.message || "Unable to load document") +
          "</div>";
      }
    }
  }

  async function editPreviewDocument(id) {
    try {
      const doc = await fetchDocumentDetail(id);
      state.activeEditPreview = doc;
      switchToNewSale();
      showEditPreview(doc);
      disableSaveButtons();
    } catch (err) {
      alert("Unable to open Edit Preview: " + (err.message || "Unknown error"));
    }
  }

  function showEditPreview(doc) {
    const root = findNewSaleRoot() || document.querySelector("main") || document.body;

    let banner = document.getElementById("axtorEditPreviewBanner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "axtorEditPreviewBanner";
      banner.className = "alert alert-warning axtor-edit-preview-banner";
      root.prepend(banner);
    }

    banner.innerHTML = `
      <div class="d-flex flex-wrap justify-content-between align-items-start gap-2">
        <div>
          <div class="fw-bold">Edit Preview Only — ${escapeHtml(doc.documentNoText)}</div>
          <div class="small">${escapeHtml(PATCH_DISABLED_MESSAGE)}</div>
        </div>
        <button type="button" class="btn btn-sm btn-outline-dark" data-exit-edit-preview="1">Exit Preview</button>
      </div>
    `;

    let panel = document.getElementById("axtorEditPreviewPanel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "axtorEditPreviewPanel";
      panel.className = "card mb-3 axtor-edit-preview-panel";
      banner.insertAdjacentElement("afterend", panel);
    }

    panel.innerHTML = `
      <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
        <strong>Loaded from Backend: ${escapeHtml(doc.documentNoText)} / ${escapeHtml(doc.typeText)}</strong>
        <span class="badge text-bg-warning">Read-only preview</span>
      </div>
      <div class="card-body">
        <div class="axtor-doc-grid mb-3">
          ${infoBox("Document No", doc.documentNoText)}
          ${infoBox("Type", doc.typeText)}
          ${infoBox("Customer", doc.customerText)}
          ${infoBox("Date", doc.dateText)}
          ${infoBox("LPO No", doc.lpoText || "-")}
          ${infoBox("Amount", money(doc.amount))}
          ${infoBox("Paid Amount", money(doc.paidAmount))}
          ${infoBox("Status", doc.statusText || "-")}
        </div>
        <div class="table-responsive">
          <table class="table table-sm table-hover align-middle mb-0">
            <thead>
              <tr>
                <th>#</th>
                <th>Item</th>
                <th>SKU</th>
                <th class="text-end">Qty</th>
                <th class="text-end">Rate</th>
                <th class="text-end">Total</th>
              </tr>
            </thead>
            <tbody>${renderLines(doc.lines)}</tbody>
          </table>
        </div>
      </div>
    `;

    setTimeout(() => {
      banner.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }

  async function createBackendDocumentFromPage() {
    if (state.creating) return;

    if (state.activeEditPreview) {
      alert(PATCH_DISABLED_MESSAGE);
      return;
    }

    state.creating = true;
    setCreateStatus("Checking products and creating backend document...", "muted");
    setCreateButtonsDisabled(true);

    try {
      const payload = await buildCreatePayloadFromPageWithProductIds();

      if (!payload.items.length) {
        throw new Error("No sale line items found. Add at least one item first.");
      }

      const ok = confirm(
        "Create backend " +
          documentTypeLabel(payload.documentType) +
          " now?\n\nItems: " +
          payload.items.length +
          "\nTotal: QAR " +
          toNumber(payload.grandTotal).toFixed(2)
      );

      if (!ok) return;

      console.log("Axtor create payload:", payload);

      const response = await backendPost("/api/v1/sales-documents", payload);
      const created = normalizeDocument(unwrapData(response));

      setCreateStatus(
        "Created successfully: " + escapeHtml(created.documentNoText || "Backend document"),
        "success"
      );

      alert("Backend document created successfully: " + (created.documentNoText || "New document"));

      await loadSavedDocuments();
      switchToSavedInvoices();
    } catch (err) {
      console.error("Create backend sales document failed:", err);
      setCreateStatus(err.message || "Create failed", "danger");

      alert(
        "Backend create failed:\n\n" +
          (err.message || "Unknown error") +
          "\n\nCheck console payload with:\nAxtorSalesBackend.buildCreatePayloadFromPageWithProductIds()"
      );
    } finally {
      state.creating = false;
      setCreateButtonsDisabled(false);
    }
  }

  function buildCreatePayloadFromPage() {
    const root = findNewSaleRoot() || document;

    const documentTypeRaw = readFieldValue(root, [
      "#documentType",
      "#salesDocumentType",
      "#saleDocumentType",
      "#newSaleDocumentType",
      '[name="documentType"]',
      '[name="salesDocumentType"]',
      '[name="saleDocumentType"]',
    ]);

    const documentType = normalizeDocumentType(documentTypeRaw || "invoice");

    const customerInfo = readCustomerInfo(root);

    const lpoNo = readFieldValue(root, [
      "#lpoNo",
      "#saleLpoNo",
      "#salesLpoNo",
      "#customerPoNo",
      '[name="lpoNo"]',
      '[name="lpo"]',
      '[name="customerPoNo"]',
    ]);

    const documentDate =
      readFieldValue(root, [
        "#saleDate",
        "#documentDate",
        "#invoiceDate",
        '[name="saleDate"]',
        '[name="documentDate"]',
        '[name="invoiceDate"]',
        '[name="date"]',
      ]) || new Date().toISOString().slice(0, 10);

    const paidAmount = readMoneyValue(root, [
      "#paidAmount",
      "#amountPaid",
      "#receivedAmount",
      "#cashAmount",
      "#paymentAmount",
      '[name="paidAmount"]',
      '[name="receivedAmount"]',
      '[name="cashAmount"]',
      '[name="paymentAmount"]',
    ]);

    const paymentMethod =
      readFieldValue(root, ["#paymentMethod", "#salePaymentMethod", '[name="paymentMethod"]']) ||
      "cash";

    const items = collectSaleLines(root);
    const totalAmount = items.reduce((sum, item) => sum + toNumber(item.lineTotal), 0);

    return {
      documentType,
      documentDate,
      customerId: customerInfo.customerId || null,
      customerName: customerInfo.customerName || "Walk-in Customer",
      lpoNo: lpoNo || null,
      customerPoNo: lpoNo || null,
      poNo: lpoNo || null,
      paidAmount: paidAmount || 0,
      paymentMethod,
      totalAmount,
      grandTotal: totalAmount,
      items: items.map((item) => ({
        productId: item.productId || null,
        productName: item.productName || item.name || "Item",
        sku: item.sku || null,
        quantity: item.quantity,
        qty: item.quantity,
        unitPrice: item.unitPrice,
        rate: item.unitPrice,
        price: item.unitPrice,
        lineTotal: item.lineTotal,
        total: item.lineTotal,
      })),
    };
  }

  async function buildCreatePayloadFromPageWithProductIds() {
    const payload = buildCreatePayloadFromPage();

    const productsResponse = await backendGet("/api/v1/products");
    const productsData = unwrapData(productsResponse);

    const products = Array.isArray(productsData)
      ? productsData
      : productsData?.items ||
        productsData?.products ||
        productsData?.rows ||
        productsData?.results ||
        [];

    payload.items = payload.items.map((item) => {
      if (item.productId) return item;

      const itemSku = String(item.sku || "").toLowerCase().trim();
      const itemName = String(item.productName || "").toLowerCase().trim();

      const matched = products.find((p) => {
        const pSku = String(p.sku || "").toLowerCase().trim();
        const pName = String(p.name || p.productName || "").toLowerCase().trim();
        const pBarcode = String(p.barcode || "").toLowerCase().trim();

        return (
          (itemSku && (pSku === itemSku || pBarcode === itemSku)) ||
          (itemName && pName === itemName)
        );
      });

      return {
        ...item,
        productId: matched?.id || null,
      };
    });

    const missing = payload.items.find((item) => !item.productId);

    if (missing) {
      throw new Error(
        "Product ID required. Product not matched from backend: " +
          (missing.productName || missing.sku || "Unknown item")
      );
    }

    return payload;
  }

  function collectSaleLines(root) {
    const rows = Array.from(root.querySelectorAll("tbody tr"));
    const lines = [];

    rows.forEach((row) => {
      if (
        row.closest("#axtorSalesBackendPanel") ||
        row.closest("#axtorEditPreviewPanel") ||
        row.closest("#axtorSalesDocViewModal")
      ) {
        return;
      }

      const rowText = String(row.textContent || "").trim();
      if (!rowText) return;

      const productId =
        row.getAttribute("data-product-id") ||
        row.getAttribute("data-backend-product-id") ||
        readFieldValue(row, [
          '[name="productId"]',
          '[name="backendProductId"]',
          ".product-id",
          ".backend-product-id",
        ]);

      const productName =
        row.getAttribute("data-product-name") ||
        readFieldValue(row, [
          '[name="productName"]',
          '[name="itemName"]',
          ".product-name",
          ".item-name",
          ".name",
        ]) ||
        guessCellText(row, 0);

      const sku =
        row.getAttribute("data-sku") ||
        readFieldValue(row, ['[name="sku"]', ".sku", ".product-sku"]) ||
        guessSku(row);

      const quantity =
        readMoneyValue(row, [
          '[name="quantity"]',
          '[name="qty"]',
          ".quantity",
          ".qty",
          ".item-qty",
        ]) || guessNumberFromCells(row, ["qty", "quantity"], 1) || 1;

      const unitPrice =
        readMoneyValue(row, [
          '[name="unitPrice"]',
          '[name="rate"]',
          '[name="price"]',
          ".unit-price",
          ".rate",
          ".price",
          ".item-price",
        ]) || guessNumberFromCells(row, ["price", "rate"], 2) || 0;

      const lineTotal =
        readMoneyValue(row, [
          '[name="lineTotal"]',
          '[name="total"]',
          ".line-total",
          ".total",
          ".amount",
        ]) || quantity * unitPrice;

      if (!productName && !sku && !productId) return;
      if (!quantity || quantity <= 0) return;

      lines.push({
        productId,
        productName,
        sku,
        quantity: toNumber(quantity),
        unitPrice: toNumber(unitPrice),
        lineTotal: toNumber(lineTotal),
      });
    });

    return lines;
  }

  async function previewCreatePayload() {
    try {
      const payload = await buildCreatePayloadFromPageWithProductIds();
      console.log("Axtor Sales Step 2B payload with productId:", payload);

      alert(
        "Payload preview printed in console.\n\nItems: " +
          payload.items.length +
          "\nDocument type: " +
          payload.documentType +
          "\nTotal: QAR " +
          toNumber(payload.grandTotal).toFixed(2)
      );
    } catch (err) {
      console.error(err);
      alert(err.message || "Payload preview failed");
    }
  }

  function ensureCreateToolbar() {
    const root = findNewSaleRoot() || document.querySelector("main") || document.body;
    if (document.getElementById("axtorSalesCreateToolbar")) return;

    const toolbar = document.createElement("div");
    toolbar.id = "axtorSalesCreateToolbar";
    toolbar.className = "card my-3 axtor-sales-create-toolbar";

    toolbar.innerHTML = `
      <div class="card-body d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div>
          <strong>Backend Create — Sales Step 2B</strong>
          <div id="axtorSalesCreateStatus" class="small text-muted">
            Ready. ProductId auto-match enabled.
          </div>
        </div>

        <div class="d-flex flex-wrap gap-2">
          <button type="button" class="btn btn-sm btn-outline-secondary" data-sales-preview-payload="1">
            Preview Payload
          </button>
          <button type="button" class="btn btn-sm btn-success" data-sales-create-backend="1">
            Create Backend Document
          </button>
        </div>
      </div>
    `;

    root.prepend(toolbar);
  }

  function setCreateStatus(message, type) {
    const status = document.getElementById("axtorSalesCreateStatus");
    if (!status) return;
    status.className = "small text-" + (type || "muted");
    status.innerHTML = message;
  }

  function setCreateButtonsDisabled(disabled) {
    document
      .querySelectorAll("[data-sales-create-backend], [data-sales-preview-payload]")
      .forEach((btn) => {
        btn.disabled = !!disabled;
      });
  }

  function disableSaveButtons() {
    const root = findNewSaleRoot() || document;

    root.querySelectorAll("button, input[type='button'], input[type='submit'], a.btn").forEach((btn) => {
      if (btn.closest("#axtorEditPreviewBanner") || btn.closest("#axtorEditPreviewPanel")) return;

      const text = String(btn.textContent || btn.value || "").toLowerCase();
      const idClass = String((btn.id || "") + " " + (btn.className || "")).toLowerCase();
      const all = text + " " + idClass;

      const shouldDisable =
        all.includes("save") ||
        all.includes("complete") ||
        all.includes("post") ||
        all.includes("submit") ||
        all.includes("finish") ||
        all.includes("update") ||
        all.includes("create backend");

      if (!shouldDisable) return;

      if (!btn.hasAttribute("data-original-disabled")) {
        btn.setAttribute("data-original-disabled", btn.disabled ? "true" : "false");
      }

      btn.disabled = true;
      btn.setAttribute("data-edit-preview-disabled", "true");
      btn.classList.add("axtor-disabled-preview");
      btn.setAttribute("title", PATCH_DISABLED_MESSAGE);
    });
  }

  function exitEditPreview() {
    state.activeEditPreview = null;

    document.querySelectorAll("[data-edit-preview-disabled='true']").forEach((btn) => {
      const originalDisabled = btn.getAttribute("data-original-disabled") === "true";
      btn.disabled = originalDisabled;
      btn.classList.remove("axtor-disabled-preview");
      btn.removeAttribute("data-edit-preview-disabled");
      btn.removeAttribute("data-original-disabled");
      btn.removeAttribute("title");
    });

    document.getElementById("axtorEditPreviewBanner")?.remove();
    document.getElementById("axtorEditPreviewPanel")?.remove();
  }

  function ensureBackendPanel() {
    let panel = document.getElementById("axtorSalesBackendPanel");
    if (panel) return panel;

    const root = findSavedInvoicesRoot() || document.querySelector("main") || document.body;

    panel = document.createElement("div");
    panel.id = "axtorSalesBackendPanel";
    panel.className = "card my-3 axtor-sales-backend-panel";

    panel.innerHTML = `
      <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div>
          <strong>Backend Saved Documents</strong>
          <div id="axtorSalesBackendStatus" class="small text-muted">Ready</div>
        </div>

        <div class="d-flex flex-wrap align-items-center gap-2">
          <span id="axtorSalesBackendCount" class="badge text-bg-light">0 shown</span>
          <input id="axtorSalesBackendSearch" type="search" class="form-control form-control-sm" style="max-width:220px" placeholder="Search INV / QUO / DN" />
          <button type="button" class="btn btn-sm btn-outline-success" data-sales-refresh="1">Refresh</button>
        </div>
      </div>

      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table table-sm table-hover align-middle mb-0">
            <thead>
              <tr>
                <th>Document No</th>
                <th>Type</th>
                <th>Customer</th>
                <th>Date</th>
                <th class="text-end">Amount</th>
                <th class="text-end">Paid</th>
                <th>Status</th>
                <th class="text-end">Actions</th>
              </tr>
            </thead>
            <tbody id="axtorSalesBackendTbody">
              <tr>
                <td colspan="8" class="text-center py-4 text-muted">Waiting for backend data...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    root.appendChild(panel);
    return panel;
  }

  function ensureModal() {
    let modal = document.getElementById("axtorSalesDocViewModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "axtorSalesDocViewModal";
    modal.className = "modal fade";
    modal.tabIndex = -1;
    modal.setAttribute("aria-hidden", "true");

    modal.innerHTML = `
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content axtor-sales-modal">
          <div class="modal-header">
            <h5 id="axtorSalesDocModalTitle" class="modal-title">Sales Document</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div id="axtorSalesDocModalBody" class="modal-body">
            <div class="text-center py-5 text-muted">Loading...</div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Close</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    return modal;
  }

  function showModal(modal) {
    if (window.bootstrap && window.bootstrap.Modal) {
      window.bootstrap.Modal.getOrCreateInstance(modal).show();
      return;
    }

    modal.classList.add("show");
    modal.style.display = "block";
    modal.removeAttribute("aria-hidden");
  }

  function switchToNewSale() {
    const selectors = [
      '[data-bs-target="#new-sale"]',
      '[data-bs-target="#newSale"]',
      '[href="#new-sale"]',
      '[href="#newSale"]',
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        if (window.bootstrap && window.bootstrap.Tab) {
          window.bootstrap.Tab.getOrCreateInstance(el).show();
        } else {
          el.click();
        }
        return;
      }
    }
  }

  function switchToSavedInvoices() {
    const selectors = [
      '[data-bs-target="#saved-invoices"]',
      '[data-bs-target="#savedInvoices"]',
      '[href="#saved-invoices"]',
      '[href="#savedInvoices"]',
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        if (window.bootstrap && window.bootstrap.Tab) {
          window.bootstrap.Tab.getOrCreateInstance(el).show();
        } else {
          el.click();
        }
        return;
      }
    }
  }

  function findSavedInvoicesRoot() {
    const selectors = [
      "#saved-invoices",
      "#savedInvoices",
      "#saved-invoices-pane",
      "#savedInvoicesPane",
      "#savedInvoicesContent",
      '[data-section="saved-invoices"]',
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) return el;
    }

    return document.querySelector("main") || document.body;
  }

  function findNewSaleRoot() {
    const selectors = [
      "#new-sale",
      "#newSale",
      "#new-sale-pane",
      "#newSalePane",
      "#newSaleContent",
      '[data-section="new-sale"]',
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

    return list.map(normalizeDocument);
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
      doc.paidAmount ?? doc.amountPaid ?? doc.receivedAmount ?? doc.cashAmount ?? 0
    );

    return {
      ...doc,
      id: doc.id || doc._id || doc.documentId || doc.salesDocumentId,
      documentNoText: doc.documentNo || doc.docNo || doc.invoiceNo || doc.number || "N/A",
      rawType,
      typeText: documentTypeLabel(rawType),
      customerId: doc.customerId || customer.id || "",
      customerText:
        doc.customerName ||
        customer.name ||
        customer.displayName ||
        customer.companyName ||
        doc.customerId ||
        "Walk-in / Unknown",
      rawDate,
      dateText: formatDate(rawDate),
      inputDate: inputDate(rawDate),
      lpoText: doc.lpoNo || doc.lpo || "",
      poText: doc.customerPoNo || doc.poNo || "",
      amount,
      paidAmount,
      statusText: doc.status || doc.paymentStatus || doc.documentStatus || (doc.isPosted ? "posted" : "draft"),
      lines: Array.isArray(linesRaw) ? linesRaw.map(normalizeLine) : [],
    };
  }

  function normalizeLine(line, index) {
    const product = line.product || line.item || {};
    const qty = toNumber(line.qty ?? line.quantity ?? line.qtySold ?? 0);
    const rate = toNumber(line.rate ?? line.unitPrice ?? line.price ?? 0);

    return {
      index: index + 1,
      name: line.productName || line.itemName || line.name || product.name || "Item",
      sku: line.sku || line.productSku || product.sku || product.barcode || "-",
      qty,
      rate,
      total: toNumber(line.lineTotal ?? line.total ?? line.amount ?? qty * rate),
    };
  }

  function renderLines(lines) {
    if (!Array.isArray(lines) || !lines.length) {
      return `<tr><td colspan="6" class="text-center py-4 text-muted">No line items returned by backend.</td></tr>`;
    }

    return lines
      .map(
        (line) => `
          <tr>
            <td>${line.index}</td>
            <td>${escapeHtml(line.name)}</td>
            <td>${escapeHtml(line.sku)}</td>
            <td class="text-end">${formatQty(line.qty)}</td>
            <td class="text-end">${money(line.rate)}</td>
            <td class="text-end"><strong>${money(line.total)}</strong></td>
          </tr>
        `
      )
      .join("");
  }

  function readCustomerInfo(root) {
    const selectors = [
      "#customer",
      "#customerName",
      "#customerSelect",
      "#salesCustomer",
      '[name="customer"]',
      '[name="customerName"]',
      '[name="customerId"]',
    ];

    for (const selector of selectors) {
      const field = root.querySelector(selector);
      if (!field) continue;

      if (field.tagName.toLowerCase() === "select") {
        const option = field.options[field.selectedIndex];
        return {
          customerId: option?.getAttribute("data-backend-id") || option?.getAttribute("data-customer-id") || field.value || "",
          customerName: option?.textContent?.trim() || "",
        };
      }

      return {
        customerId: field.getAttribute("data-backend-id") || field.getAttribute("data-customer-id") || "",
        customerName: field.value || "",
      };
    }

    return { customerId: "", customerName: "" };
  }

  function readFieldValue(root, selectors) {
    for (const selector of selectors) {
      const el = root.querySelector(selector);
      if (!el) continue;

      if (el.tagName && el.tagName.toLowerCase() === "select") {
        const option = el.options[el.selectedIndex];
        return option?.getAttribute("data-backend-id") || el.value || option?.textContent?.trim() || "";
      }

      if ("value" in el) return String(el.value || "").trim();
      return String(el.textContent || "").trim();
    }

    return "";
  }

  function readMoneyValue(root, selectors) {
    return parseMoney(readFieldValue(root, selectors));
  }

  function guessCellText(row, index) {
    const cells = Array.from(row.children || []);
    return String(cells[index]?.textContent || "").trim();
  }

  function guessSku(row) {
    const text = String(row.textContent || "");
    const skuMatch = text.match(/\b[A-Z0-9][A-Z0-9-_]{2,}\b/);
    return skuMatch ? skuMatch[0] : "";
  }

  function guessNumberFromCells(row, keywords, fallbackIndex) {
    const cells = Array.from(row.children || []);

    for (const cell of cells) {
      const cls = String(cell.className || "").toLowerCase();
      if (keywords.some((k) => cls.includes(k))) {
        const value = parseMoney(cell.textContent);
        if (value) return value;
      }
    }

    return parseMoney(cells[fallbackIndex]?.textContent || "") || 0;
  }

  function normalizeDocumentType(value) {
    const v = String(value || "").toLowerCase().trim();
    if (v.includes("delivery") || v === "dn") return "delivery_note";
    if (v.includes("quotation") || v.includes("quote") || v.includes("quo")) return "quotation";
    return "invoice";
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
      <div class="axtor-info-box">
        <div class="axtor-info-label">${escapeHtml(label)}</div>
        <div class="axtor-info-value">${escapeHtml(value || "-")}</div>
      </div>
    `;
  }

  function statusBadge(status) {
    const text = String(status || "-");
    const lower = text.toLowerCase();
    let cls = "axtor-status-badge";

    if (lower.includes("paid") || lower.includes("posted") || lower.includes("complete")) cls += " success";
    else if (lower.includes("draft") || lower.includes("pending")) cls += " warning";
    else cls += " muted";

    return `<span class="${cls}">${escapeHtml(titleCase(text))}</span>`;
  }

  function ensureStyles() {
    if (document.getElementById("axtorSalesBackendProductIdFixStyles")) return;

    const style = document.createElement("style");
    style.id = "axtorSalesBackendProductIdFixStyles";

    style.textContent = `
      #axtorSalesBackendPanel,
      #axtorSalesCreateToolbar {
        border: 1px solid rgba(25, 135, 84, 0.24);
        background: rgba(255, 255, 255, 0.74);
        backdrop-filter: blur(10px);
      }

      #axtorSalesBackendPanel .card-header {
        background: rgba(25, 135, 84, 0.08);
        border-bottom: 1px solid rgba(25, 135, 84, 0.16);
      }

      .axtor-doc-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.75rem;
      }

      .axtor-info-box {
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 0.85rem;
        padding: 0.75rem;
        background: rgba(255, 255, 255, 0.72);
      }

      .axtor-info-label {
        font-size: 0.76rem;
        color: #6c757d;
        margin-bottom: 0.18rem;
      }

      .axtor-info-value {
        font-weight: 800;
      }

      .axtor-status-badge {
        display: inline-flex;
        border-radius: 999px;
        padding: 0.18rem 0.55rem;
        font-size: 0.78rem;
        font-weight: 700;
      }

      .axtor-status-badge.success {
        color: #146c43;
        background: rgba(25, 135, 84, 0.12);
      }

      .axtor-status-badge.warning {
        color: #7a5b00;
        background: rgba(255, 193, 7, 0.2);
      }

      .axtor-status-badge.muted {
        color: #495057;
        background: rgba(108, 117, 125, 0.12);
      }

      .axtor-disabled-preview {
        opacity: 0.55 !important;
        cursor: not-allowed !important;
      }

      @media (max-width: 768px) {
        .axtor-doc-grid {
          grid-template-columns: 1fr;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function parseMoney(value) {
    const cleaned = String(value || "")
      .replace(/QAR/gi, "")
      .replace(/,/g, "")
      .replace(/[^\d.-]/g, "")
      .trim();

    const number = Number(cleaned);
    return Number.isFinite(number) ? number : 0;
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
    return date.toLocaleDateString("en-QA", { year: "numeric", month: "short", day: "2-digit" });
  }

  function inputDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return (
      date.getFullYear() +
      "-" +
      String(date.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(date.getDate()).padStart(2, "0")
    );
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
