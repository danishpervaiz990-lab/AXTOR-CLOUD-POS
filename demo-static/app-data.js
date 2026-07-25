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

  function dateText(value) {
    if (!value) return "";
    var parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString();
  }

  function syncPrintSettings(settingsResponse) {
    var payload = U.data(settingsResponse) || {};
    var values = payload.values || {};
    var company = values["company.profile"];
    var invoice = values["invoice.settings"];
    if (company && typeof company === "object") {
      var savedCompany = {};
      try { savedCompany = JSON.parse(localStorage.getItem("companySettings") || "{}") || {}; } catch (_) {}
      localStorage.setItem("companySettings", JSON.stringify(Object.assign(savedCompany, company)));
    }
    if (invoice && typeof invoice === "object") {
      var savedInvoice = {};
      try { savedInvoice = JSON.parse(localStorage.getItem("invoiceSettings") || "{}") || {}; } catch (_) {}
      var mergedInvoice = Object.assign(savedInvoice, invoice);
      localStorage.setItem("invoiceSettings", JSON.stringify(mergedInvoice));
      if (mergedInvoice.defaultInvoiceTemplate) localStorage.setItem("selectedInvoiceTemplate", mergedInvoice.defaultInvoiceTemplate);
    }
  }

  function selectedTemplate(documentData) {
    var type = String(documentData.documentType || "invoice").toLowerCase();
    var settings = window.AxtorInvoice && window.AxtorInvoice.getInvoice ? window.AxtorInvoice.getInvoice() : {};
    if (type === "quotation") return settings.defaultQuotationTemplate || "quotation";
    if (type === "delivery_note") return "delivery-invoice";
    return window.AxtorInvoice && window.AxtorInvoice.selectedTemplate ? window.AxtorInvoice.selectedTemplate(documentData.customerName) : "modern-a4";
  }

  function richData(documentData, context, customer) {
    var branches = context.branches || [];
    var warehouses = context.warehouses || [];
    var branch = branches.find(function (row) { return row.id === documentData.branchId; });
    var warehouse = warehouses.find(function (row) { return row.id === documentData.warehouseId; });
    var type = String(documentData.documentType || "invoice").toLowerCase();
    return {
      documentType: type,
      documentTitle: type === "quotation" ? "Quotation" : type === "delivery_note" ? "Delivery Note" : "Sales Invoice",
      invoiceNo: documentData.documentNo,
      date: dateText(documentData.documentDate || documentData.issuedAt || documentData.createdAt),
      dueDate: dateText(documentData.dueDate),
      status: documentData.status || "",
      paymentStatus: documentData.paymentStatus || "",
      customer: documentData.customerName || "Walk-in Customer",
      customerPhone: customer.phone || customer.mobile || customer.whatsapp || "",
      customerTax: customer.taxNumber || customer.taxNo || "",
      customerBalance: customer.balance || 0,
      creditLimit: customer.creditLimit || 0,
      deliveryAddress: documentData.deliveryAddress || customer.address || "",
      salesman: documentData.salesmanName || "",
      branch: documentData.branchName || (branch && branch.name) || "",
      warehouse: documentData.warehouseName || (warehouse && warehouse.name) || "",
      cashier: documentData.cashierName || "",
      counter: documentData.counterName || "",
      paymentMethod: String(documentData.paymentMethod || "").replaceAll("_", " "),
      lpoNo: documentData.lpoNo || "",
      customerPoNo: documentData.customerPoNo || "",
      poNo: documentData.poNo || "",
      referenceNo: documentData.referenceNo || "",
      internalNotes: documentData.internalNotes || "",
      customerNotes: documentData.customerNotes || "",
      currency: documentData.currency || "QAR",
      subtotal: documentData.subtotal,
      discount: documentData.discount,
      tax: documentData.tax,
      grand: documentData.total,
      total: documentData.total,
      paid: documentData.paid,
      balance: documentData.balance,
      items: documentData.items || []
    };
  }

  function render(documentData, context, customer) {
    var root = U.q("#invoiceViewRoot");
    if (!root) return;
    if (!window.AxtorInvoice || typeof window.AxtorInvoice.render !== "function") {
      throw new Error("Invoice template engine is unavailable");
    }
    var data = richData(documentData, context || {}, customer || {});
    root.innerHTML = window.AxtorInvoice.render(selectedTemplate(documentData), { data: data });
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
      var documentData = U.data(await U.api().apiGet("/api/v1/sales-documents/" + encodeURIComponent(id)));
      var optional = await Promise.allSettled([
        U.api().apiGet("/api/v1/settings"),
        U.api().apiGet("/api/v1/sales-documents/context"),
        documentData.customerId ? U.api().apiGet("/api/v1/customers/" + encodeURIComponent(documentData.customerId)) : Promise.resolve(null)
      ]);
      if (optional[0].status === "fulfilled") syncPrintSettings(optional[0].value);
      var context = optional[1].status === "fulfilled" ? (U.data(optional[1].value) || {}) : {};
      var customerPayload = optional[2].status === "fulfilled" ? (U.data(optional[2].value) || {}) : {};
      var customer = customerPayload.customer || customerPayload;
      render(documentData, context, customer);
      var box = U.q("#invoiceViewStatus");
      if (box) box.classList.add("d-none");
    } catch (error) {
      status(error.message || "Unable to load document", "danger");
    }
  });
})();
