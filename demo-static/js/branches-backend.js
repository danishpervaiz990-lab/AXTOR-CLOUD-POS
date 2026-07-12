(function () {
  "use strict";
  var U = window.AxtorPage;
  var state = { branches: [], counters: [], warehouses: [], products: [], transfers: [] };

  async function load() {
    var responses = await Promise.all([
      U.api().apiGet("/api/v1/branches"),
      U.api().apiGet("/api/v1/branches/counters"),
      U.api().apiGet("/api/v1/inventory/warehouses"),
      U.api().apiGet("/api/v1/inventory/stock"),
      U.api().apiGet("/api/v1/inventory/movements")
    ]);
    state.branches = U.data(responses[0]) || [];
    state.counters = U.data(responses[1]) || [];
    state.warehouses = U.data(responses[2]) || [];
    state.products = U.data(responses[3]) || [];
    state.transfers = (U.data(responses[4]) || []).filter(function (row) {
      return String(row.movementType || "").toUpperCase() === "WAREHOUSE_TRANSFER";
    });
    render();
  }

  function render() {
    var branchBody = U.q("#branchesBody");
    if (branchBody) branchBody.innerHTML = state.branches.length ? state.branches.map(function (row) {
      return "<tr><td>" + U.esc(row.name) + "</td><td>" + U.esc(row.type || "Retail") + "</td><td>" +
        U.esc(row.manager || "-") + "</td><td><span class=\"badge-soft " + (row.active ? "badge-paid" : "badge-pending") + "\">" +
        (row.active ? "Active" : "Inactive") + "</span></td></tr>";
    }).join("") : U.emptyRow(4);

    var counterBody = U.q("#countersBody");
    if (counterBody) counterBody.innerHTML = state.counters.length ? state.counters.map(function (row) {
      return "<tr><td>" + U.esc(row.name) + "</td><td>" + U.esc((row.branch && row.branch.name) || "-") +
        "</td><td>" + U.esc(row.cashierName || "-") + "</td><td>" + U.esc(row.status) + "</td></tr>";
    }).join("") : U.emptyRow(4);

    var warehouseBody = U.q("#warehousesBody");
    if (warehouseBody) warehouseBody.innerHTML = state.warehouses.length ? state.warehouses.map(function (row) {
      return "<tr><td>" + U.esc(row.name) + "</td><td>" + U.esc((row.branch && row.branch.name) || "-") +
        "</td><td>QAR " + U.money(row.stockValue || 0) + "</td></tr>";
    }).join("") : U.emptyRow(3);

    var transferBody = U.q("#transfersBody");
    if (transferBody) transferBody.innerHTML = state.transfers.length ? state.transfers.map(function (row) {
      return "<tr><td>" + U.esc(row.movementNo) + "</td><td>" + U.date(row.movementDate) + "</td><td>" +
        U.esc(row.productName) + "</td><td>" + U.money(row.qty) + "</td><td>" + U.esc(row.referenceNo || "-") + "</td></tr>";
    }).join("") : U.emptyRow(5);

    U.setOptions(U.q("#counterBranch"), state.branches, "name", "id", false);
    U.setOptions(U.q("#transferFrom"), state.warehouses, "name", "id", false);
    U.setOptions(U.q("#transferTo"), state.warehouses, "name", "id", false);

    var transferItem = U.q("#transferItem");
    if (transferItem && transferItem.tagName === "SELECT") {
      U.setOptions(transferItem, state.products, function (row) { return row.sku + " — " + row.name; }, "id", false);
    } else if (transferItem) {
      var dataListId = "branchTransferProducts";
      var dataList = U.q("#" + dataListId);
      if (!dataList) {
        dataList = document.createElement("datalist");
        dataList.id = dataListId;
        document.body.appendChild(dataList);
      }
      dataList.innerHTML = state.products.map(function (row) {
        return '<option value="' + U.esc(row.sku || row.name) + '">' + U.esc(row.name) + "</option>";
      }).join("");
      transferItem.setAttribute("list", dataListId);
    }
  }

  U.run(async function () {
    await load();

    U.bind("#addBranchBtn", "click", async function (event) {
      var done = U.loading(event.currentTarget);
      try {
        await U.api().apiPost("/api/v1/branches", { name: U.value("#branchName"), type: U.value("#branchType") });
        U.toast("Branch saved");
        await load();
      } catch (error) { U.error(error); } finally { done(); }
    });

    U.bind("#addCounterBtn", "click", async function (event) {
      var done = U.loading(event.currentTarget);
      try {
        await U.api().apiPost("/api/v1/branches/counters", { name: U.value("#counterName"), branchId: U.value("#counterBranch") });
        U.toast("Counter saved");
        await load();
      } catch (error) { U.error(error); } finally { done(); }
    });

    U.bind("#postTransferBtn", "click", async function (event) {
      var transferItem = U.q("#transferItem");
      var value = U.value(transferItem);
      var matchingProduct = state.products.find(function (row) {
        return row.id === value || row.sku === value || row.barcode === value || String(row.name).toLowerCase() === value.toLowerCase();
      });
      var done = U.loading(event.currentTarget);
      try {
        await U.api().apiPost("/api/v1/inventory/transfers", {
          fromWarehouseId: U.value("#transferFrom"),
          toWarehouseId: U.value("#transferTo"),
          productId: matchingProduct && matchingProduct.id,
          product: value,
          qty: U.num(U.value("#transferQty"))
        });
        U.toast("Stock transferred");
        await load();
      } catch (error) { U.error(error); } finally { done(); }
    });
  });
})();
