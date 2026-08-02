(function () {
  "use strict";

  const params = new URLSearchParams(location.search);
  if (String(params.get("industry") || "").toLowerCase() !== "grocery") return;

  const PROFILE_OPTIONS = [
    { code: "a4", label: "A4 Invoice" },
    { code: "thermal-80", label: "Thermal 80 mm" },
    { code: "thermal-58", label: "Thermal 58 mm" }
  ];

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char];
    });
  }

  function unwrap(value) {
    return value && Object.prototype.hasOwnProperty.call(value, "data") ? value.data : value;
  }

  function decodePayload() {
    const raw = params.get("data");
    if (!raw) return null;
    try { return JSON.parse(decodeURIComponent(escape(atob(raw)))); } catch (_) { return null; }
  }

  async function apiGet(path) {
    if (!window.AxtorAPI) throw new Error("Axtor API is not available");
    return unwrap(await AxtorAPI.apiGet(path, { cache: false }));
  }

  async function loadDocument() {
    const payload = decodePayload();
    if (payload) return payload;
    let id = params.get("id");
    const number = params.get("documentNo") || params.get("no");
    if (!id && number) {
      const rows = unwrap(await AxtorAPI.apiGet("/api/v1/sales-documents?q=" + encodeURIComponent(number) + "&limit=20", { cache: false })) || [];
      const match = rows.find(function (row) { return row.documentNo === number; }) || rows[0];
      id = match && match.id;
    }
    if (!id) return null;
    return await apiGet("/api/v1/sales-documents/" + encodeURIComponent(id));
  }

  async function loadContext() {
    return await apiGet("/api/v1/sales-documents/context").catch(function () { return {}; });
  }

  function findById(rows, id) {
    return (Array.isArray(rows) ? rows : []).find(function (row) { return row.id === id; }) || null;
  }

  function profileCode() {
    const requested = String(params.get("profile") || "").toLowerCase();
    if (requested.includes("58")) return "thermal-58";
    if (requested.includes("80")) return "thermal-80";
    return "a4";
  }

  function installProfileSelector() {
    const printButton = document.getElementById("invoiceViewPrintBtn");
    const actions = printButton && printButton.parentElement;
    if (!actions) return false;
    const existing = document.getElementById("invoiceViewProfile");
    if (existing) existing.remove();
    const select = document.createElement("select");
    select.id = "invoiceViewProfile";
    select.className = "form-select no-print";
    select.style.maxWidth = "210px";
    select.innerHTML = PROFILE_OPTIONS.map(function (row) {
      return '<option value="' + row.code + '"' + (row.code === profileCode() ? " selected" : "") + ">" + row.label + "</option>";
    }).join("");
    select.addEventListener("change", function () {
      const url = new URL(location.href);
      url.searchParams.set("profile", select.value);
      location.href = url.toString();
    });
    actions.insertBefore(select, printButton);
    return true;
  }

  function injectPrintCss() {
    if (document.getElementById("groceryPrintReconciliationStyle")) return;
    const style = document.createElement("style");
    style.id = "groceryPrintReconciliationStyle";
    style.textContent = ".grocery-print-meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:10px 0;padding:10px;border:1px solid #d8e0dc;border-radius:8px;font-size:12px}.grocery-print-meta span{display:block;color:#66736d;font-size:10px;text-transform:uppercase}.grocery-print-meta strong{display:block;margin-top:2px}.grocery-batch-note{display:block;font-size:10px;color:#52645b;margin-top:2px}@media(max-width:700px){.grocery-print-meta{grid-template-columns:repeat(2,minmax(0,1fr))}}@media print{.grocery-print-meta{break-inside:avoid;page-break-inside:avoid}.grocery-batch-note{color:#111}.no-print{display:none!important}}";
    document.head.appendChild(style);
  }

  function metadata(documentData, context) {
    const counter = findById(context.counters, documentData.counterId);
    const terminal = findById(context.terminals, documentData.terminalId) || counter;
    const cashier = findById(context.salesPersons, documentData.createdByUserId) || findById(context.users, documentData.createdByUserId);
    const shift = findById(context.shifts, documentData.shiftId);
    const payments = Array.isArray(documentData.payments) ? documentData.payments : [];
    const paymentBreakdown = payments.length
      ? payments.map(function (row) { return String(row.method || row.paymentMethod || "payment") + " " + Number(row.amount || 0).toFixed(2); }).join(" · ")
      : String(documentData.paymentMethod || "—") + " " + Number(documentData.paid || documentData.paidAmount || 0).toFixed(2);
    return {
      counter: counter?.name || documentData.counterName || "—",
      terminal: terminal?.name || terminal?.code || documentData.terminalName || documentData.terminalCode || "—",
      shift: shift?.name || shift?.referenceNo || documentData.shiftName || (documentData.shiftId ? String(documentData.shiftId).slice(-8).toUpperCase() : "—"),
      cashier: cashier?.name || documentData.cashierName || documentData.createdByName || "—",
      payment: paymentBreakdown
    };
  }

  function itemBatchText(item) {
    const batch = item.batchNo || item.batchNumber || item.inventoryBatch?.batchNo || item.inventoryBatch?.batchNumber || "";
    const expiryRaw = item.expiryDate || item.inventoryBatch?.expiryDate || item.batchExpiryDate || "";
    const expiry = expiryRaw ? new Date(expiryRaw) : null;
    const expiryText = expiry && !Number.isNaN(expiry.getTime()) ? expiry.toLocaleDateString() : "";
    if (!batch && !expiryText) return "";
    return [batch ? "Batch: " + batch : "", expiryText ? "Expiry: " + expiryText : ""].filter(Boolean).join(" · ");
  }

  function enrichRenderedDocument(documentData, context) {
    const root = document.getElementById("invoiceViewRoot");
    if (!root || !root.firstElementChild || root.querySelector(".grocery-print-meta")) return false;
    const meta = metadata(documentData, context);
    const block = document.createElement("section");
    block.className = "grocery-print-meta";
    block.innerHTML = [
      ["Counter", meta.counter], ["Terminal", meta.terminal], ["Shift", meta.shift], ["Cashier", meta.cashier], ["Payment", meta.payment]
    ].map(function (row) { return '<div><span>' + esc(row[0]) + '</span><strong>' + esc(row[1]) + '</strong></div>'; }).join("");
    const sheet = root.querySelector(".invoice-sheet") || root.firstElementChild;
    const table = sheet.querySelector("table");
    if (table) table.parentNode.insertBefore(block, table);
    else sheet.insertBefore(block, sheet.firstChild);

    const items = Array.isArray(documentData.items) ? documentData.items : [];
    const rows = root.querySelectorAll(".inv-table tbody tr, table tbody tr");
    rows.forEach(function (row, index) {
      const text = itemBatchText(items[index] || {});
      if (!text || row.querySelector(".grocery-batch-note")) return;
      const cell = row.querySelector("td:nth-child(2)") || row.querySelector("td");
      if (!cell) return;
      const note = document.createElement("small");
      note.className = "grocery-batch-note";
      note.textContent = text;
      cell.appendChild(note);
    });
    return true;
  }

  async function init() {
    injectPrintCss();
    let attempts = 0;
    const selectorTimer = setInterval(function () {
      attempts += 1;
      if (installProfileSelector() || attempts > 50) clearInterval(selectorTimer);
    }, 100);

    const values = await Promise.all([loadDocument(), loadContext()]);
    const documentData = values[0];
    const context = values[1] || {};
    if (!documentData) return;
    let renderAttempts = 0;
    const renderTimer = setInterval(function () {
      renderAttempts += 1;
      if (enrichRenderedDocument(documentData, context) || renderAttempts > 100) clearInterval(renderTimer);
    }, 100);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { init().catch(console.error); }, { once: true });
  else init().catch(console.error);
})();
