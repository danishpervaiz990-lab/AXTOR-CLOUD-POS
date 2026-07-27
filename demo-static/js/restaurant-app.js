(function () {
  "use strict";

  const API_ROOT = "/api/v1/restaurant";
  const PAGE = document.body.dataset.page || "dashboard";
  const NAV = [
    ["restaurant-dashboard.html", "Dashboard"],
    ["restaurant-floor.html", "Floor & Tables"],
    ["restaurant-menu.html", "Menu"],
    ["restaurant-orders.html", "Orders"],
    ["restaurant-kitchen.html", "Kitchen Display"],
    ["restaurant-reservations.html", "Reservations"],
    ["restaurant-modifiers.html", "Modifiers"],
    ["restaurant-recipes.html", "Recipes"],
    ["restaurant-wastage.html", "Wastage"],
    ["restaurant-reports.html", "Reports"],
    ["restaurant-settings.html", "Settings"]
  ];

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char];
    });
  }

  function unwrap(value) {
    return value && Object.prototype.hasOwnProperty.call(value, "data") ? value.data : value;
  }

  function apiUrl(path) {
    return AxtorAPI.getApiBaseUrl() + API_ROOT + path;
  }

  async function request(method, path, body, idempotent) {
    const headers = {
      Accept: "application/json",
      Authorization: "Bearer " + AxtorAPI.getToken()
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (idempotent) headers["Idempotency-Key"] = "restaurant:" + path + ":" + Date.now() + ":" + Math.random().toString(36).slice(2);
    const response = await fetch(apiUrl(path), {
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
    if (!response.ok) throw new Error(payload?.error?.message || "Restaurant request failed");
    return unwrap(payload);
  }

  function nested(row, path) {
    return path.split(".").reduce(function (current, key) {
      return current == null ? current : current[key];
    }, row);
  }

  function shown(value) {
    if (value === null || value === undefined || value === "") return "—";
    const text = String(value);
    if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return new Date(text).toLocaleString();
    return text;
  }

  function shell(title, subtitle) {
    const currentFile = window.location.pathname.split("/").pop();
    const links = NAV.map(function (item) {
      return '<a class="' + (item[0] === currentFile ? "active" : "") + '" href="' + item[0] + '">' + esc(item[1]) + "</a>";
    }).join("");
    document.body.innerHTML = '<div class="r-shell"><aside class="r-nav"><div class="r-brand">AXTOR · RESTAURANT</div>' + links + '</aside><main class="r-main"><section class="r-hero"><h1>' + esc(title) + "</h1><p>" + esc(subtitle) + '</p></section><div id="app"></div></main></div>';
  }

  async function verifyTenant() {
    const registry = unwrap(await AxtorAPI.apiGet("/api/v1/industry/registry", { cache: false })) || {};
    const code = String(registry.selection?.code || registry.selected?.code || "").toLowerCase();
    if (code !== "restaurant") throw new Error("This application is available only to Restaurant tenants.");
  }

  function fieldsHtml(fields) {
    return fields.map(function (field) {
      const required = field.required ? " required" : "";
      let control;
      if (field.type === "select") {
        control = '<select name="' + field.name + '"' + required + '><option value="">Select</option>' + field.options.map(function (option) {
          return '<option value="' + esc(option) + '">' + esc(option) + "</option>";
        }).join("") + "</select>";
      } else if (field.type === "textarea") {
        control = '<textarea name="' + field.name + '"' + required + ' placeholder="' + esc(field.placeholder || "") + '"></textarea>';
      } else {
        control = '<input name="' + field.name + '" type="' + field.type + '"' + required + ' placeholder="' + esc(field.placeholder || "") + '">';
      }
      return "<div><label>" + esc(field.label) + "</label>" + control + "</div>";
    }).join("");
  }

  function formPanel(id, title, fields, button) {
    return '<section class="r-panel"><h2>' + esc(title) + '</h2><form id="' + id + '" class="r-grid">' + fieldsHtml(fields) + '<div class="r-actions"><button class="r-btn" type="submit">' + esc(button || "Save") + '</button></div></form><div id="' + id + 'Status" class="r-status"></div></section>';
  }

  function tablePanel(id, title, columns) {
    return '<section class="r-panel"><div class="r-toolbar"><h2>' + esc(title) + '</h2><input class="r-search" data-search="' + id + '" placeholder="Search displayed records"></div><div class="r-table-wrap"><table class="r-table"><thead><tr>' + columns.map(function (column) { return "<th>" + esc(column[1]) + "</th>"; }).join("") + '</tr></thead><tbody id="' + id + '"><tr><td colspan="' + columns.length + '">Loading…</td></tr></tbody></table></div></section>';
  }

  function renderRows(id, rows, columns) {
    const body = document.getElementById(id);
    const query = String(document.querySelector('[data-search="' + id + '"]')?.value || "").toLowerCase();
    const filtered = query ? rows.filter(function (row) { return JSON.stringify(row).toLowerCase().includes(query); }) : rows;
    body.innerHTML = filtered.map(function (row) {
      return "<tr>" + columns.map(function (column) { return "<td>" + esc(shown(nested(row, column[0]))) + "</td>"; }).join("") + "</tr>";
    }).join("") || '<tr><td colspan="' + columns.length + '">No records found.</td></tr>';
  }

  function payload(form) {
    const result = Object.fromEntries(new FormData(form).entries());
    Object.keys(result).forEach(function (key) {
      if (["capacity", "partySize", "discount", "serviceCharge", "quantity", "unitPrice", "minSelect", "maxSelect", "cost", "amount"].includes(key) && result[key] !== "") result[key] = Number(result[key]);
    });
    return result;
  }

  function bindForm(id, method, pathBuilder, transform, reload, idempotent) {
    document.getElementById(id).addEventListener("submit", async function (event) {
      event.preventDefault();
      const status = document.getElementById(id + "Status");
      status.textContent = "Saving…";
      status.className = "r-status";
      try {
        let body = payload(event.currentTarget);
        if (transform) body = transform(body);
        const path = typeof pathBuilder === "function" ? pathBuilder(body) : pathBuilder;
        await request(method, path, body, idempotent);
        status.textContent = "Saved successfully.";
        status.className = "r-status ok";
        event.currentTarget.reset();
        if (reload) await reload();
      } catch (error) {
        status.textContent = error.message || "Save failed";
        status.className = "r-status error";
      }
    });
  }

  async function dashboard() {
    shell("Restaurant Operations Dashboard", "Live floor, order and kitchen control");
    const metrics = await request("GET", "/dashboard");
    document.getElementById("app").innerHTML = '<div class="r-kpis"><div class="r-kpi"><span>Tables</span><strong>' + esc(metrics.tables || 0) + '</strong></div><div class="r-kpi"><span>Open Orders</span><strong>' + esc(metrics.openOrders || 0) + '</strong></div><div class="r-kpi"><span>Kitchen Queue</span><strong>' + esc(metrics.kitchenQueue || 0) + '</strong></div><div class="r-kpi"><span>Service Mode</span><strong>Live</strong></div></div><section class="r-panel"><h2>Service Workflow</h2><div class="r-cards"><div class="r-card">Seat and manage tables</div><div class="r-card">Create dine-in, takeaway and delivery orders</div><div class="r-card">Track kitchen tickets</div><div class="r-card">Control reservations and wastage</div></div></section>';
  }

  async function floor() {
    shell("Floor & Tables", "Table capacity and occupancy administration");
    const columns = [["tableNo", "Table"], ["capacity", "Capacity"], ["status", "Status"], ["active", "Active"]];
    document.getElementById("app").innerHTML = formPanel("tableForm", "Add Table", [
      { name: "tableNo", label: "Table number", type: "text", required: true },
      { name: "capacity", label: "Capacity", type: "number", required: true },
      { name: "areaId", label: "Area ID", type: "text", required: false }
    ], "Add Table") + tablePanel("tableRows", "Tables", columns);
    let rows = [];
    const load = async function () { rows = await request("GET", "/tables"); renderRows("tableRows", rows, columns); };
    bindForm("tableForm", "POST", "/tables", null, load, false);
    document.querySelector('[data-search="tableRows"]').addEventListener("input", function () { renderRows("tableRows", rows, columns); });
    await load();
  }

  async function menu() {
    shell("Menu Management", "Categories, menu items and preparation settings");
    document.getElementById("app").innerHTML = formPanel("categoryForm", "Add Category", [
      { name: "name", label: "Category name", type: "text", required: true },
      { name: "kitchenStation", label: "Kitchen station", type: "text", required: false }
    ]) + formPanel("itemForm", "Add Menu Item", [
      { name: "name", label: "Item name", type: "text", required: true },
      { name: "categoryId", label: "Category ID", type: "text", required: false },
      { name: "sku", label: "SKU", type: "text", required: false },
      { name: "price", label: "Selling price", type: "number", required: true },
      { name: "preparationMinutes", label: "Preparation minutes", type: "number", required: false }
    ]) + tablePanel("categoryRows", "Categories", [["name", "Category"], ["kitchenStation", "Station"]]) + tablePanel("itemRows", "Menu Items", [["name", "Item"], ["sku", "SKU"], ["categoryId", "Category ID"], ["price", "Price"], ["preparationMinutes", "Prep Minutes"]]);
    let menuData = { categories: [], items: [] };
    const load = async function () {
      menuData = await request("GET", "/menu");
      renderRows("categoryRows", menuData.categories || [], [["name", "Category"], ["kitchenStation", "Station"]]);
      renderRows("itemRows", menuData.items || [], [["name", "Item"], ["sku", "SKU"], ["categoryId", "Category ID"], ["price", "Price"], ["preparationMinutes", "Prep Minutes"]]);
    };
    bindForm("categoryForm", "POST", "/menu/categories", null, load, false);
    bindForm("itemForm", "POST", "/menu/items", null, load, false);
    await load();
  }

  async function orders() {
    shell("Order Management", "Create, price and progress restaurant orders");
    const columns = [["orderNo", "Order"], ["orderType", "Type"], ["tableId", "Table"], ["customerName", "Customer"], ["total", "Total"], ["status", "Status"], ["createdAt", "Created"]];
    document.getElementById("app").innerHTML = formPanel("orderForm", "Create Order", [
      { name: "orderType", label: "Order type", type: "select", required: true, options: ["dine_in", "takeaway", "delivery"] },
      { name: "tableId", label: "Table ID", type: "text", required: false },
      { name: "customerName", label: "Customer name", type: "text", required: false },
      { name: "discount", label: "Discount", type: "number", required: false },
      { name: "serviceCharge", label: "Service charge", type: "number", required: false },
      { name: "station", label: "Kitchen station", type: "text", required: false },
      { name: "itemsJson", label: "Items JSON", type: "textarea", required: true, placeholder: '[{"menuItemId":"...","itemName":"Burger","quantity":1,"unitPrice":25}]' }
    ], "Create Order") + formPanel("statusForm", "Update Order Status", [
      { name: "orderId", label: "Order ID", type: "text", required: true },
      { name: "status", label: "Status", type: "select", required: true, options: ["open", "preparing", "ready", "served", "closed", "cancelled"] }
    ], "Update Status") + tablePanel("orderRows", "Orders", columns);
    let rows = [];
    const load = async function () { rows = await request("GET", "/orders"); renderRows("orderRows", rows, columns); };
    bindForm("orderForm", "POST", "/orders", function (body) {
      let items;
      try { items = JSON.parse(body.itemsJson); } catch (_) { throw new Error("Items JSON is invalid"); }
      delete body.itemsJson;
      body.items = items;
      return body;
    }, load, true);
    bindForm("statusForm", "PATCH", function (body) { const id = body.orderId; delete body.orderId; return "/orders/" + encodeURIComponent(id) + "/status"; }, null, load, false);
    document.querySelector('[data-search="orderRows"]').addEventListener("input", function () { renderRows("orderRows", rows, columns); });
    await load();
  }

  async function kitchen() {
    shell("Kitchen Display", "Active kitchen tickets ordered by queue time");
    const columns = [["ticketNo", "Ticket"], ["orderId", "Order ID"], ["station", "Station"], ["status", "Status"], ["createdAt", "Queued"]];
    document.getElementById("app").innerHTML = tablePanel("kitchenRows", "Kitchen Queue", columns);
    const rows = await request("GET", "/kitchen");
    renderRows("kitchenRows", rows, columns);
  }

  async function reservations() {
    shell("Reservations", "Capacity-aware table bookings and guest status");
    const columns = [["reservationNo", "Reservation"], ["customerName", "Guest"], ["phone", "Phone"], ["partySize", "Party"], ["tableId", "Table"], ["reservedAt", "Reserved At"], ["status", "Status"]];
    document.getElementById("app").innerHTML = formPanel("reservationForm", "Create Reservation", [
      { name: "customerName", label: "Customer name", type: "text", required: true },
      { name: "phone", label: "Phone", type: "text", required: false },
      { name: "partySize", label: "Party size", type: "number", required: true },
      { name: "tableId", label: "Table ID", type: "text", required: false },
      { name: "reservedAt", label: "Reserved at", type: "datetime-local", required: true },
      { name: "notes", label: "Notes", type: "textarea", required: false }
    ]) + formPanel("reservationStatusForm", "Update Reservation", [
      { name: "reservationId", label: "Reservation ID", type: "text", required: true },
      { name: "status", label: "Status", type: "select", required: true, options: ["booked", "seated", "completed", "cancelled", "no_show"] }
    ]) + tablePanel("reservationRows", "Reservations", columns);
    let rows = [];
    const load = async function () { rows = await request("GET", "/reservations"); renderRows("reservationRows", rows, columns); };
    bindForm("reservationForm", "POST", "/reservations", null, load, false);
    bindForm("reservationStatusForm", "PATCH", function (body) { const id = body.reservationId; delete body.reservationId; return "/reservations/" + encodeURIComponent(id) + "/status"; }, null, load, false);
    await load();
  }

  async function modifiers() {
    shell("Menu Modifiers", "Controlled modifier groups and selectable add-ons");
    document.getElementById("app").innerHTML = formPanel("groupForm", "Create Modifier Group", [
      { name: "name", label: "Group name", type: "text", required: true },
      { name: "required", label: "Required", type: "select", required: false, options: ["true", "false"] },
      { name: "minSelect", label: "Minimum selections", type: "number", required: false },
      { name: "maxSelect", label: "Maximum selections", type: "number", required: false }
    ]) + formPanel("modifierForm", "Create Modifier", [
      { name: "groupId", label: "Modifier group ID", type: "text", required: true },
      { name: "name", label: "Modifier name", type: "text", required: true },
      { name: "price", label: "Additional price", type: "number", required: false }
    ]) + '<section class="r-panel"><div class="r-note">Modifier records are created through controlled menu APIs. List visibility is provided through menu configuration and order composition.</div></section>';
    bindForm("groupForm", "POST", "/modifier-groups", function (body) { body.required = body.required === "true"; return body; }, null, false);
    bindForm("modifierForm", "POST", "/modifiers", null, null, false);
  }

  async function recipes() {
    shell("Recipes & Consumption", "Recipe definitions supporting food-cost and stock control");
    document.getElementById("app").innerHTML = formPanel("recipeForm", "Create Recipe", [
      { name: "menuItemId", label: "Menu item ID", type: "text", required: true },
      { name: "ingredientsJson", label: "Ingredients JSON", type: "textarea", required: true, placeholder: '[{"productId":"...","quantity":0.25,"unit":"kg"}]' }
    ]) + '<section class="r-panel"><div class="r-note">Recipe ingredients must reference inventory products belonging to the same tenant.</div></section>';
    bindForm("recipeForm", "POST", "/recipes", function (body) {
      try { body.ingredients = JSON.parse(body.ingredientsJson); } catch (_) { throw new Error("Ingredients JSON is invalid"); }
      delete body.ingredientsJson;
      return body;
    }, null, false);
  }

  async function wastage() {
    shell("Wastage Register", "Record and review kitchen loss with reversible audit flow");
    const columns = [["id", "Record ID"], ["productId", "Product"], ["quantity", "Quantity"], ["reason", "Reason"], ["occurredAt", "Occurred"], ["status", "Status"]];
    document.getElementById("app").innerHTML = formPanel("wastageForm", "Record Wastage", [
      { name: "productId", label: "Product ID", type: "text", required: true },
      { name: "quantity", label: "Quantity", type: "number", required: true },
      { name: "reason", label: "Reason", type: "text", required: true },
      { name: "occurredAt", label: "Occurred at", type: "datetime-local", required: false }
    ]) + tablePanel("wastageRows", "Wastage Records", columns);
    let rows = [];
    const load = async function () { rows = await request("GET", "/wastage"); renderRows("wastageRows", rows, columns); };
    bindForm("wastageForm", "POST", "/wastage", null, load, true);
    await load();
  }

  async function reports() {
    shell("Restaurant Reports", "Operational and profitability reporting from the shared backend");
    document.getElementById("app").innerHTML = '<section class="r-panel"><button id="runReport" class="r-btn">Refresh Report</button><pre id="reportOutput"></pre></section>';
    const load = async function () { document.getElementById("reportOutput").textContent = JSON.stringify(await request("GET", "/reports"), null, 2); };
    document.getElementById("runReport").addEventListener("click", load);
    await load();
  }

  async function settings() {
    shell("Restaurant Settings", "Notification rules and service workflow configuration");
    const columns = [["eventKey", "Event"], ["channel", "Channel"], ["daysBefore", "Days Before"], ["active", "Active"]];
    document.getElementById("app").innerHTML = formPanel("ruleForm", "Save Notification Rule", [
      { name: "eventKey", label: "Event key", type: "text", required: true },
      { name: "channel", label: "Channel", type: "select", required: true, options: ["in_app", "email", "sms", "whatsapp"] },
      { name: "daysBefore", label: "Days before", type: "number", required: false },
      { name: "active", label: "Active", type: "select", required: false, options: ["true", "false"] }
    ]) + tablePanel("ruleRows", "Rules", columns);
    let rows = [];
    const load = async function () { rows = await request("GET", "/notification-rules"); renderRows("ruleRows", rows, columns); };
    bindForm("ruleForm", "PUT", "/notification-rules", function (body) { body.active = body.active !== "false"; return body; }, load, false);
    await load();
  }

  const handlers = { dashboard, floor, menu, orders, kitchen, reservations, modifiers, recipes, wastage, reports, settings };
  document.addEventListener("DOMContentLoaded", async function () {
    try {
      await verifyTenant();
      const handler = handlers[PAGE];
      if (!handler) throw new Error("Unsupported Restaurant page.");
      await handler();
    } catch (error) {
      if (!document.getElementById("app")) shell("Restaurant Application", "Unable to open the requested module");
      document.getElementById("app").innerHTML = '<section class="r-panel"><div class="r-status error">' + esc(error.message || "Restaurant application failed") + "</div></section>";
    }
  });
})();
