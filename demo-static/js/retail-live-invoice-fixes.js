/* Live Retail invoice corrections: one saved-document table, configured print template,
   one invoice settings tab, and no duplicate Invoice Designer navigation. */
(function () {
  'use strict';

  const DESIGN_KEY = 'invoiceDesignerSettings';
  const PRINT_KEY = 'axtorInvoiceOutputProfile';
  let observer = null;
  let scheduled = 0;

  function page() {
    return (location.pathname.split('/').pop() || '').toLowerCase();
  }

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value && typeof value === 'object' ? value : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  function printProfile() {
    if (window.AxtorThemeSwitcher && typeof window.AxtorThemeSwitcher.getPrintProfile === 'function') {
      return window.AxtorThemeSwitcher.getPrintProfile();
    }
    const invoice = readJson('invoiceSettings', {});
    let value = '';
    try { value = localStorage.getItem(PRINT_KEY) || invoice.defaultPrintSize || 'A4'; } catch (_) { value = 'A4'; }
    value = String(value).toLowerCase();
    return value.includes('58') ? 'thermal-58' : value.includes('80') ? 'thermal-80' : 'a4';
  }

  function fixSidebar() {
    const nav = document.querySelector('.nav-menu');
    if (!nav) return;
    nav.querySelectorAll('a[href]').forEach(function (link) {
      const href = String(link.getAttribute('href') || '').toLowerCase();
      if (href.includes('invoice-designer.html')) link.remove();
    });
    const settings = nav.querySelector('a[href^="settings.html"]');
    if (settings) {
      settings.setAttribute('href', 'settings.html#invoice-center');
      const label = settings.querySelector('span');
      if (label) label.textContent = 'Settings';
    }
  }

  function removeLegacySavedTable() {
    const body = document.getElementById('savedInvoicesBody');
    if (body) {
      const card = body.closest('.cardx, .card');
      if (card && !card.closest('#axtorSalesBackendPanel')) card.remove();
    }
    const panel = document.getElementById('axtorSalesBackendPanel');
    if (!panel) return;
    const title = panel.querySelector('.card-header > div:first-child');
    if (title && !title.dataset.axtorLiveTitle) {
      title.dataset.axtorLiveTitle = '1';
      title.innerHTML = '<strong><i class="bi bi-receipt-cutoff me-2"></i>Saved Invoices / Quotations / Delivery Notes</strong>' +
        '<div id="axtorSalesBackendStatus" class="small text-muted">Loading PostgreSQL documents…</div>';
    }
  }

  function invoiceUrl(id, documentNo) {
    const url = new URL('invoice-view.html', location.href);
    if (id) url.searchParams.set('id', id);
    else url.searchParams.set('documentNo', documentNo);
    url.searchParams.set('profile', printProfile());
    url.searchParams.set('print', '1');
    return url.href;
  }

  function bindSavedPrint() {
    if (window.__axtorRetailSavedPrintBound) return;
    window.__axtorRetailSavedPrintBound = true;
    document.addEventListener('click', function (event) {
      const explicit = event.target.closest('[data-sales-print-id]');
      if (explicit) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        window.open(invoiceUrl(explicit.getAttribute('data-sales-print-id'), ''), '_blank', 'noopener');
        return;
      }
      const backend = event.target.closest('#axtorSalesBackendPanel [data-sales-view-id]');
      if (backend && /^\s*print\s*$/i.test(backend.textContent || '')) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        window.open(invoiceUrl(backend.getAttribute('data-sales-view-id'), ''), '_blank', 'noopener');
        return;
      }
      const local = event.target.closest('[data-print-invoice]');
      if (local) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        window.open(invoiceUrl('', local.getAttribute('data-print-invoice')), '_blank', 'noopener');
      }
    }, true);
  }

  function designerDefaults() {
    return {
      templateBase: 'modern-a4', primaryColor: '#0f9f78', accentColor: '#113d32',
      headerStyle: 'Modern', logoPosition: 'Left', tableDensity: 'Comfortable', fontSize: 'Normal',
      showLogo: true, showStamp: true, showSignature: true, showBankDetails: true,
      showTaxNumber: true, showCrNumber: true, showBarcode: true, showQr: true,
      showCustomerBalance: true, showPaymentTerms: true, showFooterNote: true,
      columns: { sku: true, qty: true, rate: true, discount: true, tax: true, total: true }
    };
  }

  function designerMarkup() {
    const d = Object.assign(designerDefaults(), readJson(DESIGN_KEY, {}));
    d.columns = Object.assign({}, designerDefaults().columns, d.columns || {});
    const option = function (value, label) { return '<option value="' + value + '"' + (d.templateBase === value ? ' selected' : '') + '>' + label + '</option>'; };
    const check = function (key, label) { return '<div class="col-md-6"><label class="form-check"><input class="form-check-input" type="checkbox" data-live-designer="' + key + '"' + (d[key] ? ' checked' : '') + '> ' + label + '</label></div>'; };
    const column = function (key, label) { return '<div class="col-md-6"><label class="form-check"><input class="form-check-input" type="checkbox" data-live-column="' + key + '"' + (d.columns[key] ? ' checked' : '') + '> ' + label + '</label></div>'; };
    return '<div class="row g-3"><div class="col-xl-4"><div class="cardx">' +
      '<h5 class="cardx-title mb-3">Designer Controls</h5>' +
      '<label class="form-label">Template base</label><select class="form-select" data-live-designer="templateBase">' +
      option('modern-a4', 'Modern A4 Invoice') + option('compact-a4', 'Compact A4 Invoice') + option('tax-invoice', 'Tax Invoice') + option('letterhead', 'Professional Letterhead') + option('bilingual', 'Bilingual Invoice') + option('minimal', 'Minimal Invoice') + option('thermal-80', 'Thermal 80mm') + option('thermal-58', 'Thermal 58mm') + '</select>' +
      '<div class="row g-2 mt-1"><div class="col-6"><label class="form-label">Primary color</label><input class="form-control form-control-color w-100" type="color" data-live-designer="primaryColor" value="' + d.primaryColor + '"></div><div class="col-6"><label class="form-label">Accent color</label><input class="form-control form-control-color w-100" type="color" data-live-designer="accentColor" value="' + d.accentColor + '"></div></div>' +
      '<hr><div class="row g-2">' + check('showLogo', 'Company logo') + check('showTaxNumber', 'Tax number') + check('showCrNumber', 'CR number') + check('showBankDetails', 'Bank details') + check('showSignature', 'Signature') + check('showStamp', 'Stamp') + check('showBarcode', 'Barcode') + check('showQr', 'QR code') + '</div>' +
      '<hr><h6 class="fw-bold">Columns</h6><div class="row g-2">' + column('sku', 'SKU') + column('qty', 'Quantity') + column('rate', 'Rate') + column('discount', 'Discount') + column('tax', 'Tax') + column('total', 'Total') + '</div>' +
      '<div class="d-grid gap-2 mt-3"><button class="btn btn-brand" type="button" id="saveLiveInvoiceDesign"><i class="bi bi-save me-1"></i>Save Design</button><button class="btn btn-soft" type="button" id="resetLiveInvoiceDesign">Reset Design</button><button class="btn btn-soft" type="button" id="printLiveInvoiceSample"><i class="bi bi-printer me-1"></i>Print Sample</button></div>' +
      '</div></div><div class="col-xl-8"><div class="cardx"><div class="d-flex justify-content-between align-items-center mb-3"><h5 class="cardx-title mb-0">Live Invoice Preview</h5><span class="badge-soft badge-paid">Uses saved template settings</span></div><div id="liveInvoiceDesignerPreview"></div></div></div></div>';
  }

  function collectDesigner() {
    const d = Object.assign(designerDefaults(), readJson(DESIGN_KEY, {}));
    d.columns = Object.assign({}, designerDefaults().columns, d.columns || {});
    document.querySelectorAll('[data-live-designer]').forEach(function (input) {
      d[input.dataset.liveDesigner] = input.type === 'checkbox' ? input.checked : input.value;
    });
    document.querySelectorAll('[data-live-column]').forEach(function (input) {
      d.columns[input.dataset.liveColumn] = input.checked;
    });
    return d;
  }

  function renderDesignerPreview() {
    const host = document.getElementById('liveInvoiceDesignerPreview');
    if (!host) return;
    const d = collectDesigner();
    writeJson(DESIGN_KEY, d);
    if (window.AxtorInvoice && typeof window.AxtorInvoice.render === 'function') {
      host.innerHTML = window.AxtorInvoice.render(d.templateBase, {});
    } else {
      host.innerHTML = '<div class="text-muted text-center py-5">Invoice preview engine is loading…</div>';
      setTimeout(renderDesignerPreview, 250);
    }
  }

  function manualActivate(button, pane) {
    const tabs = button.closest('.nav-tabs');
    if (tabs) tabs.querySelectorAll('.nav-link.active').forEach(function (x) { x.classList.remove('active'); });
    const content = pane.parentElement;
    if (content) content.querySelectorAll(':scope > .tab-pane').forEach(function (x) { x.classList.remove('active', 'show'); });
    button.classList.add('active');
    pane.classList.add('active', 'show');
  }

  function fixSettingsCenter() {
    if (page() !== 'settings.html') return;
    const tabs = document.querySelector('main .nav.nav-tabs');
    const content = document.querySelector('main .tab-content');
    if (!tabs || !content) return;

    let center = document.getElementById('invoice-center');
    const originalSections = ['invoice-settings', 'invoice-templates', 'printing'].map(function (id) { return document.getElementById(id); }).filter(Boolean);
    if (center && !center.dataset.axtorUnifiedInvoice && originalSections.length) {
      center.remove();
      center = null;
    }

    tabs.querySelectorAll('.nav-item').forEach(function (item) {
      const control = item.querySelector('[data-bs-target], a[href]');
      const target = control ? String(control.getAttribute('data-bs-target') || control.getAttribute('href') || '').toLowerCase() : '';
      if (target.includes('#invoice-settings') || target.includes('#invoice-templates') || target.includes('#printing') || target.includes('invoice-designer.html')) item.remove();
    });

    let button = tabs.querySelector('[data-bs-target="#invoice-center"]');
    if (!button) {
      const item = document.createElement('li');
      item.className = 'nav-item';
      item.innerHTML = '<button class="nav-link" type="button" data-bs-toggle="tab" data-bs-target="#invoice-center"><i class="bi bi-receipt-cutoff me-1"></i>Invoice & Print</button>';
      const company = tabs.querySelector('[data-bs-target="#company-profile"]');
      if (company && company.closest('li')) company.closest('li').insertAdjacentElement('afterend', item); else tabs.prepend(item);
      button = item.querySelector('button');
    }

    if (!center) {
      center = document.createElement('section');
      center.id = 'invoice-center';
      center.dataset.axtorUnifiedInvoice = '1';
      center.className = 'tab-pane fade section-anchor';
      center.innerHTML = '<div class="hero mb-3"><span class="smallcaps text-white-50">Unified Invoice Workspace</span><h3>Invoice & Print Center</h3><p>Invoice rules, templates, paper sizes and design are now managed in this one tab.</p></div>';
      const labels = {
        'invoice-settings': ['bi-sliders', 'Invoice Settings'],
        'invoice-templates': ['bi-layout-text-window', 'Invoice Templates'],
        'printing': ['bi-printer', 'Print Settings']
      };
      originalSections.forEach(function (section) {
        const id = section.id;
        section.classList.remove('tab-pane', 'fade', 'show', 'active', 'section-anchor');
        section.removeAttribute('id');
        const wrap = document.createElement('div');
        wrap.className = 'mb-3';
        wrap.innerHTML = '<div class="d-flex align-items-center gap-2 mb-2"><span class="axtor-card-icon"><i class="bi ' + labels[id][0] + '"></i></span><h4 class="mb-0">' + labels[id][1] + '</h4></div>';
        wrap.appendChild(section);
        center.appendChild(wrap);
      });
      const designer = document.createElement('div');
      designer.className = 'mt-3';
      designer.innerHTML = '<div class="d-flex align-items-center gap-2 mb-2"><span class="axtor-card-icon"><i class="bi bi-palette2"></i></span><h4 class="mb-0">Invoice Designer</h4></div>' + designerMarkup();
      center.appendChild(designer);
      content.appendChild(center);
    } else {
      center.dataset.axtorUnifiedInvoice = '1';
    }

    button.onclick = function () {
      setTimeout(function () { history.replaceState(null, '', '#invoice-center'); renderDesignerPreview(); }, 0);
    };
    if (location.hash === '#invoice-center' || location.hash === '#invoice-settings' || location.hash === '#invoice-templates' || location.hash === '#printing') {
      if (window.bootstrap && window.bootstrap.Tab) window.bootstrap.Tab.getOrCreateInstance(button).show();
      else manualActivate(button, center);
      history.replaceState(null, '', '#invoice-center');
    }

    if (!center.dataset.axtorDesignerBound) {
      center.dataset.axtorDesignerBound = '1';
      center.addEventListener('input', function (event) { if (event.target.matches('[data-live-designer], [data-live-column]')) renderDesignerPreview(); });
      center.addEventListener('change', function (event) { if (event.target.matches('[data-live-designer], [data-live-column]')) renderDesignerPreview(); });
      center.addEventListener('click', function (event) {
        if (event.target.closest('#saveLiveInvoiceDesign')) {
          writeJson(DESIGN_KEY, collectDesigner());
          if (window.AxtorPage && window.AxtorPage.toast) window.AxtorPage.toast('Invoice design saved', 'success');
          renderDesignerPreview();
        }
        if (event.target.closest('#resetLiveInvoiceDesign')) {
          writeJson(DESIGN_KEY, designerDefaults());
          location.reload();
        }
        if (event.target.closest('#printLiveInvoiceSample')) {
          const d = collectDesigner();
          writeJson(DESIGN_KEY, d);
          if (window.AxtorInvoice && window.AxtorInvoice.print) window.AxtorInvoice.print(d.templateBase);
        }
      });
    }
    setTimeout(renderDesignerPreview, 150);
  }

  function runFixes() {
    clearTimeout(scheduled);
    scheduled = setTimeout(function () {
      fixSidebar();
      removeLegacySavedTable();
      fixSettingsCenter();
    }, 20);
  }

  function init() {
    if (page() === 'invoice-designer.html') {
      location.replace('settings.html#invoice-center');
      return;
    }
    bindSavedPrint();
    runFixes();
    setTimeout(runFixes, 350);
    setTimeout(runFixes, 1400);
    if (document.body && !observer) {
      observer = new MutationObserver(runFixes);
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.AxtorRetailLiveInvoiceFixes = { run: runFixes, invoiceUrl: invoiceUrl };
})();
