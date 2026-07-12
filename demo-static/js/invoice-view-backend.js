(function () {
  "use strict";
  var U = window.AxtorPage;
  function status(message, type) {
    var box = U.q("#invoiceViewStatus");
    if (!box) return;
    box.className = "alert alert-" + (type || "info") + " no-print";
    box.textContent = message;
    box.classList.remove("d-none");
  }
  function render(documentData) {
    var root = U.q("#invoiceViewRoot");
    if (!root) return;
    var items = documentData.items || [];
    root.innerHTML = '<div class="cardx invoice-paper"><div class="d-flex justify-content-between align-items-start border-bottom pb-3 mb-3"><div><h2 class="mb-1">' +
      U.esc((documentData.documentType || "invoice").replaceAll("_", " ").toUpperCase()) + '</h2><div class="text-muted">' + U.esc(documentData.documentNo) +
      '</div></div><div class="text-end"><h4 class="mb-1">Axtor POS Cloud</h4><div class="text-muted">' + U.date(documentData.documentDate || documentData.createdAt) +
      '</div></div></div><div class="row mb-4"><div class="col-6"><small class="text-muted">Customer</small><div class="fw-bold">' + U.esc(documentData.customerName || "Walk-in Customer") +
      '</div><div>LPO: ' + U.esc(documentData.lpoNo || "-") + '</div></div><div class="col-6 text-end"><small class="text-muted">Salesman</small><div class="fw-bold">' +
      U.esc(documentData.salesmanName || "-") + '</div><div>Status: ' + U.esc(documentData.status) + '</div></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Item</th><th>SKU</th><th class="text-end">Qty</th><th class="text-end">Rate</th><th class="text-end">Discount</th><th class="text-end">Tax</th><th class="text-end">Total</th></tr></thead><tbody>' +
      (items.length ? items.map(function (item) {
        return "<tr><td>" + U.esc(item.name) + "</td><td>" + U.esc(item.sku || "-") + "</td><td class=\"text-end\">" + U.money(item.qty) +
          "</td><td class=\"text-end\">QAR " + U.money(item.rate) + "</td><td class=\"text-end\">QAR " + U.money(item.discount) +
          "</td><td class=\"text-end\">QAR " + U.money(item.tax) + "</td><td class=\"text-end\">QAR " + U.money(item.total) + "</td></tr>";
      }).join("") : U.emptyRow(7)) + '</tbody></table></div><div class="row justify-content-end"><div class="col-md-5"><div class="d-flex justify-content-between"><span>Subtotal</span><strong>QAR ' +
      U.money(documentData.subtotal) + '</strong></div><div class="d-flex justify-content-between"><span>Discount</span><strong>QAR ' + U.money(documentData.discount) +
      '</strong></div><div class="d-flex justify-content-between"><span>Tax</span><strong>QAR ' + U.money(documentData.tax) + '</strong></div><hr><div class="d-flex justify-content-between fs-5"><span>Total</span><strong>QAR ' +
      U.money(documentData.total) + '</strong></div><div class="d-flex justify-content-between"><span>Paid</span><strong>QAR ' + U.money(documentData.paid) +
      '</strong></div><div class="d-flex justify-content-between"><span>Balance</span><strong>QAR ' + U.money(documentData.balance) + "</strong></div></div></div></div>";
  }
  U.run(async function () {
    var params = new URLSearchParams(window.location.search);
    var id = params.get("id");
    var number = params.get("documentNo") || params.get("no");
    try {
      if (!id && number) {
        var rows = U.data(await U.api().apiGet("/api/v1/sales-documents?q=" + encodeURIComponent(number) + "&limit=20")) || [];
        var match = rows.find(function (row) { return row.documentNo === number; }) || rows[0];
        id = match && match.id;
      }
      if (!id) throw new Error("Document id or document number is required");
      var data = U.data(await U.api().apiGet("/api/v1/sales-documents/" + encodeURIComponent(id)));
      render(data);
      var box = U.q("#invoiceViewStatus"); if (box) box.classList.add("d-none");
    } catch (error) {
      status(error.message || "Unable to load document", "danger");
    }
    U.bind("#invoiceViewPrintBtn", "click", function () { window.print(); });
  });
})();
