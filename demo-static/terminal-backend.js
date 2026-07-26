(function () {
  "use strict";

  const PRODUCTS_PATH = "/api/v1/products";
  let productsCache = [];

  function onProductsPage() {
    return Boolean(document.getElementById("productsTableBody"));
  }

  function apiReady() {
    return window.AxtorAPI &&
      typeof window.AxtorAPI.apiGet === "function" &&
      typeof window.AxtorAPI.apiPost === "function" &&
      typeof window.AxtorAPI.apiPatch === "function" &&
      typeof window.AxtorAPI.apiDelete === "function";
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function toNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : (fallback || 0);
  }

  function input(id) {
    const el = document.getElementById(id);
    return el ? String(el.value || "").trim() : "";
  }

  function setInput(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value ?? "";
  }

  function skuOf(product) {
    return product.sku || product.code || product.itemCode || product.productCode || "-";
  }

  function stockOf(product) {
    return toNumber(product.currentStock ?? product.stock ?? product.openingStock, 0);
  }

  function minStockOf(product) {
    return toNumber(product.minStock, 5);
  }

  function money(value) {
    return "QAR " + toNumber(value, 0).toFixed(2);
  }

  function message(text, type) {
    let box = document.getElementById("productBackendStatus");

    if (!box) {
      box = document.createElement("div");
      box.id = "productBackendStatus";
      box.className = "mb-3";

      const target = document.querySelector(".tab-content") || document.querySelector("main.page");

      if (target && target.parentNode) {
        target.parentNode.insertBefore(box, target);
      }
    }

    box.innerHTML =
      '<div class="alert alert-' + esc(type || "info") + ' py-2 mb-0">' +
      esc(text) +
      "</div>";
  }

  function apiErrorText(error, fallback) {
    if (error && error.message && error.message !== "API request failed") {
      return error.message;
    }

    return fallback;
  }

  function setLoading(text, className) {
    const body = document.getElementById("productsTableBody");

    if (body) {
      body.innerHTML =
        '<tr><td colspan="9" class="' +
        esc(className || "text-muted") +
        '">' +
        esc(text) +
        "</td></tr>";
    }
  }

  function normalizeProducts(response) {
    if (response && Array.isArray(response.products)) {
      return response.products;
    }

    if (response && Array.isArray(response.data)) {
      return response.data;
    }

    if (Array.isArray(response)) {
      return response;
    }

    return [];
  }

  function updateKpis(products) {
    const values = document.querySelectorAll("#products-list .kpi-value");

    if (!values || values.length < 3) {
      return;
    }

    const categories = new Set(
      products
        .map(function (product) {
          return product.category || "General";
        })
        .filter(Boolean)
    );

    const lowStock = products.filter(function (product) {
      return stockOf(product) <= minStockOf(product);
    }).length;

    values[0].textContent = String(products.length);
    values[1].textContent = String(categories.size);
    values[2].textContent = String(lowStock);
  }

  function statusBadge(product) {
    const stock = stockOf(product);
    const minStock = minStockOf(product);

    if (stock <= 0) {
      return '<span class="badge-soft badge-danger-soft">Out</span>';
    }

    if (stock <= minStock) {
      return '<span class="badge-soft badge-danger-soft">Low</span>';
    }

    return '<span class="badge-soft badge-paid">In stock</span>';
  }

  function imageCell(product) {
    if (product.imageUrl) {
      return (
        '<img src="' +
        esc(product.imageUrl) +
        '" alt="" style="width:42px;height:42px;object-fit:cover;border-radius:8px">'
      );
    }

    return '<span class="quick-icon" style="width:42px;height:42px"><i class="bi bi-box-seam"></i></span>';
  }

  function renderProducts(products) {
    const body = document.getElementById("productsTableBody");

    if (!body) {
      return;
    }

    productsCache = Array.isArray(products) ? products.slice() : [];

    const table = body.closest("table");
    const header = table ? table.querySelector("thead tr") : null;

    if (header) {
      header.innerHTML =
        "<th>Image</th>" +
        "<th>SKU</th>" +
        "<th>Name</th>" +
        "<th>Category</th>" +
        "<th>Barcode / QR</th>" +
        "<th>Price</th>" +
        "<th>Stock</th>" +
        "<th>Status</th>" +
        "<th>Actions</th>";
    }

    if (!productsCache.length) {
      body.innerHTML = '<tr><td colspan="9" class="text-muted">No backend products found.</td></tr>';
      updateKpis(productsCache);
      return;
    }

    body.innerHTML = productsCache.map(function (product) {
      const id = esc(product.id || "");
      const name = esc(product.name || "-");
      const barcode = product.barcode || "-";
      const qrCode = product.qrCode || "";

      return (
        "<tr>" +
          "<td>" + imageCell(product) + "</td>" +
          "<td>" + esc(skuOf(product)) + "</td>" +
          "<td>" + name + "</td>" +
          "<td>" + esc(product.category || "General") + "</td>" +
          "<td>" +
            esc(barcode) +
            (qrCode ? "<br><small class='text-muted'>QR: " + esc(qrCode) + "</small>" : "") +
          "</td>" +
          "<td>" + money(product.price) + "</td>" +
          "<td>" + esc(stockOf(product)) + "</td>" +
          "<td>" + statusBadge(product) + "</td>" +
          "<td>" +
            "<div class='d-flex gap-2 flex-wrap'>" +
              "<button class='btn btn-sm btn-outline-primary' type='button' data-product-edit='" + id + "'>Edit</button>" +
              "<button class='btn btn-sm btn-outline-danger' type='button' data-product-delete='" + id + "' data-product-name='" + name + "'>Delete</button>" +
            "</div>" +
          "</td>" +
        "</tr>"
      );
    }).join("");

    updateKpis(productsCache);
  }

  async function loadProducts() {
    if (!onProductsPage()) {
      return null;
    }

    if (!apiReady()) {
      console.error("AxtorAPI helper missing. Load js/axtor-api.js before products-backend.js.");
      setLoading("Backend API helper missing.", "text-danger");
      message("Backend API helper missing. Check products.html script order.", "danger");
      return null;
    }

    try {
      setLoading("Loading backend products...", "text-muted");

      const response = await window.AxtorAPI.apiGet(PRODUCTS_PATH);
      const products = normalizeProducts(response);

      renderProducts(products);

      return response;
    } catch (error) {
      console.error("Products GET failed:", error);
      setLoading("Failed to load backend products.", "text-danger");
      message(apiErrorText(error, "Failed to load backend products."), "danger");
      return null;
    }
  }

  function clearForm() {
    setInput("productNameInput", "");
    setInput("productSkuInput", "");
    setInput("productBarcodeInput", "");
    setInput("productQrCodeInput", "");
    setInput("productSalePriceInput", "0.00");
    setInput("productCostPriceInput", "0.00");
    setInput("productOpeningStockInput", "0");
  }

  function saveButton() {
    return document.getElementById("saveProductBtn");
  }

  function addProductTabButton() {
    return document.querySelector('[data-bs-target="#add-product"]') || document.querySelector('[href="#add-product"]');
  }

  function setTabLabel(text) {
    const btn = addProductTabButton();

    if (btn) {
      btn.textContent = text;
    }
  }

  function setFormTitle(text) {
    const pane = document.getElementById("add-product");
    const title = pane ? pane.querySelector(".cardx-title, h5") : null;

    if (title) {
      title.textContent = text;
    }
  }

  function openAddProductTab() {
    const btn = addProductTabButton();

    if (btn && window.bootstrap && window.bootstrap.Tab) {
      window.bootstrap.Tab.getOrCreateInstance(btn).show();
    } else if (btn) {
      btn.click();
    }
  }

  function ensureCancelButton() {
    const btn = saveButton();

    if (!btn || document.getElementById("cancelProductEditBtn")) {
      return;
    }

    const cancel = document.createElement("button");
    cancel.id = "cancelProductEditBtn";
    cancel.type = "button";
    cancel.className = "btn btn-outline-secondary ms-2 d-none";
    cancel.textContent = "Cancel Edit";

    btn.insertAdjacentElement("afterend", cancel);

    cancel.addEventListener("click", function () {
      clearEditMode();
      clearForm();
      message("Edit cancelled.", "info");
    });
  }

  function setEditMode(productId) {
    const btn = saveButton();
    const cancel = document.getElementById("cancelProductEditBtn");

    if (btn) {
      btn.dataset.editProductId = productId;
      btn.innerHTML = "Update Product";
    }

    if (cancel) {
      cancel.classList.remove("d-none");
    }

    setTabLabel("Edit Product");
    setFormTitle("Edit Product");
  }

  function clearEditMode() {
    const btn = saveButton();
    const cancel = document.getElementById("cancelProductEditBtn");

    if (btn) {
      delete btn.dataset.editProductId;
      btn.innerHTML = "Save Product";
    }

    if (cancel) {
      cancel.classList.add("d-none");
    }

    setTabLabel("Add New Product");
    setFormTitle("Add New Product");
  }

  function ensureCategory(category) {
    const select = document.getElementById("productCategoryInput");
    const value = String(category || "General").trim() || "General";

    if (!select) {
      return;
    }

    const exists = Array.from(select.options).some(function (option) {
      return option.value === value || option.textContent === value;
    });

    if (!exists) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    }

    select.value = value;
  }

  function fillForm(product) {
    setInput("productNameInput", product.name || "");
    setInput("productSkuInput", skuOf(product) === "-" ? "" : skuOf(product));
    setInput("productBarcodeInput", product.barcode || "");
    setInput("productQrCodeInput", product.qrCode || "");
    ensureCategory(product.category || "General");
    setInput("productSalePriceInput", toNumber(product.price, 0).toFixed(2));
    setInput("productCostPriceInput", toNumber(product.costPrice, 0).toFixed(2));
    setInput("productOpeningStockInput", String(stockOf(product)));
  }

  function getPayload(isEdit) {
    const name = input("productNameInput");

    if (!name) {
      message("Product name is required.", "warning");
      return null;
    }

    const openingStock = toNumber(input("productOpeningStockInput"), 0);

    const payload = {
      sku: input("productSkuInput") || "SKU-" + Date.now().toString().slice(-6),
      name: name,
      barcode: input("productBarcodeInput") || undefined,
      qrCode: input("productQrCodeInput") || undefined,
      category: input("productCategoryInput") || "General",
      unit: "PCS",
      price: toNumber(input("productSalePriceInput"), 0),
      costPrice: toNumber(input("productCostPriceInput"), 0),
      openingStock: openingStock,
      currentStock: openingStock,
      active: true
    };

    if (isEdit) {
      delete payload.active;
    }

    return payload;
  }

  async function saveProduct(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (!apiReady()) {
      message("Backend API helper missing. Check products.html script order.", "danger");
      return null;
    }

    const btn = saveButton();
    const editId = btn ? btn.dataset.editProductId : "";
    const isEdit = Boolean(editId);
    const payload = getPayload(isEdit);

    if (!payload) {
      return null;
    }

    try {
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = isEdit ? "Updating backend..." : "Saving to backend...";
      }

      const response = isEdit
        ? await window.AxtorAPI.apiPatch(PRODUCTS_PATH + "/" + encodeURIComponent(editId), payload)
        : await window.AxtorAPI.apiPost(PRODUCTS_PATH, payload);

      message(isEdit ? "Product updated in backend successfully." : "Product saved to backend successfully.", "success");

      clearEditMode();
      clearForm();
      await loadProducts();

      return response;
    } catch (error) {
      console.error(isEdit ? "Product PATCH failed:" : "Product POST failed:", error);

      message(
        apiErrorText(
          error,
          isEdit
            ? "Product update failed. Check duplicate SKU or console."
            : "Product save failed. Check duplicate SKU or console."
        ),
        "danger"
      );

      return null;
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = btn.dataset.editProductId ? "Update Product" : "Save Product";
      }
    }
  }

  async function editProduct(productId) {
    const product = productsCache.find(function (item) {
      return String(item.id || "") === String(productId || "");
    });

    if (!product) {
      message("Product not found in current list. Reload page and try again.", "warning");
      return;
    }

    ensureCancelButton();
    fillForm(product);
    setEditMode(productId);
    openAddProductTab();

    message("Editing product: " + (product.name || skuOf(product)), "info");
  }

  async function deleteProduct(productId, productName, btn) {
    if (!productId) {
      message("Product id missing. Cannot delete.", "danger");
      return null;
    }

    const ok = window.confirm("Delete this product from backend?\n\n" + productName);

    if (!ok) {
      return null;
    }

    if (!apiReady()) {
      message("Backend API helper missing. Check products.html script order.", "danger");
      return null;
    }

    const oldText = btn ? btn.innerHTML : "Delete";

    try {
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = "Deleting...";
      }

      const response = await window.AxtorAPI.apiDelete(PRODUCTS_PATH + "/" + encodeURIComponent(productId));

      message("Product deleted from backend successfully.", "success");

      await loadProducts();

      return response;
    } catch (error) {
      console.error("Product DELETE failed:", error);
      message(apiErrorText(error, "Product delete failed. Check console."), "danger");
      return null;
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = oldText;
      }
    }
  }

  function bindSaveButton() {
    const oldBtn = saveButton();

    if (!oldBtn || oldBtn.dataset.backendBound === "1") {
      return;
    }

    const newBtn = oldBtn.cloneNode(true);
    newBtn.dataset.backendBound = "1";

    oldBtn.parentNode.replaceChild(newBtn, oldBtn);

    newBtn.addEventListener("click", saveProduct);

    ensureCancelButton();
  }

  function bindActions() {
    if (document.body.dataset.productsBackendActionsBound === "1") {
      return;
    }

    document.body.dataset.productsBackendActionsBound = "1";

    document.addEventListener("click", function (event) {
      const editBtn = event.target.closest("[data-product-edit]");

      if (editBtn) {
        event.preventDefault();
        event.stopPropagation();

        editProduct(editBtn.getAttribute("data-product-edit"));
        return;
      }

      const delBtn = event.target.closest("[data-product-delete]");

      if (delBtn) {
        event.preventDefault();
        event.stopPropagation();

        deleteProduct(
          delBtn.getAttribute("data-product-delete"),
          delBtn.getAttribute("data-product-name") || "this product",
          delBtn
        );
      }
    });
  }

  function boot() {
    if (!onProductsPage()) {
      return;
    }

    bindSaveButton();
    bindActions();
    loadProducts();
  }

  window.AxtorProductsBackend = {
    loadProducts: loadProducts,
    renderProducts: renderProducts,
    saveProductToBackend: saveProduct,
    editProduct: editProduct,
    deleteProductFromBackend: deleteProduct
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
