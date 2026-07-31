(function () {
  "use strict";
  var U = window.AxtorPage;
  var activeDocument = null;
  var profiles = [];
  var activeProfile = null;

  function status(message, type) {
    var box = U.q("#invoiceViewStatus");
    if (!box) return;
    box.className = "alert alert-" + (type || "info") + " no-print";
    box.textContent = message;
    box.classList.remove("d-none");
  }

  function unwrap(response) { return U.data(response) || response || null; }
  async function safeGet(url, fallback) {
    try { return unwrap(await U.api().apiGet(url)); } catch (_) { return fallback; }
  }

  function valueMap(settings) {
    if (!settings) return {};
    if (settings.values) return settings.values;
    if (Array.isArray(settings.settings)) return Object.fromEntries(settings.settings.map(function (row) { return [row.key, row.value]; }));
    return {};
  }

  function virtualProfile(code, documentData) {
    var type = String(documentData && documentData.documentType || "invoice").toLowerCase();
    if (code === "thermal-58") return { code: code, name: "58 mm Thermal Receipt", documentType: "receipt", paperSize: "58MM", widthMm: 58, heightMm: null, marginTopMm: 2, marginRightMm: 2, marginBottomMm: 2, marginLeftMm: 2, fontScale: .88, copies: ["Original"], config: {} };
    if (code === "thermal-80") return { code: code, name: "80 mm Thermal Receipt", documentType: "receipt", paperSize: "80MM", widthMm: 80, heightMm: null, marginTopMm: 2, marginRightMm: 2, marginBottomMm: 2, marginLeftMm: 2, fontScale: 1, copies: ["Original"], config: {} };
    return { code: "a4", name: "A4 Document", documentType: type, paperSize: "A4", widthMm: 210, heightMm: 297, marginTopMm: 8, marginRightMm: 8, marginBottomMm: 8, marginLeftMm: 8, fontScale: 1, copies: ["Original"], config: {} };
  }

  function profileTemplate(profile, documentData) {
    if (profile && profile.paperSize === "58MM") return "thermal-58";
    if (profile && profile.paperSize === "80MM") return "thermal-80";
    var type = String(documentData.documentType || "invoice").toLowerCase();
    if (type === "quotation") {
      var quotationSettings = window.AxtorInvoice && window.AxtorInvoice.getInvoice ? window.AxtorInvoice.getInvoice() : {};
      return quotationSettings.defaultQuotationTemplate || "quotation";
    }
    if (type === "delivery_note") return "delivery-invoice";
    if (window.AxtorInvoice && typeof window.AxtorInvoice.selectedTemplate === "function") {
      var selected = window.AxtorInvoice.selectedTemplate(documentData.customerName || documentData.customer || "");
      if (selected && !String(selected).toLowerCase().startsWith("thermal-")) return selected;
    }
    var invoiceSettings = window.AxtorInvoice && window.AxtorInvoice.getInvoice ? window.AxtorInvoice.getInvoice() : {};
    var configured = invoiceSettings.defaultInvoiceTemplate || "modern-a4";
    return String(configured).toLowerCase().startsWith("thermal-") ? "modern-a4" : configured;
  }

  function pickProfile(requested, documentData) {
    var normalized = String(requested || "").toLowerCase();
    if (normalized === "thermal-58" || normalized.includes("58mm")) {
      return profiles.find(function (row) { return row.paperSize === "58MM" || row.code === "thermal-58"; }) || virtualProfile("thermal-58", documentData);
    }
    if (normalized === "thermal-80" || normalized.includes("80mm")) {
      return profiles.find(function (row) { return row.paperSize === "80MM" || row.code === "thermal-80"; }) || virtualProfile("thermal-80", documentData);
    }
    if (requested) {
      var exact = profiles.find(function (row) { return row.code === requested || row.id === requested; });
      if (exact) return exact;
    }
    var type = String(documentData.documentType || "invoice").toLowerCase();
    var matching = profiles.filter(function (row) { return row.documentType === type && row.paperSize === "A4"; });
    return matching.find(function (row) { return row.isDefault; }) || matching[0] || virtualProfile("a4", documentData);
  }

  function applyPrintProfile(profile) {
    activeProfile = profile;
    var old = U.q("#axtorCloudPrintProfile");
    if (old) old.remove();
    var style = document.createElement("style");
    style.id = "axtorCloudPrintProfile";
    var thermal = profile.paperSize === "58MM" || profile.paperSize === "80MM";
    var width = Number(profile.widthMm || (profile.paperSize === "58MM" ? 58 : profile.paperSize === "80MM" ? 80 : 210));
    var height = profile.heightMm ? Number(profile.heightMm) : null;
    var pageSize = thermal ? width + "mm auto" : width + "mm " + (height || 297) + "mm";
    var margins = [Number(profile.marginTopMm || 0), Number(profile.marginRightMm || 0), Number(profile.marginBottomMm || 0), Number(profile.marginLeftMm || 0)].join("mm ") + "mm";
    style.textContent = "@page{size:" + pageSize + ";margin:" + margins + "}"
      + "@media print{html,body{width:" + (thermal ? width + "mm" : "auto") + ";margin:0!important;padding:0!important;background:#fff!important}"
      + ".page{max-width:none!important;margin:0!important;padding:0!important}.invoice-sheet{font-size:calc(13px * " + Number(profile.fontScale || 1) + ")!important;"
      + (thermal ? "width:" + Math.max(40, width - Number(profile.marginLeftMm || 0) - Number(profile.marginRightMm || 0)) + "mm!important;max-width:none!important;" : "width:auto!important;max-width:none!important;")
      + "box-shadow:none!important;border:0!important;margin:0!important}.inv-table thead{display:table-header-group}.inv-table tr,.inv-totals,.signature-card{break-inside:avoid;page-break-inside:avoid}}";
    document.head.appendChild(style);
    document.body.dataset.printProfile = profile.code;
  }

  function renderProfileSelector(documentData) {
    var actions = U.q("#invoiceViewPrintBtn") && U.q("#invoiceViewPrintBtn").parentElement;
    if (!actions || U.q("#invoiceViewProfile")) return;
    var select = document.createElement("select");
    select.id = "invoiceViewProfile";
    select.className = "form-select no-print";
    select.style.maxWidth = "230px";
    select.setAttribute("aria-label", "Print profile");
    var type = String(documentData.documentType || "invoice").toLowerCase();
    var relevant = profiles.filter(function (row) { return row.documentType === type || row.documentType === "receipt"; });
    [virtualProfile("a4", documentData), virtualProfile("thermal-80", documentData), virtualProfile("thermal-58", documentData)].forEach(function (fallback) {
      if (!relevant.some(function (row) { return row.code === fallback.code || row.paperSize === fallback.paperSize; })) relevant.push(fallback);
    });
    if (activeProfile && !relevant.some(function (row) { return row.code === activeProfile.code; })) relevant.unshift(activeProfile);
    select.innerHTML = relevant.map(function (row) {
      return '<option value="' + U.esc(row.code) + '"' + (row.code === activeProfile.code ? " selected" : "") + '>' + U.esc(row.name) + '</option>';
    }).join("");
    select.addEventListener("change", function () {
      var selected = relevant.find(function (row) { return row.code === select.value; }) || activeProfile;
      renderDocument(documentData, selected);
      var url = new URL(location.href);
      url.searchParams.set("profile", selected.code);
      history.replaceState(null, "", url);
    });
    actions.insertBefore(select, U.q("#invoiceViewPrintBtn"));
  }

  function normalizedData(documentData, context) {
    var branch = (context.branches || []).find(function (row) { return row.id === documentData.branchId; });
    var warehouse = (context.warehouses || []).find(function (row) { return row.id === documentData.warehouseId; });
    var counter = (context.counters || []).find(function (row) { return row.id === documentData.counterId; });
    var cashier = (context.salesPersons || []).find(function (row) { return row.id === documentData.createdByUserId || row.userId === documentData.createdByUserId; });
    var created = new Date(documentData.issuedAt || documentData.postedAt || documentData.createdAt || Date.now());
    return Object.assign({}, documentData, {
      invoiceNo: documentData.documentNo,
      date: created.toLocaleDateString(),
      time: created.toLocaleTimeString(),
      customer: documentData.customerName || "Walk-in Customer",
      customerPhone: documentData.customerPhone || "",
      customerTax: documentData.customerTaxNumber || "",
      salesman: documentData.salesmanName || "",
      cashier: cashier && cashier.name || documentData.cashierName || "—",
      branch: branch && branch.name || documentData.branchName || "—",
      warehouseName: warehouse && warehouse.name || "—",
      counterName: counter && counter.name || "—",
      shiftReference: documentData.shiftId ? documentData.shiftId.slice(-8).toUpperCase() : "",
      paymentMethod: documentData.paymentMethod || "—",
      paid: documentData.paid,
      balance: documentData.balance,
      grand: documentData.total,
      total: documentData.total,
      returned: documentData.returnedAmount,
      refunded: documentData.refundedAmount,
      items: documentData.items || documentData.lines || documentData.documentItems || [],
    });
  }

  function renderDocument(documentData, profile, context) {
    var root = U.q("#invoiceViewRoot");
    if (!root) return;
    context = context || window.AxtorInvoiceContext || {};
    applyPrintProfile(profile);
    var template = profileTemplate(profile, documentData);
    root.innerHTML = window.AxtorInvoice ? window.AxtorInvoice.render(template, { data: normalizedData(documentData, context) }) : '<div class="alert alert-danger">Invoice engine not loaded.</div>';
    document.title = documentData.documentNo + " · Axtor POS Cloud";
  }

  U.run(async function () {
    var params = new URLSearchParams(window.location.search);
    var id = params.get("id");
    var number = params.get("documentNo") || params.get("no");
    try {
      if (!id && number) {
        var rows = unwrap(await U.api().apiGet("/api/v1/sales-documents?q=" + encodeURIComponent(number) + "&limit=20")) || [];
        var list = Array.isArray(rows) ? rows : rows.items || rows.documents || [];
        var match = list.find(function (row) { return row.documentNo === number; }) || list[0];
        id = match && match.id;
      }
      if (!id) throw new Error("Document id or document number is required");
      var results = await Promise.all([
        U.api().apiGet("/api/v1/sales-documents/" + encodeURIComponent(id)),
        safeGet("/api/v1/settings", { values: {} }),
        safeGet("/api/v1/industry/print-profiles", []),
        safeGet("/api/v1/sales-documents/context", {}),
      ]);
      activeDocument = unwrap(results[0]);
      var settings = valueMap(results[1]);
      profiles = Array.isArray(results[2]) ? results[2] : [];
      var context = results[3] || {};
      window.AxtorInvoiceContext = context;
      var business = context.business || {};
      var company = Object.assign({}, settings["company.profile"] || {}, {
        companyName: (settings["company.profile"] || {}).companyName || (settings["company.profile"] || {}).name || business.name,
        legalBusinessName: (settings["company.profile"] || {}).legalBusinessName || business.legalName || business.name,
        currency: business.currency || "QAR",
        currencySymbol: (business.currency || "QAR") + " ",
      });
      if (window.AxtorInvoice && window.AxtorInvoice.setCloudConfig) {
        window.AxtorInvoice.setCloudConfig({ company: company, invoice: settings["invoice.settings"] || {}, designer: settings["invoice.designer"] || {} });
      }
      activeProfile = pickProfile(params.get("profile"), activeDocument);
      renderDocument(activeDocument, activeProfile, context);
      renderProfileSelector(activeDocument);
      var box = U.q("#invoiceViewStatus"); if (box) box.classList.add("d-none");
      if (params.get("print") === "1") setTimeout(function () { window.print(); }, 500);
    } catch (error) {
      status(error.message || "Unable to load document", "danger");
    }
    U.bind("#invoiceViewPrintBtn", "click", function () { window.print(); });
    addEventListener("beforeprint", function () { document.body.classList.add("axtor-printing"); });
    addEventListener("afterprint", function () { document.body.classList.remove("axtor-printing"); });
  });
})();
