(function () {
  "use strict";

  const SALES_DOCUMENTS_PATH = "/api/v1/sales-documents";
  let salesDocumentsCache = [];
  let searchTimer = null;

  function onSalesPage() {
    return Boolean(document.getElementById("savedInvoicesBody"));
  }

  function apiReady() {
    return window.AxtorAPI &&
      typeof window.AxtorAPI.apiGet === "function";
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function toNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : (fallback || 0);
  }

  function money(value) {
    return "QAR " + toNumber(value, 0).toFixed(2);
  }

  function message(text, type) {
    let box = document.getElementById("salesBackendStatus");

    if (!box) {
      box = document.createElement("div");
      box.id = "salesBackendStatus";
      box.className = "mb-3";

      const target = document.querySelector(".tab-content") || document.querySelector("main.page");

      if (target && target.parentNode) {
        target.parentNode.insertBefore(box, target);
      }
    }

    box.innerHTML =
      '<div class="alert alert-' + esc(type || "info") + ' py-2 mb-0">' +
      esc(text) +
      "</div>";
  }

  function apiErrorText(error, fallback) {
    if (error && error.message && error.message !== "API request failed") {
      return error.message;
    }

    return fallback;
  }

  function normalizeSalesDocuments(response) {
    if (response && Array.isArray(response.salesDocuments)) return response.salesDocuments;
    if (response && Array.isArray(response.documents)) return response.documents;
    if (response && Array.isArray(response.items)) return response.items;
    if (response && Array.isArray(response.data)) return response.data;
    if (Array.isArray(response)) return response;
    return [];
  }

  function inputValue(id) {
    const el = document.getElementById(id);
    return el ? String(el.value || "").trim() : "";
  }

  function documentNumber(doc) {
    return doc.documentNo || doc.invoiceNo || doc.number || doc.referenceNo || doc.refNo || doc.id || "-";
  }

  function documentType(doc) {
    const raw = String(doc.documentType || doc.documentTypeRaw || doc.type || "").toLowerCase();

    if (raw.includes("quotation") || raw === "quote" || raw === "quo") return "Quotation";
    if (raw.includes("delivery") || raw === "dn" || raw.includes("delivery_note")) return "Delivery Note";
    if (raw.includes("invoice") || raw === "sales_invoice") return "Sales Invoice";

    return doc.documentTypeRaw || doc.documentType || "Sales Document";
  }

  function customerName(doc) {
    if (doc.customer && doc.customer.name) return doc.customer.name;
    if (doc.customerName) return doc.customerName;
    if (doc.customer && doc.customer.phone) return doc.customer.phone;
    if (doc.customerId) return "Customer";
    return "Walk-in / Customer";
  }

  function documentTotal(doc) {
    return toNumber(
      doc.grandTotal ??
      doc.netTotal ??
      doc.totalAmount ??
      doc.total ??
      doc.amount ??
      doc.payableAmount,
      0
    );
  }

  function paidAmount(doc) {
    return toNumber(doc.paidAmount ?? doc.amountPaid ?? doc.receivedAmount, 0);
  }

  function documentStatusText(doc) {
    const raw = String(doc.paymentStatus || doc.status || doc.documentStatus || "").toLowerCase();

    if (raw.includes("paid")) return "Paid";
    if (raw.includes("partial")) return "Partial";
    if (raw.includes("credit")) return "Credit";
    if (raw.includes("posted")) return "Posted";
    if (raw.includes("draft")) return "Draft";
    if (raw.includes("cancel")) return "Cancelled";
    if (raw.includes("quote")) return "Quotation";
    if (raw.includes("delivery")) return "Delivery Note";

    const type = documentType(doc).toLowerCase();

    if (type.includes("quotation")) return "Not payable";
    if (type.includes("delivery")) return "Not payable";

    const total = documentTotal(doc);
    const paid = paidAmount(doc);

    if (total > 0 && paid >= total) return "Paid";
    if (total > 0 && paid > 0) return "Partial";
    if (total > 0) return "Credit";

    return "Saved";
  }

  function statusBadge(doc) {
    const status = documentStatusText(doc).toLowerCase();

    if (status.includes("paid")) {
      return '<span class="badge-soft badge-paid">Paid</span>';
    }

    if (status.includes("partial") || status.includes("credit") || status.includes("due")) {
      return '<span class="badge-soft badge-pending">' + esc(documentStatusText(doc)) + "</span>";
    }

    if (status.includes("cancel")) {
      return '<span class="badge-soft badge-danger-soft">Cancelled</span>';
    }

    if (status.includes("not payable") || status.includes("quotation") || status.includes("delivery")) {
      return '<span class="badge-soft badge-draft">' + esc(documentStatusText(doc)) + "</span>";
    }

    return '<span class="badge-soft badge-pending">' + esc(documentStatusText(doc)) + "</span>";
  }

  function formatDate(value) {
    const raw = value || "";
    if (!raw) return "-";

    const date = new Date(raw);

    if (Number.isNaN(date.getTime())) {
      return String(raw).slice(0, 10);
    }

    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  }

  function docDate(doc) {
    return doc.documentDate || doc.date || doc.createdAt || doc.updatedAt;
  }

  function searchText(doc) {
    return [
      documentNumber(doc),
      documentType(doc),
      customerName(doc),
      doc.lpoNo,
      doc.customerPoNo,
      doc.poNo,
      documentStatusText(doc),
      documentTotal(doc)
    ].join(" ").toLowerCase();
  }

  function filteredDocuments() {
    const search = inputValue("savedInvoicesSearch").toLowerCase();

    if (!search) {
      return salesDocumentsCache.slice();
    }

    return salesDocumentsCache.filter(function (doc) {
      return searchText(doc).includes(search);
    });
  }

  function updateSalesKpis(docs) {
    const kpis = document.querySelectorAll("#sales-overview .kpi-value");

    if (!kpis || kpis.length < 4) {
      return;
    }

    const invoiceDocs = docs.filter(function (doc) {
      return documentType(doc).toLowerCase().includes("invoice");
    });

    const grossSales = invoiceDocs.reduce(function (total, doc) {
      return total + documentTotal(doc);
    }, 0);

    const paidInvoices = invoiceDocs.filter(function (doc) {
      return documentStatusText(doc).toLowerCase().includes("paid");
    }).length;

    const creditSales = invoiceDocs.reduce(function (total, doc) {
      const totalAmount = documentTotal(doc);
      const paid = paidAmount(doc);
      const balance = Math.max(totalAmount - paid, 0);
      return total + balance;
    }, 0);

    kpis[0].textContent = money(grossSales);
    kpis[1].textContent = String(paidInvoices);
    kpis[2].textContent = money(creditSales);
    kpis[3].textContent = "QAR 0.00";
  }

  function renderDocuments(docs) {
    const body = document.getElementById("savedInvoicesBody");

    if (!body) {
      return;
    }

    const table = body.closest("table");
    const header = table ? table.querySelector("thead tr") : null;

    if (header) {
      header.innerHTML =
        "<th>Document</th>" +
        "<th>Type</th>" +
        "<th>Customer</th>" +
        "<th>Date</th>" +
        "<th>LPO / PO</th>" +
        "<th>Amount</th>" +
        "<th>Status</th>" +
        "<th>Actions</th>";
    }

    const list = Array.isArray(docs) ? docs : [];

    if (!list.length) {
      body.innerHTML = '<tr><td colspan="8" class="text-muted">No backend sales documents found.</td></tr>';
      updateSalesKpis([]);
      return;
    }

    body.innerHTML = list.map(function (doc) {
      const no = documentNumber(doc);
      const id = esc(doc.id || no);
      const po = doc.lpoNo || doc.customerPoNo || doc.poNo || "-";

      return (
        "<tr>" +
          "<td><strong>" + esc(no) + "</strong></td>" +
          "<td>" + esc(documentType(doc)) + "</td>" +
          "<td>" + esc(customerName(doc)) + "</td>" +
          "<td>" + esc(formatDate(docDate(doc))) + "</td>" +
          "<td>" + esc(po) + "</td>" +
          "<td>" + money(documentTotal(doc)) + "</td>" +
          "<td>" + statusBadge(doc) + "</td>" +
          "<td>" +
            "<div class='d-flex gap-2 flex-wrap'>" +
              "<button class='btn btn-sm btn-soft' type='button' data-backend-sales-view='" + id + "'>View</button>" +
              "<button class='btn btn-sm btn-brand' type='button' data-backend-sales-print='" + id + "'>Print</button>" +
            "</div>" +
          "</td>" +
        "</tr>"
      );
    }).join("");

    updateSalesKpis(salesDocumentsCache);
  }

  function setLoading(text, className) {
    const body = document.getElementById("savedInvoicesBody");

    if (body) {
      body.innerHTML =
        '<tr><td colspan="8" class="' +
        esc(className || "text-muted") +
        '">' +
        esc(text) +
        "</td></tr>";
    }
  }

  async function loadSalesDocuments() {
    if (!onSalesPage()) {
      return null;
    }

    if (!apiReady()) {
      console.error("AxtorAPI helper missing. Load js/axtor-api.js before sales-backend.js.");
      setLoading("Backend API helper missing.", "text-danger");
      message("Backend API helper missing. Check sales.html script order.", "danger");
      return null;
    }

    try {
      setLoading("Loading backend sales documents...", "text-muted");

      const response = await window.AxtorAPI.apiGet(SALES_DOCUMENTS_PATH);
      const docs = normalizeSalesDocuments(response);

      salesDocumentsCache = docs.slice();

      renderDocuments(filteredDocuments());

      return response;
    } catch (error) {
      console.error("Sales documents GET failed:", error);
      setLoading("Failed to load backend sales documents.", "text-danger");
      message(apiErrorText(error, "Failed to load backend sales documents."), "danger");
      return null;
    }
  }

  function findDocByIdOrNo(value) {
    return salesDocumentsCache.find(function (doc) {
      return String(doc.id || "") === String(value || "") ||
        String(documentNumber(doc)) === String(value || "");
    }) || null;
  }

  function viewDocument(value) {
    const doc = findDocByIdOrNo(value);

    if (!doc) {
      message("Document not found in current backend list.", "warning");
      return;
    }

    const details = [
      "Document: " + documentNumber(doc),
      "Type: " + documentType(doc),
      "Customer: " + customerName(doc),
      "Amount: " + money(documentTotal(doc)),
      "Status: " + documentStatusText(doc)
    ].join("\n");

    window.alert(details);
  }

  function printDocument(value) {
    const doc = findDocByIdOrNo(value);

    if (!doc) {
      message("Document not found in current backend list.", "warning");
      return;
    }

    message("Print preview for " + documentNumber(doc) + " will be connected in the next Sales pass.", "info");
    window.alert("Print preview will be connected in next Sales pass.\n\n" + documentNumber(doc));
  }

  function bindSearch() {
    const search = document.getElementById("savedInvoicesSearch");
    const clear = document.getElementById("clearSavedInvoicesSearch");

    if (search && search.dataset.backendBound !== "1") {
      search.dataset.backendBound = "1";

      search.addEventListener("input", function () {
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(function () {
          renderDocuments(filteredDocuments());
        }, 150);
      });
    }

    if (clear && clear.dataset.backendBound !== "1") {
      clear.dataset.backendBound = "1";

      clear.addEventListener("click", function () {
        if (search) {
          search.value = "";
        }

        renderDocuments(filteredDocuments());
      });
    }
  }

  function bindActions() {
    if (document.body.dataset.salesBackendActionsBound === "1") {
      return;
    }

    document.body.dataset.salesBackendActionsBound = "1";

    document.addEventListener("click", function (event) {
      const viewBtn = event.target.closest("[data-backend-sales-view]");

      if (viewBtn) {
        event.preventDefault();
        event.stopPropagation();
        viewDocument(viewBtn.getAttribute("data-backend-sales-view"));
        return;
      }

      const printBtn = event.target.closest("[data-backend-sales-print]");

      if (printBtn) {
        event.preventDefault();
        event.stopPropagation();
        printDocument(printBtn.getAttribute("data-backend-sales-print"));
      }
    });
  }

  function boot() {
    if (!onSalesPage()) {
      return;
    }

    bindSearch();
    bindActions();
    loadSalesDocuments();
  }

  window.AxtorSalesBackend = {
    loadSalesDocuments: loadSalesDocuments,
    renderDocuments: renderDocuments,
    viewDocument: viewDocument,
    printDocument: printDocument
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
