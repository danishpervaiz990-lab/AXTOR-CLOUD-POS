(function () {
  "use strict";
  var U = window.AxtorPage;
  async function load() {
    var rows = U.data(await U.api().apiGet("/api/v1/sales-documents?documentType=quotation&limit=500")) || [];
    var body = U.q("#quotationsBody");
    if (!body) return;
    body.innerHTML = rows.length ? rows.map(function (row) {
      return "<tr><td>" + U.esc(row.documentNo) + "</td><td>" + U.esc(row.customerName || "Walk-in Customer") + "</td><td>" +
        U.date(row.documentDate || row.createdAt) + "</td><td>QAR " + U.money(row.total) + "</td><td><span class=\"badge-soft badge-draft\">" +
        U.esc(row.status) + "</span></td><td><a class=\"btn btn-sm btn-soft\" href=\"invoice-view.html?id=" + encodeURIComponent(row.id) + "\">View</a></td></tr>";
    }).join("") : U.emptyRow(6, "No backend quotations found");
  }
  U.run(load);
})();
