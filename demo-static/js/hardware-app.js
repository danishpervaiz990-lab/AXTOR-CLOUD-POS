(function () {
  "use strict";

  const PAGE = document.body.dataset.page || "dashboard";
  const VERTICAL = "/api/v1/hardware";
  const NAV = [
    ["hardware-dashboard.html", "Dashboard"],
    ["hardware-terminal.html", "Trade Checkout"],
    ["hardware-projects.html", "Contractor Projects"],
    ["hardware-quotations.html", "Quotations & LPO"],
    ["hardware-price-levels.html", "Price Levels"],
    ["hardware-deliveries.html", "Staged Delivery"],
    ["hardware-backorders.html", "Backorders"],
    ["hardware-rentals.html", "Rentals"],
    ["hardware-warranties.html", "Warranty"],
    ["hardware-unit-conversions.html", "Unit Conversion"],
    ["hardware-reports.html", "Reports"],
    ["hardware-settings.html", "Settings"]
  ];

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char];
    });
  }

  function normalizeResponse(payload) {
    if (!payload) return payload;
    if (Object.prototype.hasOwnProperty.call(payload, "data")) return payload.data;
    if (Object.prototype.hasOwnProperty.call(payload, "products")) return payload.products;
    if (Object.prototype.hasOwnProperty.call(payload, "customers")) return payload.customers;
    return payload;
  }

  async function request(method, path, body, idempotent, vertical) {
    const headers = { Accept: "application/json", Authorization: "Bearer " + AxtorAPI.getToken() };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (idempotent) headers["Idempotency-Key"] = "hardware:" + path + ":" + Date.now() + ":" + Math.random().toString(36).slice(2);
    const response = await fetch(AxtorAPI.getApiBaseUrl() + (vertical === false ? path : VERTICAL + path), {
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
    if (!response.ok) throw new Error(payload?.error?.message || "Hardware request failed");
    return normalizeResponse(payload);
  }

  function shell(title, subtitle) {
    const currentFile = window.location.pathname.split("/").pop();
    const links = NAV.map(function (item) {
      return '<a class="' + (item[0] === currentFile ? "active" : "") + '" href="' + item[0] + '">' + esc(item[1]) + "</a>";
    }).join("");
    document.body.innerHTML = '<div class="h-shell"><aside class="h-nav"><div class="h-brand">AXTOR · HARDWARE</div>' + links + '</aside><main class="h-main"><section class="h-hero"><h1>' + esc(title) + "</h1><p>" + esc(subtitle) + '</p></section><div id="app"></div></main></div>';
  }

  async function verifyTenant() {
    const registry = normalizeResponse(await AxtorAPI.apiGet("/api/v1/industry/registry", { cache: false })) || {};
    const code = String(registry.selection?.code || registry.selected?.code || "").toLowerCase();
    if (!["hardware", "hardware_paint"].includes(code)) throw new Error("This application is available only to Hardware tenants.");
  }

  function nested(row, path) {
    return path.split(".").reduce(function (current, key) { return current == null ? current : current[key]; }, row);
  }

  function shown(value) {
    if (value === null || value === undefined || value === "") return "—";
    const text = String(value);
    if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return new Date(text).toLocaleString();
    return text;
  }

  function fieldsHtml(fields) {
    return fields.map(function (field) {
      const required = field.required ? " required" : "";
      if (field.type === "select") {
        return '<div><label>' + esc(field.label) + '</label><select name="' + field.name + '"' + required + '><option value="">Select</option>' + field.options.map(function (option) { return '<option value="' + esc(option) + '">' + esc(option) + "</option>"; }).join("") + "</select></div>";
      }
      if (field.type === "textarea") return '<div><label>' + esc(field.label) + '</label><textarea name="' + field.name + '"' + required + ' placeholder="' + esc(field.placeholder || "") + '"></textarea></div>';
      return '<div><label>' + esc(field.label) + '</label><input name="' + field.name + '" type="' + field.type + '"' + required + ' placeholder="' + esc(field.placeholder || "") + '"></div>';
    }).join("");
  }

  function formPanel(id, title, fields, button) {
    return '<section class="h-panel"><h2>' + esc(title) + '</h2><form id="' + id + '" class="h-form">' + fieldsHtml(fields) + '<div class="h-actions"><button class="h-btn" type="submit">' + esc(button || "Save") + '</button></div></form><div id="' + id + 'Status" class="h-status"></div></section>';
  }

  function tablePanel(id, title, columns) {
    return '<section class="h-panel"><div class="h-toolbar"><h2>' + esc(title) + '</h2><input class="h-search" data-search="' + id + '" placeholder="Search displayed records"></div><div class="h-table-wrap"><table class="h-table"><thead><tr>' + columns.map(function (column) { return "<th>" + esc(column[1]) + "</th>"; }).join("") + '</tr></thead><tbody id="' + id + '"><tr><td colspan="' + columns.length + '">Loading…</td></tr></tbody></table></div></section>';
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
    const numeric = new Set(["creditLimit", "discountPercent", "quantity", "deposit", "factor", "discount", "orderedQuantity", "deliveredQuantity"]);
    Object.keys(result).forEach(function (key) { if (numeric.has(key) && result[key] !== "") result[key] = Number(result[key]); });
    return result;
  }

  function bindForm(id, method, pathBuilder, transform, reload, idempotent) {
    document.getElementById(id).addEventListener("submit", async function (event) {
      event.preventDefault();
      const status = document.getElementById(id + "Status");
      status.textContent = "Saving…";
      status.className = "h-status";
      try {
        let body = formPayload(event.currentTarget);
        if (transform) body = transform(body);
        const path = typeof pathBuilder === "function" ? pathBuilder(body) : pathBuilder;
        await request(method, path, body, idempotent);
        status.textContent = "Saved successfully.";
        status.className = "h-status ok";
        event.currentTarget.reset();
        if (reload) await reload();
      } catch (error) {
        status.textContent = error.message || "Save failed";
        status.className = "h-status error";
      }
    });
  }

  async function dashboard() {
    shell("Hardware & Trade Dashboard", "Projects, quotations, staged delivery, backorders and rentals");
    const metrics = await request("GET", "/dashboard");
    document.getElementById("app").innerHTML = '<div class="h-kpis"><div class="h-kpi"><span>Active Projects</span><strong>' + esc(metrics.activeProjects || 0) + '</strong></div><div class="h-kpi"><span>Open Backorders</span><strong>' + esc(metrics.openBackorders || 0) + '</strong></div><div class="h-kpi"><span>Pending Deliveries</span><strong>' + esc(metrics.pendingDeliveries || 0) + '</strong></div><div class="h-kpi"><span>Active Rentals</span><strong>' + esc(metrics.activeRentals || 0) + '</strong></div></div><section class="h-panel"><div class="h-note">Hardware workflows support contractor projects, LPO-linked quotations, piece/box/metre conversion, staged delivery and warranty records.</div></section>';
  }

  async function terminal() {
    shell("Trade Checkout", "Hardware-specific checkout with project and LPO references");
    document.getElementById("app").innerHTML = '<div class="h-terminal-grid"><section class="h-panel"><div class="h-toolbar"><h2>Products</h2><input id="productSearch" class="h-search" placeholder="Search SKU, barcode or product"></div><div id="productList" class="h-list">Loading…</div></section><section class="h-panel"><h2>Trade Cart</h2><div id="cart"></div><form id="checkoutForm" class="h-form"><div><label>Customer ID</label><input name="customerId" type="text"></div><div><label>Project reference</label><input name="projectReference" type="text"></div><div><label>LPO number</label><input name="lpoNo" type="text"></div><div><label>Payment method</label><select name="paymentMethod"><option value="cash">Cash</option><option value="card">Card</option><option value="credit">Credit</option></select></div><div><label>Paid amount</label><input name="paidAmount" type="number" value="0"></div><div class="h-actions"><button class="h-btn" type="submit">Post Invoice</button></div></form><div id="checkoutStatus" class="h-status"></div></section></div>';
    const products = await request("GET", "/api/v1/products?active=true", undefined, false, false);
    const cart = [];
    function renderProducts() {
      const query = String(document.getElementById("productSearch").value || "").toLowerCase();
      const filtered = products.filter(function (product) { return JSON.stringify(product).toLowerCase().includes(query); }).slice(0, 100);
      document.getElementById("productList").innerHTML = filtered.map(function (product) {
        return '<div class="h-item"><span><strong>' + esc(product.name) + '</strong><br><small>' + esc(product.sku) + ' · ' + esc(product.unit || "PCS") + ' · ' + esc(product.price) + '</small></span><button type="button" data-add="' + esc(product.id) + '">Add</button></div>';
      }).join("") || "No matching products.";
    }
    function renderCart() {
      document.getElementById("cart").innerHTML = cart.map(function (item, index) {
        return '<div class="h-cart-row"><span>' + esc(item.name) + '</span><input data-qty="' + index + '" type="number" min="0.001" step="0.001" value="' + item.qty + '"><input data-rate="' + index + '" type="number" min="0" step="0.01" value="' + item.rate + '"><button type="button" data-remove="' + index + '">×</button></div>';
      }).join("") || '<p class="h-note">Cart is empty.</p>';
    }
    document.getElementById("productSearch").addEventListener("input", renderProducts);
    document.getElementById("productList").addEventListener("click", function (event) {
      const button = event.target.closest("[data-add]");
      if (!button) return;
      const product = products.find(function (row) { return row.id === button.dataset.add; });
      const existing = cart.find(function (row) { return row.productId === product.id; });
      if (existing) existing.qty += 1; else cart.push({ productId: product.id, name: product.name, qty: 1, rate: Number(product.price || 0) });
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
        const documentBody = {
          documentType: "invoice",
          postingMode: "post",
          customerId: form.customerId || null,
          customerName: form.customerId ? undefined : "Walk-in Customer",
          paymentMethod: form.paymentMethod,
          paidAmount: paidAmount,
          lpoNo: form.lpoNo || null,
          referenceNo: form.projectReference || null,
          salesChannel: "hardware_trade_terminal",
          items: cart.map(function (item) { return { productId: item.productId, qty: item.qty, rate: item.rate, discount: 0, taxRate: 0 }; })
        };
        await request("POST", "/api/v1/sales-documents", documentBody, true, false);
        cart.splice(0, cart.length);
        renderCart();
        status.textContent = "Invoice posted successfully.";
        status.className = "h-status ok";
      } catch (error) {
        status.textContent = error.message || "Invoice failed";
        status.className = "h-status error";
      }
    });
    renderProducts();
    renderCart();
  }

  const CONFIGS = {
    projects: {
      title: "Contractor Projects", subtitle: "Project pricing and credit context", list: "/projects", create: "/projects",
      fields: [{ name: "customerId", label: "Customer ID", type: "text", required: true }, { name: "projectCode", label: "Project code", type: "text", required: true }, { name: "name", label: "Project name", type: "text", required: true }, { name: "location", label: "Location", type: "text" }, { name: "creditLimit", label: "Credit limit", type: "number" }],
      columns: [["projectCode", "Project"], ["name", "Name"], ["customerId", "Customer"], ["location", "Location"], ["creditLimit", "Credit Limit"], ["status", "Status"]]
    },
    "price-levels": {
      title: "Trade Price Levels", subtitle: "Contractor and customer pricing tiers", list: "/price-levels", create: "/price-levels",
      fields: [{ name: "name", label: "Level name", type: "text", required: true }, { name: "discountPercent", label: "Discount %", type: "number" }],
      columns: [["name", "Price Level"], ["discountPercent", "Discount %"], ["active", "Active"]]
    },
    deliveries: {
      title: "Staged Delivery", subtitle: "Schedule and track partial deliveries", list: "/deliveries", create: "/deliveries", idempotent: true,
      fields: [{ name: "documentNo", label: "Document number", type: "text", required: true }, { name: "scheduledDate", label: "Scheduled date", type: "date", required: true }, { name: "projectId", label: "Project ID", type: "text" }, { name: "notes", label: "Notes", type: "textarea" }],
      columns: [["documentNo", "Document"], ["projectId", "Project"], ["scheduledDate", "Scheduled"], ["status", "Status"], ["notes", "Notes"]]
    },
    backorders: {
      title: "Backorders", subtitle: "Unfulfilled customer and project demand", list: "/backorders", create: "/backorders",
      fields: [{ name: "productId", label: "Product ID", type: "text", required: true }, { name: "customerId", label: "Customer ID", type: "text" }, { name: "quantity", label: "Quantity", type: "number", required: true }],
      columns: [["productId", "Product"], ["customerId", "Customer"], ["quantity", "Quantity"], ["status", "Status"], ["createdAt", "Created"]]
    },
    rentals: {
      title: "Equipment Rentals", subtitle: "Deposits, due dates and return control", list: "/rentals", create: "/rentals",
      fields: [{ name: "contractNo", label: "Contract number", type: "text", required: true }, { name: "customerId", label: "Customer ID", type: "text", required: true }, { name: "itemDescription", label: "Item description", type: "text", required: true }, { name: "startAt", label: "Start", type: "datetime-local", required: true }, { name: "dueAt", label: "Due", type: "datetime-local", required: true }, { name: "deposit", label: "Deposit", type: "number" }],
      columns: [["contractNo", "Contract"], ["customerId", "Customer"], ["itemDescription", "Item"], ["startAt", "Start"], ["dueAt", "Due"], ["deposit", "Deposit"], ["status", "Status"]]
    },
    quotations: {
      title: "Quotations & LPO", subtitle: "Project-linked trade quotations", list: "/quotations", create: "/quotations", idempotent: true,
      fields: [{ name: "customerId", label: "Customer ID", type: "text", required: true }, { name: "projectId", label: "Project ID", type: "text" }, { name: "lpoNo", label: "LPO number", type: "text" }, { name: "discount", label: "Discount", type: "number" }, { name: "validUntil", label: "Valid until", type: "date" }, { name: "itemsJson", label: "Items JSON", type: "textarea", required: true, placeholder: '[{"productId":"...","description":"Item","quantity":2,"unit":"box","unitPrice":10}]' }],
      columns: [["quotationNo", "Quotation"], ["customerId", "Customer"], ["projectId", "Project"], ["lpoNo", "LPO"], ["total", "Total"], ["status", "Status"], ["validUntil", "Valid Until"]],
      transform: function (body) { try { body.items = JSON.parse(body.itemsJson); } catch (_) { throw new Error("Items JSON is invalid"); } delete body.itemsJson; return body; }
    },
    settings: {
      title: "Hardware Settings", subtitle: "Trade notifications and workflow rules", list: "/notification-rules", create: "/notification-rules", method: "PUT",
      fields: [{ name: "eventKey", label: "Event key", type: "text", required: true }, { name: "channel", label: "Channel", type: "select", required: true, options: ["in_app", "email", "sms", "whatsapp"] }, { name: "daysBefore", label: "Days before", type: "number" }, { name: "active", label: "Active", type: "select", options: ["true", "false"] }],
      columns: [["eventKey", "Event"], ["channel", "Channel"], ["daysBefore", "Days Before"], ["active", "Active"]],
      transform: function (body) { body.active = body.active !== "false"; return body; }
    }
  };

  async function generic(config) {
    shell(config.title, config.subtitle);
    document.getElementById("app").innerHTML = formPanel("recordForm", "New Record", config.fields, "Save") + tablePanel("recordRows", "Records", config.columns);
    let rows = [];
    const load = async function () { rows = await request("GET", config.list); renderRows("recordRows", rows, config.columns); };
    bindForm("recordForm", config.method || "POST", config.create, config.transform || null, load, Boolean(config.idempotent));
    document.querySelector('[data-search="recordRows"]').addEventListener("input", function () { renderRows("recordRows", rows, config.columns); });
    await load();
  }

  async function warranty() {
    shell("Warranty Register", "Product serial and customer warranty records");
    document.getElementById("app").innerHTML = formPanel("warrantyForm", "Register Warranty", [{ name: "productId", label: "Product ID", type: "text", required: true }, { name: "customerId", label: "Customer ID", type: "text", required: true }, { name: "serialNo", label: "Serial number", type: "text" }, { name: "invoiceNo", label: "Invoice number", type: "text" }, { name: "startsAt", label: "Starts", type: "date", required: true }, { name: "expiresAt", label: "Expires", type: "date", required: true }, { name: "notes", label: "Notes", type: "textarea" }]) + '<section class="h-panel"><div class="h-note">Warranty writes validate that the product and customer belong to this tenant.</div></section>';
    bindForm("warrantyForm", "POST", "/warranties", null, null, false);
  }

  async function conversions() {
    shell("Unit Conversion", "Piece, box, metre, length and pack conversion rules");
    document.getElementById("app").innerHTML = formPanel("conversionForm", "Save Unit Conversion", [{ name: "productId", label: "Product ID", type: "text", required: true }, { name: "fromUnit", label: "From unit", type: "text", required: true }, { name: "toUnit", label: "To unit", type: "text", required: true }, { name: "factor", label: "Conversion factor", type: "number", required: true }]) + '<section class="h-panel"><div class="h-note">Example: 1 box = 12 pieces uses factor 12 from box to piece.</div></section>';
    bindForm("conversionForm", "POST", "/unit-conversions", null, null, false);
  }

  async function reports() {
    shell("Hardware Reports", "Quotation value, backorders, delivery, rentals and warranty exposure");
    document.getElementById("app").innerHTML = '<section class="h-panel"><button id="refreshReport" class="h-btn">Refresh Report</button><pre id="reportOutput"></pre></section>';
    const load = async function () { document.getElementById("reportOutput").textContent = JSON.stringify(await request("GET", "/reports"), null, 2); };
    document.getElementById("refreshReport").addEventListener("click", load);
    await load();
  }

  document.addEventListener("DOMContentLoaded", async function () {
    try {
      await verifyTenant();
      if (PAGE === "dashboard") return dashboard();
      if (PAGE === "terminal") return terminal();
      if (PAGE === "warranties") return warranty();
      if (PAGE === "unit-conversions") return conversions();
      if (PAGE === "reports") return reports();
      const config = CONFIGS[PAGE];
      if (!config) throw new Error("Unsupported Hardware page.");
      return generic(config);
    } catch (error) {
      if (!document.getElementById("app")) shell("Hardware Application", "Unable to open requested module");
      document.getElementById("app").innerHTML = '<section class="h-panel"><div class="h-status error">' + esc(error.message || "Hardware application failed") + "</div></section>";
    }
  });
})();
