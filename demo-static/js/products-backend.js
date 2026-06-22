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

    updateProd
