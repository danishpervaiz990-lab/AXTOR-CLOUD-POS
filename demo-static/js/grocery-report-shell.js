(function () {
  "use strict";

  const PAGE = String(document.body?.dataset.page || "dashboard").toLowerCase();
  if (!['dashboard', 'reports'].includes(PAGE)) return;

  const NAV = [
    ["grocery-dashboard.html", "Dashboard", "dashboard"],
    ["grocery-terminal.html", "POS Terminal", "terminal"],
    ["grocery-sales.html", "Sales & Returns", "sales"],
    ["grocery-shifts.html", "Shifts / Closing", "shifts"],
    ["grocery-customers.html", "Customers", "customers"],
    ["grocery-products.html", "Products", "products"],
    ["grocery-categories.html", "Categories", "categories"],
    ["grocery-inventory.html", "Inventory", "inventory"],
    ["grocery-batches.html", "Batch & Expiry", "batches"],
    ["grocery-labels.html", "Barcode / Scale Labels", "labels"],
    ["grocery-receiving.html", "Purchases", "receiving"],
    ["grocery-suppliers.html", "Suppliers", "suppliers"],
    ["grocery-waste.html", "Waste / Spoilage", "waste"],
    ["grocery-promotions.html", "Promotions", "promotions"],
    ["grocery-loyalty.html", "Loyalty", "loyalty"],
    ["grocery-expenses.html", "Expenses", "expenses"],
    ["grocery-accounts.html", "Accounts", "accounts"],
    ["grocery-reports.html", "Reports", "reports"],
    ["grocery-users.html", "Users / Roles", "users"],
    ["grocery-notifications.html", "Notifications", "notifications"],
    ["grocery-settings.html", "Settings", "settings"]
  ];

  const PAGE_COPY = {
    dashboard: {
      title: "Grocery Operations Dashboard",
      subtitle: "Barcode checkout, expiry rotation, waste and recall control"
    },
    reports: {
      title: "Grocery Reports",
      subtitle: "Expiry, waste, recall, stock and sales exposure"
    }
  };

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char];
    });
  }

  function renderShell() {
    const copy = PAGE_COPY[PAGE];
    const links = NAV.map(function (item) {
      return '<a class="' + (item[2] === PAGE ? 'active' : '') + '" href="' + esc(item[0]) + '" data-module="' + esc(item[2]) + '">' + esc(item[1]) + '</a>';
    }).join('');
    document.body.innerHTML = '<div class="g-shell">' +
      '<aside class="g-nav"><div class="g-brand">AXTOR · GROCERY</div><div class="g-nav-section">Grocery Operations</div>' + links + '</aside>' +
      '<main class="g-main"><section class="g-hero"><h1>' + esc(copy.title) + '</h1><p>' + esc(copy.subtitle) + '</p></section>' +
      '<div id="app"><div class="g-status" id="groceryReportBootStatus">Loading live Grocery data…</div></div></main></div>';
    document.documentElement.dataset.groceryReportShell = 'ready';
    document.dispatchEvent(new CustomEvent('axtor:grocery-report-shell-ready', { detail: { page: PAGE } }));
  }

  function start() {
    if (!window.AxtorAPI || typeof window.AxtorAPI.getToken !== 'function') {
      document.body.innerHTML = '<main class="g-main"><div class="g-status error">Grocery authentication runtime is unavailable.</div></main>';
      return;
    }
    if (!window.AxtorAPI.getToken()) {
      window.AxtorAPI.goToLogin('authentication-required');
      return;
    }
    renderShell();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  window.AxtorGroceryReportShell = Object.freeze({ page: PAGE, render: renderShell });
})();
