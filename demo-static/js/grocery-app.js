(function () {
  "use strict";

  const PAGE = document.body.dataset.page || "dashboard";
  const NAV = [
    ["grocery-dashboard.html", "Dashboard"],
    ["grocery-terminal.html", "FEFO Checkout"],
    ["grocery-products.html", "Products & PLU"],
    ["grocery-batches.html", "Batches"],
    ["grocery-expiry.html", "Expiry Control"],
    ["grocery-receiving.html", "Receiving"],
    ["grocery-waste.html", "Waste & Spoilage"],
    ["grocery-recalls.html", "Recalls"],
    ["grocery-reports.html", "Reports"],
    ["grocery-settings.html", "Settings"]
  ];

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char];
    });
  }

  function unwrap(value) {
    if (!value) return value;
    if (Object.prototype.hasOwnProperty.call(value, "data")) return value.data;
    if (Object.prototype.hasOwnProperty.call(value, "products")) return value.products;
    return value;
  }

  async function request(method, path, body, idempotent) {
    const headers = { Accept: "application/json", Authorization: "Bearer " + AxtorAPI.getToken() };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (idempotent) headers["Idempotency-Key"] = "grocery:" + path + ":" + Date.now() + ":" + Math.random().toString(36).slice(2);
    const response = await fetch(AxtorAPI.getApiBaseUrl() + path, {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store"
    });
    const payload = await response.json().catch(function () { return null; });
    if (response.status === 401) {
      AxtorAPI.goToLogin("session-expired", { clearToken: true });
      throw new Error("Session expired.");
    }
    if (!response.ok) throw new Error(payload?.error?.message || "Grocery request failed");
    return unwrap(payload);
  }

  function shell(title, subtitle) {
    const current = window.location.pathname.split("/").pop();
    const links = NAV.map(function (item) {
      return '<a class="' + (item[0] === current ? "active" : "") + '" href="' + item[0] + '">' + esc(item[1]) + "</a>";
    }).join("");
    document.body.innerHTML = '<div class="g-shell"><aside class="g-nav"><div class="g-brand">AXTOR · GROCERY</div>' + links + '</aside><main class="g-main"><section class="g-hero"><h1>' + esc(title) + "</h1><p>" + esc(subtitle) + '</p></section><div id="app"></div></main></div>';
  }

  async function verifyTenant() {
    const registry = unwrap(await AxtorAPI.apiGet("/api/v1/industry/registry", { cache: false })) || {};
    const code = String(registry.selection?.code || registry.selected?.code || "").toLowerCase();
    if (code !== "grocery") throw new Error("This application is available only to Grocery tenants.");
  }

  function shown(value) {
    if (value === null || value === undefined || value === "") return "—";
    const text = String(value);
    if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return new Date(text).toLocaleString();
    return text;
  }

  function fieldHtml(field) {
    const required = field.required ? " required" : "";
    if (field.type === "select") {
      return '<div><label>' + esc(field.label) + '</label><select name="' + field.name + '"' + required + '><option value="">Select</option>' + field.options.map(function (option) {
        return '<option value="' + esc(option) + '">' + esc(option) + "</option>";
      }).join("") + "</select></div>";
    }
    if (field.type === "textarea") return '<div><label>' + esc(field.label) + '</label><textarea name="' + field.name + '"' + required + '></textarea></div>';
    return '<div><label>' + esc(field.label) + '</label><input name="' + field.name + '" type="' + field.type + '"' + required + '></div>';
  }

  function formPanel(id, title, fields, button) {
    return '<section class="g-panel"><h2>' + esc(title) + '</h2><form id="' + id + '" class="g-form">' + fields.map(fieldHtml).join("") + '<div class="g-actions"><button class="g-btn" type="submit">' + esc(button || "Save") + '</button></div></form><div id="' + id + 'Status" class="g-status"></div></section>';
  }

  function tablePanel(id, title, columns) {
    return '<section class="g-panel"><div class="g-toolbar"><h2>' + esc(title) + '</h2><input class="g-search" data-search="' + id + '" placeholder="Search records"></div><div class="g-table-wrap"><table class="g-table"><thead><tr>' + columns.map(function (column) { return "<th>" + esc(column[1]) + "</th>"; }).join("") + '</tr></thead><tbody id="' + id + '"><tr><td colspan="' + columns.length + '">Loading…</td></tr></tbody></table></div></section>';
  }

  function nested(row, path) {
    return path.split(".").reduce(function (current, key) { return current == null ? current : current[key]; }, row);
  }

  function renderRows(id, rows, columns) {
    const query = String(document.querySelector('[data-search="' + id + '"]')?.value || "").toLowerCase();
    const filtered = query ? rows.filter(function (row) { return JSON.stringify(row).toLowerCase().includes(query); }) : rows;
    document.getElementById(id).innerHTML = filtered.map(function (row) {
      return "<tr>" + columns.map(function (column) { return "<td>" + esc(shown(nested(row, column[0]))) + "</td>"; }).join("") + "</tr>";
    }).join("") || '<tr><td colspan="' + columns.length + '">No records found.</td></tr>';
  }

  function formPayload(form) {
    const result = Object.fromEntries(new FormData(form).entries());
    const numeric = new Set(["price", "costPrice", "minStock", "openingStock", "qtyOnHandBase", "qtyReservedBase", "costPerBaseUnit", "unitsPerStockUnit", "quantity", "amount", "daysBefore"]);
    Object.keys(result).forEach(function (key) {
      if (result[key] === "true") result[key] = true;
      else if (result[key] === "false") result[key] = false;
      else if (numeric.has(key) && result[key] !== "") result[key] = Number(result[key]);
    });
    return result;
  }

  function bind(id, method, pathBuilder, transform, reload, idempotent) {
    document.getElementById(id).addEventListener("submit", async function (event) {
      event.preventDefault();
      const status = document.getElementById(id + "Status");
      status.textContent = "Saving…";
      status.className = "g-status";
      try {
        let body = formPayload(event.currentTarget);
        if (transform) body = transform(body);
        const path = typeof pathBuilder === "function" ? pathBuilder(body) : pathBuilder;
        await request(method, path, body, idempotent);
        status.textContent = "Saved successfully.";
        status.className = "g-status ok";
        event.currentTarget.reset();
        if (reload) await reload();
      } catch (error) {
        status.textContent = error.message || "Save failed";
        status.className = "g-status error";
      }
    });
  }

  async function loadBatches(query) {
    return await request("GET", "/api/v1/industry/batches?limit=500" + (query || ""));
  }

  async function dashboard() {
    shell("Grocery Operations Dashboard", "Barcode checkout, expiry rotation, waste and recall control");
    const values = await Promise.all([
      request("GET", "/api/v1/dashboard/summary"),
      loadBatches(""),
      request("GET", "/api/v1/industry/records?entityType=grocery_waste&limit=500"),
      request("GET", "/api/v1/industry/records?entityType=grocery_recall&limit=500")
    ]);
    const summary = values[0] || {};
    const batches = values[1] || [];
    const waste = values[2] || [];
    const recalls = values[3] || [];
    const now = Date.now();
    const nearLimit = now + 30 * 86400000;
    const nearExpiry = batches.filter(function (row) {
      const expiry = row.expiryDate ? new Date(row.expiryDate).getTime() : 0;
      return expiry >= now && expiry <= nearLimit;
    }).length;
    const blocked = batches.filter(function (row) {
      return ["expired", "quarantined", "recalled", "damaged"].includes(String(row.status || "").toLowerCase());
    }).length;
    document.getElementById("app").innerHTML = '<div class="g-kpis"><div class="g-kpi"><span>Today Sales</span><strong>' + esc(Number(summary.today?.sales || 0).toFixed(2)) + '</strong></div><div class="g-kpi"><span>Expiring in 30 Days</span><strong>' + nearExpiry + '</strong></div><div class="g-kpi"><span>Blocked Batches</span><strong>' + blocked + '</strong></div><div class="g-kpi"><span>Open Recalls</span><strong>' + recalls.filter(function (row) { return row.status !== "closed"; }).length + '</strong></div></div><section class="g-panel"><h2>Fresh Stock Control</h2><p>Waste records: <strong>' + waste.length + '</strong></p><div class="g-note">Checkout selects the earliest saleable expiry batch. Expired, recalled, quarantined and damaged stock cannot be posted.</div></section>';
  }

  async function terminal() {
    shell("FEFO Grocery Checkout", "Barcode, PLU and expiry-first batch selection");
    document.getElementById("app").innerHTML = '<div class="g-terminal"><section class="g-panel"><div class="g-toolbar"><h2>Products</h2><input id="productSearch" class="g-search" placeholder="Search barcode, PLU, SKU or name"></div><div id="productList" class="g-list">Loading…</div></section><section class="g-panel"><h2>Cart</h2><div id="cart"></div><form id="checkoutForm" class="g-form"><div><label>Customer ID</label><input name="customerId" type="text"></div><div><label>Payment method</label><select name="paymentMethod"><option value="cash">Cash</option><option value="card">Card</option><option value="credit">Credit</option></select></div><div><label>Paid amount</label><input name="paidAmount" type="number" value="0"></div><div class="g-actions"><button class="g-btn" type="submit">Post Sale</button></div></form><div id="checkoutStatus" class="g-status"></div></section></div>';
    const values = await Promise.all([request("GET", "/api/v1/products?active=true"), loadBatches("")]);
    const products = values[0] || [];
    const batches = values[1] || [];
    const cart = [];

    function saleableBatch(productId) {
      const now = Date.now();
      return batches.filter(function (batch) {
        const status = String(batch.status || "").toLowerCase();
        const expiry = batch.expiryDate ? new Date(batch.expiryDate).getTime() : Infinity;
        return batch.productId === productId && ["available", "near_expiry"].includes(status) && expiry >= now && Number(batch.qtyOnHandBase || 0) > Number(batch.qtyReservedBase || 0);
      }).sort(function (a, b) { return new Date(a.expiryDate || "2999-12-31") - new Date(b.expiryDate || "2999-12-31"); })[0] || null;
    }

    function renderProducts() {
      const query = String(document.getElementById("productSearch").value || "").toLowerCase();
      const rows = products.filter(function (product) { return JSON.stringify(product).toLowerCase().includes(query); }).slice(0, 100);
      document.getElementById("productList").innerHTML = rows.map(function (product) {
        const batch = saleableBatch(product.id);
        return '<div class="g-item"><span><strong>' + esc(product.name) + '</strong><br><small>' + esc(product.sku) + ' · ' + esc(product.barcode || product.customFields?.plu || "No barcode") + ' · ' + esc(product.price) + '</small><br>' + (batch ? '<span class="g-badge">FEFO ' + esc(batch.batchNo) + ' · ' + esc(new Date(batch.expiryDate).toLocaleDateString()) + '</span>' : '<span class="g-badge blocked">No saleable batch</span>') + '</span><button type="button" data-add="' + esc(product.id) + '"' + (batch ? "" : " disabled") + '>Add</button></div>';
      }).join("") || "No matching products.";
    }

    function renderCart() {
      document.getElementById("cart").innerHTML = cart.map(function (item, index) {
        return '<div class="g-cart-row"><span>' + esc(item.name) + '<br><small>' + esc(item.batchNo) + '</small></span><input data-qty="' + index + '" type="number" min="0.001" step="0.001" value="' + item.qty + '"><input data-rate="' + index + '" type="number" min="0" step="0.01" value="' + item.rate + '"><button type="button" data-remove="' + index + '">×</button></div>';
      }).join("") || '<p class="g-note">Cart is empty.</p>';
    }

    document.getElementById("productSearch").addEventListener("input", renderProducts);
    document.getElementById("productList").addEventListener("click", function (event) {
      const button = event.target.closest("[data-add]");
      if (!button || button.disabled) return;
      const product = products.find(function (row) { return row.id === button.dataset.add; });
      const batch = saleableBatch(product.id);
      if (!batch) return;
      const existing = cart.find(function (row) { return row.productId === product.id && row.inventoryBatchId === batch.id; });
      if (existing) existing.qty += 1;
      else cart.push({ productId: product.id, inventoryBatchId: batch.id, batchNo: batch.batchNo, name: product.name, qty: 1, rate: Number(product.price || 0) });
      renderCart();
    });
    document.getElementById("cart").addEventListener("input", function (event) {
      if (event.target.dataset.qty !== undefined) cart[Number(event.target.dataset.qty)].qty = Number(event.target.value);
      if (event.target.dataset.rate !== undefined) cart[Number(event.target.dataset.rate)].rate = Number(event.target.value);
    });
    document.getElementById("cart").addEventListener("click", function (event) {
      const button = event.target.closest("[data-remove]");
      if (!button) return;
      cart.splice(Number(button.dataset.remove), 1);
      renderCart();
    });
    document.getElementById("checkoutForm").addEventListener("submit", async function (event) {
      event.preventDefault();
      const status = document.getElementById("checkoutStatus");
      try {
        if (!cart.length) throw new Error("Cart is empty");
        const form = Object.fromEntries(new FormData(event.currentTarget).entries());
        const total = cart.reduce(function (sum, item) { return sum + item.qty * item.rate; }, 0);
        const paidAmount = form.paymentMethod === "credit" ? Number(form.paidAmount || 0) : (Number(form.paidAmount || 0) || total);
        await request("POST", "/api/v1/sales-documents", {
          documentType: "invoice",
          postingMode: "post",
          customerId: form.customerId || null,
          customerName: form.customerId ? undefined : "Walk-in Customer",
          paymentMethod: form.paymentMethod,
          paidAmount: paidAmount,
          salesChannel: "grocery_fefo_terminal",
          items: cart.map(function (item) { return { productId: item.productId, inventoryBatchId: item.inventoryBatchId, qty: item.qty, rate: item.rate, discount: 0, taxRate: 0 }; })
        }, true);
        cart.splice(0, cart.length);
        renderCart();
        status.textContent = "Sale posted successfully.";
        status.className = "g-status ok";
      } catch (error) {
        status.textContent = error.message || "Sale failed";
        status.className = "g-status error";
      }
    });
    renderProducts();
    renderCart();
  }

  async function products() {
    shell("Grocery Products & PLU", "Barcode, weighted-item, unit and expiry-tracking setup");
    const columns = [["sku", "SKU"], ["barcode", "Barcode"], ["name", "Product"], ["category", "Category"], ["unit", "Unit"], ["price", "Price"], ["currentStock", "Stock"]];
    document.getElementById("app").innerHTML = formPanel("productForm", "Add Grocery Product", [
      { name: "sku", label: "SKU", type: "text", required: true },
      { name: "barcode", label: "Barcode / GTIN", type: "text" },
      { name: "name", label: "Product name", type: "text", required: true },
      { name: "category", label: "Category", type: "text" },
      { name: "unit", label: "Unit", type: "select", options: ["PCS", "PACK", "CARTON", "KG", "GRAM", "LITRE"] },
      { name: "price", label: "Selling price", type: "number" },
      { name: "costPrice", label: "Cost price", type: "number" },
      { name: "minStock", label: "Minimum stock", type: "number" },
      { name: "openingStock", label: "Opening stock", type: "number" },
      { name: "plu", label: "PLU", type: "text" },
      { name: "weighted", label: "Weighted item", type: "select", options: ["true", "false"] },
      { name: "expiryTracking", label: "Expiry tracking", type: "select", options: ["true", "false"] }
    ]) + tablePanel("productRows", "Products", columns);
    let rows = [];
    const load = async function () { rows = await request("GET", "/api/v1/products?active=true"); renderRows("productRows", rows, columns); };
    bind("productForm", "POST", "/api/v1/products", function (body) {
      body.customFields = { plu: body.plu || null, weighted: body.weighted === true, expiryTracking: body.expiryTracking !== false };
      delete body.plu; delete body.weighted; delete body.expiryTracking;
      return body;
    }, load, false);
    await load();
  }

  async function batchPage(title, subtitle, filter) {
    shell(title, subtitle);
    const columns = [["product.name", "Product"], ["batchNo", "Batch"], ["warehouse.name", "Warehouse"], ["expiryDate", "Expiry"], ["qtyOnHandBase", "On Hand"], ["qtyReservedBase", "Reserved"], ["status", "Status"]];
    document.getElementById("app").innerHTML = tablePanel("batchRows", "Batches", columns);
    let rows = await loadBatches(filter || "");
    if (PAGE === "expiry") rows = rows.filter(function (row) { return row.expiryDate; }).sort(function (a, b) { return new Date(a.expiryDate) - new Date(b.expiryDate); });
    renderRows("batchRows", rows, columns);
  }

  async function receiving() {
    shell("Grocery Receiving", "Create supplier lots with expiry, stock units and costs");
    const columns = [["product.name", "Product"], ["batchNo", "Batch"], ["expiryDate", "Expiry"], ["qtyOnHandBase", "Quantity"], ["costPerBaseUnit", "Unit Cost"], ["status", "Status"]];
    document.getElementById("app").innerHTML = formPanel("batchForm", "Receive Batch", [
      { name: "productId", label: "Product ID", type: "text", required: true },
      { name: "warehouseId", label: "Warehouse ID", type: "text", required: true },
      { name: "batchNo", label: "Batch / lot", type: "text", required: true },
      { name: "gtin", label: "GTIN", type: "text" },
      { name: "productionDate", label: "Production date", type: "date" },
      { name: "bestBeforeDate", label: "Best before", type: "date" },
      { name: "expiryDate", label: "Expiry date", type: "date", required: true },
      { name: "smallestUnit", label: "Smallest unit", type: "text" },
      { name: "unitsPerStockUnit", label: "Units per stock unit", type: "number" },
      { name: "qtyOnHandBase", label: "Quantity base units", type: "number" },
      { name: "costPerBaseUnit", label: "Cost per base unit", type: "number" }
    ], "Receive Stock") + tablePanel("batchRows", "Recent Batches", columns);
    let rows = [];
    const load = async function () { rows = await loadBatches(""); renderRows("batchRows", rows.slice(0, 200), columns); };
    bind("batchForm", "POST", "/api/v1/industry/batches", null, load, true);
    await load();
  }

  async function recordsPage(type, title, subtitle, fields, columns) {
    shell(title, subtitle);
    document.getElementById("app").innerHTML = formPanel("recordForm", "Create Record", fields, "Save") + tablePanel("recordRows", "Records", columns);
    let rows = [];
    const load = async function () { rows = await request("GET", "/api/v1/industry/records?entityType=" + encodeURIComponent(type) + "&limit=500"); renderRows("recordRows", rows, columns); };
    bind("recordForm", "POST", "/api/v1/industry/records", function (body) {
      return { entityType: type, data: body, status: type === "grocery_waste" ? "posted" : "open" };
    }, load, true);
    await load();
  }

  async function reports() {
    shell("Grocery Reports", "Expiry, waste, recall, stock and sales exposure");
    const values = await Promise.all([loadBatches(""), request("GET", "/api/v1/industry/records?entityType=grocery_waste&limit=500"), request("GET", "/api/v1/industry/records?entityType=grocery_recall&limit=500"), request("GET", "/api/v1/dashboard/summary")]);
    const report = { batches: values[0], waste: values[1], recalls: values[2], dashboard: values[3] };
    document.getElementById("app").innerHTML = '<section class="g-panel"><pre>' + esc(JSON.stringify(report, null, 2)) + "</pre></section>";
  }

  async function settings() {
    shell("Grocery Settings", "Expiry, low-stock and recall notification rules");
    document.getElementById("app").innerHTML = formPanel("ruleForm", "Create Notification Rule", [
      { name: "code", label: "Rule code", type: "text", required: true },
      { name: "name", label: "Rule name", type: "text", required: true },
      { name: "eventType", label: "Event type", type: "text", required: true },
      { name: "channels", label: "Channels CSV", type: "text" },
      { name: "active", label: "Active", type: "select", options: ["true", "false"] }
    ], "Save Rule") + '<section class="g-panel"><pre id="rulesOutput"></pre></section>';
    const load = async function () { document.getElementById("rulesOutput").textContent = JSON.stringify(await request("GET", "/api/v1/industry/notification-rules"), null, 2); };
    bind("ruleForm", "POST", "/api/v1/industry/notification-rules", function (body) {
      body.channels = String(body.channels || "in_app").split(",").map(function (item) { return item.trim(); }).filter(Boolean);
      body.active = body.active !== false;
      return body;
    }, load, false);
    await load();
  }

  const handlers = {
    dashboard: dashboard,
    terminal: terminal,
    products: products,
    batches: function () { return batchPage("Grocery Batches", "Lot traceability and FEFO stock visibility", ""); },
    expiry: function () { return batchPage("Expiry Control", "Earliest expiry and blocked-stock monitoring", ""); },
    receiving: receiving,
    waste: function () { return recordsPage("grocery_waste", "Waste & Spoilage", "Record expiry, spoilage, breakage and shrinkage", [{ name: "productReference", label: "Product / SKU", type: "text", required: true }, { name: "batchNo", label: "Batch / lot", type: "text" }, { name: "quantity", label: "Quantity", type: "number", required: true }, { name: "unit", label: "Unit", type: "select", required: true, options: ["piece", "pack", "carton", "kg", "gram", "litre"] }, { name: "reason", label: "Reason", type: "select", required: true, options: ["expired", "spoilage", "breakage", "shrinkage"] }, { name: "occurredAt", label: "Occurred at", type: "datetime-local", required: true }], [["referenceNo", "Reference"], ["displayName", "Product"], ["data.batchNo", "Batch"], ["data.quantity", "Quantity"], ["data.reason", "Reason"], ["status", "Status"]]); },
    recalls: function () { return recordsPage("grocery_recall", "Product Recalls", "Quarantine and trace recalled lots", [{ name: "productReference", label: "Product / GTIN", type: "text", required: true }, { name: "batchNo", label: "Batch / lot", type: "text", required: true }, { name: "supplierReference", label: "Supplier reference", type: "text" }, { name: "reason", label: "Recall reason", type: "textarea", required: true }, { name: "openedAt", label: "Opened at", type: "datetime-local", required: true }], [["referenceNo", "Recall"], ["displayName", "Product"], ["data.batchNo", "Batch"], ["data.supplierReference", "Supplier"], ["status", "Status"], ["createdAt", "Created"]]); },
    reports: reports,
    settings: settings
  };

  document.addEventListener("DOMContentLoaded", async function () {
    try {
      await verifyTenant();
      const handler = handlers[PAGE];
      if (!handler) throw new Error("Unsupported Grocery page.");
      await handler();
    } catch (error) {
      if (!document.getElementById("app")) shell("Grocery Application", "Unable to open requested module");
      document.getElementById("app").innerHTML = '<section class="g-panel"><div class="g-status error">' + esc(error.message || "Grocery application failed") + "</div></section>";
    }
  });
})();
