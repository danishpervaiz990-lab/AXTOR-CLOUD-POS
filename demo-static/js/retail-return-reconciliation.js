/* Axtor POS Cloud — Retail cumulative return reconciliation guard. */
(function () {
  "use strict";

  function num(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function lineKey(line, index) {
    return String(line.salesDocumentItemId || line.saleItemId || line.invoiceItemId || line.lineId || line.id || line.productId || ("line-" + index));
  }

  function returnInvoiceId(row) {
    return String(row.salesDocumentId || row.invoiceId || row.originalInvoiceId || row.documentId || "");
  }

  function returnedByLine(state, invoiceId) {
    var totals = new Map();
    (state.returns || []).forEach(function (row) {
      if (returnInvoiceId(row) !== String(invoiceId)) return;
      var items = row.items || row.lines || row.returnItems || row.details || [];
      (Array.isArray(items) ? items : []).forEach(function (line, index) {
        var key = lineKey(line, index);
        var qty = num(line.qty || line.quantity || line.returnQty || line.returnedQty);
        totals.set(key, num(totals.get(key)) + Math.max(0, qty));
        if (line.productId) {
          var productKey = "product:" + line.productId;
          totals.set(productKey, num(totals.get(productKey)) + Math.max(0, qty));
        }
      });
    });
    return totals;
  }

  function reconcileSelectedInvoice() {
    var api = window.AxtorReturnsBackend;
    if (!api || typeof api.getState !== "function") return;
    var state = api.getState();
    var invoice = state.selectedInvoice;
    if (!invoice || !(state.returnItems instanceof Map)) return;

    var prior = returnedByLine(state, invoice.id);
    state.returnItems.forEach(function (item, key) {
      if (item.__originalSoldQty == null) item.__originalSoldQty = num(item.soldQty);
      var returned = Math.max(
        num(prior.get(String(item.salesDocumentItemId || key))),
        num(prior.get("product:" + String(item.productId || "")))
      );
      item.previouslyReturnedQty = Math.min(item.__originalSoldQty, returned);
      item.soldQty = Math.max(0, item.__originalSoldQty - item.previouslyReturnedQty);
      item.returnQty = Math.min(num(item.returnQty), item.soldQty);
      item.total = item.returnQty * num(item.rate);
    });

    document.querySelectorAll("[data-return-qty]").forEach(function (input) {
      var item = state.returnItems.get(String(input.getAttribute("data-return-qty")));
      if (!item) return;
      input.max = String(item.soldQty);
      if (num(input.value) > item.soldQty) input.value = String(item.soldQty);
      var row = input.closest("tr");
      if (row && item.previouslyReturnedQty > 0 && !row.querySelector("[data-previous-return-note]")) {
        var note = document.createElement("div");
        note.setAttribute("data-previous-return-note", "1");
        note.className = "small text-muted mt-1";
        note.textContent = "Previously returned: " + item.previouslyReturnedQty;
        input.parentElement.appendChild(note);
      }
    });
  }

  document.addEventListener("click", function (event) {
    if (event.target.closest("[data-return-select-invoice]")) {
      setTimeout(reconcileSelectedInvoice, 0);
      setTimeout(reconcileSelectedInvoice, 150);
    }
  }, true);

  document.addEventListener("input", function (event) {
    var input = event.target.closest && event.target.closest("[data-return-qty]");
    if (!input) return;
    var max = num(input.max);
    if (num(input.value) > max) input.value = String(max);
  }, true);

  window.AxtorRetailReturnReconciliation = {
    reconcile: reconcileSelectedInvoice,
    returnedByLine: returnedByLine
  };
})();
