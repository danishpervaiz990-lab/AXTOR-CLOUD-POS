(function () {
  "use strict";

  const API_ROOT = "/api/v1/restaurant";
  const PAGE = document.body.dataset.page || "dashboard";
  const NAV = [
    ["restaurant-dashboard.html", "Dashboard"],
    ["restaurant-floor.html", "Floor & Tables"],
    ["restaurant-menu.html", "Menu"],
    ["restaurant-orders.html", "Waiter POS & Billing"],
    ["restaurant-kitchen.html", "Kitchen Display"],
    ["restaurant-reservations.html", "Reservations"],
    ["restaurant-modifiers.html", "Modifiers"],
    ["restaurant-recipes.html", "Recipes"],
    ["restaurant-wastage.html", "Wastage"],
    ["restaurant-reports.html", "Reports"],
    ["restaurant-settings.html", "Settings"]
  ];

  const state = {
    context: null,
    accounts: [],
    products: [],
    timers: []
  };

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

  function idempotencyKey(scope) {
    return "restaurant:" + scope + ":" + Date.now() + ":" + crypto.randomUUID();
  }

  async function request(method, path, body, options) {
    const settings = options || {};
    const token = AxtorAPI.getToken();
    if (!token) {
      AxtorAPI.goToLogin("authentication-required", { clearToken: false });
      throw new Error("Authentication required.");
    }

    const headers = {
      Accept: "application/json",
      Authorization: "Bearer " + token
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (settings.idempotent) {
      headers["Idempotency-Key"] = settings.idempotencyKey || idempotencyKey(path.replace(/[^a-z0-9]+/gi, "-"));
    }

    let response;
    try {
      response = await fetch(apiUrl(path), {
        method: method,
        headers: headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store"
      });
    } catch (_) {
      throw new Error("Cannot connect to the Restaurant backend. Check the connection and retry.");
    }

    const payload = await response.json().catch(function () { return null; });
    if (response.status === 401) {
      AxtorAPI.goToLogin("session-expired", { clearToken: true });
      throw new Error("Session expired.");
    }
    if (!response.ok) {
      throw new Error(payload?.error?.message || payload?.message || "Restaurant request failed");
    }
    return unwrap(payload);
  }

  async function sharedRequest(method, path, body, options) {
    const settings = options || {};
    const token = AxtorAPI.getToken();
    if (!token) throw new Error("Authentication required.");
    const headers = { Accept: "application/json", Authorization: "Bearer " + token };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (settings.idempotent) headers["Idempotency-Key"] = settings.idempotencyKey || idempotencyKey("shared");
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
    if (!response.ok) throw new Error(payload?.error?.message || payload?.message || "Request failed");
    return unwrap(payload);
  }

  function businessCurrency() {
    try {
      const business = JSON.parse(localStorage.getItem("axtorBusiness") || "{}");
      return business.currency || business.currencyCode || "QAR";
    } catch (_) {
      return "QAR";
    }
  }

  function money(value) {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: businessCurrency(),
      maximumFractionDigits: 2
    }).format(Number(value || 0));
  }

  function dateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  }

  function relativeMinutes(value) {
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return "—";
    const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
    return minutes < 1 ? "just now" : minutes + " min";
  }

  function statusChip(status) {
    const value = String(status || "unknown").toLowerCase();
    return '<span class="r-status-chip ' + esc(value) + '">' + esc(value.replaceAll("_", " ")) + "</span>";
  }

  function shell(title, subtitle, actions) {
    const currentFile = window.location.pathname.split("/").pop();
    const links = NAV.map(function (item) {
      return '<a class="' + (item[0] === currentFile ? "active" : "") + '" href="' + item[0] + '">' + esc(item[1]) + "</a>";
    }).join("");
    document.body.innerHTML = [
      '<div class="r-shell">',
      '<aside class="r-nav">',
      '<div class="r-brand"><div>AXTOR RESTAURANT<small>Service Operations</small></div></div>',
      '<nav class="r-nav-links">' + links + "</nav>",
      '<div class="r-nav-footer">Dedicated Restaurant workflows<br>Shared AXTOR backend · Tenant isolated</div>',
      "</aside>",
      '<main class="r-main">',
      '<section class="r-hero">',
      '<div class="r-hero-copy"><span class="r-eyebrow">Restaurant POS</span><h1>' + esc(title) + "</h1><p>" + esc(subtitle) + "</p></div>",
      '<div class="r-hero-actions">' + (actions || "") + "</div>",
      "</section>",
      '<div id="app"></div>',
      "</main></div>",
      '<div id="modalRoot"></div>'
    ].join("");
  }

  function panel(title, subtitle, content, extraClass) {
    return '<section class="r-panel ' + esc(extraClass || "") + '"><div class="r-panel-head"><div><h2>' + esc(title) + "</h2>" + (subtitle ? "<p>" + esc(subtitle) + "</p>" : "") + "</div></div>" + content + "</section>";
  }

  function field(name, label, type, value, options) {
    const settings = options || {};
    const required = settings.required ? " required" : "";
    const placeholder = settings.placeholder ? ' placeholder="' + esc(settings.placeholder) + '"' : "";
    const step = settings.step ? ' step="' + esc(settings.step) + '"' : "";
    const min = settings.min !== undefined ? ' min="' + esc(settings.min) + '"' : "";
    const max = settings.max !== undefined ? ' max="' + esc(settings.max) + '"' : "";
    const inputValue = value !== undefined && value !== null ? ' value="' + esc(value) + '"' : "";
    return '<div class="r-field"><label for="' + esc(name) + '">' + esc(label) + '</label><input id="' + esc(name) + '" name="' + esc(name) + '" type="' + esc(type || "text") + '"' + inputValue + required + placeholder + step + min + max + "></div>";
  }

  function selectField(name, label, options, selected, settings) {
    const config = settings || {};
    const required = config.required ? " required" : "";
    const blank = config.blank === false ? "" : '<option value="">' + esc(config.blankLabel || "Select") + "</option>";
    return '<div class="r-field"><label for="' + esc(name) + '">' + esc(label) + '</label><select id="' + esc(name) + '" name="' + esc(name) + '"' + required + ">" + blank + options.map(function (option) {
      const item = typeof option === "string" ? { value: option, label: option.replaceAll("_", " ") } : option;
      return '<option value="' + esc(item.value) + '"' + (String(item.value) === String(selected ?? "") ? " selected" : "") + ">" + esc(item.label) + "</option>";
    }).join("") + "</select></div>";
  }

  function textAreaField(name, label, value, settings) {
    const config = settings || {};
    return '<div class="r-field"><label for="' + esc(name) + '">' + esc(label) + '</label><textarea id="' + esc(name) + '" name="' + esc(name) + '"' + (config.required ? " required" : "") + (config.placeholder ? ' placeholder="' + esc(config.placeholder) + '"' : "") + ">" + esc(value || "") + "</textarea></div>";
  }

  function formValues(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  function setStatus(element, message, kind) {
    if (!element) return;
    element.textContent = message || "";
    element.className = "r-status" + (kind ? " " + kind : "");
  }

  function showModal(content) {
    const root = document.getElementById("modalRoot");
    root.innerHTML = '<div class="r-modal-backdrop" data-close-modal><div class="r-modal" role="dialog" aria-modal="true">' + content + "</div></div>";
    root.querySelector("[data-close-modal]").addEventListener("click", function (event) {
      if (event.target === event.currentTarget) closeModal();
    });
    root.querySelectorAll("[data-modal-close]").forEach(function (button) {
      button.addEventListener("click", closeModal);
    });
  }

  function closeModal() {
    const root = document.getElementById("modalRoot");
    if (root) root.innerHTML = "";
  }

  function showPageError(error) {
    const app = document.getElementById("app");
    if (app) app.innerHTML = '<div class="r-alert error">' + esc(error?.message || "Restaurant application failed") + "</div>";
  }

  async function verifyTenant() {
    const registry = unwrap(await AxtorAPI.apiGet("/api/v1/industry/registry")) || {};
    const code = String(registry.selection?.code || registry.selected?.code || "").toLowerCase();
    if (code !== "restaurant") throw new Error("This application is available only to Restaurant tenants.");
  }

  async function loadContext(force) {
    if (!force && state.context) return state.context;
    state.context = await request("GET", "/context");
    return state.context;
  }

  async function loadAccounts(force) {
    if (!force && state.accounts.length) return state.accounts;
    const result = await sharedRequest("GET", "/api/v1/accounts?active=true");
    state.accounts = Array.isArray(result?.accounts) ? result.accounts : Array.isArray(result) ? result : [];
    return state.accounts;
  }

  async function loadProducts(force) {
    if (!force && state.products.length) return state.products;
    const result = await sharedRequest("GET", "/api/v1/products?active=true");
    state.products = Array.isArray(result?.products) ? result.products : Array.isArray(result?.data) ? result.data : Array.isArray(result) ? result : [];
    return state.products;
  }

  function tableName(context, tableId) {
    return context.tables.find(function (table) { return String(table.id) === String(tableId); })?.tableNo || "—";
  }

  function categoryName(context, categoryId) {
    return context.categories.find(function (category) { return String(category.id) === String(categoryId); })?.name || "Uncategorised";
  }

  async function dashboard() {
    shell("Restaurant Operations Dashboard", "See the floor, kitchen queue, open orders and today’s service pressure in one place.", '<a class="r-btn" href="restaurant-orders.html">Open Waiter POS</a>');
    const [metrics, context, kitchen, reservations] = await Promise.all([
      request("GET", "/dashboard"),
      loadContext(true),
      request("GET", "/kitchen/board"),
      request("GET", "/reservations")
    ]);
    const occupied = context.tables.filter(function (table) { return table.status === "occupied"; }).length;
    const today = new Date().toDateString();
    const todayReservations = reservations.filter(function (row) { return new Date(row.reservedAt).toDateString() === today; });
    document.getElementById("app").innerHTML = [
      '<div class="r-kpis">',
      '<article class="r-kpi"><span>Open orders</span><strong>' + esc(metrics.openOrders || context.openOrders.length) + '</strong><small>Active service tickets</small></article>',
      '<article class="r-kpi"><span>Occupied tables</span><strong>' + esc(occupied) + '/' + esc(context.tables.length) + '</strong><small>Current floor utilisation</small></article>',
      '<article class="r-kpi"><span>Kitchen queue</span><strong>' + esc(metrics.kitchenQueue || kitchen.length) + '</strong><small>Queued and preparing</small></article>',
      '<article class="r-kpi"><span>Today reservations</span><strong>' + esc(todayReservations.length) + '</strong><small>Booked guest parties</small></article>',
      "</div>",
      panel("Service shortcuts", "Move directly into the operational screen you need.", '<div class="r-summary-grid">' + [
        ["restaurant-floor.html", "Floor control", "Seat guests and manage table status"],
        ["restaurant-orders.html", "Waiter POS", "Create orders and settle bills"],
        ["restaurant-kitchen.html", "Kitchen display", "Prepare and complete KOTs"],
        ["restaurant-reservations.html", "Reservations", "Manage bookings and seating"]
      ].map(function (item) {
        return '<a class="r-summary-card" href="' + item[0] + '"><span>' + esc(item[1]) + '</span><strong>Open</strong><small>' + esc(item[2]) + "</small></a>";
      }).join("") + "</div>"),
      panel("Live floor snapshot", "Tables with open orders are highlighted.", '<div class="r-table-map">' + context.tables.slice(0, 12).map(function (table) {
        return '<article class="r-table-card"><div class="r-table-head"><h3>Table ' + esc(table.tableNo) + "</h3>" + statusChip(table.status) + '</div><p>' + esc(table.area?.name || "Main floor") + ' · ' + esc(table.capacity) + ' seats</p>' + (table.openOrder ? '<strong>' + esc(table.openOrder.orderNo) + ' · ' + money(table.openOrder.total) + "</strong>" : '<span class="r-muted">No open order</span>') + "</article>";
      }).join("") + "</div>")
    ].join("");
  }

  async function floor() {
    shell("Floor & Table Control", "Use a visual table map to seat guests, open orders and manage cleaning or reservation status.", '<a class="r-btn" href="restaurant-orders.html">New order</a>');
    const context = await loadContext(true);

    function render() {
      const app = document.getElementById("app");
      const areaOptions = context.areas.map(function (area) { return { value: area.id, label: area.name }; });
      app.innerHTML = [
        '<div class="r-kpis">',
        '<article class="r-kpi"><span>Available</span><strong>' + context.tables.filter(function (table) { return table.status === "available"; }).length + '</strong><small>Ready for seating</small></article>',
        '<article class="r-kpi"><span>Occupied</span><strong>' + context.tables.filter(function (table) { return table.status === "occupied"; }).length + '</strong><small>Active guest tables</small></article>',
        '<article class="r-kpi"><span>Reserved</span><strong>' + context.tables.filter(function (table) { return table.status === "reserved"; }).length + '</strong><small>Held for bookings</small></article>',
        '<article class="r-kpi"><span>Cleaning / offline</span><strong>' + context.tables.filter(function (table) { return ["cleaning", "out_of_service"].includes(table.status); }).length + '</strong><small>Not ready for guests</small></article>',
        "</div>",
        panel("Floor map", "Tap a table to start an order or change its operational state.", '<div class="r-table-map">' + context.tables.map(function (table) {
          const order = table.openOrder;
          return '<article class="r-table-card" data-table-card="' + esc(table.id) + '"><div class="r-table-head"><h3>Table ' + esc(table.tableNo) + "</h3>" + statusChip(table.status) + '</div><p>' + esc(table.area?.name || "Main floor") + ' · ' + esc(table.capacity) + ' seats</p>' + (order ? '<strong>' + esc(order.orderNo) + ' · ' + money(order.total) + '</strong><small class="r-muted">' + esc(order.orderType.replaceAll("_", " ")) + "</small>" : '<span class="r-muted">Ready for service</span>') + '<div class="r-card-actions">' + (order ? '<button class="r-btn small" data-open-order="' + esc(order.id) + '">Open order</button>' : '<button class="r-btn small" data-new-order="' + esc(table.id) + '">Start order</button>') + '<button class="r-btn secondary small" data-table-status="' + esc(table.id) + '">Status</button></div></article>';
        }).join("") + "</div>"),
        panel("Floor setup", "Create service areas and tables without entering database IDs.", '<div class="r-grid two"><form id="areaForm" class="r-grid one">' + field("areaName", "New area", "text", "", { required: true, placeholder: "Terrace, Main Hall, VIP" }) + '<div class="r-actions"><button class="r-btn" type="submit">Add area</button></div><div id="areaStatus" class="r-status"></div></form><form id="tableForm" class="r-grid two">' + field("tableNo", "Table number", "text", "", { required: true, placeholder: "T-01" }) + field("capacity", "Capacity", "number", 2, { required: true, min: 1, max: 30 }) + selectField("areaId", "Area", areaOptions, "", { blankLabel: "Main floor" }) + '<div class="r-actions"><button class="r-btn" type="submit">Add table</button></div><div id="tableStatus" class="r-status"></div></form></div>')
      ].join("");

      app.querySelectorAll("[data-new-order]").forEach(function (button) {
        button.addEventListener("click", function () {
          sessionStorage.setItem("restaurantSelectedTableId", button.dataset.newOrder);
          window.location.assign("restaurant-orders.html");
        });
      });
      app.querySelectorAll("[data-open-order]").forEach(function (button) {
        button.addEventListener("click", function () {
          sessionStorage.setItem("restaurantOpenOrderId", button.dataset.openOrder);
          window.location.assign("restaurant-orders.html");
        });
      });
      app.querySelectorAll("[data-table-status]").forEach(function (button) {
        button.addEventListener("click", function () { openTableStatus(button.dataset.tableStatus); });
      });

      document.getElementById("areaForm").addEventListener("submit", async function (event) {
        event.preventDefault();
        const status = document.getElementById("areaStatus");
        setStatus(status, "Saving…");
        try {
          await request("POST", "/areas", { name: formValues(event.currentTarget).areaName });
          state.context = null;
          Object.assign(context, await loadContext(true));
          setStatus(status, "Area added.", "ok");
          render();
        } catch (error) { setStatus(status, error.message, "error"); }
      });
      document.getElementById("tableForm").addEventListener("submit", async function (event) {
        event.preventDefault();
        const status = document.getElementById("tableStatus");
        const values = formValues(event.currentTarget);
        setStatus(status, "Saving…");
        try {
          await request("POST", "/tables", {
            tableNo: values.tableNo,
            capacity: Number(values.capacity),
            areaId: values.areaId || null
          });
          state.context = null;
          Object.assign(context, await loadContext(true));
          setStatus(status, "Table added.", "ok");
          render();
        } catch (error) { setStatus(status, error.message, "error"); }
      });
    }

    function openTableStatus(tableId) {
      const table = context.tables.find(function (row) { return String(row.id) === String(tableId); });
      if (!table) return;
      showModal('<div class="r-panel-head"><div><h2>Table ' + esc(table.tableNo) + '</h2><p>Current status: ' + esc(table.status.replaceAll("_", " ")) + '</p></div><button class="r-btn ghost small" data-modal-close>Close</button></div><div class="r-grid one">' + selectField("tableStatusSelect", "New status", ["available", "occupied", "reserved", "cleaning", "out_of_service"], table.status, { blank: false }) + '<div class="r-actions"><button id="saveTableStatus" class="r-btn">Save status</button></div><div id="tableModalStatus" class="r-status"></div></div>');
      document.getElementById("saveTableStatus").addEventListener("click", async function () {
        const status = document.getElementById("tableModalStatus");
        setStatus(status, "Saving…");
        try {
          await request("PATCH", "/tables/" + encodeURIComponent(table.id) + "/status", { status: document.getElementById("tableStatusSelect").value });
          state.context = null;
          Object.assign(context, await loadContext(true));
          closeModal();
          render();
        } catch (error) { setStatus(status, error.message, "error"); }
      });
    }

    render();
  }

  async function menu() {
    shell("Menu Management", "Maintain categories, pricing and kitchen routing with human-readable selections.");
    const context = await loadContext(true);

    function render() {
      const categoryOptions = context.categories.map(function (row) { return { value: row.id, label: row.name }; });
      document.getElementById("app").innerHTML = [
        panel("Add menu category", "Route categories to a kitchen station such as Grill, Bar or Pastry.", '<form id="categoryForm" class="r-grid two">' + field("categoryName", "Category name", "text", "", { required: true }) + field("kitchenStation", "Kitchen station", "text", "", { placeholder: "Main, Grill, Bar" }) + '<div class="r-actions"><button class="r-btn" type="submit">Add category</button></div><div id="categoryStatus" class="r-status"></div></form>'),
        panel("Add menu item", "Create orderable items without entering category IDs.", '<form id="menuItemForm" class="r-grid">' + field("itemName", "Item name", "text", "", { required: true }) + selectField("categoryId", "Category", categoryOptions, "", { blankLabel: "Uncategorised" }) + field("sku", "SKU", "text", "", { placeholder: "Optional" }) + field("price", "Selling price", "number", "", { required: true, min: 0, step: "0.01" }) + field("preparationMinutes", "Preparation minutes", "number", 10, { min: 0, max: 240 }) + '<div class="r-actions"><button class="r-btn" type="submit">Add menu item</button></div><div id="itemStatus" class="r-status"></div></form>'),
        panel("Menu catalogue", "Search all active menu items.", '<div class="r-toolbar"><input id="menuSearch" class="r-search" placeholder="Search menu"></div><div class="r-menu-grid" id="menuCards"></div>')
      ].join("");

      function renderCards() {
        const query = document.getElementById("menuSearch").value.trim().toLowerCase();
        const rows = context.menuItems.filter(function (item) {
          return !query || (item.name + " " + (item.sku || "") + " " + categoryName(context, item.categoryId)).toLowerCase().includes(query);
        });
        document.getElementById("menuCards").innerHTML = rows.map(function (item) {
          return '<article class="r-menu-card"><div><h3>' + esc(item.name) + '</h3><p>' + esc(categoryName(context, item.categoryId)) + ' · ' + esc(item.preparationMinutes || 0) + ' min</p></div><strong>' + money(item.price) + "</strong></article>";
        }).join("") || '<div class="r-empty">No menu items matched.</div>';
      }
      document.getElementById("menuSearch").addEventListener("input", renderCards);
      renderCards();

      document.getElementById("categoryForm").addEventListener("submit", async function (event) {
        event.preventDefault();
        const values = formValues(event.currentTarget);
        const status = document.getElementById("categoryStatus");
        setStatus(status, "Saving…");
        try {
          await request("POST", "/menu/categories", { name: values.categoryName, kitchenStation: values.kitchenStation || null });
          state.context = null;
          Object.assign(context, await loadContext(true));
          render();
        } catch (error) { setStatus(status, error.message, "error"); }
      });
      document.getElementById("menuItemForm").addEventListener("submit", async function (event) {
        event.preventDefault();
        const values = formValues(event.currentTarget);
        const status = document.getElementById("itemStatus");
        setStatus(status, "Saving…");
        try {
          await request("POST", "/menu/items", {
            name: values.itemName,
            categoryId: values.categoryId || null,
            sku: values.sku || null,
            price: Number(values.price),
            preparationMinutes: Number(values.preparationMinutes || 10)
          });
          state.context = null;
          Object.assign(context, await loadContext(true));
          render();
        } catch (error) { setStatus(status, error.message, "error"); }
      });
    }

    render();
  }

  async function orders() {
    shell("Waiter POS & Billing", "Build orders from the live menu, assign tables, progress service and settle bills with split payments.", '<a class="r-btn secondary" href="restaurant-kitchen.html">Kitchen Display</a>');
    const [context, accounts] = await Promise.all([loadContext(true), loadAccounts(true)]);
    let cart = [];
    let activeCategory = "all";
    let selectedTableId = sessionStorage.getItem("restaurantSelectedTableId") || "";
    let orderType = selectedTableId ? "dine_in" : "takeaway";
    let customerName = "";
    let discount = 0;
    let serviceCharge = 0;

    function cartSubtotal() {
      return cart.reduce(function (sum, line) { return sum + line.quantity * Number(line.unitPrice); }, 0);
    }

    function cartTotal() {
      return Math.max(0, cartSubtotal() - Number(discount || 0) + Number(serviceCharge || 0));
    }

    function render() {
      const categories = [{ id: "all", name: "All" }].concat(context.categories);
      const tableOptions = context.tables.filter(function (table) {
        return ["available", "occupied", "reserved"].includes(table.status) || String(table.id) === String(selectedTableId);
      }).map(function (table) {
        return { value: table.id, label: "Table " + table.tableNo + " · " + table.status.replaceAll("_", " ") };
      });
      const visibleItems = context.menuItems.filter(function (item) {
        return activeCategory === "all" || String(item.categoryId) === String(activeCategory);
      });

      document.getElementById("app").innerHTML = [
        '<div class="r-order-layout">',
        '<div class="r-order-catalog">',
        panel("Order details", "Choose service type and guest context.", '<div class="r-grid">' + selectField("orderType", "Order type", ["dine_in", "takeaway", "delivery"], orderType, { blank: false }) + selectField("orderTable", "Table", tableOptions, selectedTableId, { blankLabel: "No table" }) + field("orderCustomer", "Guest / customer", "text", customerName, { placeholder: "Walk-in Customer" }) + "</div>"),
        panel("Menu", "Tap an item to add it to the current order.", '<div class="r-category-tabs">' + categories.map(function (category) {
          return '<button class="r-category-tab ' + (String(category.id) === String(activeCategory) ? "active" : "") + '" data-category="' + esc(category.id) + '">' + esc(category.name) + "</button>";
        }).join("") + '</div><div class="r-menu-grid">' + visibleItems.map(function (item) {
          return '<button class="r-menu-card" data-add-menu="' + esc(item.id) + '"><div><h3>' + esc(item.name) + '</h3><p>' + esc(categoryName(context, item.categoryId)) + ' · ' + esc(item.preparationMinutes || 0) + ' min</p></div><strong>' + money(item.price) + "</strong></button>";
        }).join("") + "</div>"),
        panel("Open orders", "Review, progress or settle active orders.", '<div class="r-table-wrap"><table class="r-table"><thead><tr><th>Order</th><th>Type / table</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead><tbody>' + context.openOrders.map(function (order) {
          return '<tr><td><strong>' + esc(order.orderNo) + '</strong><small>' + esc(order.customerName || "Walk-in Customer") + '</small></td><td>' + esc(order.orderType.replaceAll("_", " ")) + (order.tableId ? '<small>Table ' + esc(tableName(context, order.tableId)) + "</small>" : "") + '</td><td>' + money(order.total) + '</td><td>' + statusChip(order.status) + '</td><td><div class="r-row-actions"><button class="r-btn ghost small" data-view-order="' + esc(order.id) + '">View</button><button class="r-btn secondary small" data-progress-order="' + esc(order.id) + '">Progress</button><button class="r-btn small" data-settle-order="' + esc(order.id) + '">Settle</button></div></td></tr>';
        }).join("") + (context.openOrders.length ? "" : '<tr><td colspan="5">No open orders.</td></tr>') + "</tbody></table></div>"),
        "</div>",
        '<aside class="r-order-cart">',
        panel("Current order", cart.length + " line(s)", '<div class="r-cart-lines">' + (cart.length ? cart.map(function (line, index) {
          return '<article class="r-cart-line"><div><h4>' + esc(line.itemName) + '</h4><small>' + money(line.unitPrice) + ' each</small></div><div><strong>' + money(line.quantity * line.unitPrice) + '</strong><div class="r-qty-control"><button data-cart-minus="' + index + '">−</button><span>' + esc(line.quantity) + '</span><button data-cart-plus="' + index + '">+</button></div></div></article>';
        }).join("") : '<div class="r-empty">Tap menu items to build an order.</div>') + '</div><div class="r-grid two" style="margin-top:14px">' + field("orderDiscount", "Discount", "number", discount, { min: 0, step: "0.01" }) + field("orderService", "Service charge", "number", serviceCharge, { min: 0, step: "0.01" }) + '</div><div class="r-totals"><div class="r-total-line"><span>Subtotal</span><strong>' + money(cartSubtotal()) + '</strong></div><div class="r-total-line"><span>Discount</span><strong>− ' + money(discount) + '</strong></div><div class="r-total-line"><span>Service charge</span><strong>' + money(serviceCharge) + '</strong></div><div class="r-total-line grand"><span>Total</span><strong>' + money(cartTotal()) + '</strong></div></div><div class="r-actions" style="margin-top:14px"><button id="clearCart" class="r-btn ghost" type="button">Clear</button><button id="sendOrder" class="r-btn" type="button"' + (cart.length ? "" : " disabled") + '>Send to kitchen</button></div><div id="orderStatus" class="r-status"></div>'),
        "</aside></div>"
      ].join("");

      document.querySelectorAll("[data-category]").forEach(function (button) {
        button.addEventListener("click", function () { activeCategory = button.dataset.category; render(); });
      });
      document.querySelectorAll("[data-add-menu]").forEach(function (button) {
        button.addEventListener("click", function () {
          const item = context.menuItems.find(function (row) { return String(row.id) === String(button.dataset.addMenu); });
          if (!item) return;
          const existing = cart.find(function (line) { return String(line.menuItemId) === String(item.id); });
          if (existing) existing.quantity += 1;
          else cart.push({ menuItemId: item.id, itemName: item.name, quantity: 1, unitPrice: Number(item.price), modifiers: [] });
          render();
        });
      });
      document.querySelectorAll("[data-cart-minus]").forEach(function (button) {
        button.addEventListener("click", function () {
          const index = Number(button.dataset.cartMinus);
          if (!cart[index]) return;
          cart[index].quantity -= 1;
          if (cart[index].quantity <= 0) cart.splice(index, 1);
          render();
        });
      });
      document.querySelectorAll("[data-cart-plus]").forEach(function (button) {
        button.addEventListener("click", function () { const line = cart[Number(button.dataset.cartPlus)]; if (line) line.quantity += 1; render(); });
      });
      document.getElementById("orderType").addEventListener("change", function (event) { orderType = event.target.value; if (orderType !== "dine_in") selectedTableId = ""; render(); });
      document.getElementById("orderTable").addEventListener("change", function (event) { selectedTableId = event.target.value; });
      document.getElementById("orderCustomer").addEventListener("input", function (event) { customerName = event.target.value; });
      document.getElementById("orderDiscount").addEventListener("input", function (event) { discount = Number(event.target.value || 0); render(); });
      document.getElementById("orderService").addEventListener("input", function (event) { serviceCharge = Number(event.target.value || 0); render(); });
      document.getElementById("clearCart").addEventListener("click", function () { cart = []; render(); });
      document.getElementById("sendOrder").addEventListener("click", async function () {
        const status = document.getElementById("orderStatus");
        setStatus(status, "Posting order…");
        try {
          if (orderType === "dine_in" && !selectedTableId) throw new Error("Choose a table for a dine-in order.");
          await request("POST", "/orders", {
            orderType: orderType,
            tableId: selectedTableId || null,
            customerName: customerName || null,
            discount: discount,
            serviceCharge: serviceCharge,
            station: "main",
            items: cart
          }, { idempotent: true });
          cart = [];
          sessionStorage.removeItem("restaurantSelectedTableId");
          state.context = null;
          Object.assign(context, await loadContext(true));
          render();
        } catch (error) { setStatus(status, error.message, "error"); }
      });
      document.querySelectorAll("[data-view-order]").forEach(function (button) { button.addEventListener("click", function () { openOrderDetail(button.dataset.viewOrder); }); });
      document.querySelectorAll("[data-progress-order]").forEach(function (button) { button.addEventListener("click", function () { openOrderProgress(button.dataset.progressOrder); }); });
      document.querySelectorAll("[data-settle-order]").forEach(function (button) { button.addEventListener("click", function () { openSettlement(button.dataset.settleOrder); }); });
    }

    async function refreshOrders() {
      state.context = null;
      Object.assign(context, await loadContext(true));
      render();
    }

    async function openOrderDetail(orderId) {
      try {
        const order = await request("GET", "/orders/" + encodeURIComponent(orderId));
        showModal('<div class="r-panel-head"><div><h2>' + esc(order.orderNo) + '</h2><p>' + esc(order.orderType.replaceAll("_", " ")) + (order.table ? " · Table " + esc(order.table.tableNo) : "") + '</p></div><button class="r-btn ghost small" data-modal-close>Close</button></div><div class="r-summary-grid"><article class="r-summary-card"><span>Status</span><strong>' + esc(order.status) + '</strong></article><article class="r-summary-card"><span>Subtotal</span><strong>' + money(order.subtotal) + '</strong></article><article class="r-summary-card"><span>Discount</span><strong>' + money(order.discount) + '</strong></article><article class="r-summary-card"><span>Total</span><strong>' + money(order.total) + '</strong></article></div><div class="r-table-wrap" style="margin-top:14px"><table class="r-table"><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th><th>Preparation</th></tr></thead><tbody>' + order.items.map(function (item) { return '<tr><td>' + esc(item.itemName) + '</td><td>' + esc(item.quantity) + '</td><td>' + money(item.unitPrice) + '</td><td>' + money(item.lineTotal) + '</td><td>' + statusChip(item.preparationStatus) + "</td></tr>"; }).join("") + "</tbody></table></div>");
      } catch (error) { showPageError(error); }
    }

    function openOrderProgress(orderId) {
      const order = context.openOrders.find(function (row) { return String(row.id) === String(orderId); });
      if (!order) return;
      showModal('<div class="r-panel-head"><div><h2>Progress ' + esc(order.orderNo) + '</h2><p>Move the order through service stages.</p></div><button class="r-btn ghost small" data-modal-close>Close</button></div><div class="r-grid one">' + selectField("orderProgressStatus", "New status", ["open", "preparing", "ready", "served", "cancelled"], order.status, { blank: false }) + '<div class="r-actions"><button id="saveOrderProgress" class="r-btn">Update order</button></div><div id="progressStatus" class="r-status"></div></div>');
      document.getElementById("saveOrderProgress").addEventListener("click", async function () {
        const status = document.getElementById("progressStatus");
        setStatus(status, "Saving…");
        try {
          await request("PATCH", "/orders/" + encodeURIComponent(order.id) + "/status", { status: document.getElementById("orderProgressStatus").value });
          closeModal();
          await refreshOrders();
        } catch (error) { setStatus(status, error.message, "error"); }
      });
    }

    async function openSettlement(orderId) {
      try {
        const order = await request("GET", "/orders/" + encodeURIComponent(orderId));
        const accountOptions = accounts.map(function (account) { return { value: account.id, label: account.name + " · " + account.type }; });
        showModal('<div class="r-panel-head"><div><h2>Settle ' + esc(order.orderNo) + '</h2><p>Current bill ' + money(order.total) + '</p></div><button class="r-btn ghost small" data-modal-close>Close</button></div><div class="r-grid">' + field("settleDiscount", "Discount", "number", Number(order.discount || 0), { min: 0, step: "0.01" }) + field("settleService", "Service charge", "number", Number(order.serviceCharge || 0), { min: 0, step: "0.01" }) + field("settleTip", "Tip", "number", Number(order.tip || 0), { min: 0, step: "0.01" }) + '</div><div class="r-panel-head" style="margin-top:18px"><div><h3>Payment lines</h3><p>Use multiple lines for split payment.</p></div><button id="addPaymentLine" class="r-btn secondary small">Add split line</button></div><div id="paymentLines" class="r-payment-lines"></div><div class="r-actions" style="margin-top:16px"><button id="settleButton" class="r-btn">Post settlement</button></div><div id="settleStatus" class="r-status"></div>');
        const paymentLines = [{ method: "cash", amount: Number(order.total || 0), accountId: "", referenceNo: "" }];

        function adjustedTotal() {
          return Math.max(0, Number(order.subtotal || 0) - Number(document.getElementById("settleDiscount")?.value || 0) + Number(document.getElementById("settleService")?.value || 0) + Number(document.getElementById("settleTip")?.value || 0));
        }

        function renderPaymentLines() {
          document.getElementById("paymentLines").innerHTML = paymentLines.map(function (line, index) {
            return '<div class="r-payment-line">' + selectField("paymentMethod" + index, "Method", ["cash", "card", "debit card", "credit card", "bank transfer", "wallet", "cheque"], line.method, { blank: false }) + field("paymentAmount" + index, "Amount", "number", line.amount, { required: true, min: 0, step: "0.01" }) + selectField("paymentAccount" + index, "Account", accountOptions, line.accountId, { blankLabel: "No account" }) + '<button class="r-btn danger small" data-remove-payment="' + index + '"' + (paymentLines.length === 1 ? " disabled" : "") + '>Remove</button></div>';
          }).join("");
          paymentLines.forEach(function (line, index) {
            document.getElementById("paymentMethod" + index).addEventListener("change", function (event) { line.method = event.target.value; });
            document.getElementById("paymentAmount" + index).addEventListener("input", function (event) { line.amount = Number(event.target.value || 0); });
            document.getElementById("paymentAccount" + index).addEventListener("change", function (event) { line.accountId = event.target.value; });
          });
          document.querySelectorAll("[data-remove-payment]").forEach(function (button) {
            button.addEventListener("click", function () { paymentLines.splice(Number(button.dataset.removePayment), 1); renderPaymentLines(); });
          });
        }
        renderPaymentLines();
        ["settleDiscount", "settleService", "settleTip"].forEach(function (id) {
          document.getElementById(id).addEventListener("input", function () {
            if (paymentLines.length === 1) {
              paymentLines[0].amount = adjustedTotal();
              renderPaymentLines();
            }
          });
        });
        document.getElementById("addPaymentLine").addEventListener("click", function () {
          paymentLines.push({ method: "card", amount: 0, accountId: "", referenceNo: "" });
          renderPaymentLines();
        });
        document.getElementById("settleButton").addEventListener("click", async function () {
          const status = document.getElementById("settleStatus");
          setStatus(status, "Posting settlement…");
          try {
            const result = await request("POST", "/orders/" + encodeURIComponent(order.id) + "/settle", {
              discount: Number(document.getElementById("settleDiscount").value || 0),
              serviceCharge: Number(document.getElementById("settleService").value || 0),
              tip: Number(document.getElementById("settleTip").value || 0),
              payments: paymentLines
            }, { idempotent: true });
            setStatus(status, "Settlement posted. Change due: " + money(result.changeDue || 0), "ok");
            setTimeout(async function () { closeModal(); await refreshOrders(); }, 700);
          } catch (error) { setStatus(status, error.message, "error"); }
        });
      } catch (error) { showPageError(error); }
    }

    const requestedOrderId = sessionStorage.getItem("restaurantOpenOrderId");
    sessionStorage.removeItem("restaurantOpenOrderId");
    render();
    if (requestedOrderId) openOrderDetail(requestedOrderId);
  }

  async function kitchen() {
    shell("Kitchen Display System", "Live KOT cards show ordered items, elapsed time and preparation actions.", '<button id="refreshKitchen" class="r-btn">Refresh</button>');

    async function load() {
      const tickets = await request("GET", "/kitchen/board");
      document.getElementById("app").innerHTML = '<div class="r-kds-board">' + tickets.map(function (ticket) {
        return '<article class="r-kds-ticket" data-status="' + esc(ticket.status) + '"><div class="r-ticket-head"><div><h3>' + esc(ticket.ticketNo) + '</h3><span class="r-ticket-time">' + esc(relativeMinutes(ticket.createdAt)) + ' · ' + esc(ticket.station) + '</span></div>' + statusChip(ticket.status) + '</div><div class="r-ticket-items">' + ticket.items.map(function (item) {
          return '<div class="r-ticket-item"><span><strong>' + esc(item.quantity) + '×</strong> ' + esc(item.itemName) + '</span>' + statusChip(item.preparationStatus) + "</div>";
        }).join("") + '</div><div class="r-ticket-actions">' + (ticket.status === "queued" ? '<button class="r-btn secondary small" data-kitchen-action="preparing" data-ticket="' + esc(ticket.id) + '">Start</button>' : "") + (ticket.status === "preparing" ? '<button class="r-btn small" data-kitchen-action="ready" data-ticket="' + esc(ticket.id) + '">Mark ready</button>' : "") + (ticket.status === "ready" ? '<button class="r-btn small" data-kitchen-action="completed" data-ticket="' + esc(ticket.id) + '">Complete</button>' : "") + '</div><div class="r-status" id="ticketStatus' + esc(ticket.id) + '"></div></article>';
      }).join("") + (tickets.length ? "" : '<div class="r-empty">Kitchen queue is clear.</div>') + "</div>";
      document.querySelectorAll("[data-kitchen-action]").forEach(function (button) {
        button.addEventListener("click", async function () {
          const status = document.getElementById("ticketStatus" + button.dataset.ticket);
          setStatus(status, "Updating…");
          try {
            await request("PATCH", "/kitchen/" + encodeURIComponent(button.dataset.ticket) + "/status", { status: button.dataset.kitchenAction });
            await load();
          } catch (error) { setStatus(status, error.message, "error"); }
        });
      });
    }

    document.getElementById("refreshKitchen").addEventListener("click", load);
    await load();
    const timer = setInterval(load, 20000);
    state.timers.push(timer);
  }

  async function reservations() {
    shell("Reservations & Seating", "Create capacity-aware bookings, assign tables and progress guest status from booked to completed.");
    const context = await loadContext(true);
    const tableOptions = context.tables.map(function (table) { return { value: table.id, label: "Table " + table.tableNo + " · " + table.capacity + " seats" }; });

    async function render() {
      const rows = await request("GET", "/reservations");
      document.getElementById("app").innerHTML = [
        panel("Create reservation", "Bookings are checked against table capacity and overlapping time windows.", '<form id="reservationForm" class="r-grid">' + field("reservationName", "Guest name", "text", "", { required: true }) + field("reservationPhone", "Phone", "tel", "") + field("partySize", "Party size", "number", 2, { required: true, min: 1, max: 100 }) + selectField("reservationTable", "Table", tableOptions, "", { blankLabel: "Assign later" }) + field("reservedAt", "Reservation time", "datetime-local", "", { required: true }) + textAreaField("reservationNotes", "Notes", "", { placeholder: "High chair, birthday, accessibility…" }) + '<div class="r-actions"><button class="r-btn" type="submit">Book reservation</button></div><div id="reservationStatus" class="r-status"></div></form>'),
        panel("Upcoming reservations", "Use action buttons instead of entering reservation IDs.", '<div class="r-table-wrap"><table class="r-table"><thead><tr><th>Reservation</th><th>Guest</th><th>Time</th><th>Table</th><th>Status</th><th>Actions</th></tr></thead><tbody>' + rows.map(function (row) {
          return '<tr><td><strong>' + esc(row.reservationNo) + '</strong><small>' + esc(row.partySize) + ' guests</small></td><td>' + esc(row.customerName) + '<small>' + esc(row.phone || "No phone") + '</small></td><td>' + esc(dateTime(row.reservedAt)) + '</td><td>' + esc(row.tableId ? "Table " + tableName(context, row.tableId) : "Unassigned") + '</td><td>' + statusChip(row.status) + '</td><td><div class="r-row-actions">' + (row.status === "booked" ? '<button class="r-btn small" data-reservation-action="seated" data-reservation="' + esc(row.id) + '">Seat</button>' : "") + (row.status === "seated" ? '<button class="r-btn small" data-reservation-action="completed" data-reservation="' + esc(row.id) + '">Complete</button>' : "") + (!["completed", "cancelled", "no_show"].includes(row.status) ? '<button class="r-btn danger small" data-reservation-action="cancelled" data-reservation="' + esc(row.id) + '">Cancel</button><button class="r-btn ghost small" data-reservation-action="no_show" data-reservation="' + esc(row.id) + '">No show</button>' : "") + "</div></td></tr>";
        }).join("") + (rows.length ? "" : '<tr><td colspan="6">No reservations found.</td></tr>') + "</tbody></table></div>")
      ].join("");
      document.getElementById("reservationForm").addEventListener("submit", async function (event) {
        event.preventDefault();
        const values = formValues(event.currentTarget);
        const status = document.getElementById("reservationStatus");
        setStatus(status, "Booking…");
        try {
          await request("POST", "/reservations", {
            customerName: values.reservationName,
            phone: values.reservationPhone || null,
            partySize: Number(values.partySize),
            tableId: values.reservationTable || null,
            reservedAt: new Date(values.reservedAt).toISOString(),
            notes: values.reservationNotes || null
          });
          await render();
        } catch (error) { setStatus(status, error.message, "error"); }
      });
      document.querySelectorAll("[data-reservation-action]").forEach(function (button) {
        button.addEventListener("click", async function () {
          await request("PATCH", "/reservations/" + encodeURIComponent(button.dataset.reservation) + "/status", { status: button.dataset.reservationAction });
          await render();
        });
      });
    }

    await render();
  }

  async function modifiers() {
    shell("Menu Modifiers", "Build controlled add-on groups such as cooking preference, sides, sauces and extras.");
    const groups = await request("GET", "/modifier-groups");

    function render() {
      const groupOptions = groups.map(function (group) { return { value: group.id, label: group.name }; });
      document.getElementById("app").innerHTML = [
        panel("Create modifier group", "Set minimum and maximum selections for the waiter terminal.", '<form id="groupForm" class="r-grid">' + field("groupName", "Group name", "text", "", { required: true }) + selectField("groupRequired", "Required", [{ value: "true", label: "Yes" }, { value: "false", label: "No" }], "false", { blank: false }) + field("minSelect", "Minimum selections", "number", 0, { min: 0 }) + field("maxSelect", "Maximum selections", "number", 1, { min: 1 }) + '<div class="r-actions"><button class="r-btn" type="submit">Add group</button></div><div id="groupStatus" class="r-status"></div></form>'),
        panel("Create modifier", "Choose a group by name instead of entering its ID.", '<form id="modifierForm" class="r-grid">' + selectField("modifierGroup", "Modifier group", groupOptions, "", { required: true }) + field("modifierName", "Modifier name", "text", "", { required: true }) + field("modifierPrice", "Price adjustment", "number", 0, { step: "0.01" }) + '<div class="r-actions"><button class="r-btn" type="submit">Add modifier</button></div><div id="modifierStatus" class="r-status"></div></form>'),
        panel("Modifier catalogue", "Active groups and their choices.", '<div class="r-summary-grid">' + groups.map(function (group) {
          return '<article class="r-summary-card"><span>' + esc(group.required ? "Required" : "Optional") + '</span><strong>' + esc(group.name) + '</strong><small>' + esc(group.minSelect) + '–' + esc(group.maxSelect) + ' selections</small><div class="r-ticket-items">' + (group.modifiers || []).map(function (modifier) { return '<div class="r-ticket-item"><span>' + esc(modifier.name) + '</span><strong>' + money(modifier.priceDelta) + "</strong></div>"; }).join("") + "</div></article>";
        }).join("") + (groups.length ? "" : '<div class="r-empty">No modifier groups yet.</div>') + "</div>")
      ].join("");
      document.getElementById("groupForm").addEventListener("submit", async function (event) {
        event.preventDefault();
        const values = formValues(event.currentTarget);
        const status = document.getElementById("groupStatus");
        try {
          const created = await request("POST", "/modifier-groups", { name: values.groupName, required: values.groupRequired === "true", minSelect: Number(values.minSelect), maxSelect: Number(values.maxSelect) });
          groups.push({ ...created, modifiers: [] });
          render();
        } catch (error) { setStatus(status, error.message, "error"); }
      });
      document.getElementById("modifierForm").addEventListener("submit", async function (event) {
        event.preventDefault();
        const values = formValues(event.currentTarget);
        const status = document.getElementById("modifierStatus");
        try {
          const created = await request("POST", "/modifiers", { groupId: values.modifierGroup, name: values.modifierName, priceDelta: Number(values.modifierPrice || 0) });
          const group = groups.find(function (row) { return String(row.id) === String(values.modifierGroup); });
          if (group) group.modifiers.push({ ...created, priceDelta: Number(created.priceDelta || 0) });
          render();
        } catch (error) { setStatus(status, error.message, "error"); }
      });
    }

    render();
  }

  async function recipes() {
    shell("Recipes & Food Cost", "Link menu items to inventory ingredients without writing JSON or copying product IDs.");
    const [context, products, recipes] = await Promise.all([loadContext(true), loadProducts(true), request("GET", "/recipes")]);
    let ingredients = [];

    function render() {
      const menuOptions = context.menuItems.map(function (item) { return { value: item.id, label: item.name }; });
      const productOptions = products.map(function (product) { return { value: product.id, label: product.name + " · " + (product.unit || "unit") }; });
      document.getElementById("app").innerHTML = [
        panel("Recipe builder", "Add one or more tenant-owned inventory products as ingredients.", '<form id="recipeForm"><div class="r-grid">' + selectField("recipeMenuItem", "Menu item", menuOptions, "", { required: true }) + field("recipeYield", "Yield quantity", "number", 1, { required: true, min: 0.001, step: "0.001" }) + '</div><div class="r-grid" style="margin-top:14px">' + selectField("ingredientProduct", "Ingredient product", productOptions, "", { required: true }) + field("ingredientQty", "Quantity", "number", "", { min: 0.0001, step: "0.0001" }) + field("ingredientUnit", "Unit", "", "", { placeholder: "kg, g, ml, unit" }) + '<div class="r-actions"><button id="addIngredient" class="r-btn secondary" type="button">Add ingredient</button></div></div><div class="r-table-wrap" style="margin-top:14px"><table class="r-table"><thead><tr><th>Ingredient</th><th>Quantity</th><th>Action</th></tr></thead><tbody id="ingredientRows"></tbody></table></div><div class="r-actions" style="margin-top:14px"><button class="r-btn" type="submit"' + (ingredients.length ? "" : " disabled") + '>Save recipe</button></div><div id="recipeStatus" class="r-status"></div></form>'),
        panel("Recipe catalogue", "Existing menu-to-inventory mappings.", '<div class="r-summary-grid">' + recipes.map(function (recipe) {
          return '<article class="r-summary-card"><span>Yield ' + esc(recipe.yieldQuantity) + '</span><strong>' + esc(recipe.menuItem?.name || "Menu item") + '</strong><small>' + esc(recipe.ingredients.length) + ' ingredients</small><div class="r-ticket-items">' + recipe.ingredients.map(function (ingredient) { return '<div class="r-ticket-item"><span>' + esc(ingredient.product?.name || ingredient.productId) + '</span><strong>' + esc(ingredient.quantity) + ' ' + esc(ingredient.unit) + "</strong></div>"; }).join("") + "</div></article>";
        }).join("") + (recipes.length ? "" : '<div class="r-empty">No recipes configured.</div>') + "</div>")
      ].join("");

      function renderIngredients() {
        document.getElementById("ingredientRows").innerHTML = ingredients.map(function (ingredient, index) {
          const product = products.find(function (row) { return String(row.id) === String(ingredient.productId); });
          return '<tr><td>' + esc(product?.name || ingredient.productId) + '</td><td>' + esc(ingredient.quantity) + ' ' + esc(ingredient.unit) + '</td><td><button class="r-btn danger small" data-remove-ingredient="' + index + '">Remove</button></td></tr>';
        }).join("") || '<tr><td colspan="3">Add ingredients to the recipe.</td></tr>';
        document.querySelectorAll("[data-remove-ingredient]").forEach(function (button) { button.addEventListener("click", function () { ingredients.splice(Number(button.dataset.removeIngredient), 1); render(); }); });
      }
      renderIngredients();
      document.getElementById("addIngredient").addEventListener("click", function () {
        const productId = document.getElementById("ingredientProduct").value;
        const quantity = Number(document.getElementById("ingredientQty").value || 0);
        const unit = document.getElementById("ingredientUnit").value.trim();
        if (!productId || quantity <= 0 || !unit) return setStatus(document.getElementById("recipeStatus"), "Choose product, quantity and unit.", "error");
        const existing = ingredients.find(function (item) { return String(item.productId) === String(productId); });
        if (existing) { existing.quantity = quantity; existing.unit = unit; }
        else ingredients.push({ productId: productId, quantity: quantity, unit: unit });
        render();
      });
      document.getElementById("recipeForm").addEventListener("submit", async function (event) {
        event.preventDefault();
        const values = formValues(event.currentTarget);
        const status = document.getElementById("recipeStatus");
        setStatus(status, "Saving recipe…");
        try {
          const saved = await request("POST", "/recipes", { menuItemId: values.recipeMenuItem, yieldQuantity: Number(values.recipeYield), ingredients: ingredients });
          recipes.push({ ...saved, menuItem: context.menuItems.find(function (item) { return String(item.id) === String(values.recipeMenuItem); }), ingredients: ingredients.map(function (ingredient) { return { ...ingredient, product: products.find(function (product) { return String(product.id) === String(ingredient.productId); }) }; }) });
          ingredients = [];
          render();
        } catch (error) { setStatus(status, error.message, "error"); }
      });
    }

    render();
  }

  async function wastage() {
    shell("Wastage Register", "Record ingredient loss against tenant inventory and reverse mistakes with an auditable action.");
    const products = await loadProducts(true);

    async function render() {
      const rows = await request("GET", "/wastage");
      const productOptions = products.map(function (product) { return { value: product.id, label: product.name + " · " + (product.unit || "unit") }; });
      document.getElementById("app").innerHTML = [
        panel("Record wastage", "Choose an inventory product by name.", '<form id="wastageForm" class="r-grid">' + selectField("wasteProduct", "Inventory product", productOptions, "", { required: true }) + field("wasteQuantity", "Quantity", "number", "", { required: true, min: 0.001, step: "0.001" }) + field("wasteUnit", "Unit", "unit", "", { required: true }) + field("wasteReason", "Reason", "text", "", { required: true, placeholder: "Spoilage, overproduction, damage" }) + '<div class="r-actions"><button class="r-btn" type="submit">Post wastage</button></div><div id="wasteStatus" class="r-status"></div></form>'),
        panel("Wastage history", "Reversed entries remain visible for audit history.", '<div class="r-table-wrap"><table class="r-table"><thead><tr><th>Product</th><th>Quantity</th><th>Reason</th><th>Posted</th><th>Status</th><th>Action</th></tr></thead><tbody>' + rows.map(function (row) {
          const product = products.find(function (item) { return String(item.id) === String(row.productId); });
          return '<tr><td>' + esc(product?.name || row.productId) + '</td><td>' + esc(row.quantity) + ' ' + esc(row.unit) + '</td><td>' + esc(row.reason) + '</td><td>' + esc(dateTime(row.postedAt)) + '</td><td>' + statusChip(row.reversedAt ? "reversed" : "posted") + '</td><td>' + (row.reversedAt ? "—" : '<button class="r-btn danger small" data-reverse-waste="' + esc(row.id) + '">Reverse</button>') + "</td></tr>";
        }).join("") + (rows.length ? "" : '<tr><td colspan="6">No wastage records.</td></tr>') + "</tbody></table></div>")
      ].join("");
      document.getElementById("wastageForm").addEventListener("submit", async function (event) {
        event.preventDefault();
        const values = formValues(event.currentTarget);
        const status = document.getElementById("wasteStatus");
        setStatus(status, "Posting…");
        try {
          await request("POST", "/wastage", { productId: values.wasteProduct, quantity: Number(values.wasteQuantity), unit: values.wasteUnit, reason: values.wasteReason }, { idempotent: true });
          await render();
        } catch (error) { setStatus(status, error.message, "error"); }
      });
      document.querySelectorAll("[data-reverse-waste]").forEach(function (button) {
        button.addEventListener("click", async function () { await request("POST", "/wastage/" + encodeURIComponent(button.dataset.reverseWaste) + "/reverse", {}); await render(); });
      });
    }

    await render();
  }

  async function reports() {
    shell("Restaurant Reports", "Review revenue, orders, reservations and wastage over a selected period.");
    const today = new Date();
    const fromDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    const toDate = today.toISOString().slice(0, 10);

    async function load(from, to) {
      const report = await request("GET", "/reports?from=" + encodeURIComponent(new Date(from + "T00:00:00").toISOString()) + "&to=" + encodeURIComponent(new Date(to + "T23:59:59").toISOString()));
      document.getElementById("reportCards").innerHTML = '<article class="r-summary-card"><span>Orders</span><strong>' + esc(report.orders) + '</strong><small>Non-cancelled orders</small></article><article class="r-summary-card"><span>Revenue</span><strong>' + money(report.revenue) + '</strong><small>Restaurant order total</small></article><article class="r-summary-card"><span>Reservations</span><strong>' + esc(report.reservations) + '</strong><small>Guest bookings</small></article><article class="r-summary-card"><span>Wastage</span><strong>' + esc(report.wastageQuantity) + '</strong><small>' + esc(report.wastageRecords) + ' records</small></article>';
    }

    document.getElementById("app").innerHTML = panel("Report range", "Select a period and refresh the operational summary.", '<form id="reportForm" class="r-grid two">' + field("reportFrom", "From", "date", fromDate, { required: true }) + field("reportTo", "To", "date", toDate, { required: true }) + '<div class="r-actions"><button class="r-btn" type="submit">Run report</button></div></form>') + '<div id="reportCards" class="r-summary-grid"></div>';
    document.getElementById("reportForm").addEventListener("submit", async function (event) { event.preventDefault(); const values = formValues(event.currentTarget); await load(values.reportFrom, values.reportTo); });
    await load(fromDate, toDate);
  }

  async function settings() {
    shell("Restaurant Settings", "Configure operational alerts without exposing raw backend configuration.");

    async function render() {
      const rows = await request("GET", "/notification-rules");
      document.getElementById("app").innerHTML = [
        panel("Notification rule", "Configure reminders for reservations, stock, kitchen or closing events.", '<form id="ruleForm" class="r-grid">' + field("eventKey", "Event key", "text", "", { required: true, placeholder: "reservation.reminder" }) + selectField("channel", "Channel", ["in_app", "email", "sms", "whatsapp"], "in_app", { blank: false }) + field("daysBefore", "Days before", "number", 0, { min: 0 }) + selectField("active", "Active", [{ value: "true", label: "Yes" }, { value: "false", label: "No" }], "true", { blank: false }) + '<div class="r-actions"><button class="r-btn" type="submit">Save rule</button></div><div id="ruleStatus" class="r-status"></div></form>'),
        panel("Configured rules", "Rules are tenant scoped.", '<div class="r-table-wrap"><table class="r-table"><thead><tr><th>Event</th><th>Channel</th><th>Lead time</th><th>Status</th></tr></thead><tbody>' + rows.map(function (row) { return '<tr><td>' + esc(row.eventKey) + '</td><td>' + esc(row.channel) + '</td><td>' + esc(row.daysBefore) + ' days</td><td>' + statusChip(row.active ? "active" : "inactive") + "</td></tr>"; }).join("") + (rows.length ? "" : '<tr><td colspan="4">No notification rules.</td></tr>') + "</tbody></table></div>")
      ].join("");
      document.getElementById("ruleForm").addEventListener("submit", async function (event) {
        event.preventDefault();
        const values = formValues(event.currentTarget);
        const status = document.getElementById("ruleStatus");
        try {
          await request("PUT", "/notification-rules", { eventKey: values.eventKey, channel: values.channel, daysBefore: Number(values.daysBefore || 0), active: values.active === "true" });
          await render();
        } catch (error) { setStatus(status, error.message, "error"); }
      });
    }

    await render();
  }

  const handlers = { dashboard, floor, menu, orders, kitchen, reservations, modifiers, recipes, wastage, reports, settings };

  window.addEventListener("beforeunload", function () {
    state.timers.forEach(function (timer) { clearInterval(timer); });
  });

  document.addEventListener("DOMContentLoaded", async function () {
    try {
      await verifyTenant();
      const handler = handlers[PAGE];
      if (!handler) throw new Error("Unsupported Restaurant page.");
      await handler();
    } catch (error) {
      if (!document.getElementById("app")) shell("Restaurant Application", "Unable to open the requested module.");
      showPageError(error);
    }
  });
})();
