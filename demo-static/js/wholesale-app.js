(function () {
  "use strict";

  const PAGE = document.body.dataset.page || "dashboard";
  const ROOT = "/api/v1/wholesale";
  const NAV = [
    ["wholesale-dashboard.html", "Dashboard"],
    ["wholesale-price-lists.html", "Price Lists"],
    ["wholesale-price-assignments.html", "Price Assignments"],
    ["wholesale-unit-conversions.html", "Unit Conversions"],
    ["wholesale-orders.html", "Sales Orders"],
    ["wholesale-allocation.html", "Allocation & Picking"],
    ["wholesale-packing.html", "Packing Lists"],
    ["wholesale-routes.html", "Delivery Routes"],
    ["wholesale-dispatch.html", "Dispatch"],
    ["wholesale-proof-of-delivery.html", "Proof of Delivery"],
    ["wholesale-collections.html", "Collections"],
    ["wholesale-credit.html", "Credit Control"],
    ["wholesale-ageing.html", "Receivables Ageing"],
    ["wholesale-reports.html", "Reports"],
    ["wholesale-settings.html", "Settings"]
  ];

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char];
    });
  }

  function unwrap(value) {
    return value && Object.prototype.hasOwnProperty.call(value, "data") ? value.data : value;
  }

  async function request(method, path, body, idempotent) {
    const headers = { Accept: "application/json", Authorization: "Bearer " + AxtorAPI.getToken() };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (idempotent) headers["Idempotency-Key"] = "wholesale:" + path + ":" + Date.now() + ":" + Math.random().toString(36).slice(2);
    const response = await fetch(AxtorAPI.getApiBaseUrl() + ROOT + path, {
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
    if (!response.ok) throw new Error(payload?.error?.message || "Wholesale request failed");
    return unwrap(payload);
  }

  function shell(title, subtitle) {
    const current = window.location.pathname.split("/").pop();
    const links = NAV.map(function (item) {
      return '<a class="' + (item[0] === current ? "active" : "") + '" href="' + item[0] + '">' + esc(item[1]) + "</a>";
    }).join("");
    document.body.innerHTML = '<div class="d-shell"><aside class="d-nav"><div class="d-brand">AXTOR · WHOLESALE</div>' + links + '</aside><main class="d-main"><section class="d-hero"><h1>' + esc(title) + "</h1><p>" + esc(subtitle) + '</p></section><div id="app"></div></main></div>';
  }

  async function verifyTenant() {
    const registry = unwrap(await AxtorAPI.apiGet("/api/v1/industry/registry", { cache: false })) || {};
    const code = String(registry.selection?.code || registry.selected?.code || "").toLowerCase();
    if (!["wholesale", "distribution"].includes(code)) throw new Error("This application is available only to Wholesale tenants.");
  }

  function fieldHtml(field) {
    const required = field.required ? " required" : "";
    if (field.type === "select") {
      return '<div><label>' + esc(field.label) + '</label><select name="' + field.name + '"' + required + '><option value="">Select</option>' + field.options.map(function (option) {
        return '<option value="' + esc(option) + '">' + esc(option) + "</option>";
      }).join("") + "</select></div>";
    }
    if (field.type === "textarea") return '<div><label>' + esc(field.label) + '</label><textarea name="' + field.name + '"' + required + ' placeholder="' + esc(field.placeholder || "") + '"></textarea></div>';
    return '<div><label>' + esc(field.label) + '</label><input name="' + field.name + '" type="' + field.type + '"' + required + ' placeholder="' + esc(field.placeholder || "") + '"></div>';
  }

  function formPanel(id, title, fields, button) {
    return '<section class="d-panel"><h2>' + esc(title) + '</h2><form id="' + id + '" class="d-form">' + fields.map(fieldHtml).join("") + '<div class="d-actions"><button class="d-btn" type="submit">' + esc(button || "Save") + '</button></div></form><div id="' + id + 'Status" class="d-status"></div></section>';
  }

  function tablePanel(id, title, columns) {
    return '<section class="d-panel"><div class="d-toolbar"><h2>' + esc(title) + '</h2><input class="d-search" data-search="' + id + '" placeholder="Search records"></div><div class="d-table-wrap"><table class="d-table"><thead><tr>' + columns.map(function (column) { return "<th>" + esc(column[1]) + "</th>"; }).join("") + '</tr></thead><tbody id="' + id + '"><tr><td colspan="' + columns.length + '">Loading…</td></tr></tbody></table></div></section>';
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

  function renderRows(id, rows, columns) {
    const query = String(document.querySelector('[data-search="' + id + '"]')?.value || "").toLowerCase();
    const filtered = query ? rows.filter(function (row) { return JSON.stringify(row).toLowerCase().includes(query); }) : rows;
    document.getElementById(id).innerHTML = filtered.map(function (row) {
      return "<tr>" + columns.map(function (column) { return "<td>" + esc(shown(nested(row, column[0]))) + "</td>"; }).join("") + "</tr>";
    }).join("") || '<tr><td colspan="' + columns.length + '">No records found.</td></tr>';
  }

  function payload(form) {
    const result = Object.fromEntries(new FormData(form).entries());
    const numeric = new Set(["discount", "quantity", "unitPrice", "factor", "amount", "creditLimit", "creditDays", "daysBefore"]);
    Object.keys(result).forEach(function (key) {
      if (result[key] === "true") result[key] = true;
      else if (result[key] === "false") result[key] = false;
      else if (numeric.has(key) && result[key] !== "") result[key] = Number(result[key]);
    });
    return result;
  }

  function bind(id, method, pathBuilder, transform, reload, idempotent, outputId) {
    document.getElementById(id).addEventListener("submit", async function (event) {
      event.preventDefault();
      const status = document.getElementById(id + "Status");
      status.textContent = "Saving…";
      status.className = "d-status";
      try {
        let body = payload(event.currentTarget);
        if (transform) body = transform(body);
        const path = typeof pathBuilder === "function" ? pathBuilder(body) : pathBuilder;
        const response = await request(method, path, body, idempotent);
        status.textContent = "Saved successfully.";
        status.className = "d-status ok";
        if (outputId) document.getElementById(outputId).textContent = JSON.stringify(response, null, 2);
        event.currentTarget.reset();
        if (reload) await reload();
      } catch (error) {
        status.textContent = error.message || "Save failed";
        status.className = "d-status error";
      }
    });
  }

  async function dashboard() {
    shell("Wholesale Distribution Dashboard", "Orders, allocation, packing, dispatch and receivables");
    const metrics = await request("GET", "/dashboard");
    document.getElementById("app").innerHTML = '<div class="d-kpis"><div class="d-kpi"><span>Open Orders</span><strong>' + esc(metrics.openOrders || 0) + '</strong></div><div class="d-kpi"><span>Open Pick Lists</span><strong>' + esc(metrics.openPickLists || 0) + '</strong></div><div class="d-kpi"><span>Active Dispatches</span><strong>' + esc(metrics.activeDispatches || 0) + '</strong></div><div class="d-kpi"><span>Backorders</span><strong>' + esc(metrics.backorders || 0) + '</strong></div></div><section class="d-panel"><h2>Distribution Workflow</h2><div class="d-flow"><div class="d-step">Price</div><div class="d-step">Order</div><div class="d-step">Allocate</div><div class="d-step">Pack</div><div class="d-step">Dispatch</div><div class="d-step">Collect</div></div></section>';
  }

  async function priceLists() {
    shell("Wholesale Price Lists", "Currency-specific selling structures");
    const columns = [["name", "Price List"], ["currency", "Currency"], ["active", "Active"]];
    document.getElementById("app").innerHTML = formPanel("recordForm", "Create Price List", [
      { name: "name", label: "Price-list name", type: "text", required: true },
      { name: "currency", label: "Currency", type: "text", required: true }
    ]) + tablePanel("recordRows", "Price Lists", columns);
    let rows = [];
    const load = async function () { rows = await request("GET", "/price-lists"); renderRows("recordRows", rows, columns); };
    bind("recordForm", "POST", "/price-lists", null, load, false);
    await load();
  }

  const ACTIONS = {
    "price-assignments": {
      title: "Customer Price Assignments", subtitle: "Assign a wholesale price list to a customer", id: "assignmentForm", button: "Assign Price List",
      fields: [{ name: "customerId", label: "Customer ID", type: "text", required: true }, { name: "priceListId", label: "Price-list ID", type: "text", required: true }], method: "POST", path: "/price-list-assignments"
    },
    "unit-conversions": {
      title: "Wholesale Unit Conversions", subtitle: "Carton, pack, piece and bulk conversion factors", id: "conversionForm", button: "Save Conversion",
      fields: [{ name: "productId", label: "Product ID", type: "text", required: true }, { name: "fromUnit", label: "From unit", type: "text", required: true }, { name: "toUnit", label: "To unit", type: "text", required: true }, { name: "factor", label: "Factor", type: "number", required: true }], method: "POST", path: "/unit-conversions"
    },
    allocation: {
      title: "Order Allocation & Picking", subtitle: "Allocate available inventory and create pick lists", id: "allocationForm", button: "Allocate Order",
      fields: [{ name: "orderId", label: "Sales-order ID", type: "text", required: true }, { name: "assignedTo", label: "Assigned picker", type: "text" }, { name: "availableJson", label: "Available quantities JSON", type: "textarea", placeholder: '{"product-id":25}' }], method: "POST",
      path: function (body) { const id = body.orderId; delete body.orderId; return "/orders/" + encodeURIComponent(id) + "/allocate"; },
      transform: function (body) { if (body.availableJson) { try { body.available = JSON.parse(body.availableJson); } catch (_) { throw new Error("Available quantities JSON is invalid"); } } delete body.availableJson; return body; }
    },
    packing: {
      title: "Detailed Packing Lists", subtitle: "Pack allocated order items with quantities and units", id: "packingForm", button: "Create Packing List",
      fields: [{ name: "pickListId", label: "Pick-list ID", type: "text", required: true }, { name: "packedBy", label: "Packed by", type: "text" }, { name: "itemsJson", label: "Packing items JSON", type: "textarea", required: true, placeholder: '[{"salesOrderItemId":"...","quantity":5,"unit":"carton"}]' }], method: "POST", path: "/packing-lists/detailed",
      transform: function (body) { try { body.items = JSON.parse(body.itemsJson); } catch (_) { throw new Error("Packing items JSON is invalid"); } delete body.itemsJson; return body; }
    },
    routes: {
      title: "Delivery Routes", subtitle: "Driver and vehicle route definitions", id: "routeForm", button: "Create Route",
      fields: [{ name: "name", label: "Route name", type: "text", required: true }, { name: "driverName", label: "Driver", type: "text" }, { name: "vehicleReference", label: "Vehicle", type: "text" }], method: "POST", path: "/routes"
    },
    collections: {
      title: "Customer Collections", subtitle: "Record receipts against wholesale sales orders", id: "collectionForm", button: "Post Collection",
      fields: [{ name: "salesOrderId", label: "Sales-order ID", type: "text", required: true }, { name: "amount", label: "Amount", type: "number", required: true }, { name: "method", label: "Method", type: "select", options: ["bank", "cash", "card", "cheque"] }, { name: "reference", label: "Reference", type: "text" }], method: "POST", path: "/collections", idempotent: true
    },
    settings: {
      title: "Wholesale Settings", subtitle: "Order, dispatch and collection notification rules", id: "ruleForm", button: "Save Rule",
      fields: [{ name: "eventCode", label: "Event code", type: "text", required: true }, { name: "channel", label: "Channel", type: "select", options: ["in_app", "email", "sms", "whatsapp"] }, { name: "daysBefore", label: "Days before", type: "number" }, { name: "enabled", label: "Enabled", type: "select", options: ["true", "false"] }], method: "PUT", path: "/notification-rules/wholesale"
    }
  };

  async function actionPage(config) {
    shell(config.title, config.subtitle);
    document.getElementById("app").innerHTML = formPanel(config.id, config.button, config.fields, config.button) + '<section class="d-panel"><div class="d-note">This operation is tenant-scoped and protected by server-side permissions.</div></section>';
    bind(config.id, config.method, config.path, config.transform || null, null, Boolean(config.idempotent));
  }

  async function orders() {
    shell("Wholesale Sales Orders", "Customer PO, territory, delivery date and bulk line items");
    const columns = [["orderNo", "Order"], ["customerId", "Customer"], ["customerPo", "PO / LPO"], ["territory", "Territory"], ["total", "Total"], ["requestedDeliveryAt", "Requested Delivery"], ["status", "Status"]];
    document.getElementById("app").innerHTML = formPanel("orderForm", "Create Sales Order", [
      { name: "customerId", label: "Customer ID", type: "text", required: true },
      { name: "customerPo", label: "Customer PO / LPO", type: "text" },
      { name: "territory", label: "Territory", type: "text" },
      { name: "discount", label: "Discount", type: "number" },
      { name: "requestedDeliveryAt", label: "Requested delivery", type: "datetime-local" },
      { name: "itemsJson", label: "Order items JSON", type: "textarea", required: true, placeholder: '[{"productId":"...","description":"Product","quantity":10,"unit":"carton","unitPrice":50}]' }
    ], "Create Order") + tablePanel("orderRows", "Sales Orders", columns);
    let rows = [];
    const load = async function () { rows = await request("GET", "/orders"); renderRows("orderRows", rows, columns); };
    bind("orderForm", "POST", "/orders", function (body) { try { body.items = JSON.parse(body.itemsJson); } catch (_) { throw new Error("Order items JSON is invalid"); } delete body.itemsJson; return body; }, load, true);
    await load();
  }

  async function dispatch() {
    shell("Dispatch Management", "Schedule delivery and close completed dispatches");
    document.getElementById("app").innerHTML = formPanel("dispatchForm", "Create Dispatch", [
      { name: "salesOrderId", label: "Sales-order ID", type: "text", required: true },
      { name: "routeName", label: "Route name", type: "text" },
      { name: "driverName", label: "Driver", type: "text" },
      { name: "vehicleReference", label: "Vehicle", type: "text" }
    ], "Create Dispatch") + formPanel("deliverForm", "Mark Dispatch Delivered", [
      { name: "dispatchId", label: "Dispatch ID", type: "text", required: true }
    ], "Mark Delivered") + '<section class="d-panel"><div class="d-note">Use Proof of Delivery for receiver name and signature evidence.</div></section>';
    bind("dispatchForm", "POST", "/dispatches", null, null, false);
    bind("deliverForm", "PATCH", function (body) { return "/dispatches/" + encodeURIComponent(body.dispatchId) + "/deliver"; }, function () { return {}; }, null, false);
  }

  async function proofOfDelivery() {
    shell("Proof of Delivery", "Receiver details, signature reference and dispatch completion");
    document.getElementById("app").innerHTML = formPanel("podForm", "Record Proof of Delivery", [
      { name: "dispatchId", label: "Dispatch ID", type: "text", required: true },
      { name: "receiverName", label: "Receiver name", type: "text", required: true },
      { name: "signatureReference", label: "Signature reference", type: "text" },
      { name: "notes", label: "Notes", type: "textarea" }
    ], "Record POD");
    bind("podForm", "POST", function (body) { const id = body.dispatchId; delete body.dispatchId; return "/dispatches/" + encodeURIComponent(id) + "/proof-of-delivery"; }, null, null, false);
  }

  async function credit() {
    shell("Wholesale Credit Control", "Customer credit limits, terms, blocks and pre-order checks");
    document.getElementById("app").innerHTML = formPanel("profileForm", "Save Credit Profile", [
      { name: "customerId", label: "Customer ID", type: "text", required: true },
      { name: "creditLimit", label: "Credit limit", type: "number", required: true },
      { name: "creditDays", label: "Credit days", type: "number" },
      { name: "blocked", label: "Blocked", type: "select", options: ["true", "false"] }
    ]) + formPanel("checkForm", "Run Credit Check", [
      { name: "customerId", label: "Customer ID", type: "text", required: true },
      { name: "amount", label: "Requested amount", type: "number", required: true }
    ], "Check Credit") + '<section class="d-panel"><pre id="creditOutput"></pre></section>';
    bind("profileForm", "PUT", "/credit-profiles", null, null, false);
    document.getElementById("checkForm").addEventListener("submit", async function (event) {
      event.preventDefault();
      const value = payload(event.currentTarget);
      const status = document.getElementById("checkFormStatus");
      try {
        const result = await request("GET", "/customers/" + encodeURIComponent(value.customerId) + "/credit-check?amount=" + encodeURIComponent(value.amount));
        document.getElementById("creditOutput").textContent = JSON.stringify(result, null, 2);
        status.textContent = result.approved ? "Credit approved." : "Credit not approved.";
        status.className = result.approved ? "d-status ok" : "d-status error";
      } catch (error) {
        status.textContent = error.message || "Credit check failed";
        status.className = "d-status error";
      }
    });
  }

  async function ageing() {
    shell("Receivables Ageing", "Outstanding wholesale exposure by ageing bucket");
    const buckets = await request("GET", "/receivables/ageing");
    document.getElementById("app").innerHTML = '<section class="d-panel"><div class="d-ageing"><div class="d-age"><span>Current / 0-30</span><strong>' + esc(Number(buckets.current || 0).toFixed(2)) + '</strong></div><div class="d-age"><span>31-60 Days</span><strong>' + esc(Number(buckets.days31to60 || 0).toFixed(2)) + '</strong></div><div class="d-age"><span>61-90 Days</span><strong>' + esc(Number(buckets.days61to90 || 0).toFixed(2)) + '</strong></div><div class="d-age"><span>Over 90 Days</span><strong>' + esc(Number(buckets.over90 || 0).toFixed(2)) + "</strong></div></div></section>";
  }

  async function reports() {
    shell("Wholesale Reports", "Order, dispatch, backorder and collection summaries");
    document.getElementById("app").innerHTML = '<section class="d-panel"><button id="refreshReport" class="d-btn">Refresh Report</button><pre id="reportOutput"></pre></section>';
    const load = async function () { document.getElementById("reportOutput").textContent = JSON.stringify(await request("GET", "/reports"), null, 2); };
    document.getElementById("refreshReport").addEventListener("click", load);
    await load();
  }

  const handlers = {
    dashboard: dashboard,
    "price-lists": priceLists,
    "price-assignments": function () { return actionPage(ACTIONS["price-assignments"]); },
    "unit-conversions": function () { return actionPage(ACTIONS["unit-conversions"]); },
    orders: orders,
    allocation: function () { return actionPage(ACTIONS.allocation); },
    packing: function () { return actionPage(ACTIONS.packing); },
    routes: function () { return actionPage(ACTIONS.routes); },
    dispatch: dispatch,
    "proof-of-delivery": proofOfDelivery,
    collections: function () { return actionPage(ACTIONS.collections); },
    credit: credit,
    ageing: ageing,
    reports: reports,
    settings: function () { return actionPage(ACTIONS.settings); }
  };

  document.addEventListener("DOMContentLoaded", async function () {
    try {
      await verifyTenant();
      const handler = handlers[PAGE];
      if (!handler) throw new Error("Unsupported Wholesale page.");
      await handler();
    } catch (error) {
      if (!document.getElementById("app")) shell("Wholesale Application", "Unable to open requested module");
      document.getElementById("app").innerHTML = '<section class="d-panel"><div class="d-status error">' + esc(error.message || "Wholesale application failed") + "</div></section>";
    }
  });
})();
