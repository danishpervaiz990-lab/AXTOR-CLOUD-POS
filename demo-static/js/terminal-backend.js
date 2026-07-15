(function () {
  "use strict";
  var U = window.AxtorPage;
  var state = { products: [], customers: [], salesPersons: [], context: {}, cart: [], drafts: [], currentDraftId: null, lastDocument: null };

  function replaceControl(selector) {
    var old = U.q(selector);
    if (!old) return null;
    var clone = old.cloneNode(true);
    old.replaceWith(clone);
    return clone;
  }

  function settingValue(key, fallback) {
    var value = state.context && state.context.settings ? state.context.settings[key] : undefined;
    if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "value")) value = value.value;
    return value === undefined || value === null || value === "" ? fallback : value;
  }

  function defaultTaxRate() { return U.num(settingValue("sales.defaultTaxRate", 0)); }

  function normalizeList(response) {
    var value = U.data(response) || [];
    return value.items || value.products || value.customers || value;
  }

  async function load() {
    var responses = await Promise.all([
      U.api().apiGet("/api/v1/products?limit=500"),
      U.api().apiGet("/api/v1/customers?limit=500"),
      U.api().apiGet("/api/v1/sales-documents/context"),
      U.api().apiGet("/api/v1/sales-documents?documentType=invoice&status=draft&limit=100")
    ]);
    state.products = normalizeList(responses[0]);
    state.customers = normalizeList(responses[1]);
    state.context = U.data(responses[2]) || {};
    state.salesPersons = state.context.salesPersons || [];
    state.drafts = U.data(responses[3]) || [];
    renderAll();
  }

  function productName(row) { return row.name || row.productName || "Item"; }
  function productPrice(row) { return U.num(row.price || row.sellingPrice || row.unitPrice); }
  function productStock(row) { return U.num(row.currentStock || row.stock || row.openingStock); }

  function findProduct(value) {
    var query = String(value || "").trim().toLowerCase();
    if (!query) return null;
    return state.products.find(function (row) {
      return [row.id, row.sku, row.barcode, row.qrCode, row.itemCode, row.name].some(function (field) {
        return String(field || "").toLowerCase() === query;
      });
    }) || state.products.find(function (row) {
      return [row.sku, row.barcode, row.qrCode, row.itemCode, row.name, row.category].join(" ").toLowerCase().includes(query);
    });
  }

  function addProduct(product) {
    if (!product) return U.toast("Product not found", "error");
    var existing = state.cart.find(function (item) { return item.productId === product.id; });
    if (existing) existing.qty += 1;
    else state.cart.push({
      productId: product.id,
      sku: product.sku || "-",
      barcode: product.barcode || null,
      name: productName(product),
      qty: 1,
      rate: productPrice(product),
      discount: 0,
      taxRate: U.num(product.taxRate, defaultTaxRate())
    });
    renderCart();
  }

  function totals() {
    var subtotal = 0, lineDiscount = 0, tax = 0;
    state.cart.forEach(function (item) {
      var line = U.num(item.qty) * U.num(item.rate);
      subtotal += line;
      lineDiscount += U.num(item.discount);
      tax += Math.max(0, line - U.num(item.discount)) * U.num(item.taxRate) / 100;
    });
    var invoiceDiscount = Math.max(0, U.num(U.value("#terminalInvoiceDiscount")));
    var grand = Math.max(0, subtotal - lineDiscount - invoiceDiscount + tax);
    var cash = Math.max(0, U.num(U.value("#terminalPayCash")));
    var card = Math.max(0, U.num(U.value("#terminalPayCard")));
    var bank = Math.max(0, U.num(U.value("#terminalPayBank")));
    var credit = Math.max(0, U.num(U.value("#terminalPayCredit")));
    var paidNow = Math.min(grand, cash + card + bank);
    var recorded = Math.min(grand, paidNow + credit);
    return { subtotal: subtotal, lineDiscount: lineDiscount, invoiceDiscount: invoiceDiscount, tax: tax, grand: grand, cash: cash, card: card, bank: bank, credit: credit, paidNow: paidNow, recorded: recorded, balance: Math.max(0, grand - recorded) };
  }

  function renderAll() {
    U.setOptions(U.q("#terminalCustomer"), state.customers, function (row) { return row.name + (row.phone ? " — " + row.phone : ""); }, "id");
    U.setOptions(U.q("#saleSmId"), state.salesPersons, "name", "id");
    renderProducts(U.value("#terminalProductSearch"));
    renderCart();
    renderHeld();
  }

  function renderProducts(search) {
    var query = String(search || "").trim().toLowerCase();
    var rows = state.products.filter(function (row) {
      return !query || [row.sku, row.barcode, row.qrCode, row.itemCode, row.name, row.category].join(" ").toLowerCase().includes(query);
    }).slice(0, 80);
    var grid = U.q("#terminalProductGrid");
    if (!grid) return;
    grid.innerHTML = rows.length ? rows.map(function (row) {
      return '<div class="fast-product"><div class="product-icon"><i class="bi bi-box-seam"></i></div><strong>' + U.esc(productName(row)) +
        '</strong><small class="text-muted">' + U.esc(row.sku || "-") + " • Stock " + U.money(productStock(row)) +
        '</small><div class="d-flex justify-content-between align-items-center mt-auto"><span class="fw-bold">QAR ' + U.money(productPrice(row)) +
        '</span><button type="button" class="btn btn-sm btn-brand" data-cloud-terminal-add="' + U.esc(row.id) + '">Add</button></div></div>';
    }).join("") : '<div class="text-muted p-3">No backend products found.</div>';
  }

  function renderCart() {
    var body = U.q("#terminalCartBody");
    if (body) body.innerHTML = state.cart.length ? state.cart.map(function (item, index) {
      var line = item.qty * item.rate;
      var itemTax = Math.max(0, line - item.discount) * item.taxRate / 100;
      var total = line - item.discount + itemTax;
      return "<tr><td><strong>" + U.esc(item.name) + "</strong></td><td>" + U.esc(item.sku) +
        '</td><td><div class="d-flex align-items-center gap-1"><button type="button" class="btn btn-sm btn-soft" data-cloud-qty="' + index + '" data-delta="-1">−</button>' +
        '<input class="form-control form-control-sm text-center" style="width:64px" data-cloud-qty-input="' + index + '" value="' + U.esc(item.qty) + '">' +
        '<button type="button" class="btn btn-sm btn-soft" data-cloud-qty="' + index + '" data-delta="1">+</button></div></td><td>QAR ' + U.money(item.rate) +
        '</td><td><input class="form-control form-control-sm" type="number" data-cloud-disc="' + index + '" value="' + U.esc(item.discount) + '"></td><td>QAR ' +
        U.money(itemTax) + '</td><td class="fw-bold">QAR ' + U.money(total) + '</td><td><button type="button" class="btn btn-sm btn-soft text-danger" data-cloud-remove="' + index + '">×</button></td></tr>';
    }).join("") : U.emptyRow(8, "Scan barcode or add a product to start sale");
    renderTotals();
  }

  function renderTotals() {
    var value = totals();
    var map = {
      terminalSubtotal: value.subtotal,
      terminalLineDiscount: value.lineDiscount,
      terminalTax: value.tax,
      terminalGrand: value.grand,
      terminalPaid: value.recorded,
      terminalBalance: value.balance
    };
    Object.keys(map).forEach(function (id) {
      var element = U.q("#" + id);
      if (element) element.textContent = "QAR " + U.money(map[id]);
    });
    var taxLabel = U.q("#terminalTaxLabel");
    if (taxLabel) taxLabel.textContent = "Tax";

    var warning = U.q("#terminalCreditWarning");
    if (warning) {
      var customerId = U.value("#terminalCustomer");
      warning.innerHTML = value.balance > 0 && !customerId ? '<div class="alert alert-warning py-2 mb-0">Select a named customer for an outstanding credit balance.</div>' : "";
    }
  }

  function renderHeld() {
    var body = U.q("#heldSalesBody");
    if (!body) return;
    body.innerHTML = state.drafts.length ? state.drafts.map(function (row) {
      return "<tr><td>" + U.esc(row.documentNo) + "</td><td>" + U.esc(row.customerName || "Walk-in Customer") + "</td><td>" + U.datetime(row.createdAt) +
        "</td><td>" + U.esc((row.items || []).length) + "</td><td>QAR " + U.money(row.total) +
        '</td><td><button type="button" class="btn btn-sm btn-brand" data-cloud-recall="' + U.esc(row.id) + '">Recall</button></td></tr>';
    }).join("") : U.emptyRow(6, "No held backend sales");
  }

  function buildPayment() {
    var value = totals();
    var lines = [];
    if (value.cash > 0) lines.push({ method: "cash", amount: Math.min(value.cash, value.grand) });
    if (value.card > 0) lines.push({ method: "card", amount: Math.min(value.card, Math.max(0, value.grand - lines.reduce(function (s, x) { return s + x.amount; }, 0))) });
    if (value.bank > 0) lines.push({ method: "bank_transfer", amount: Math.min(value.bank, Math.max(0, value.grand - lines.reduce(function (s, x) { return s + x.amount; }, 0))) });
    lines = lines.filter(function (line) { return line.amount > 0; });
    var method = lines.length > 1 ? "mixed" : lines.length === 1 ? lines[0].method : "credit";
    return { value: value, lines: lines, method: method };
  }

  function payload(postingMode) {
    var customerId = U.value("#terminalCustomer");
    var customer = state.customers.find(function (row) { return row.id === customerId; });
    var payment = buildPayment();
    if (!state.cart.length) throw new Error("Cart is empty");
    if (payment.value.balance > 0 && !customerId) throw new Error("Select a customer for a credit/balance invoice");
    return {
      documentType: "invoice",
      postingMode: postingMode,
      idempotencyKey: "terminal:" + Date.now() + ":" + Math.random().toString(36).slice(2),
      documentDate: new Date().toISOString().slice(0, 10),
      customerId: customerId || null,
      customerName: customer ? customer.name : "Walk-in Customer",
      salesmanId: U.value("#saleSmId") || null,
      salesChannel: "pos_terminal",
      paymentMethod: payment.method,
      paidAmount: payment.value.paidNow,
      paymentLines: payment.lines,
      discount: payment.value.invoiceDiscount,
      items: state.cart.map(function (item) {
        return { productId: item.productId, qty: item.qty, rate: item.rate, discount: item.discount, taxRate: item.taxRate };
      })
    };
  }

  function resetTerminal() {
    state.cart = [];
    state.currentDraftId = null;
    ["#terminalInvoiceDiscount", "#terminalPayCash", "#terminalPayCard", "#terminalPayCredit", "#terminalPayBank"].forEach(function (id) {
      var element = U.q(id); if (element) element.value = 0;
    });
    renderCart();
  }

  async function completeSale(button) {
    var done = U.loading(button, "Posting...");
    try {
      var body = payload("post");
      var response;
      if (state.currentDraftId) {
        delete body.idempotencyKey;
        delete body.postingMode;
        await U.api().apiPatch("/api/v1/sales-documents/" + encodeURIComponent(state.currentDraftId), body);
        response = await U.api().apiPost("/api/v1/sales-documents/" + encodeURIComponent(state.currentDraftId) + "/post", {
          paymentMethod: body.paymentMethod, paidAmount: body.paidAmount, paymentLines: body.paymentLines
        });
      } else {
        response = await U.api().apiPost("/api/v1/sales-documents", body);
      }
      state.lastDocument = U.data(response);
      U.toast("Sale posted: " + (state.lastDocument.documentNo || "Invoice"));
      resetTerminal();
      await load();
    } catch (error) { U.error(error); } finally { done(); }
  }

  async function holdSale(button) {
    var done = U.loading(button, "Holding...");
    try {
      var response = await U.api().apiPost("/api/v1/sales-documents", payload("draft"));
      var draft = U.data(response);
      U.toast("Sale held: " + draft.documentNo);
      resetTerminal();
      await load();
    } catch (error) { U.error(error); } finally { done(); }
  }

  async function recallDraft(id) {
    var draft = U.data(await U.api().apiGet("/api/v1/sales-documents/" + encodeURIComponent(id)));
    state.currentDraftId = draft.id;
    state.cart = (draft.items || []).map(function (item) {
      return { productId: item.productId, sku: item.sku, barcode: item.barcode, name: item.name, qty: U.num(item.qty), rate: U.num(item.rate), discount: U.num(item.discount), taxRate: U.num(item.taxRate) };
    });
    var customer = U.q("#terminalCustomer"); if (customer) customer.value = draft.customerId || "";
    var salesman = U.q("#saleSmId"); if (salesman) salesman.value = draft.salesmanId || "";
    var invoiceDiscount = U.q("#terminalInvoiceDiscount"); if (invoiceDiscount) invoiceDiscount.value = Math.max(0, U.num(draft.discount) - state.cart.reduce(function (s, item) { return s + item.discount; }, 0));
    renderCart();
    U.modalHide("#heldSalesModal");
    U.toast("Held sale recalled. Complete Sale will post this draft.");
  }

  window.addEventListener("axtor:salesmen-migrated", function () { load().catch(function (error) { U.toast(error.message || "Unable to refresh terminal data", "error"); }); });

  U.run(async function () {
    await load();

    var search = replaceControl("#terminalProductSearch");
    var scan = replaceControl("#terminalScan");
    var customer = replaceControl("#terminalCustomer");
    var salesman = replaceControl("#saleSmId");
    var discount = replaceControl("#terminalInvoiceDiscount");
    var payCash = replaceControl("#terminalPayCash");
    var payCard = replaceControl("#terminalPayCard");
    var payCredit = replaceControl("#terminalPayCredit");
    var payBank = replaceControl("#terminalPayBank");
    renderAll();

    U.on(search, "input", function () { renderProducts(search.value); });
    U.on(scan, "keydown", function (event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      addProduct(findProduct(scan.value));
      scan.value = "";
    });
    [customer, salesman, discount, payCash, payCard, payCredit, payBank].forEach(function (element) {
      U.on(element, "input", renderTotals); U.on(element, "change", renderTotals);
    });

    U.bind("#completeTerminalSaleBtn", "click", function (event) { completeSale(event.currentTarget); });
    U.bind("#holdSaleBtn", "click", function (event) { holdSale(event.currentTarget); });
    U.bind("#printTerminalReceiptBtn", "click", function () { window.print(); });
    U.bind("#cashDrawerBtn", "click", function () { U.toast("Cash drawer command requires supported POS hardware integration", "error"); });
    U.bind("#returnFromInvoiceBtn", "click", function () { window.location.href = "sales.html#returns"; });

    document.addEventListener("click", function (event) {
      var add = event.target.closest("[data-cloud-terminal-add]");
      if (add) { event.preventDefault(); event.stopImmediatePropagation(); addProduct(state.products.find(function (row) { return row.id === add.dataset.cloudTerminalAdd; })); return; }
      var qty = event.target.closest("[data-cloud-qty]");
      if (qty) { event.preventDefault(); event.stopImmediatePropagation(); var index = Number(qty.dataset.cloudQty); state.cart[index].qty = Math.max(0.001, U.num(state.cart[index].qty) + U.num(qty.dataset.delta)); renderCart(); return; }
      var remove = event.target.closest("[data-cloud-remove]");
      if (remove) { event.preventDefault(); event.stopImmediatePropagation(); state.cart.splice(Number(remove.dataset.cloudRemove), 1); renderCart(); return; }
      var recall = event.target.closest("[data-cloud-recall]");
      if (recall) { event.preventDefault(); event.stopImmediatePropagation(); recallDraft(recall.dataset.cloudRecall).catch(U.error); }
    }, true);

    U.on(U.q("#terminalCartBody"), "input", function (event) {
      var qtyInput = event.target.closest("[data-cloud-qty-input]");
      if (qtyInput) state.cart[Number(qtyInput.dataset.cloudQtyInput)].qty = Math.max(0.001, U.num(qtyInput.value));
      var discountInput = event.target.closest("[data-cloud-disc]");
      if (discountInput) state.cart[Number(discountInput.dataset.cloudDisc)].discount = Math.max(0, U.num(discountInput.value));
      renderTotals();
    });
  });
})();
