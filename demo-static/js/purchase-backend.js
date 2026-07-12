(function () {
  "use strict";
  var U = window.AxtorPage;
  var state = { suppliers: [], purchases: [], requests: [], receipts: [], payments: [], returns: [], accounts: [], products: [], warehouses: [], purchaseItems: [] };

  async function load() {
    var responses = await Promise.all([
      U.api().apiGet("/api/v1/suppliers"),
      U.api().apiGet("/api/v1/purchases"),
      U.api().apiGet("/api/v1/purchases/requests"),
      U.api().apiGet("/api/v1/purchases/goods-receipts"),
      U.api().apiGet("/api/v1/purchases/supplier-payments"),
      U.api().apiGet("/api/v1/purchases/returns"),
      U.api().apiGet("/api/v1/accounts"),
      U.api().apiGet("/api/v1/products?limit=500"),
      U.api().apiGet("/api/v1/inventory/warehouses")
    ]);
    state.suppliers = U.data(responses[0]) || [];
    state.purchases = U.data(responses[1]) || [];
    state.requests = U.data(responses[2]) || [];
    state.receipts = U.data(responses[3]) || [];
    state.payments = U.data(responses[4]) || [];
    state.returns = U.data(responses[5]) || [];
    var accountData = U.data(responses[6]) || {};
    state.accounts = accountData.accounts || accountData || [];
    var productData = U.data(responses[7]) || [];
    state.products = productData.items || productData.products || productData;
    state.warehouses = U.data(responses[8]) || [];
    render();
  }

  function purchaseLabel(row) { return row.purchaseNo + " — " + (row.supplierName || "Supplier"); }

  function render() {
    var supplierBody = U.q("#supplierListBody");
    if (supplierBody) supplierBody.innerHTML = state.suppliers.length ? state.suppliers.map(function (row) {
      return "<tr><td>" + U.esc(row.name) + "</td><td>" + U.esc(row.phone || "-") + "</td><td>QAR " + U.money(row.balance) +
        "</td><td><span class=\"badge-soft " + (U.num(row.balance) > 0 ? "badge-pending" : "badge-paid") + "\">" +
        (U.num(row.balance) > 0 ? "Payable" : "Clear") + "</span></td></tr>";
    }).join("") : U.emptyRow(4);

    ["#purchaseSupplier", "#supplierPaymentSupplier", "#supplierSoaSupplier"].forEach(function (id) {
      U.setOptions(U.q(id), state.suppliers, "name", "id", false);
    });
    U.setOptions(U.q("#supplierPaymentAccount"), state.accounts, "name", "id", false);
    U.setOptions(U.q("#purchaseProduct"), state.products, function (row) { return (row.sku || "") + " — " + row.name; }, "id", false);
    U.setOptions(U.q("#purchaseReturnPurchase"), state.purchases, purchaseLabel, "id", false);
    renderReturnProducts();

    var requestBody = U.q("#purchaseRequestBody");
    if (requestBody) requestBody.innerHTML = state.requests.length ? state.requests.map(function (row) {
      return "<tr><td>" + U.esc(row.requestNo) + "</td><td>" + U.esc(row.itemName) + "</td><td>" + U.money(row.qty) +
        "</td><td>" + U.esc(row.status) + "</td><td><button class=\"btn btn-sm btn-soft\" data-pr-convert=\"" + U.esc(row.id) + "\">Convert</button></td></tr>";
    }).join("") : U.emptyRow(5);

    var orderBody = U.q("#purchaseOrderBody");
    if (orderBody) orderBody.innerHTML = state.purchases.length ? state.purchases.map(function (row) {
      var canReceive = ["draft", "ordered", "DRAFT", "ORDERED"].includes(row.status);
      return "<tr><td>" + U.esc(row.purchaseNo) + "</td><td>" + U.esc(row.supplierName) + "</td><td>" +
        U.esc((row.items && row.items[0] && (row.items[0].name || row.items[0].productName)) || "-") + "</td><td>" +
        U.money((row.items || []).reduce(function (total, item) { return total + U.num(item.qty); }, 0)) + "</td><td>" + U.esc(row.status) +
        "</td><td>" + (canReceive ? '<button class="btn btn-sm btn-brand" data-po-receive="' + U.esc(row.id) + '">Receive</button>' : "") + "</td></tr>";
    }).join("") : U.emptyRow(6);

    var receiptBody = U.q("#grnBody");
    if (receiptBody) receiptBody.innerHTML = state.receipts.length ? state.receipts.map(function (row) {
      return "<tr><td>" + U.esc(row.receiptNo) + "</td><td>" + U.esc((row.purchase && row.purchase.purchaseNo) || row.purchaseNo || "-") +
        "</td><td>" + U.money((row.items || []).reduce(function (total, item) { return total + U.num(item.qty); }, 0)) + "</td><td>" +
        U.esc(row.status) + "</td><td></td></tr>";
    }).join("") : U.emptyRow(5);

    var billBody = U.q("#supplierBillBody");
    if (billBody) billBody.innerHTML = state.purchases.length ? state.purchases.map(function (row) {
      return "<tr><td>" + U.esc(row.purchaseNo) + "</td><td>" + U.esc(row.supplierName) + "</td><td>QAR " + U.money(row.total) +
        "</td><td>" + U.esc(U.num(row.balance) > 0 ? "payable" : "paid") + "</td><td></td></tr>";
    }).join("") : U.emptyRow(5);

    var paymentHistory = U.q("#supplierPaymentHistoryBody");
    if (paymentHistory) paymentHistory.innerHTML = state.payments.length ? state.payments.map(function (row) {
      return "<tr><td>" + U.esc(row.voucherNo) + "</td><td>" + U.date(row.paymentDate) + "</td><td>QAR " + U.money(row.amount) +
        "</td><td>" + U.esc(row.method || "-") + "</td><td>" + U.esc((((row.allocation || {}).allocations) || []).length) + "</td></tr>";
    }).join("") : U.emptyRow(5);

    var returnBody = U.q("#purchaseReturnBody");
    if (returnBody) returnBody.innerHTML = state.returns.length ? state.returns.map(function (row) {
      return "<tr><td>" + U.esc(row.returnNo) + "</td><td>" + U.esc(row.supplierName) + "</td><td>" +
        U.esc((row.items && row.items[0] && row.items[0].productName) || "-") + "</td><td>" +
        U.money((row.items || []).reduce(function (total, item) { return total + U.num(item.qty); }, 0)) + "</td><td>" + U.esc(row.status || "posted") + "</td></tr>";
    }).join("") : U.emptyRow(5);

    renderPurchaseItems();
    renderSupplierLedger();
    renderAging();
    paymentBills();
  }

  function renderPurchaseItems() {
    var body = U.q("#purchaseItemsBody");
    if (!body) return;
    body.innerHTML = state.purchaseItems.length ? state.purchaseItems.map(function (item, index) {
      return "<tr><td>" + U.esc(item.name) + "</td><td>" + U.money(item.qty) + "</td><td>" + U.money(item.cost) +
        "</td><td>" + U.money(item.qty * item.cost) + "</td><td><button class=\"btn btn-sm btn-outline-danger\" data-remove-purchase-item=\"" + index + "\">×</button></td></tr>";
    }).join("") : U.emptyRow(5, "Add products to this purchase");
  }

  function renderSupplierLedger() {
    var body = U.q("#supplierLedgerBody");
    if (!body) return;
    var rows = state.purchases.map(function (row) {
      return { date: row.purchaseDate, type: "Purchase posted", ref: row.purchaseNo, amount: row.total };
    }).concat(state.payments.map(function (row) {
      return { date: row.paymentDate, type: "Payment posted", ref: row.voucherNo, amount: -U.num(row.amount) };
    })).sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    body.innerHTML = rows.length ? rows.map(function (row) {
      return "<tr><td>" + U.date(row.date) + "</td><td>" + U.esc(row.type) + "</td><td>" + U.esc(row.ref) + "</td><td>QAR " + U.money(row.amount) + "</td></tr>";
    }).join("") : U.emptyRow(4);
  }

  function renderAging() {
    var body = U.q("#supplierAgingBody");
    if (!body) return;
    var now = Date.now();
    var map = {};
    state.purchases.filter(function (row) { return U.num(row.balance) > 0; }).forEach(function (row) {
      var id = row.supplierId || row.supplierName;
      if (!map[id]) map[id] = { supplier: row.supplierName, d30: 0, d60: 0, old: 0 };
      var due = new Date(row.dueDate || row.purchaseDate).getTime();
      var days = Math.max(0, Math.floor((now - due) / 86400000));
      if (days <= 30) map[id].d30 += U.num(row.balance); else if (days <= 60) map[id].d60 += U.num(row.balance); else map[id].old += U.num(row.balance);
    });
    var rows = Object.values(map);
    body.innerHTML = rows.length ? rows.map(function (row) {
      var total = row.d30 + row.d60 + row.old;
      return "<tr><td>" + U.esc(row.supplier) + "</td><td>QAR " + U.money(row.d30) + "</td><td>QAR " + U.money(row.d60) +
        "</td><td>QAR " + U.money(row.old) + "</td><td>QAR " + U.money(total) + "</td><td></td></tr>";
    }).join("") : U.emptyRow(6);
  }

  function renderReturnProducts() {
    var purchaseId = U.value("#purchaseReturnPurchase");
    var purchase = state.purchases.find(function (row) { return row.id === purchaseId; });
    var rows = purchase && purchase.items ? purchase.items : [];
    var select = U.q("#purchaseReturnProduct");
    if (!select) return;
    select.innerHTML = '<option value="">Select product</option>' + rows.map(function (item) {
      var id = item.productId || item.id || "";
      return '<option value="' + U.esc(id) + '" data-cost="' + U.esc(item.cost || item.rate || 0) + '" data-name="' +
        U.esc(item.name || item.productName) + '" data-sku="' + U.esc(item.sku || "") + '">' + U.esc(item.name || item.productName) + "</option>";
    }).join("");
  }

  function paymentBills() {
    var supplierId = U.value("#supplierPaymentSupplier");
    var rows = state.purchases.filter(function (row) { return row.supplierId === supplierId && U.num(row.balance) > 0; });
    var body = U.q("#supplierPaymentBillsBody");
    if (body) body.innerHTML = rows.length ? rows.map(function (row) {
      return '<tr><td><input type="checkbox" data-pay-select="' + U.esc(row.id) + '"></td><td>' + U.esc(row.purchaseNo) + "</td><td>" +
        U.date(row.dueDate) + "</td><td>" + U.money(row.total) + "</td><td>" + U.money(row.paid) + "</td><td>" + U.money(row.balance) +
        '</td><td><input class="form-control form-control-sm" type="number" data-pay-amount="' + U.esc(row.id) + '" value="0" max="' + U.esc(row.balance) + '"></td></tr>';
    }).join("") : U.emptyRow(7);
  }

  async function runStatement() {
    var supplierId = U.value("#supplierSoaSupplier");
    if (!supplierId) return U.toast("Select supplier", "error");
    var query = new URLSearchParams();
    if (U.value("#supplierSoaFrom")) query.set("from", U.value("#supplierSoaFrom"));
    if (U.value("#supplierSoaTo")) query.set("to", U.value("#supplierSoaTo"));
    var statement = U.data(await U.api().apiGet("/api/v1/purchases/supplier-statement/" + encodeURIComponent(supplierId) + "?" + query.toString()));
    var body = U.q("#supplierSoaBody");
    body.innerHTML = statement.rows && statement.rows.length ? statement.rows.map(function (row) {
      return "<tr><td>" + U.date(row.date) + "</td><td>" + U.esc(row.ref) + "</td><td>QAR " + U.money(row.debit) +
        "</td><td>QAR " + U.money(row.credit) + "</td><td>QAR " + U.money(row.balance) + "</td></tr>";
    }).join("") : U.emptyRow(5);
    var totals = statement.totals || {};
    U.q("#supplierSoaDebitTotal").textContent = "QAR " + U.money(totals.debit);
    U.q("#supplierSoaCreditTotal").textContent = "QAR " + U.money(totals.credit);
    U.q("#supplierSoaClosingBalance").textContent = "QAR " + U.money(totals.closingBalance);
  }

  U.run(async function () {
    await load();

    U.bind("#saveSupplierBtn", "click", async function (event) {
      var done = U.loading(event.currentTarget);
      try {
        await U.api().apiPost("/api/v1/suppliers", { name: U.value("#supplierName"), phone: U.value("#supplierPhone"), email: U.value("#supplierEmail") });
        U.toast("Supplier saved");
        await load();
      } catch (error) { U.error(error); } finally { done(); }
    });

    U.bind("#addPurchaseItemBtn", "click", function () {
      var productId = U.value("#purchaseProduct");
      var product = state.products.find(function (row) { return row.id === productId; });
      var qty = U.num(U.value("#purchaseQty"));
      var cost = U.num(U.value("#purchaseCost"));
      if (!product || qty <= 0) return U.toast("Select product and quantity", "error");
      state.purchaseItems.push({ productId: product.id, sku: product.sku, name: product.name, qty: qty, cost: cost || U.num(product.costPrice) });
      renderPurchaseItems();
    });

    U.on(U.q("#purchaseProduct"), "change", function () {
      var product = state.products.find(function (row) { return row.id === U.value("#purchaseProduct"); });
      if (product) U.q("#purchaseCost").value = U.num(product.costPrice);
    });

    U.bind(U.q('[data-demo-action="Purchase saved"]', U.q("#new-purchase")), "click", async function (event) {
      if (!state.purchaseItems.length) return U.toast("Add at least one product", "error");
      var done = U.loading(event.currentTarget);
      try {
        await U.api().apiPost("/api/v1/purchases", {
          supplierId: U.value("#purchaseSupplier"),
          purchaseNo: U.value("#purchaseNo"),
          purchaseDate: U.value("#purchaseDate"),
          items: state.purchaseItems,
          status: "DRAFT"
        });
        state.purchaseItems = [];
        U.toast("Purchase saved");
        await load();
      } catch (error) { U.error(error); } finally { done(); }
    });

    U.bind("#createPrBtn", "click", async function (event) {
      var done = U.loading(event.currentTarget);
      try {
        await U.api().apiPost("/api/v1/purchases/requests", { itemName: U.value("#prItem"), qty: U.num(U.value("#prQty")) });
        U.toast("Purchase request created");
        await load();
      } catch (error) { U.error(error); } finally { done(); }
    });

    U.on(U.q("#supplierPaymentSupplier"), "change", paymentBills);
    U.on(U.q("#purchaseReturnPurchase"), "change", renderReturnProducts);
    U.bind("#runSupplierSoaBtn", "click", function () { runStatement().catch(U.error); });

    U.bind("#supplierAutoAllocateBtn", "click", function () {
      var left = U.num(U.value("#supplierPaidTotal"));
      U.qa("[data-pay-amount]").forEach(function (input) {
        var max = U.num(input.max);
        var value = Math.min(left, max);
        input.value = value;
        left -= value;
      });
    });

    U.bind("#saveSupplierPaymentBtn", "click", async function (event) {
      var done = U.loading(event.currentTarget);
      try {
        var allocations = U.qa("[data-pay-amount]").map(function (input) {
          return { purchaseId: input.dataset.payAmount, amount: U.num(input.value) };
        }).filter(function (row) { return row.amount > 0; });
        await U.api().apiPost("/api/v1/purchases/supplier-payments", {
          supplierId: U.value("#supplierPaymentSupplier"), amount: U.num(U.value("#supplierPaidTotal")),
          paymentDate: U.value("#supplierPaymentDate"), method: U.value("#supplierPaymentMethod"),
          accountId: U.value("#supplierPaymentAccount"), referenceNo: U.value("#supplierPaymentRef"), allocations: allocations
        });
        U.toast("Supplier payment saved");
        await load();
      } catch (error) { U.error(error); } finally { done(); }
    });

    U.bind("#savePurchaseReturnBtn", "click", async function (event) {
      var purchaseId = U.value("#purchaseReturnPurchase");
      var purchase = state.purchases.find(function (row) { return row.id === purchaseId; });
      var option = U.q("#purchaseReturnProduct option:checked");
      if (!purchase || !option || !option.value) return U.toast("Select purchase and product", "error");
      var done = U.loading(event.currentTarget);
      try {
        await U.api().apiPost("/api/v1/purchases/returns", {
          purchaseId: purchase.id,
          supplierId: purchase.supplierId,
          warehouseId: purchase.warehouseId,
          reason: U.value("#purchaseReturnReason"),
          items: [{ productId: option.value, sku: option.dataset.sku, name: option.dataset.name, qty: U.num(U.value("#purchaseReturnQty")), cost: U.num(option.dataset.cost) }]
        });
        U.toast("Purchase return posted and stock reduced");
        await load();
      } catch (error) { U.error(error); } finally { done(); }
    });

    document.addEventListener("click", async function (event) {
      var remove = event.target.closest("[data-remove-purchase-item]");
      if (remove) {
        state.purchaseItems.splice(Number(remove.dataset.removePurchaseItem), 1);
        renderPurchaseItems();
      }
      var receive = event.target.closest("[data-po-receive]");
      if (receive) {
        await U.api().apiPost("/api/v1/purchases/" + encodeURIComponent(receive.dataset.poReceive) + "/receive", {});
        U.toast("Goods received and stock updated");
        await load();
      }
      var convert = event.target.closest("[data-pr-convert]");
      if (convert) {
        var supplierId = state.suppliers[0] && state.suppliers[0].id;
        if (!supplierId) return U.toast("Add supplier first", "error");
        await U.api().apiPost("/api/v1/purchases/requests/" + encodeURIComponent(convert.dataset.prConvert) + "/convert", { supplierId: supplierId });
        U.toast("PR converted to PO");
        await load();
      }
    });
  });
})();
