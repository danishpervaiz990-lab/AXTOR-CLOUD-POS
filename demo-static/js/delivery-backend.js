(function () {
  "use strict";
  var U = window.AxtorPage;
  async function load() {
    var rows = U.data(await U.api().apiGet("/api/v1/sales-documents?documentType=delivery_note&limit=500")) || [];
    var page = U.q("main.page");
    if (!page) return;
    var existing = U.q(".cardx", page);
    var html = '<div class="cardx"><div class="d-flex justify-content-between align-items-center mb-3"><div><h5 class="cardx-title mb-1">Saved Delivery Notes</h5><p class="text-muted mb-0">Live documents stored in PostgreSQL.</p></div><a class="btn btn-brand" href="sales.html#new-sale">New Delivery Note</a></div><div class="table-wrap"><table class="table"><thead><tr><th>Document</th><th>Customer</th><th>Date</th><th>Items</th><th>Status</th><th></th></tr></thead><tbody>' +
      (rows.length ? rows.map(function (row) {
        return "<tr><td>" + U.esc(row.documentNo) + "</td><td>" + U.esc(row.customerName || "Walk-in Customer") + "</td><td>" +
          U.date(row.documentDate || row.createdAt) + "</td><td>" + U.esc((row.items || []).length) + "</td><td>" + U.esc(row.status) +
          "</td><td><a class=\"btn btn-sm btn-soft\" href=\"invoice-view.html?id=" + encodeURIComponent(row.id) + "\">Preview / Print</a></td></tr>";
      }).join("") : U.emptyRow(6, "No backend delivery notes found")) + "</tbody></table></div></div>";
    if (existing) existing.outerHTML = html; else page.insertAdjacentHTML("beforeend", html);
  }
  U.run(load);
})();
