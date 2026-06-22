(function () {
  "use strict";

  function isProductsPage() {
    return window.location.pathname.endsWith("products.html");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function money(value) {
    const amount = Number(value || 0);
    return "QAR " + amount.toFixed(2);
  }

  function numberValue(value, fallback) {
    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
      return fallback || 0;
    }

    return parsed;
  }

  function inputValue(id) {
    const input = document.getElementById(id);
    return input ? String(input.value || "").trim() : "";
  }

  function setInputValue(id, value) {
    const input = document.getElementById(id);

    if (input) {
      input.value = value;
    }
  }

  function stockStatus(product) {
    const stock = Number(product.currentStock ?? product.stock ?? 0);
    const minStock = Number(product.minStock ?? 5);

    if (stock <= 0) {
      return {
        text: "Out",
        className: "badge-danger-soft"
      };
    }

    if (stock <= minStock) {
      return {
        text: "Low",
        className: "badge-danger-soft"
      };
    }

    return {
      text: "In stock",
      className: "badge-paid"
    };
  }

  function productImageCell(product) {
    if (product.imageUrl) {
      return '<img src="' + escapeHtml(product.imageUrl) + '" style="width:42px;height:42px;object-fit:cover;border-radius:8px">';
    }

    return '<span class="quick-icon" style="width:42px;height:42px"><i class="bi bi-box-seam"></i></span>';
  }

  function showProductStatus(message, type) {
    let statusBox = document.getElementById("productBackendStatus");

    if (!statusBox) {
      statusBox = document.createElement("div");
      statusBox.id = "productBackendStatus";
      statusBox.className = "mb-3";

      const target = document.querySelector(".tab-content") || document.querySelector("main.page");

      if (target && target.parentNode) {
        target.parentNode.insertBefore(statusBox, target);
      }
    }

    const alertType = type || "info";

    statusBox.innerHTML =
      '<div class="alert alert-' + alertType + ' py-2 mb-0">' +
      escapeHtml(message) +
      "</div>";
  }

  function updateProductKpis(products) {
    const kpis = document.querySelectorAll("#products-list .kpi-value");

    if (!kpis || kpis.length < 3) {
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
      const stock = Number(product.currentStock ?? product.stock ?? 0);
      const minStock = Number(product.minStock ?? 5);
      return stock <= minStock;
    }).length;

    kpis[0].textContent = String(products.length);
    kpis[1].textContent = String(categories.size);
    kpis[2].textContent = String(lowStock);
  }

  function renderProducts(products) {
    const body = document.getElementById("productsTableBody");

    if (!body) {
      return;
    }

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

    if (!products.length) {
      body.innerHTML = '<tr><td colspan="9" class="text-muted">No backend products found.</td></tr>';
      updateProductKpis(products);
      return;
    }

    body.innerHTML = products.map(function (product) {
      const status = stockStatus(product);
      const stock = Number(product.currentStock ?? product.stock ?? 0);
      const productId = escapeHtml(product.id || "");
      const productName = escapeHtml(product.name || "-");

      return (
        "<tr>" +
          "<td>" + productImageCell(product) + "</td>" +
          "<td>" + escapeHtml(product.sku || "-") + "</td>" +
          "<td>" + productName + "</td>" +
          "<td>" + escapeHtml(product.category || "General") + "</td>" +
          "<td>" +
            escapeHtml(product.barcode || "-") +
            (product.qrCode ? "<br><small class='text-muted'>QR: " + escapeHtml(product.qrCode) + "</small>" : "") +
          "</td>" +
          "<td>" + money(product.price) + "</td>" +
          "<td>" + stock + "</td>" +
          "<td><span class='badge-soft " + status.className + "'>" + status.text + "</span></td>" +
          "<td>" +
            "<button class='btn btn-sm btn-soft text-danger' type='button' data-backend-product-delete='" + productId + "' data-backend-product-name='" + productName + "'>" +
              "Delete" +
            "</button>" +
          "</td>" +
        "</tr>"
      );
    }).join("");

    updateProductKpis(products);
  }

  async function loadProducts() {
    if (!isProductsPage()) {
      return;
    }

    const body = document.getElementById("productsTableBody");

    if (body) {
      body.innerHTML = '<tr><td colspan="9" class="text-muted">Loading backend products...</td></tr>';
    }

    try {
      const response = await window.AxtorAPI.apiGet("/api/v1/products");
      const products = response.products || [];
      renderProducts(products);
      return response;
    } catch (error) {
      console.error("Products backend load failed:", error);

      if (body) {
        body.innerHTML = '<tr><td colspan="9" class="text-danger">Failed to load backend products.</td></tr>';
      }

      throw error;
    }
  }

  function clearProductForm() {
    setInputValue("productNameInput", "");
    setInputValue("productSkuInput", "");
    setInputValue("productBarcodeInput", "");
    setInputValue("productQrCodeInput", "");
    setInputValue("productSalePriceInput", "0.00");
    setInputValue("productOpeningStockInput", "0");
    setInputValue("productCostPriceInput", "");

    const imagePreview = document.getElementById("productImagePreview");

    if (imagePreview) {
      imagePreview.innerHTML = '<i class="bi bi-image text-muted"></i>';
      delete imagePreview.dataset.imageData;
    }
  }

  async function saveProductToBackend(event) {
    event.preventDefault();
    event.stopPropagation();

    const saveButton = document.getElementById("saveProductBtn");

    const name = inputValue("productNameInput");

    if (!name) {
      showProductStatus("Product name is required.", "warning");
      return;
    }

    const sku = inputValue("productSkuInput") || "SKU-" + Date.now().toString().slice(-6);
    const barcode = inputValue("productBarcodeInput");
    const qrCode = inputValue("productQrCodeInput");
    const category = inputValue("productCategoryInput") || "General";
    const price = numberValue(inputValue("productSalePriceInput"), 0);
    const costPrice = numberValue(inputValue("productCostPriceInput"), 0);
    const openingStock = numberValue(inputValue("productOpeningStockInput"), 0);

    const payload = {
      sku: sku,
      name: name,
      barcode: barcode || undefined,
      qrCode: qrCode || undefined,
      category: category,
      unit: "PCS",
      price: price,
      costPrice: costPrice,
      openingStock: openingStock,
      currentStock: openingStock,
      active: true
    };

    const oldButtonText = saveButton ? saveButton.innerHTML : "";

    try {
      if (saveButton) {
        saveButton.disabled = true;
        saveButton.innerHTML = "Saving to backend...";
      }

      showProductStatus("Saving product to backend...", "info");

      const response = await window.AxtorAPI.apiPost("/api/v1/products", payload);

      showProductStatus("Product saved to backend successfully.", "success");
      clearProductForm();
      await loadProducts();

      return response;
    } catch (error) {
      console.error("Save product failed:", error);
      showProductStatus("Product save failed. Check SKU duplicate or console error.", "danger");
      throw error;
    } finally {
      if (saveButton) {
        saveButton.disabled = false;
        saveButton.innerHTML = oldButtonText || "Save Product";
      }
    }
  }

  async function deleteProductFromBackend(productId, productName, button) {
    if (!productId) {
      showProductStatus("Product id missing. Cannot delete.", "danger");
      return;
    }

    const confirmed = window.confirm("Delete this product from backend?\n\n" + productName);

    if (!confirmed) {
      return;
    }

    const oldButtonText = button ? button.innerHTML : "";

    try {
      if (button) {
        button.disabled = true;
        button.innerHTML = "Deleting...";
      }

      showProductStatus("Deleting product from backend...", "info");

      const response = await window.AxtorAPI.apiDelete("/api/v1/products/" + encodeURIComponent(productId));

      showProductStatus("Product deleted from backend successfully.", "success");
      await loadProducts();

      return response;
    } catch (error) {
      console.error("Delete product failed:", error);
      showProductStatus("Product delete failed. Check console.", "danger");
      throw error;
    } finally {
      if (button) {
        button.disabled = false;
        button.innerHTML = oldButtonText || "Delete";
      }
    }
  }

  function bindSaveProductButton() {
    const oldButton = document.getElementById("saveProductBtn");

    if (!oldButton) {
      return;
    }

    if (oldButton.dataset.axtorBackendBound === "1") {
      return;
    }

    const newButton = oldButton.cloneNode(true);
    newButton.dataset.axtorBackendBound = "1";

    oldButton.parentNode.replaceChild(newButton, oldButton);

    newButton.addEventListener("click", saveProductToBackend);
  }

  function bindDeleteProductButtons() {
    if (document.body.dataset.axtorBackendDeleteBound === "1") {
      return;
    }

    document.body.dataset.axtorBackendDeleteBound = "1";

    document.addEventListener("click", function (event) {
      const button = event.target.closest("[data-backend-product-delete]");

      if (!button) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const productId = button.getAttribute("data-backend-product-delete");
      const productName = button.getAttribute("data-backend-product-name") || "this product";

      deleteProductFromBackend(productId, productName, button);
    });
  }

  window.AxtorProductsBackend = {
    loadProducts: loadProducts,
    renderProducts: renderProducts,
    saveProductToBackend: saveProductToBackend,
    deleteProductFromBackend: deleteProductFromBackend
  };

  document.addEventListener("DOMContentLoaded", function () {
    setTimeout(function () {
      bindSaveProductButton();
      bindDeleteProductButtons();
      loadProducts();
    }, 150);
  });
})();
