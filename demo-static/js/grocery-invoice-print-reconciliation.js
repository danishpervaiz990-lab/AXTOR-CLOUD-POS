(function () {
  "use strict";

  const params = new URLSearchParams(location.search);
  const dedicatedGroceryPage = String(document.body?.dataset.industry || "").toLowerCase() === "grocery";
  const requestedIndustry = String(params.get("industry") || "").toLowerCase();
  if (!dedicatedGroceryPage && requestedIndustry !== "grocery") return;

  const PROFILE_OPTIONS = [
    { code: "a4", label: "A4 Invoice" },
    { code: "thermal-80", label: "Thermal 80 mm" },
    { code: "thermal-58", label: "Thermal 58 mm" }
  ];

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char];
    });
  }

  function unwrap(value) {
    return value && Object.prototype.hasOwnProperty.call(value, "data") ? value.data : value;
  }

  function money(value) {
    if (window.AxtorLocale?.money) return window.AxtorLocale.money(value);
    return "QAR " + Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function date(value) {
    if (window.AxtorLocale?.date) return window.AxtorLocale.date(value);
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString();
  }

  async function apiGet(path) {
    if (!window.AxtorAPI) throw new Error("Axtor API is not available");
    return unwrap(await AxtorAPI.apiGet(path, { cache: false }));
  }

  function decodePayload() {
    const raw = params.get("data");
    if (!raw) return null;
    try { return JSON.parse(decodeURIComponent(escape(atob(raw)))); }
    catch (_) { return null; }
  }

  async function loadDocument() {
    const payload = decodePayload();
    if (payload) return payload;
    let id = params.get("id");
    const number = params.get("documentNo") || params.get("no");
    if (!id && number) {
      const response = await apiGet("/api/v1/sales-documents?q=" + encodeURIComponent(number) + "&limit=20");
      const rows = Array.isArray(response) ? response : response?.data || [];
      const match = rows.find(function (row) { return row.documentNo === number; }) || rows[0];
      id = match?.id;
    }
    return id ? apiGet("/api/v1/sales-documents/" + encodeURIComponent(id)) : null;
  }

  async function loadContext() {
    try { return await apiGet("/api/v1/sales-documents/context"); }
    catch (_) { return {}; }
  }

  function profileCode() {
    const requested = String(params.get("profile") || "").toLowerCase();
    if (requested.includes("58")) return "thermal-58";
    if (requested.includes("80")) return "thermal-80";
    return "a4";
  }

  function installProfileSelector() {
    const printButton = document.getElementById("invoiceViewPrintBtn");
    const actions = printButton?.parentElement;
    if (!actions) return false;
    document.getElementById("invoiceViewProfile")?.remove();
    const select = document.createElement("select");
    select.id = "invoiceViewProfile";
    select.className = "form-select no-print";
    select.style.maxWidth = "210px";
    select.setAttribute("aria-label", "Grocery print profile");
    select.innerHTML = PROFILE_OPTIONS.map(function (profile) {
      return '<option value="' + esc(profile.code) + '"' + (profile.code === profileCode() ? ' selected' : '') + '>' + esc(profile.label) + '</option>';
    }).join("");
    select.addEventListener("change", function () {
      const url = new URL(location.href);
      url.searchParams.set("profile", select.value);
      location.href = url.toString();
    });
    actions.insertBefore(select, printButton);
    return true;
  }

  function installStyles() {
    if (document.getElementById("groceryPrintReconciliationStyle")) return;
    const style = document.createElement("style");
    style.id = "groceryPrintReconciliationStyle";
    style.textContent = ".grocery-print-meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:10px 0;padding:10px;border:1px solid #d8e0dc;border-radius:8px;font-size:12px}.grocery-print-meta span{display:block;color:#66736d;font-size:10px;text-transform:uppercase}.grocery-print-meta strong{display:block;margin-top:2px}.grocery-batch-note{display:block;font-size:10px;color:#52645b;margin-top:2px}@media(max-width:700px){.grocery-print-meta{grid-template-columns:repeat(2,minmax(0,1fr))}}@media print{.grocery-print-meta{break-inside:avoid;page-break-inside:avoid}.grocery-batch-note{color:#111}.no-print{display:none!important}}";
    document.head.appendChild(style);
  }

  function findById(rows, id) {
    return (Array.isArray(rows) ? rows : []).find(function (row) { return row.id === id; }) || null;
  }

  function metadata(documentData, context) {
    const counter = findById(context.counters, documentData.counterId);
    const terminal = findById(context.terminals, documentData.terminalId) || counter;
    const cashier = findById(context.salesPersons, documentData.createdByUserId) || findById(context.users, documentData.createdByUserId);
    const shift = findById(context.shifts, documentData.shiftId);
    const payments = Array.isArray(documentData.payments) ? documentData.payments : [];
    const payment = payments.length
      ? payments.map(function (row) { return String(row.method || row.paymentMethod || "payment") + " " + money(row.amount); }).join(" · ")
      : String(documentData.paymentMethod || "—") + " " + money(documentData.paid || documentData.paidAmount || 0);
    return {
      counter: counter?.name || documentData.counterName || "—",
      terminal: terminal?.name || terminal?.code || documentData.terminalName || documentData.terminalCode || "—",
      shift: shift?.name || shift?.referenceNo || documentData.shiftName || (documentData.shiftId ? String(documentData.shiftId).slice(-8).toUpperCase() : "—"),
      cashier: cashier?.name || documentData.cashierName || documentData.createdByName || "—",
      payment
    };
  }

  function itemBatchText(item) {
    const batch = item.batchNo || item.batchNumber || item.inventoryBatch?.batchNo || item.inventoryBatch?.batchNumber || "";
    const expiry = item.expiryDate || item.inventoryBatch?.expiryDate || item.batchExpiryDate || "";
    return [batch ? "Batch: " + batch : "", expiry ? "Expiry: " + date(expiry) : ""].filter(Boolean).join(" · ");
  }

  function enrichRenderedDocument(documentData, context) {
    const root = document.getElementById("invoiceViewRoot");
    const sheet = root?.querySelector(".invoice-sheet") || root?.firstElementChild;
    if (!root || !sheet || /Loading saved Grocery document/i.test(root.textContent || "")) return false;
    if (!root.querySelector(".grocery-print-meta")) {
      const meta = metadata(documentData, context || {});
      const block = document.createElement("section");
      block.className = "grocery-print-meta";
      block.innerHTML = [
        ["Counter", meta.counter], ["Terminal", meta.terminal], ["Shift", meta.shift],
        ["Cashier", meta.cashier], ["Payment", meta.payment]
      ].map(function (row) {
        return '<div><span>' + esc(row[0]) + '</span><strong>' + esc(row[1]) + '</strong></div>';
      }).join("");
      const table = sheet.querySelector("table");
      if (table) table.parentNode.insertBefore(block, table);
      else sheet.insertBefore(block, sheet.firstChild);
    }

    const items = Array.isArray(documentData.items) ? documentData.items : [];
    root.querySelectorAll(".inv-table tbody tr, table tbody tr").forEach(function (row, index) {
      const text = itemBatchText(items[index] || {});
      if (!text || row.querySelector(".grocery-batch-note")) return;
      const cell = row.querySelector("td:nth-child(2)") || row.querySelector("td");
      if (!cell) return;
      const note = document.createElement("small");
      note.className = "grocery-batch-note";
      note.textContent = text;
      cell.appendChild(note);
    });
    document.body.dataset.groceryDocumentReady = "true";
    return true;
  }

  async function init() {
    installStyles();
    let selectorAttempts = 0;
    const selectorTimer = window.setInterval(function () {
      selectorAttempts += 1;
      if (installProfileSelector() || selectorAttempts >= 100) window.clearInterval(selectorTimer);
    }, 100);

    const values = await Promise.all([loadDocument(), loadContext()]);
    const documentData = values[0];
    const context = values[1] || {};
    if (!documentData) return;

    let enriching = false;
    function enrich() {
      if (enriching || document.body.dataset.groceryDocumentReady === "true") return;
      enriching = true;
      try { enrichRenderedDocument(documentData, context); }
      finally { enriching = false; }
    }
    const observer = new MutationObserver(enrich);
    const root = document.getElementById("invoiceViewRoot");
    if (root) observer.observe(root, { childList: true, subtree: true });
    enrich();
    window.setTimeout(enrich, 250);
    window.setTimeout(enrich, 1000);
  }

  function start() {
    init().catch(function (error) {
      console.error("Grocery invoice reconciliation failed", error);
      const status = document.getElementById("invoiceViewStatus");
      if (status) {
        status.className = "alert alert-danger no-print";
        status.textContent = error.message || "Unable to load Grocery document";
        status.classList.remove("d-none");
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
