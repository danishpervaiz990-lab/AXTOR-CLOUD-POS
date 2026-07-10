/**
 * Axtor POS Cloud
 * Phase 3 — Sales Backend Integration
 * Sales Step 3 — Production UX + Safe Create Flow
 *
 * Full replace file.
 * No backend PATCH.
 * No backend/Railway changes.
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
    products: [],
    cart: [],
    cache: new Map(),
    activeEditPreview: null,
    searchText: "",
    productSearch: "",
    creating: false,
    loadingProducts: false,
    loadingDocs: false,
    lastCreatedId: "",
    lastCreatedDocumentNo: "",
    pendingAutoOpenId: "",
    selectedTabSelector: "",
  };

  window.AxtorSalesBackend = {
    exists: true,
    version: "20260626-phase5c-sales-return-tracking-ui-full",
    init,
    refresh: loadSavedDocuments,
    refreshProducts: loadBackendProducts,
    loadSavedDocuments,
    loadBackendProducts,
    viewDocument,
    editPreviewDocument,
    exitEditPreview,
    createBackendDocumentFromPage,
    buildCreatePayloadFromPage,
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
    ensureModal();
    ensureCreateToolbar();
    ensureBackendProductGrid();
    ensureBackendCart();
    ensureBackendPanel();
    bindEvents();

    rememberSelectedTab();
    loadBackendProducts();
    loadSavedDocuments({ preserveSearch: true, preserveTab: true });

    console.log("AxtorSalesBackend loaded:", window.AxtorSalesBackend.version);
  }

  function bindEvents() {
    document.addEventListener("click", function (e) {
      const addBtn = e.target.closest("[data-backend-product-add]");
      if (addBtn) {
        e.preventDefault();
        addProductToCart(addBtn.getAttribute("data-backend-product-add"));
        return;
      }

      const qtyBtn = e.target.closest("[data-cart-qty]");
      if (qtyBtn) {
        e.preventDefault();
        changeCartQty(
          qtyBtn.getAttribute("data-cart-qty"),
          Number(qtyBtn.getAttribute("data-delta") || 0)
        );
        return;
      }

      const removeBtn = e.target.closest("[data-cart-remove]");
      if (removeBtn) {
        e.preventDefault();
        removeCartItem(removeBtn.getAttribute("data-cart-remove"));
        return;
      }

      const clearBtn = e.target.closest("[data-cart-clear]");
      if (clearBtn) {
        e.preventDefault();
        state.cart = [];
        renderCart();
        setCreateStatus("Cart cleared.", "muted");
        return;
      }

      const viewBtn = e.target.closest("[data-sales-view-id]");
      if (viewBtn) {
        e.preventDefault();
        viewDocument(viewBtn.getAttribute("data-sales-view-id"));
        return;
      }

      const editBtn = e.target.closest("[data-sales-edit-id]");
      if (editBtn) {
        e.preventDefault();
        editPreviewDocument(editBtn.getAttribute("data-sales-edit-id"));
        return;
      }

      const refreshBtn = e.target.closest("[data-sales-refresh]");
      if (refreshBtn) {
        e.preventDefault();
        loadSavedDocuments({ preserveSearch: true, preserveTab: true, manual: true });
        return;
      }

      const refreshProductsBtn = e.target.closest("[data-products-refresh]");
      if (refreshProductsBtn) {
        e.preventDefault();
        loadBackendProducts();
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
        syncSavedSearchInput();
      }

      if (e.target && e.target.id === "axtorBackendProductSearch") {
        state.productSearch = e.target.value || "";
        renderBackendProducts();
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.target && e.target.id === "axtorBackendProductSearch" && e.key === "Enter") {
        e.preventDefault();

        const search = String(state.productSearch || "").toLowerCase().trim();
        if (!search) return;

        const matched = state.products.find(function (p) {
          return productSearchText(p).includes(search);
        });

        if (matched) {
          addProductToCart(matched.id);
          e.target.value = "";
          state.productSearch = "";
          renderBackendProducts();
        } else {
          setCreateStatus("No product matched: " + escapeHtml(search), "danger");
          showToast("No product matched", "Search by item code, product name, SKU, barcode, or QR.", "warning");
        }
      }
    });

    document.addEventListener("shown.bs.tab", rememberSelectedTab);
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

  async function loadBackendProducts() {
    ensureBackendProductGrid();

    const grid = document.getElementById("axtorBackendProductGridBody");
    const status = document.getElementById("axtorBackendProductStatus");

    if (status) {
      status.className = "small text-muted";
      status.textContent = "Loading backend products...";
    }

    if (grid) {
      grid.innerHTML = '<div class="text-muted p-3">Loading backend products...</div>';
    }

    try {
      const response = await backendGet("/api/v1/products");
      const data = unwrapData(response);

      const products = Array.isArray(data)
        ? data
        : data?.products || data?.items || data?.rows || data?.results || [];

      state.products = products.map(normalizeProduct).filter(function (p) {
        return !!p.id;
      });

      renderBackendProducts();

      if (status) {
        status.className = "small text-success";
        status.innerHTML =
          "Backend products loaded: <strong>" + state.products.length + "</strong>";
      }
    } catch (err) {
      console.error("Backend products load failed:", err);

      if (status) {
        status.className = "small text-danger";
        status.textContent = err.message || "Failed to load backend products";
      }

      if (grid) {
        grid.innerHTML = '<div class="text-danger p-3">Failed to load backend products.</div>';
      }
    }
  }

  function renderBackendProducts() {
    const grid = document.getElementById("axtorBackendProductGridBody");
    if (!grid) return;

    const search = String(state.productSearch || "").toLowerCase().trim();

    const products = state.products.filter(function (p) {
      if (!search) return true;
      return productSearchText(p).includes(search);
    });

    if (!products.length) {
      grid.innerHTML = '<div class="text-muted p-3">No backend products found.</div>';
      return;
    }

    grid.innerHTML = products
      .map(function (p) {
        return `
          <div class="axtor-backend-product-card" data-product-id="${escapeAttr(p.id)}">
            <div class="axtor-product-icon">▣</div>
            <div class="fw-bold">${escapeHtml(p.name)}</div>
            <div class="small text-muted">Item Code: ${escapeHtml(p.itemCode || "-")}</div>
            <div class="small text-muted">SKU: ${escapeHtml(p.sku || "-")}</div>
            <div class="small text-muted">Barcode/QR: ${escapeHtml(
              p.barcode || p.qrCode || "-"
            )}</div>
            <div class="small text-success">ID: ${escapeHtml(p.id)}</div>
            <div class="d-flex justify-content-between align-items-center mt-2">
              <strong>${money(p.price)}</strong>
              <button type="button" class="btn btn-sm btn-success" data-backend-product-add="${escapeAttr(
                p.id
              )}">
                Add
              </button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function addProductToCart(productId) {
    const product = state.products.find(function (p) {
      return String(p.id) === String(productId);
    });

    if (!product) {
      alert("Backend product not found.");
      return;
    }

    const existing = state.cart.find(function (item) {
      return String(item.productId) === String(product.id);
    });

    if (existing) {
      existing.quantity += 1;
      existing.lineTotal = existing.quantity * existing.unitPrice;
    } else {
      state.cart.push({
        productId: product.id,
        productName: product.name,
        itemCode: product.itemCode,
        sku: product.sku,
        barcode: product.barcode,
        qrCode: product.qrCode,
        quantity: 1,
        unitPrice: product.price,
        lineTotal: product.price,
      });
    }

    renderCart();
    setCreateStatus("Added to backend cart: " + escapeHtml(product.name), "success");
  }

  function changeCartQty(productId, delta) {
    const item = state.cart.find(function (x) {
      return String(x.productId) === String(productId);
    });

    if (!item) return;

    item.quantity += delta;

    if (item.quantity <= 0) {
      removeCartItem(productId);
      return;
    }

    item.lineTotal = item.quantity * item.unitPrice;
    renderCart();
  }

  function removeCartItem(productId) {
    state.cart = state.cart.filter(function (x) {
      return String(x.productId) !== String(productId);
    });

    renderCart();
  }

  function renderCart() {
    ensureBackendCart();

    const tbody = document.getElementById("axtorBackendCartTbody");
    const totalBox = document.getElementById("axtorBackendCartTotal");
    const countBox = document.getElementById("axtorBackendCartCount");

    if (!tbody) return;

    if (!state.cart.length) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="text-center py-3 text-muted">Cart empty. Add backend product first.</td></tr>';
    } else {
      tbody.innerHTML = state.cart
        .map(function (item) {
          return `
            <tr>
              <td>
                <strong>${escapeHtml(item.productName)}</strong>
                <div class="small text-muted">SKU: ${escapeHtml(item.sku || "-")}</div>
                <div class="small text-muted">Barcode/QR: ${escapeHtml(
                  item.barcode || item.qrCode || "-"
                )}</div>
                <div class="small text-success">productId: ${escapeHtml(item.productId)}</div>
              </td>
              <td class="text-center">
                <button type="button" class="btn btn-sm btn-outline-secondary" data-cart-qty="${escapeAttr(
                  item.productId
                )}" data-delta="-1">−</button>
                <span class="mx-2">${escapeHtml(item.quantity)}</span>
                <button type="button" class="btn btn-sm btn-outline-secondary" data-cart-qty="${escapeAttr(
                  item.productId
                )}" data-delta="1">+</button>
              </td>
              <td class="text-end">${money(item.unitPrice)}</td>
              <td class="text-end"><strong>${money(item.lineTotal)}</strong></td>
              <td class="text-end">
                <button type="button" class="btn btn-sm btn-outline-danger" data-cart-remove="${escapeAttr(
                  item.productId
                )}">Remove</button>
              </td>
            </tr>
          `;
        })
        .join("");
    }

    const total = state.cart.reduce(function (sum, item) {
      return sum + toNumber(item.lineTotal);
    }, 0);

    if (totalBox) totalBox.textContent = money(total);
    if (countBox) countBox.textContent = state.cart.length + " item(s)";
  }

  async function createBackendDocumentFromPage() {
    if (state.creating) {
      showToast("Please wait", "Backend document is already being created.", "warning");
      return;
    }

    if (state.activeEditPreview) {
      showToast("Edit Preview is read-only", PATCH_DISABLED_MESSAGE, "warning");
      return;
    }

    const activeBeforeCreate = getActiveTabSelector();
    if (activeBeforeCreate) state.selectedTabSelector = activeBeforeCreate;

    let created = null;

    try {
      const payload = buildCreatePayloadFromPage();

      if (!payload.items.length) {
        throw new Error("Cart empty. Add backend product first.");
      }

      const missingProductId = payload.items.find(function (item) {
        return !item.productId;
      });

      if (missingProductId) {
        throw new Error("Product ID missing. Add products only from Backend Product Grid.");
      }

      const ok = confirm(
        "Create backend " +
          documentTypeLabel(payload.documentType) +
          " now?\n\nItems: " +
          payload.items.length +
          "\nTotal: " +
          money(payload.grandTotal)
      );

      if (!ok) return;

      state.creating = true;
      setCreateButtonsDisabled(true);
      setGlobalLoading(true, "Creating backend document...");
      setCreateStatus(withSpinner("Creating backend document..."), "muted");
      showToast("Creating document", "Please wait while backend saves this sale.", "info");

      console.log("Axtor Step 3 create payload:", payload);

      const response = await backendPost("/api/v1/sales-documents", payload);
      created = normalizeDocument(unwrapData(response));

      state.lastCreatedId = created.id || "";
            state.lastCreatedDocumentNo = created.documentNoText || "";
      state.pendingAutoOpenId = created.id || "";

      setCreateStatus("Created successfully: " + escapeHtml(created.documentNoText), "success");
      showToast(
        "Document created",
        created.documentNoText + " saved successfully.",
        "success"
      );

      clearBackendCart();
      safelyClearSaleFormAfterCreate();

      await loadSavedDocuments({
        preserveSearch: true,
        preserveTab: false,
        highlightId: created.id,
        autoOpenId: created.id,
        afterCreate: true,
      });

      switchToSavedInvoices();

      setTimeout(function () {
        highlightAndScrollToDocument(created.id);
      }, 350);

      setTimeout(function () {
        if (created && created.id) {
          viewDocument(created.id);
        }
      }, 650);
    } catch (err) {
      console.error("Create backend sales document failed:", err);
      setCreateStatus(escapeHtml(err.message || "Create failed"), "danger");
      showToast("Create failed", err.message || "Unknown backend error", "danger");
    } finally {
      state.creating = false;
      setCreateButtonsDisabled(false);
      setGlobalLoading(false);
    }
  }

  function clearBackendCart() {
    state.cart = [];
    renderCart();
  }

  function safelyClearSaleFormAfterCreate() {
    const root = findNewSaleRoot() || document;

    const selectors = [
      "#lpoNo",
      "#saleLpoNo",
      "#salesLpoNo",
      "#customerPoNo",
      '[name="lpoNo"]',
      '[name="lpo"]',
      '[name="customerPoNo"]',
      "#salePaymentMethod",
      "#paymentMethod",
      '[name="paymentMethod"]',
    ];

    selectors.forEach(function (selector) {
      const el = root.querySelector(selector);
      if (!el) return;

      if (el.tagName && el.tagName.toLowerCase() === "select") {
        el.selectedIndex = 0;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }

      if ("value" in el) {
        el.value = "";
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    setCreateStatus("Ready. Previous sale cleared safely.", "muted");
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

    const paymentMethod =
      readFieldValue(root, ["#paymentMethod", "#salePaymentMethod", '[name="paymentMethod"]']) ||
      "cash";

    const totalAmount = state.cart.reduce(function (sum, item) {
      return sum + toNumber(item.lineTotal);
    }, 0);

    const paidAmount = documentType === "invoice" ? totalAmount : 0;

    return {
      documentType: documentType,
      documentDate: documentDate,
      customerId: customerInfo.customerId || null,
      customerName: customerInfo.customerName || "Walk-in Customer",
      lpoNo: lpoNo || null,
      customerPoNo: lpoNo || null,
      poNo: lpoNo || null,
      paidAmount: paidAmount,
      paymentMethod: paymentMethod,
      totalAmount: totalAmount,
      grandTotal: totalAmount,
      items: state.cart.map(function (item) {
        return {
          productId: item.productId,
          productName: item.productName,
          sku: item.sku || null,
          barcode: item.barcode || null,
          quantity: item.quantity,
          qty: item.quantity,
          unitPrice: item.unitPrice,
          rate: item.unitPrice,
          price: item.unitPrice,
          lineTotal: item.lineTotal,
          total: item.lineTotal,
        };
      }),
    };
  }

  function previewCreatePayload() {
    try {
      const payload = buildCreatePayloadFromPage();
      console.log("Axtor Sales Step 3 payload:", payload);

      showToast(
        "Payload ready",
        "Payload printed in console. Items: " + payload.items.length + ", Total: " + money(payload.grandTotal),
        "info"
      );

      alert(
        "Payload printed in console.\n\nItems: " +
          payload.items.length +
          "\nTotal: " +
          money(payload.grandTotal)
      );
    } catch (err) {
      showToast("Payload preview failed", err.message || "Unknown error", "danger");
      alert(err.message || "Payload preview failed");
    }
  }

  async function loadSavedDocuments(options) {
    const opts = options || {};
    ensureBackendPanel();

    const tbody = document.getElementById("axtorSalesBackendTbody");
    const status = document.getElementById("axtorSalesBackendStatus");

    if (!opts.preserveSearch) {
      state.searchText = "";
      syncSavedSearchInput();
    } else {
      readSavedSearchInput();
    }

    if (status) {
      status.className = "small text-muted";
      status.innerHTML = withSpinner("Loading backend saved documents...");
    }

    if (tbody) {
      tbody.innerHTML =
        '<tr><td colspan="8" class="text-center py-4 text-muted">' +
        inlineSpinner("Loading...") +
        "</td></tr>";
    }

    state.loadingDocs = true;

    try {
      const response = await backendGet("/api/v1/sales-documents");
      const docs = normalizeList(response);

      state.docs = docs;
      state.cache.clear();

      docs.forEach(function (doc) {
        if (doc.id) state.cache.set(String(doc.id), doc);
      });

      renderSavedDocuments(opts.highlightId || state.lastCreatedId);

      if (status) {
        status.className = "small text-success";
        status.innerHTML = "Backend documents loaded: <strong>" + docs.length + "</strong>";
      }

      if (opts.manual) {
        showToast("Saved documents refreshed", docs.length + " document(s) loaded.", "success");
      }

      if (opts.highlightId) {
        setTimeout(function () {
          highlightAndScrollToDocument(opts.highlightId);
        }, 150);
      }

      if (opts.autoOpenId) {
        setTimeout(function () {
          viewDocument(opts.autoOpenId);
        }, 500);
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

      showToast("Saved documents failed", err.message || "Unable to load backend saved documents.", "danger");
    } finally {
      state.loadingDocs = false;
    }
  }

  function renderSavedDocuments(highlightId) {
    const tbody = document.getElementById("axtorSalesBackendTbody");
    const count = document.getElementById("axtorSalesBackendCount");
    if (!tbody) return;

    const search = String(state.searchText || "").toLowerCase().trim();

    const docs = state.docs.filter(function (doc) {
      if (!search) return true;
      return [
        doc.documentNoText,
        doc.typeText,
        doc.customerText,
        doc.dateText,
        doc.statusText,
        doc.returnStatusText,
        doc.returnedAmount,
        doc.returnCount,
        doc.refundStatus,
        doc.refundedAmount,
        doc.refundBalance,
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
      .map(function (doc) {
        const isNew = String(doc.id || "") === String(highlightId || state.lastCreatedId || "");
        return `
          <tr id="axtor-sales-doc-row-${escapeAttr(doc.id)}" class="${isNew ? "axtor-newly-created-row" : ""}" data-sales-doc-row="${escapeAttr(doc.id)}">
            <td><strong>${escapeHtml(doc.documentNoText)}</strong></td>
            <td>${escapeHtml(doc.typeText)}</td>
            <td>${escapeHtml(doc.customerText)}</td>
            <td>${escapeHtml(doc.dateText)}</td>
            <td class="text-end">
              <strong>${money(doc.amount)}</strong>
              ${toNumber(doc.refundedAmount) > 0 ? `<div class="small text-success mt-1">Net after refund: ${money(Math.max(0, toNumber(doc.amount) - toNumber(doc.refundedAmount)))}</div>` : ""}
            </td>
            <td class="text-end">${money(doc.paidAmount)}</td>
            <td>
              ${statusBadge(doc.statusText)}
              ${returnBadge(doc)}
              ${refundBadge(doc)}
            </td>
            <td class="text-end text-nowrap">
              <button type="button" class="btn btn-sm btn-outline-primary me-1" data-sales-view-id="${escapeAttr(
                doc.id
              )}">View</button>
              <button type="button" class="btn btn-sm btn-outline-warning me-1" data-sales-edit-id="${escapeAttr(
                doc.id
              )}">Edit</button>
              <button type="button" class="btn btn-sm btn-outline-secondary" onclick="alert('Print placeholder only')">Print</button>
            </td>
          </tr>
        `;
      })
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
        '<div class="text-center py-5 text-muted">' +
        inlineSpinner("Loading backend document details...") +
        "</div>";
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
            ${infoBox("Return Status", doc.returnStatusText || "Not Returned")}
            ${infoBox("Returned Amount", money(doc.returnedAmount || 0))}
          ${infoBox("Refund Status", titleCase(String(doc.refundStatus || "not_refunded").replaceAll("_", " ")))}
          ${infoBox("Refunded Amount", money(doc.refundedAmount || 0))}
          ${infoBox("Refund Balance", money(doc.refundBalance || 0))}
            ${infoBox("Return Count", String(doc.returnCount || 0))}
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
      showToast("Document load failed", err.message || "Unable to load document.", "danger");
    }
  }

  async function editPreviewDocument(id) {
    try {
      const doc = await fetchDocumentDetail(id);
      state.activeEditPreview = doc;
      switchToNewSale();
      showEditPreview(doc);
      disableSaveButtons();
      showToast("Edit Preview opened", "This document is read-only until backend PATCH is added.", "warning");
    } catch (err) {
      showToast("Edit Preview failed", err.message || "Unknown error", "danger");
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
        <strong>Loaded from Backend: ${escapeHtml(doc.documentNoText)} / ${escapeHtml(
      doc.typeText
    )}</strong>
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
          ${infoBox("Return Status", doc.returnStatusText || "Not Returned")}
          ${infoBox("Returned Amount", money(doc.returnedAmount || 0))}
          ${infoBox("Refund Status", titleCase(String(doc.refundStatus || "not_refunded").replaceAll("_", " ")))}
          ${infoBox("Refunded Amount", money(doc.refundedAmount || 0))}
          ${infoBox("Refund Balance", money(doc.refundBalance || 0))}
          ${infoBox("Return Count", String(doc.returnCount || 0))}
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

    setTimeout(function () {
      banner.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }

  function exitEditPreview() {
    state.activeEditPreview = null;

    document.querySelectorAll("[data-edit-preview-disabled='true']").forEach(function (btn) {
      const originalDisabled = btn.getAttribute("data-original-disabled") === "true";
      btn.disabled = originalDisabled;
      btn.classList.remove("axtor-disabled-preview");
      btn.removeAttribute("data-edit-preview-disabled");
      btn.removeAttribute("data-original-disabled");
      btn.removeAttribute("title");
    });

    document.getElementById("axtorEditPreviewBanner")?.remove();
    document.getElementById("axtorEditPreviewPanel")?.remove();

    showToast("Edit Preview closed", "Create flow is available again.", "info");
  }

  function disableSaveButtons() {
    const root = findNewSaleRoot() || document;

    root
      .querySelectorAll("button, input[type='button'], input[type='submit'], a.btn")
      .forEach(function (btn) {
        if (btn.closest("#axtorEditPreviewBanner") || btn.closest("#axtorEditPreviewPanel")) {
          return;
        }

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

  function ensureCreateToolbar() {
    const root = findNewSaleRoot() || document.querySelector("main") || document.body;
    if (document.getElementById("axtorSalesCreateToolbar")) return;

    const toolbar = document.createElement("div");
    toolbar.id = "axtorSalesCreateToolbar";
    toolbar.className = "card my-3 axtor-sales-create-toolbar";

    toolbar.innerHTML = `
      <div class="card-body d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div>
          <strong>Backend Create — Sales Step 3</strong>
          <div id="axtorSalesCreateStatus" class="small text-muted">
            Ready. Production UX enabled.
          </div>
        </div>
        <div class="d-flex flex-wrap gap-2">
          <button type="button" class="btn btn-sm btn-outline-secondary" data-sales-preview-payload="1">Preview Payload</button>
          <button type="button" class="btn btn-sm btn-success" data-sales-create-backend="1">Create Backend Document</button>
        </div>
      </div>
    `;

    root.prepend(toolbar);
  }

  function ensureBackendProductGrid() {
    if (document.getElementById("axtorBackendProductGrid")) return;

    removeOldLocalProductCards();

    const toolbar = document.getElementById("axtorSalesCreateToolbar");
    const root = findNewSaleRoot() || document.querySelector("main") || document.body;

    const card = document.createElement("div");
    card.id = "axtorBackendProductGrid";
    card.className = "card my-3 axtor-backend-products";

    card.innerHTML = `
      <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div>
          <strong>Backend Product Grid</strong>
          <div id="axtorBackendProductStatus" class="small text-muted">Ready</div>
        </div>
        <div class="d-flex flex-wrap gap-2">
          <input
            id="axtorBackendProductSearch"
            class="form-control form-control-sm"
            style="max-width:280px"
            placeholder="Search item code / name / SKU / barcode / QR"
          >
          <button type="button" class="btn btn-sm btn-outline-success" data-products-refresh="1">
            Refresh Products
          </button>
        </div>
      </div>

      <div class="card-body">
        <div id="axtorBackendProductGridBody" class="axtor-backend-product-grid">
          <div class="text-muted p-3">Waiting for backend products...</div>
        </div>
      </div>
    `;

    if (toolbar) toolbar.insertAdjacentElement("afterend", card);
    else root.prepend(card);
  }

  function ensureBackendCart() {
    const root = findNewSaleRoot() || document.querySelector("main") || document.body;
    if (document.getElementById("axtorBackendCart")) return;

    const card = document.createElement("div");
    card.id = "axtorBackendCart";
    card.className = "card my-3 axtor-backend-cart";

    card.innerHTML = `
      <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div>
          <strong>Backend Cart</strong>
          <div class="small text-muted">Uses real backend productId</div>
        </div>
        <div class="d-flex gap-2 align-items-center">
          <span id="axtorBackendCartCount" class="badge text-bg-light">0 item(s)</span>
          <button type="button" class="btn btn-sm btn-outline-danger" data-cart-clear="1">Clear</button>
        </div>
      </div>
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0">
            <thead>
              <tr>
                <th>Item</th>
                <th class="text-center">Qty</th>
                <th class="text-end">Rate</th>
                <th class="text-end">Total</th>
                <th class="text-end">Action</th>
              </tr>
            </thead>
            <tbody id="axtorBackendCartTbody">
              <tr><td colspan="5" class="text-center py-3 text-muted">Cart empty. Add backend product first.</td></tr>
            </tbody>
            <tfoot>
              <tr>
                <th colspan="3" class="text-end">Grand Total</th>
                <th id="axtorBackendCartTotal" class="text-end">QAR 0.00</th>
                <th></th>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;

    const grid = document.getElementById("axtorBackendProductGrid");
    if (grid) grid.insertAdjacentElement("afterend", card);
    else root.prepend(card);
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
              <tr><td colspan="8" class="text-center py-4 text-muted">Waiting for backend data...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    root.appendChild(panel);
    syncSavedSearchInput();
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

  function ensureToastContainer() {
    if (document.getElementById("axtorToastContainer")) return;

    const box = document.createElement("div");
    box.id = "axtorToastContainer";
    box.className = "toast-container position-fixed top-0 end-0 p-3";
    box.style.zIndex = "1080";

    document.body.appendChild(box);
  }

  function showToast(title, message, type) {
    ensureToastContainer();

    const container = document.getElementById("axtorToastContainer");
    if (!container) return;

    const id = "axtor-toast-" + Date.now() + "-" + Math.random().toString(16).slice(2);
    const safeType = type || "info";

    const toast = document.createElement("div");
    toast.id = id;
    toast.className = "toast axtor-toast axtor-toast-" + safeType;
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

  function setGlobalLoading(active, text) {
    let overlay = document.getElementById("axtorGlobalLoadingOverlay");

    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "axtorGlobalLoadingOverlay";
      overlay.innerHTML = `
        <div class="axtor-loading-box">
          <div class="spinner-border text-success" role="status" aria-hidden="true"></div>
          <div id="axtorGlobalLoadingText" class="mt-2 fw-bold">Loading...</div>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    const label = document.getElementById("axtorGlobalLoadingText");
    if (label) label.textContent = text || "Loading...";

    overlay.classList.toggle("show", !!active);
  }
    function inlineSpinner(text) {
    return (
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>' +
      escapeHtml(text || "Loading...")
    );
  }

  function withSpinner(text) {
    return inlineSpinner(text);
  }

  function highlightAndScrollToDocument(id) {
    if (!id) return;

    const row =
      document.querySelector('[data-sales-doc-row="' + cssEscape(id) + '"]') ||
      document.getElementById("axtor-sales-doc-row-" + id);

    if (!row) return;

    row.classList.add("axtor-newly-created-row");

    setTimeout(function () {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);

    setTimeout(function () {
      row.classList.remove("axtor-newly-created-row");
      row.classList.add("axtor-created-row-soft");
    }, 6000);
  }

  function readSavedSearchInput() {
    const input = document.getElementById("axtorSalesBackendSearch");
    if (input) state.searchText = input.value || state.searchText || "";
  }

  function syncSavedSearchInput() {
    const input = document.getElementById("axtorSalesBackendSearch");
    if (input && input.value !== state.searchText) {
      input.value = state.searchText || "";
    }
  }

  function rememberSelectedTab() {
    state.selectedTabSelector = getActiveTabSelector();
  }

  function getActiveTabSelector() {
    const active =
      document.querySelector(".nav-link.active[data-bs-target]") ||
      document.querySelector(".nav-link.active[href^='#']") ||
      document.querySelector("[data-bs-toggle='tab'].active[data-bs-target]") ||
      document.querySelector("[data-bs-toggle='pill'].active[data-bs-target]");

    if (!active) return "";

    return active.getAttribute("data-bs-target") || active.getAttribute("href") || "";
  }

  function removeOldLocalProductCards() {
    const root = findNewSaleRoot() || document;

    const headings = Array.from(root.querySelectorAll("h1,h2,h3,h4,h5,strong,b,div,span"))
      .filter(function (el) {
        return String(el.textContent || "").trim().toLowerCase().includes("product grid");
      });

    headings.forEach(function (heading) {
      const box = heading.closest(".card, .glass-card, section, .panel, .box, .col, .row, div");
      if (box && !box.id && !box.closest("#axtorBackendProductGrid")) {
        box.style.display = "none";
        box.setAttribute("data-axtor-hidden-local-products", "1");
      }
    });
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
      .forEach(function (btn) {
        btn.disabled = !!disabled;

        if (btn.hasAttribute("data-sales-create-backend")) {
          btn.innerHTML = disabled
            ? '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Creating...'
            : "Create Backend Document";
        }
      });
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

  function normalizeProduct(raw) {
    const p = raw || {};

    return {
      id: p.id || p._id || p.productId,
      name: p.name || p.productName || p.title || "Product",
      itemCode: p.itemCode || p.code || p.productCode || p.sku || "",
      sku: p.sku || p.code || p.itemCode || "",
      barcode: p.barcode || p.barCode || p.qrCode || "",
      qrCode: p.qrCode || p.qr || p.barcode || "",
      price: toNumber(p.price ?? p.sellingPrice ?? p.salePrice ?? p.unitPrice ?? 0),
      cost: toNumber(p.cost ?? p.costPrice ?? 0),
      stock: toNumber(p.stock ?? p.openingStock ?? p.quantity ?? 0),
    };
  }

  function productSearchText(p) {
    return [p.name, p.itemCode, p.sku, p.barcode, p.qrCode, p.id]
      .join(" ")
      .toLowerCase();
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
      inputDate: inputDate(rawDate),
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
      refundBalance: toNumber(doc.refundBalance ?? 0),
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
      qty: qty,
      rate: rate,
      total: toNumber(line.lineTotal ?? line.total ?? line.amount ?? qty * rate),
    };
  }

  function renderLines(lines) {
    if (!Array.isArray(lines) || !lines.length) {
      return `<tr><td colspan="6" class="text-center py-4 text-muted">No line items returned by backend.</td></tr>`;
    }

    return lines
      .map(function (line) {
        return `
          <tr>
            <td>${line.index}</td>
            <td>${escapeHtml(line.name)}</td>
            <td>${escapeHtml(line.sku)}</td>
            <td class="text-end">${formatQty(line.qty)}</td>
            <td class="text-end">${money(line.rate)}</td>
            <td class="text-end"><strong>${money(line.total)}</strong></td>
          </tr>
        `;
      })
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

      if (field.tagName && field.tagName.toLowerCase() === "select") {
        const option = field.options[field.selectedIndex];
        return {
          customerId:
            option?.getAttribute("data-backend-id") ||
            option?.getAttribute("data-customer-id") ||
            field.value ||
            "",
          customerName: option?.textContent?.trim() || "",
        };
      }

      return {
        customerId:
          field.getAttribute("data-backend-id") ||
          field.getAttribute("data-customer-id") ||
          "",
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

  function normalizeDocumentType(value) {
    const v = String(value || "").toLowerCase().trim();

    if (v.includes("delivery") || v === "dn" || v.includes("delivery_note")) {
      return "delivery_note";
    }

    if (v.includes("quotation") || v.includes("quote") || v.includes("quo")) {
      return "quotation";
    }

    return "invoice";
  }

  function documentTypeLabel(type) {
    const value = String(type || "").toLowerCase();

    if (value.includes("delivery") || value === "dn") return "Delivery Note";

    if (value.includes("quotation") || value.includes("quote") || value.includes("quo")) {
      return "Quotation";
    }

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


  function returnStatusLabel(status) {
    const value = String(status || "not_returned").toLowerCase();

    if (value.includes("fully")) return "Fully Returned";
    if (value.includes("partial")) return "Partially Returned";
    if (value.includes("returned") && !value.includes("not")) return "Returned";

    return "Not Returned";
  }

  function returnBadge(doc) {
    const status = String(doc?.returnStatus || "").toLowerCase();
    const amount = toNumber(doc?.returnedAmount || 0);
    const count = toNumber(doc?.returnCount || 0);

    if ((!status || status === "not_returned") && amount <= 0 && count <= 0) {
      return "";
    }

    let cls = "axtor-return-mini-badge warning";
    let label = doc.returnStatusText || "Returned";

    if (status.includes("fully")) {
      cls = "axtor-return-mini-badge danger";
      label = "Fully Returned";
    } else if (status.includes("partial")) {
      cls = "axtor-return-mini-badge warning";
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

  function refundBadge(doc) {
    const refunded = toNumber(doc?.refundedAmount || 0);
    const balance = toNumber(doc?.refundBalance || 0);
    const status = String(doc?.refundStatus || "not_refunded").toLowerCase();

    if (refunded <= 0 && (!status || status === "not_refunded")) {
      return "";
    }

    const fullyRefunded = status.includes("fully") || balance <= 0;
    const label = fullyRefunded ? "Fully Refunded" : "Partially Refunded";
    const cls = fullyRefunded ? "axtor-return-mini-badge success" : "axtor-return-mini-badge warning";

    return `
      <div class="mt-1">
        <span class="${cls}">
          ${escapeHtml(label)} · ${money(refunded)}${balance > 0 ? ` · Balance ${money(balance)}` : ""}
        </span>
      </div>
    `;
  }

  function statusBadge(status) {
    const text = String(status || "-");
    const lower = text.toLowerCase();
    let cls = "axtor-status-badge";

    if (lower.includes("paid") || lower.includes("posted") || lower.includes("complete")) {
      cls += " success";
    } else if (lower.includes("draft") || lower.includes("pending")) {
      cls += " warning";
    } else {
      cls += " muted";
    }

    return `<span class="${cls}">${escapeHtml(titleCase(text))}</span>`;
  }

  function ensureStyles() {
    if (document.getElementById("axtorSalesBackendStep3ProductionStyles")) return;

    const style = document.createElement("style");
    style.id = "axtorSalesBackendStep3ProductionStyles";

    style.textContent = `
      #axtorSalesBackendPanel,
      #axtorSalesCreateToolbar,
      #axtorBackendProductGrid,
      #axtorBackendCart {
        border: 1px solid rgba(25, 135, 84, 0.24);
        background: rgba(255, 255, 255, 0.74);
        backdrop-filter: blur(10px);
      }

      #axtorSalesBackendPanel .card-header,
      #axtorBackendProductGrid .card-header,
      #axtorBackendCart .card-header {
        background: rgba(25, 135, 84, 0.08);
        border-bottom: 1px solid rgba(25, 135, 84, 0.16);
      }

      .axtor-backend-product-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
        gap: 1rem;
      }

      .axtor-backend-product-card {
        border: 1px solid rgba(25, 135, 84, 0.18);
        border-radius: 1rem;
        padding: 1rem;
        background: rgba(255,255,255,0.8);
      }

      .axtor-product-icon {
        height: 56px;
        border-radius: 0.75rem;
        display:flex;
        align-items:center;
        justify-content:center;
        background: linear-gradient(135deg, rgba(16,185,129,0.15), rgba(255,193,7,0.12));
        color:#059669;
        font-size:1.6rem;
        margin-bottom:0.75rem;
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

      .axtor-newly-created-row {
        animation: axtorNewRowPulse 1.2s ease-in-out infinite alternate;
        outline: 2px solid rgba(25, 135, 84, 0.75);
        outline-offset: -2px;
      }

      .axtor-created-row-soft {
        background: rgba(25, 135, 84, 0.08) !important;
      }

      @keyframes axtorNewRowPulse {
        from { background: rgba(25, 135, 84, 0.10); }
        to { background: rgba(255, 193, 7, 0.18); }
      }

      #axtorGlobalLoadingOverlay {
        position: fixed;
        inset: 0;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(255,255,255,0.45);
        backdrop-filter: blur(2px);
        z-index: 1075;
      }

      #axtorGlobalLoadingOverlay.show {
        display: flex;
      }

      .axtor-loading-box {
        min-width: 240px;
        border-radius: 1rem;
        border: 1px solid rgba(25, 135, 84, 0.22);
        background: rgba(255,255,255,0.94);
        padding: 1.25rem;
        text-align: center;
        box-shadow: 0 12px 40px rgba(0,0,0,0.12);
      }

      .axtor-toast-success .toast-header {
        background: rgba(25, 135, 84, 0.12);
      }

      .axtor-toast-danger .toast-header {
        background: rgba(220, 53, 69, 0.12);
      }

      .axtor-toast-warning .toast-header {
        background: rgba(255, 193, 7, 0.18);
      }

      .axtor-toast-info .toast-header {
        background: rgba(13, 202, 240, 0.12);
      }


      .axtor-return-mini-badge {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 0.14rem 0.48rem;
        font-size: 0.72rem;
        font-weight: 800;
        line-height: 1.2;
      }

      .axtor-return-mini-badge.warning {
        color: #7a5b00;
        background: rgba(255, 193, 7, 0.22);
      }

      .axtor-return-mini-badge.danger {
        color: #842029;
        background: rgba(220, 53, 69, 0.14);
      }


      body.retro-theme #axtorSalesBackendPanel,
      body.retro-theme #axtorSalesCreateToolbar,
      body.retro-theme #axtorBackendProductGrid,
      body.retro-theme #axtorBackendCart,
      body.retro-theme #axtorGlobalLoadingOverlay,
      body.retro #axtorSalesBackendPanel,
      body.retro #axtorSalesCreateToolbar,
      body.retro #axtorBackendProductGrid,
      body.retro #axtorBackendCart,
      body.retro #axtorGlobalLoadingOverlay {
        backdrop-filter: none;
      }

      @media (max-width: 768px) {
        .axtor-doc-grid {
          grid-template-columns: 1fr;
        }

        .axtor-backend-product-grid {
          grid-template-columns: 1fr;
        }
      }
    `;

    document.head.appendChild(style);
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
