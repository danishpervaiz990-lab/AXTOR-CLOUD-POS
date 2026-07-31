/* Axtor Retail — force every saved invoice print through the selected invoice template. */
(function () {
  'use strict';

  var RELEASE = '20260731-modern-a4-all-saved-print-v2';
  var LOCAL_KEYS = ['axtorAdvancedDemoDB', 'axtorDemoDB'];
  var enginePromise = null;
  var lastBackendId = '';
  var lastBackendNo = '';
  var scheduled = 0;

  function readJson(key, fallback) {
    try {
      var value = JSON.parse(localStorage.getItem(key) || 'null');
      return value && typeof value === 'object' ? value : fallback;
    } catch (_) { return fallback; }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function number(value) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function money(value) {
    return 'QAR ' + number(value).toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function selectedTemplate(engine, customer) {
    var invoice = readJson('invoiceSettings', {});
    var designer = readJson('invoiceDesignerSettings', {});
    var selected = '';
    try { selected = localStorage.getItem('selectedInvoiceTemplate') || ''; } catch (_) {}
    selected = selected || invoice.defaultInvoiceTemplate || designer.templateBase || '';
    if (!selected && engine && typeof engine.selectedTemplate === 'function') selected = engine.selectedTemplate(customer || '');
    selected = selected || 'modern-a4';
    return String(selected).toLowerCase().startsWith('thermal-') ? 'modern-a4' : selected;
  }

  function outputProfile() {
    var invoice = readJson('invoiceSettings', {});
    var value = '';
    try { value = localStorage.getItem('axtorInvoiceOutputProfile') || invoice.defaultPrintSize || 'A4'; } catch (_) { value = 'A4'; }
    value = String(value).toLowerCase();
    if (value.includes('58')) return 'thermal-58';
    if (value.includes('80')) return 'thermal-80';
    return 'a4';
  }

  function backendUrl(id, documentNo, printNow) {
    var url = new URL('invoice-view.html', location.href);
    if (id) url.searchParams.set('id', id);
    else if (documentNo) url.searchParams.set('documentNo', documentNo);
    url.searchParams.set('profile', outputProfile());
    if (printNow) url.searchParams.set('print', '1');
    url.searchParams.set('release', RELEASE);
    return url.href;
  }

  function openBackend(id, documentNo, printNow) {
    if (!id && !documentNo) return;
    window.open(backendUrl(id, documentNo, printNow), '_blank', 'noopener');
  }

  function unwrap(response) {
    return response && typeof response === 'object' && Object.prototype.hasOwnProperty.call(response, 'data') ? response.data : response;
  }

  function valuesMap(settings) {
    settings = unwrap(settings) || {};
    if (settings.values) return settings.values;
    if (Array.isArray(settings.settings)) {
      return Object.fromEntries(settings.settings.map(function (row) { return [row.key, row.value]; }));
    }
    return {};
  }

  async function syncCloudConfig(engine) {
    if (!engine || typeof engine.setCloudConfig !== 'function' || !window.AxtorAPI) return;
    try {
      var response = typeof window.AxtorAPI.apiGet === 'function'
        ? await window.AxtorAPI.apiGet('/api/v1/settings')
        : await window.AxtorAPI.request('GET', '/api/v1/settings');
      var values = valuesMap(response);
      engine.setCloudConfig({
        company: values['company.profile'] || {},
        invoice: values['invoice.settings'] || {},
        designer: values['invoice.designer'] || {}
      });
    } catch (_) {}
  }

  function ensureInvoiceEngine() {
    if (window.AxtorInvoice) return Promise.resolve(window.AxtorInvoice);
    if (enginePromise) return enginePromise;
    enginePromise = new Promise(function (resolve, reject) {
      var script = document.querySelector('script[data-axtor-modern-print-engine="1"]');
      if (!script) {
        script = document.createElement('script');
        script.src = 'js/invoice-templates.js?v=' + RELEASE;
        script.async = true;
        script.dataset.axtorModernPrintEngine = '1';
        document.head.appendChild(script);
      }
      function done() {
        if (window.AxtorInvoice) resolve(window.AxtorInvoice);
        else reject(new Error('Invoice template engine did not initialize.'));
      }
      script.addEventListener('load', done, { once: true });
      script.addEventListener('error', function () { reject(new Error('Invoice template engine failed to load.')); }, { once: true });
      if (window.AxtorInvoice) resolve(window.AxtorInvoice);
    }).catch(function (error) { enginePromise = null; throw error; });
    return enginePromise;
  }

  function localNo(row) {
    return String(row && (row.documentNo || row.invoiceNo || row.no || row.id) || '').trim();
  }

  function localType(row) {
    var no = localNo(row);
    var raw = String(row && row.documentType || '').toLowerCase().replace(/[\s-]+/g, '_');
    if (raw === 'quotation' || raw === 'quote' || raw === 'qtn' || no.startsWith('QTN-')) return 'quotation';
    if (raw === 'delivery_note' || raw === 'delivery' || raw === 'dn' || no.startsWith('DN-')) return 'delivery_note';
    return 'invoice';
  }

  function localDocuments() {
    var unique = new Map();
    LOCAL_KEYS.forEach(function (key) {
      var database = readJson(key, {});
      var rows = []
        .concat(Array.isArray(database.invoices) ? database.invoices : [])
        .concat(Array.isArray(database.salesDocuments) ? database.salesDocuments : []);
      rows.forEach(function (row) {
        var no = localNo(row);
        var draft = String(row && row.status || '').toLowerCase() === 'draft' || no.startsWith('DRAFT');
        if (no && !draft) unique.set(no, row);
      });
    });
    return Array.from(unique.values());
  }

  function findLocal(no) {
    return localDocuments().find(function (row) { return localNo(row) === String(no || ''); }) || null;
  }

  function fallbackFromRow(button, no) {
    var row = button && button.closest('tr');
    var cells = row ? Array.from(row.cells || []) : [];
    var total = number(String(cells[3] && cells[3].textContent || '0').replace(/[^0-9.-]/g, ''));
    return {
      documentNo: no, invoiceNo: no, no: no,
      documentType: no.startsWith('QTN-') ? 'quotation' : no.startsWith('DN-') ? 'delivery_note' : 'invoice',
      customer: String(cells[1] && cells[1].textContent || 'Walk-in Customer').trim(),
      date: String(cells[2] && cells[2].textContent || new Date().toLocaleDateString('en-QA')).trim(),
      total: total, grand: total, amount: total, paid: total, balance: 0,
      paymentMethod: 'Cash',
      items: [{ sku: no, name: 'Saved invoice item', productName: 'Saved invoice item', qty: 1, rate: total, total: total }]
    };
  }

  function normalizeLocal(row, fallback) {
    var source = Object.assign({}, fallback || {}, row || {});
    var no = localNo(source);
    var total = number(source.grand ?? source.grandTotal ?? source.total ?? source.amount);
    var paid = source.paid !== undefined ? number(source.paid) : total;
    var items = Array.isArray(source.items) && source.items.length ? source.items
      : Array.isArray(source.lines) && source.lines.length ? source.lines
        : (fallback && fallback.items) || [];
    return Object.assign({}, source, {
      documentNo: no, invoiceNo: no, no: no, documentType: localType(source),
      customer: source.customer || source.customerName || 'Walk-in Customer',
      customerPhone: source.customerPhone || source.phone || '',
      date: source.date || source.documentDate || new Date().toLocaleDateString('en-QA'),
      branch: source.branch || source.branchName || 'Main Branch',
      warehouseName: source.warehouseName || source.warehouse || 'Main Warehouse',
      salesman: source.salesman || source.salesmanName || '',
      paymentMethod: source.paymentMethod || source.paymentType || 'Cash',
      subtotal: source.subtotal !== undefined ? number(source.subtotal) : total,
      discount: number(source.discount), tax: number(source.tax ?? source.taxAmount),
      grand: total, total: total, amount: total, paid: paid,
      balance: source.balance !== undefined ? number(source.balance) : Math.max(0, total - paid),
      items: items
    });
  }

  async function openLocal(no, printNow, sourceButton) {
    var data = normalizeLocal(findLocal(no), fallbackFromRow(sourceButton, no));
    try {
      var engine = await ensureInvoiceEngine();
      await syncCloudConfig(engine);
      var template = selectedTemplate(engine, data.customer);
      if (printNow) engine.print(template, { data: data });
      else engine.preview(template, { data: data });
    } catch (error) {
      console.error('Saved invoice template failed:', error);
      alert(error.message || 'Unable to open the selected invoice template.');
    }
  }

  function modalPrintTarget(target) {
    var modal = target.closest('#axtorSalesDocViewModal');
    if (!modal) return false;
    var button = target.closest('button, a');
    if (!button) return false;
    return /^\s*print(?:\s+invoice)?\s*$/i.test(button.textContent || '') || button.matches('[data-invoice-modal-print]');
  }

  function rememberBackend(control) {
    var id = control.getAttribute('data-sales-template-view-id') || control.getAttribute('data-sales-template-print-id') || control.getAttribute('data-sales-view-id') || '';
    if (id) lastBackendId = id;
    var row = control.closest('tr');
    var first = row && row.cells && row.cells[0];
    if (first) lastBackendNo = String(first.textContent || '').trim().split(/\s+/)[0];
  }

  function handleCapturedClick(event) {
    var target = event.target;
    if (!(target instanceof Element)) return;

    if (modalPrintTarget(target)) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      openBackend(lastBackendId, lastBackendNo, true);
      return;
    }

    var backendControl = target.closest('#axtorSalesBackendPanel [data-sales-template-print-id], #axtorSalesBackendPanel [data-sales-template-view-id], #axtorSalesBackendPanel [data-sales-view-id]');
    if (backendControl) {
      rememberBackend(backendControl);
      var label = String(backendControl.textContent || '').trim().toLowerCase();
      var printNow = backendControl.hasAttribute('data-sales-template-print-id') || label === 'print';
      var templateView = backendControl.hasAttribute('data-sales-template-view-id') || label === 'view';
      if (printNow || templateView) {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
        openBackend(lastBackendId, lastBackendNo, printNow);
      }
      return;
    }

    var localPrint = target.closest('[data-imported-print], [data-print-invoice]');
    if (localPrint) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      openLocal(localPrint.getAttribute('data-imported-print') || localPrint.getAttribute('data-print-invoice'), true, localPrint);
      return;
    }

    var localView = target.closest('[data-imported-view], [data-view-invoice]');
    if (localView) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      openLocal(localView.getAttribute('data-imported-view') || localView.getAttribute('data-view-invoice'), false, localView);
    }
  }

  function normalizeBackendActions() {
    var panel = document.getElementById('axtorSalesBackendPanel');
    if (!panel) return;
    panel.querySelectorAll('tbody tr').forEach(function (row) {
      var controls = Array.from(row.querySelectorAll('button, a'));
      var source = controls.find(function (control) { return control.hasAttribute('data-sales-view-id'); });
      var id = source && source.getAttribute('data-sales-view-id');
      if (!id) return;
      controls.forEach(function (control) {
        var label = String(control.textContent || '').trim().toLowerCase();
        if (label === 'view') {
          control.removeAttribute('data-sales-view-id');
          control.setAttribute('data-sales-template-view-id', id);
          control.innerHTML = '<i class="bi bi-eye me-1"></i>View';
        } else if (label === 'print') {
          control.removeAttribute('data-sales-view-id');
          control.setAttribute('data-sales-template-print-id', id);
          control.innerHTML = '<i class="bi bi-printer me-1"></i>Print';
        }
      });
    });
  }

  function removeStaticPlaceholders() {
    var body = document.getElementById('savedInvoicesBody');
    if (body) {
      var card = body.closest('.cardx, .card, section');
      if (card && !card.closest('#axtorImportedSavedInvoicesPanel')) card.remove();
    }
    document.getElementById('invoiceModal')?.remove();
  }

  function renderImportedPanel() {
    var root = document.getElementById('saved-invoices');
    if (!root) return;
    var rows = localDocuments();
    var panel = document.getElementById('axtorImportedSavedInvoicesPanel');
    if (!rows.length) { if (panel) panel.remove(); return; }
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'axtorImportedSavedInvoicesPanel';
      panel.className = 'cardx mb-3';
      var backend = document.getElementById('axtorSalesBackendPanel');
      if (backend) backend.insertAdjacentElement('beforebegin', panel); else root.prepend(panel);
    }
    panel.innerHTML = '<div class="d-flex justify-content-between align-items-center gap-2 flex-wrap mb-3"><div><h5 class="cardx-title mb-1"><i class="bi bi-archive me-2"></i>Imported Saved Invoices</h5><p class="text-muted mb-0">Older browser-saved invoices. View and Print use the invoice template selected in Settings.</p></div><span class="badge-soft badge-paid">' + rows.length + ' imported</span></div>' +
      '<div class="table-wrap"><table class="table"><thead><tr><th>Document</th><th>Customer</th><th>Date</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead><tbody>' +
      rows.map(function (row) {
        var no = localNo(row);
        var total = number(row.grand ?? row.grandTotal ?? row.total ?? row.amount);
        return '<tr><td><strong>' + escapeHtml(no) + '</strong></td><td>' + escapeHtml(row.customer || row.customerName || 'Walk-in Customer') + '</td><td>' + escapeHtml(row.date || row.documentDate || '-') + '</td><td>' + money(total) + '</td><td>' + escapeHtml(row.status || 'Saved') + '</td><td><button class="btn btn-sm btn-soft" type="button" data-imported-view="' + escapeHtml(no) + '"><i class="bi bi-eye me-1"></i>View</button> <button class="btn btn-sm btn-brand" type="button" data-imported-print="' + escapeHtml(no) + '"><i class="bi bi-printer me-1"></i>Print</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function normalize() {
    clearTimeout(scheduled);
    scheduled = setTimeout(function () {
      normalizeBackendActions();
      removeStaticPlaceholders();
      renderImportedPanel();
    }, 20);
  }

  function init() {
    if ((location.pathname.split('/').pop() || '').toLowerCase() !== 'sales.html') return;
    window.addEventListener('click', handleCapturedClick, true);
    normalize();
    setTimeout(normalize, 250);
    setTimeout(normalize, 900);
    setInterval(normalize, 2000);
    if (document.body) new MutationObserver(normalize).observe(document.body, { childList: true, subtree: true });
    window.AxtorModernSavedInvoicePrint = { release: RELEASE, normalize: normalize, backendUrl: backendUrl };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
