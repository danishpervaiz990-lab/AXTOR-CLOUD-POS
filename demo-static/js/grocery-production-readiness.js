(function () {
  "use strict";

  const PAGE = document.body.dataset.page || "dashboard";
  const VIEW_KEY = "axtor:grocery:terminal:view";
  const PRINT_KEY = "axtor:grocery:invoice:output";
  const NAV_ITEMS = [
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

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function replaceNavigation() {
    const nav = document.querySelector(".g-nav");
    if (!nav) return;
    const current = window.location.pathname.split("/").pop();
    nav.innerHTML = '<div class="g-brand">AXTOR · GROCERY</div><div class="g-nav-section">Grocery Operations</div>' + NAV_ITEMS.map(function (item) {
      const active = item[0] === current || item[2] === PAGE;
      return '<a class="' + (active ? "active" : "") + '" href="' + item[0] + '" data-module="' + item[2] + '">' + escapeHtml(item[1]) + "</a>";
    }).join("");
  }

  function parseScaleBarcode(code) {
    const normalized = String(code || "").trim();
    if (!/^2\d{12}$/.test(normalized)) return null;
    const plu = normalized.slice(1, 6);
    const embedded = Number(normalized.slice(6, 11));
    const mode = normalized.charAt(0) === "2" ? "weight" : "price";
    return {
      raw: normalized,
      plu: plu,
      mode: mode,
      weightKg: mode === "weight" ? embedded / 1000 : null,
      embeddedPrice: mode === "price" ? embedded / 100 : null
    };
  }

  function addTerminalControls() {
    if (PAGE !== "terminal") return;
    const toolbar = document.querySelector(".g-terminal .g-toolbar");
    const list = document.getElementById("productList");
    const search = document.getElementById("productSearch");
    if (!toolbar || !list || !search || document.getElementById("groceryViewControls")) return;

    const controls = document.createElement("div");
    controls.id = "groceryViewControls";
    controls.className = "g-view-controls";
    controls.innerHTML = [
      ["grid", "Grid"],
      ["compact", "Compact"],
      ["list", "List"],
      ["barcode", "Barcode"]
    ].map(function (item) {
      return '<button type="button" data-view="' + item[0] + '">' + item[1] + "</button>";
    }).join("");
    toolbar.appendChild(controls);

    function applyView(view) {
      const valid = ["grid", "compact", "list", "barcode"].includes(view) ? view : "list";
      list.dataset.view = valid;
      localStorage.setItem(VIEW_KEY, valid);
      controls.querySelectorAll("button").forEach(function (button) {
        button.classList.toggle("active", button.dataset.view === valid);
      });
    }

    controls.addEventListener("click", function (event) {
      const button = event.target.closest("[data-view]");
      if (button) applyView(button.dataset.view);
    });
    applyView(localStorage.getItem(VIEW_KEY) || "list");

    search.setAttribute("autocomplete", "off");
    search.setAttribute("inputmode", "numeric");
    search.placeholder = "Scan barcode or search SKU, PLU, name, brand, category";
    search.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const parsed = parseScaleBarcode(search.value);
      if (!parsed) return;
      const productButton = Array.from(document.querySelectorAll("#productList [data-add]")).find(function (button) {
        return button.closest(".g-item")?.textContent?.includes(parsed.plu);
      });
      if (productButton && !productButton.disabled) {
        productButton.click();
        setTimeout(function () {
          const qtyInputs = document.querySelectorAll("#cart [data-qty]");
          const last = qtyInputs[qtyInputs.length - 1];
          if (last && parsed.weightKg) {
            last.value = parsed.weightKg.toFixed(3);
            last.dispatchEvent(new Event("input", { bubbles: true }));
          }
          search.value = "";
          search.focus();
        }, 0);
      }
    });

    document.addEventListener("click", function (event) {
      if (!event.target.closest("input,select,textarea,button")) search.focus();
    });
    setTimeout(function () { search.focus(); }, 100);
  }

  function enhanceDashboard() {
    if (PAGE !== "dashboard") return;
    const app = document.getElementById("app");
    if (!app || document.getElementById("groceryQuickActions")) return;
    const section = document.createElement("section");
    section.id = "groceryQuickActions";
    section.className = "g-panel";
    section.innerHTML = '<h2>Quick Actions</h2><div class="g-quick-actions">' + [
      ["grocery-terminal.html", "New Sale"],
      ["grocery-terminal.html?mode=barcode", "Quick Barcode Sale"],
      ["grocery-products.html", "Add Product"],
      ["grocery-receiving.html", "Receive Purchase"],
      ["grocery-inventory.html", "Stock Count"],
      ["grocery-waste.html", "Record Waste"],
      ["grocery-labels.html", "Print Labels"],
      ["grocery-promotions.html", "Create Promotion"],
      ["grocery-expiry.html", "View Expiry Alerts"],
      ["grocery-shifts.html", "Close Shift"]
    ].map(function (item) { return '<a href="' + item[0] + '">' + item[1] + "</a>"; }).join("") + "</div>";
    app.appendChild(section);
  }

  function enhanceSettings() {
    if (PAGE !== "settings") return;
    const app = document.getElementById("app");
    if (!app || document.getElementById("invoicePrintWorkspace")) return;
    const output = localStorage.getItem(PRINT_KEY) || "a4";
    const section = document.createElement("section");
    section.id = "invoicePrintWorkspace";
    section.className = "g-panel";
    section.innerHTML = '<h2>Invoice & Print</h2><p class="g-note">One saved output is used for terminal receipts, saved invoice View/Print, returns, refunds and reprints.</p><div class="g-form"><div><label>Default output</label><select id="groceryPrintOutput"><option value="a4">A4</option><option value="80mm">Thermal 80mm</option><option value="58mm">Thermal 58mm</option></select></div><div><label>Footer text</label><input id="groceryInvoiceFooter" type="text" placeholder="Thank you for shopping with us"></div><div><label>Visible fields</label><select id="groceryInvoiceDensity"><option value="standard">Standard</option><option value="compact">Compact</option></select></div></div><div class="g-actions"><button id="saveInvoicePrint" class="g-btn" type="button">Save Design</button><button id="printInvoiceSample" type="button">Print Sample</button></div><div id="invoicePrintStatus" class="g-status"></div>';
    app.prepend(section);
    const select = document.getElementById("groceryPrintOutput");
    select.value = output;
    document.getElementById("saveInvoicePrint").addEventListener("click", function () {
      localStorage.setItem(PRINT_KEY, select.value);
      document.documentElement.dataset.invoiceOutput = select.value;
      const status = document.getElementById("invoicePrintStatus");
      status.textContent = "Invoice and print preference saved.";
      status.className = "g-status ok";
    });
    document.getElementById("printInvoiceSample").addEventListener("click", function () { window.print(); });
  }

  function blockCrossIndustryLinks() {
    document.querySelectorAll('a[href*="retail"],a[href*="pharmacy"],a[href*="school"],a[href*="clinic"],a[href*="gym"],a[href*="restaurant"]').forEach(function (link) {
      link.remove();
    });
  }

  function removeInternalLabels() {
    const forbidden = ["Template: Modern A4 Invoice", "Template ID", "Internal profile", "Debug release", "Development mode", "Database source", "Demo structure", "Customer Ready Mode"];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      forbidden.forEach(function (label) {
        if (node.nodeValue.includes(label)) node.nodeValue = node.nodeValue.replaceAll(label, "");
      });
    });
  }

  function runEnhancements() {
    replaceNavigation();
    addTerminalControls();
    enhanceDashboard();
    enhanceSettings();
    blockCrossIndustryLinks();
    removeInternalLabels();
    document.documentElement.dataset.invoiceOutput = localStorage.getItem(PRINT_KEY) || "a4";
  }

  document.addEventListener("DOMContentLoaded", function () {
    const observer = new MutationObserver(function () { runEnhancements(); });
    observer.observe(document.body, { childList: true, subtree: true });
    runEnhancements();
    setTimeout(runEnhancements, 250);
    setTimeout(runEnhancements, 1000);
  });

  window.AxtorGrocery = Object.freeze({ parseScaleBarcode: parseScaleBarcode });
})();
