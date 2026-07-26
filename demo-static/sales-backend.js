(function () {
  "use strict";
  var U = window.AxtorPage;
  var state = { warehouses: [], stock: [], moves: [], counts: [], low: [], countSheet: null };

  function warehouseName(id) {
    var row = state.warehouses.find(function (warehouse) { return warehouse.id === id; });
    return row ? row.name : id || "-";
  }

  async function load() {
    var responses = await Promise.all([
      U.api().apiGet("/api/v1/inventory/warehouses"),
      U.api().apiGet("/api/v1/inventory/stock"),
      U.api().apiGet("/api/v1/inventory/movements"),
      U.api().apiGet("/api/v1/inventory/stock-counts"),
      U.api().apiGet("/api/v1/inventory/low-stock")
    ]);
    state.warehouses = U.data(responses[0]) || [];
    state.stock = U.data(responses[1]) || [];
    state.moves = U.data(responses[2]) || [];
    state.counts = U.data(responses[3]) || [];
    state.low = U.data(responses[4]) || [];
    render();
  }

  function render() {
    U.setOptions(U.q("#stockAdjustmentWarehouse"), state.warehouses, "name", "id", false);
    U.setOptions(U.q("#stockCountWarehouse"), state.warehouses, "name", "id", false);

    var ledger = U.q("#stockLedgerBody");
    if (ledger) ledger.innerHTML = state.moves.length ? state.moves.map(function (row) {
      var direction = String(row.direction || "").toUpperCase();
      var incoming = direction === "IN" || (direction === "ADJUSTMENT" && U.num(row.afterQty) >= U.num(row.beforeQty));
      var outgoing = direction === "OUT" || (direction === "ADJUSTMENT" && U.num(row.afterQty) < U.num(row.beforeQty));
      return "<tr><td>" + U.date(row.movementDate) + "</td><td>" + U.esc(row.productName) + "</td><td>" +
        U.esc(row.referenceNo || row.movementNo) + "</td><td>" + (incoming ? U.money(row.qty) : "-") + "</td><td>" +
        (outgoing ? U.money(row.qty) : "-") + "</td><td>" + U.money(row.afterQty) + "</td></tr>";
    }).join("") : U.emptyRow(6);

    var reorder = U.q("#reorderBody");
    if (reorder) reorder.innerHTML = state.low.length ? state.low.map(function (row) {
      return "<tr><td>" + U.esc(row.name) + "</td><td>-</td><td>" + U.money(row.currentStock) + "</td><td>" +
        U.money(row.minStock) + "</td><td>" + U.money(row.suggestedQty) + "</td><td>" + U.esc(row.preferredSupplier || "-") +
        "</td><td><a class=\"btn btn-sm btn-soft\" href=\"purchase.html#purchase-request\">Create PR</a></td></tr>";
    }).join("") : U.emptyRow(7);

    var history = U.q("#stockCountHistoryBody");
    if (history) history.innerHTML = state.counts.length ? state.counts.map(function (row) {
      return "<tr><td>" + U.esc(row.countNo) + "</td><td>" + U.esc(warehouseName(row.warehouseId)) + "</td><td>" +
        U.datetime(row.countedAt) + "</td><td>" + U.esc((row.items || []).length) + "</td><td>" + U.esc(row.status) + "</td></tr>";
    }).join("") : U.emptyRow(5);

    var warehouseWrap = U.q("#warehouse-management .table-wrap");
    if (warehouseWrap) warehouseWrap.innerHTML = '<table class="table"><thead><tr><th>Warehouse</th><th>Branch</th><th>Location</th><th>Status</th></tr></thead><tbody>' +
      (state.warehouses.length ? state.warehouses.map(function (row) {
        return "<tr><td>" + U.esc(row.name) + "</td><td>" + U.esc((row.branch && row.branch.name) || "-") + "</td><td>" +
          U.esc(row.address || "-") + "</td><td>" + (row.active ? "Active" : "Inactive") + "</td></tr>";
      }).join("") : U.emptyRow(4)) + "</tbody></table>";

    renderTransferInputs();
    renderCountSheet();
  }

  function renderTransferInputs() {
    var section = U.q("#stock-transfer");
    if (!section) return;
    var selects = U.qa("select", section);
    if (selects[0]) U.setOptions(selects[0], state.warehouses, function (row) { return "From: " + row.name; }, "id", false);
    if (selects[1]) U.setOptions(selects[1], state.warehouses, function (row) { return "To: " + row.name; }, "id", false);
    var inputs = U.qa("input", section);
    var productInput = inputs[1];
    if (productInput) {
      var list = U.q("#inventoryTransferProducts");
      if (!list) {
        list = document.createElement("datalist");
        list.id = "inventoryTransferProducts";
        document.body.appendChild(list);
      }
      list.innerHTML = state.stock.map(function (row) {
        return '<option value="' + U.esc(row.sku || row.name) + '">' + U.esc(row.name) + "</option>";
      }).join("");
      productInput.setAttribute("list", list.id);
    }
  }

  function renderCountSheet() {
    var body = U.q("#stockCountBody");
    if (!body) return;
    var items = state.countSheet && state.countSheet.items ? state.countSheet.items : [];
    body.innerHTML = items.length ? items.map(function (row) {
      return "<tr data-count-product=\"" + U.esc(row.productId) + "\"><td>" + U.esc(row.sku + " — " + row.productName) +
        "</td><td>" + U.money(row.systemQty) + "</td><td><input class=\"form-control form-control-sm\" type=\"number\" step=\"0.001\" data-counted-qty value=\"" +
        U.esc(row.countedQty) + "\"></td><td data-count-difference>" + U.money(U.num(row.countedQty) - U.num(row.systemQty)) + "</td></tr>";
    }).join("") : U.emptyRow(4, "Select a warehouse to load its stock count sheet");
  }

  async function loadCountSheet() {
    var warehouseId = U.value("#stockCountWarehouse");
    if (!warehouseId) {
      state.countSheet = null;
      renderCountSheet();
      return;
    }
    state.countSheet = U.data(await U.api().apiGet("/api/v1/inventory/stock-counts/sheet/" + encodeURIComponent(warehouseId)));
    renderCountSheet();
  }

  U.run(async function () {
    await load();
    if (state.warehouses[0]) {
      var countWarehouse = U.q("#stockCountWarehouse");
      if (countWarehouse && !countWarehouse.value) countWarehouse.value = state.warehouses[0].id;
      await loadCountSheet();
    }

    U.on(U.q("#stockAdjustmentProductSearch"), "input", function () {
      var query = this.value.toLowerCase();
      var box = U.q("#stockAdjustmentProductSuggestions");
      if (!box) return;
      var rows = state.stock.filter(function (row) {
        return (row.name + " " + row.sku + " " + (row.barcode || "")).toLowerCase().includes(query);
      }).slice(0, 8);
      box.innerHTML = rows.map(function (row) {
        return '<button type="button" class="list-group-item list-group-item-action" data-stock-product="' + U.esc(row.id) +
          '" data-stock-name="' + U.esc(row.name) + '">' + U.esc(row.sku + " — " + row.name) + "</button>";
      }).join("");
      box.classList.toggle("d-none", !rows.length);
    });

    document.addEventListener("click", function (event) {
      var button = event.target.closest("[data-stock-product]");
      if (!button) return;
      var input = U.q("#stockAdjustmentProductSearch");
      input.value = button.dataset.stockName;
      input.dataset.productId = button.dataset.stockProduct;
      U.q("#stockAdjustmentProductSuggestions").classList.add("d-none");
    });

    U.bind("#saveStockAdjustmentBtn", "click", async function (event) {
      var done = U.loading(event.currentTarget);
      var input = U.q("#stockAdjustmentProductSearch");
      var selectedType = U.value("#stockAdjustmentType").toLowerCase();
      try {
        await U.api().apiPost("/api/v1/inventory/adjustments", {
          date: U.value("#stockAdjustmentDate"),
          warehouseId: U.value("#stockAdjustmentWarehouse"),
          type: selectedType.includes("decrease") ? "subtract" : "add",
          productId: input && input.dataset.productId,
          product: input && input.value,
          qty: U.num(U.value("#stockAdjustmentQty"))
        });
        U.toast("Stock adjustment saved");
        if (input) { input.value = ""; delete input.dataset.productId; }
        await load();
      } catch (error) { U.error(error); } finally { done(); }
    });

    var warehouseSection = U.q("#warehouse-management");
    var warehouseInputs = U.qa("input", warehouseSection);
    var warehouseSave = U.q('[data-demo-action="Warehouse saved"]', warehouseSection);
    U.bind(warehouseSave, "click", async function (event) {
      var done = U.loading(event.currentTarget);
      try {
        await U.api().apiPost("/api/v1/inventory/warehouses", {
          name: warehouseInputs[0] && warehouseInputs[0].value,
          address: warehouseInputs[1] && warehouseInputs[1].value
        });
        U.toast("Warehouse saved");
        await load();
      } catch (error) { U.error(error); } finally { done(); }
    });

    var transferSection = U.q("#stock-transfer");
    var transferSave = U.q('[data-demo-action="Transfer saved"]', transferSection);
    U.bind(transferSave, "click", async function (event) {
      var selects = U.qa("select", transferSection);
      var inputs = U.qa("input", transferSection);
      var productValue = inputs[1] ? inputs[1].value.trim() : "";
      var product = state.stock.find(function (row) {
        return row.id === productValue || row.sku === productValue || row.barcode === productValue || String(row.name).toLowerCase() === productValue.toLowerCase();
      });
      var done = U.loading(event.currentTarget);
      try {
        await U.api().apiPost("/api/v1/inventory/transfers", {
          fromWarehouseId: selects[0] && selects[0].value,
          toWarehouseId: selects[1] && selects[1].value,
          referenceNo: inputs[0] && inputs[0].value,
          productId: product && product.id,
          product: productValue,
          qty: U.num(inputs[2] && inputs[2].value)
        });
        U.toast("Stock transfer saved");
        await load();
      } catch (error) { U.error(error); } finally { done(); }
    });

    U.on(U.q("#stockCountWarehouse"), "change", function () { loadCountSheet().catch(U.error); });
    U.on(U.q("#stockCountBody"), "input", function (event) {
      if (!event.target.matches("[data-counted-qty]")) return;
      var row = event.target.closest("tr");
      var product = (state.countSheet.items || []).find(function (item) { return item.productId === row.dataset.countProduct; });
      var difference = U.num(event.target.value) - U.num(product && product.systemQty);
      var cell = U.q("[data-count-difference]", row);
      if (cell) cell.textContent = U.money(difference);
    });

    U.bind("#approveStockCountBtn", "click", async function (event) {
      var warehouseId = U.value("#stockCountWarehouse");
      if (!warehouseId) return U.toast("Select warehouse", "error");
      var done = U.loading(event.currentTarget);
      try {
        var items = U.qa("#stockCountBody tr[data-count-product]").map(function (row) {
          return { productId: row.dataset.countProduct, countedQty: U.num(U.value(U.q("[data-counted-qty]", row))) };
        });
        if (!items.length) return U.toast("No stock count lines found", "error");
        await U.api().apiPost("/api/v1/inventory/stock-counts/approve", { warehouseId: warehouseId, items: items });
        U.toast("Stock count approved and stock adjusted");
        await load();
        await loadCountSheet();
      } catch (error) { U.error(error); } finally { done(); }
    });
  });
})();
