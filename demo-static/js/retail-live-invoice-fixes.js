/* Axtor Retail production finalizer.
   Keeps one Settings entry, routes saved documents through the configured invoice engine,
   removes legacy demo UI, and normalizes the unified Invoice & Print workspace. */
(function () {
  'use strict';

  const DESIGN_KEY = 'invoiceDesignerSettings';
  const LEGACY_DESIGN_KEY = 'invoiceDesigner';
  const INVOICE_KEY = 'invoiceSettings';
  const SELECTED_TEMPLATE_KEY = 'selectedInvoiceTemplate';
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

  function migrateDesignerStorage() {
    const canonical = readJson(DESIGN_KEY, null);
    const legacy = readJson(LEGACY_DESIGN_KEY, null);
    if (!canonical && legacy) writeJson(DESIGN_KEY, legacy);
  }

  function printProfile() {
    if (window.AxtorThemeSwitcher && typeof window.AxtorThemeSwitcher.getPrintProfile === 'function') {
      return window.AxtorThemeSwitcher.getPrintProfile();
    }
    const invoice = readJson(INVOICE_KEY, {});
    let value = 'A4';
    try { value = localStorage.getItem(PRINT_KEY) || invoice.defaultPrintSize || 'A4'; } catch (_) {}
    value = String(value).toLowerCase();
    return value.includes('58') ? 'thermal-58' : value.includes('80') ? 'thermal-80' : 'a4';
  }

  function selectedTemplate() {
    const invoice = readJson(INVOICE_KEY, {});
    let selected = '';
    try { selected = localStorage.getItem(SELECTED_TEMPLATE_KEY) || ''; } catch (_) {}
    selected = selected || invoice.defaultInvoiceTemplate || 'modern-a4';
    return String(selected).toLowerCase().startsWith('thermal-') ? 'modern-a4' : selected;
  }

  function documentUrl(id, documentNo, autoPrint) {
    const url = new URL('invoice-view.html', location.href);
    if (id) url.searchParams.set('id', id);
    else if (documentNo) url.searchParams.set('documentNo', documentNo);
    const profile = printProfile();
    url.searchParams.set('profile', profile === 'a4' ? selectedTemplate() : profile);
    if (autoPrint) url.searchParams.set('print', '1');
    return url.href;
  }

  function fixSidebar() {
    const nav = document.querySelector('.nav-menu');
    if (!nav) return;

    const settingsLinks = [];
    nav.querySelectorAll('a[href]').forEach(function (link) {
      const href = String(link.getAttribute('href') || '').toLowerCase();
      const text = String(link.textContent || '').trim().toLowerCase();
      if (href.includes('invoice-designer.html')) {
        link.remove();
        return;
      }
      if (href.startsWith('settings.html') || text === 'settings' || text.includes('settings & invoice')) {
        settingsLinks.push(link);
      }
    });

    let settings = settingsLinks.shift();
    settingsLinks.forEach(function (duplicate) { duplicate.remove(); });
    if (!settings) {
      settings = document.createElement('a');
      settings.className = 'nav-linkx';
      nav.appendChild(settings);
    }
    settings.href = 'settings.html#invoice-center';
    settings.innerHTML = '<i class="bi bi-gear"></i><span>Settings</span>';
    settings.classList.toggle('active', page() === 'settings.html');

    const footer = document.querySelector('.sidebar-footer');
    if (footer) footer.innerHTML = '<span class="status-dot"></span>Retail Cloud Workspace<br><small>PostgreSQL Connected</small>';
  }

  function removeLegacySalesUi() {
    const legacyBody = document.getElementById('savedInvoicesBody');
    if (legacyBody) {
      const card = legacyBody.closest('.cardx, .card, section');
      if (card && !card.closest('#axtorSalesBackendPanel')) card.remove();
    }
    document.getElementById('invoiceModal')?.remove();
  }

  function normalizeSavedActions() {
    const panel = document.getElementById('axtorSalesBackendPanel');
    if (!panel) return;

    const heading = panel.querySelector('.card-header > div:first-child');
    if (heading) {
      heading.innerHTML = '<strong><i class="bi bi-receipt-cutoff me-2"></i>Saved Invoices / Quotations / Delivery Notes</strong>' +
        '<div id="axtorSalesBackendStatus" class="small text-muted">PostgreSQL documents</div>';
    }

    panel.querySelectorAll('tbody tr').forEach(function (row) {
      const source = row.querySelector('[data-sales-view-id]');
      const id = source && source.getAttribute('data-sales-view-id');
      if (!id) return;

      row.querySelectorAll('button, a').forEach(function (control) {
        const label = String(control.textContent || '').trim().toLowerCase();
        if (label === 'view') {
          control.removeAttribute('data-sales-view-id');
          control.setAttribute('data-sales-template-view-id', id);
          control.setAttribute('type', 'button');
          control.innerHTML = '<i class="bi bi-eye me-1"></i>View';
        }
        if (label === 'print') {
          control.removeAttribute('data-sales-view-id');
          control.setAttribute('data-sales-template-print-id', id);
          control.setAttribute('type', 'button');
          control.innerHTML = '<i class="bi bi-printer me-1"></i>Print';
        }
      });
    });
  }

  function bindDocumentActions() {
    if (window.__axtorRetailProductionDocumentActions) return;
    window.__axtorRetailProductionDocumentActions = true;
    document.addEventListener('click', function (event) {
      const view = event.target.closest('[data-sales-template-view-id]');
      if (view) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        window.open(documentUrl(view.getAttribute('data-sales-template-view-id'), '', false), '_blank', 'noopener');
        return;
      }

      const print = event.target.closest('[data-sales-template-print-id]');
      if (print) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        window.open(documentUrl(print.getAttribute('data-sales-template-print-id'), '', true), '_blank', 'noopener');
        return;
      }

      const localPrint = event.target.closest('[data-print-invoice]');
      if (localPrint) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        window.open(documentUrl('', localPrint.getAttribute('data-print-invoice'), true), '_blank', 'noopener');
      }
    }, true);
  }

  function designerDefaults() {
    return {
      templateBase: selectedTemplate(),
      primaryColor: '#0f9f78',
      accentColor: '#113d32',
      headerStyle: 'Modern',
      logoPosition: 'Left',
      tableDensity: 'Comfortable',
      fontSize: 'Normal',
      showLogo: true,
      showTaxNumber: true,
      showCrNumber: true,
      showBankDetails: true,
      showSignature: true,
      showStamp: true,
      showBarcode: false,
      showQr: true,
      showCustomerBalance: true,
      showPaymentTerms: true,
      columns: { sku: true, qty: true, rate: true, discount: true, tax: true, total: true }
    };
  }

  function fallbackDesignerMarkup() {
    const value = Object.assign(designerDefaults(), readJson(DESIGN_KEY, {}));
    const templates = [
      ['modern-a4', 'Modern A4 Invoice'], ['compact-a4', 'Compact A4 Invoice'],
      ['tax-invoice', 'Tax Invoice'], ['letterhead', 'Professional Letterhead'],
      ['bilingual', 'Bilingual Invoice'], ['minimal', 'Minimal Invoice'],
      ['thermal-80', 'Thermal 80mm'], ['thermal-58', 'Thermal 58mm']
    ];
    return '<div class="row g-3"><div class="col-xl-4"><div class="cardx">' +
      '<h5 class="cardx-title mb-3"><i class="bi bi-palette2"></i>Invoice Designer</h5>' +
      '<label class="form-label">Template</label><select class="form-select" data-final-designer="templateBase">' +
      templates.map(function (item) { return '<option value="' + item[0] + '"' + (value.templateBase === item[0] ? ' selected' : '') + '>' + item[1] + '</option>'; }).join('') +
      '</select><div class="row g-2 mt-2"><div class="col-6"><label class="form-label">Primary color</label><input class="form-control form-control-color w-100" type="color" value="' + value.primaryColor + '" data-final-designer="primaryColor"></div>' +
      '<div class="col-6"><label class="form-label">Accent color</label><input class="form-control form-control-color w-100" type="color" value="' + value.accentColor + '" data-final-designer="accentColor"></div></div>' +
      '<div class="d-grid gap-2 mt-3"><button class="btn btn-brand" id="saveFinalInvoiceDesign" type="button"><i class="bi bi-save me-1"></i>Save Design</button><button class="btn btn-soft" id="printFinalInvoiceSample" type="button"><i class="bi bi-printer me-1"></i>Print Sample</button></div>' +
      '</div></div><div class="col-xl-8"><div class="cardx"><h5 class="cardx-title mb-3">Live Invoice Preview</h5><div id="finalInvoicePreview"></div></div></div></div>';
  }

  function collectDesigner() {
    const value = Object.assign(designerDefaults(), readJson(DESIGN_KEY, {}));
    document.querySelectorAll('[data-final-designer], [data-studio-designer]').forEach(function (input) {
      const key = input.dataset.finalDesigner || input.dataset.studioDesigner;
      value[key] = input.type === 'checkbox' ? input.checked : input.value;
    });
    return value;
  }

  function saveDesigner() {
    const value = collectDesigner();
    writeJson(DESIGN_KEY, value);
    writeJson(LEGACY_DESIGN_KEY, value);
    const invoice = readJson(INVOICE_KEY, {});
    if (!String(value.templateBase).startsWith('thermal-')) {
      invoice.defaultInvoiceTemplate = value.templateBase;
      try { localStorage.setItem(SELECTED_TEMPLATE_KEY, value.templateBase); } catch (_) {}
    } else {
      invoice.defaultReceiptTemplate = value.templateBase;
    }
    writeJson(INVOICE_KEY, invoice);
    return value;
  }

  function renderDesignerPreview() {
    const host = document.getElementById('finalInvoicePreview') || document.getElementById('axtorStudioPreview');
    if (!host) return;
    const value = saveDesigner();
    if (window.AxtorInvoice && typeof window.AxtorInvoice.render === 'function') {
      host.innerHTML = window.AxtorInvoice.render(value.templateBase, {});
    } else {
      host.innerHTML = '<div class="text-center text-muted py-5">Loading invoice preview…</div>';
    }
  }

  function normalizeSettingsCenter() {
    if (page() !== 'settings.html') return;
    const tabs = document.querySelector('main .nav.nav-tabs');
    const content = document.querySelector('main .tab-content');
    if (!tabs || !content) return;

    tabs.querySelectorAll('.nav-item').forEach(function (item) {
      const control = item.querySelector('[data-bs-target], a[href]');
      const target = control ? String(control.getAttribute('data-bs-target') || control.getAttribute('href') || '').toLowerCase() : '';
      if (target.includes('#invoice-settings') || target.includes('#invoice-templates') || target.includes('#printing') || target.includes('invoice-designer.html')) item.remove();
    });

    const duplicateButtons = Array.from(tabs.querySelectorAll('[data-bs-target="#invoice-center"]'));
    let button = duplicateButtons.shift();
    duplicateButtons.forEach(function (extra) { extra.closest('.nav-item')?.remove(); });
    if (!button) {
      const item = document.createElement('li');
      item.className = 'nav-item';
      item.innerHTML = '<button class="nav-link" type="button" data-bs-toggle="tab" data-bs-target="#invoice-center"><i class="bi bi-receipt-cutoff me-1"></i>Invoice & Print</button>';
      const company = tabs.querySelector('[data-bs-target="#company-profile"]')?.closest('.nav-item');
      if (company) company.insertAdjacentElement('afterend', item); else tabs.prepend(item);
      button = item.querySelector('button');
    } else {
      button.innerHTML = '<i class="bi bi-receipt-cutoff me-1"></i>Invoice & Print';
    }

    let center = document.getElementById('invoice-center');
    if (!center) {
      center = document.createElement('section');
      center.id = 'invoice-center';
      center.className = 'tab-pane fade section-anchor';
      center.innerHTML = '<div class="hero mb-3"><span class="smallcaps text-white-50">Business Documents</span><h3>Invoice & Print</h3><p>Manage invoice rules, templates, print sizes and document design in one place.</p></div>';
      ['invoice-settings', 'invoice-templates', 'printing'].forEach(function (id) {
        const section = document.getElementById(id);
        if (!section) return;
        section.classList.remove('tab-pane', 'fade', 'show', 'active', 'section-anchor');
        section.removeAttribute('id');
        center.appendChild(section);
      });
      const designer = document.createElement('div');
      designer.className = 'mt-3';
      designer.innerHTML = fallbackDesignerMarkup();
      center.appendChild(designer);
      content.appendChild(center);
    }

    if (!center.querySelector('[data-final-designer], [data-studio-designer]')) {
      const designer = document.createElement('div');
      designer.className = 'mt-3';
      designer.innerHTML = fallbackDesignerMarkup();
      center.appendChild(designer);
    }

    if (!center.dataset.productionDesignerBound) {
      center.dataset.productionDesignerBound = '1';
      center.addEventListener('input', function (event) {
        if (event.target.matches('[data-final-designer], [data-studio-designer]')) renderDesignerPreview();
      });
      center.addEventListener('change', function (event) {
        if (event.target.matches('[data-final-designer], [data-studio-designer]')) renderDesignerPreview();
      });
      center.addEventListener('click', function (event) {
        if (event.target.closest('#saveFinalInvoiceDesign, #axtorSaveStudioDesign')) {
          saveDesigner();
          window.AxtorPage?.toast?.('Invoice design saved', 'success');
          renderDesignerPreview();
        }
        if (event.target.closest('#printFinalInvoiceSample, #axtorPrintStudioSample')) {
          const value = saveDesigner();
          if (window.AxtorInvoice?.print) window.AxtorInvoice.print(value.templateBase);
        }
      });
    }

    if (location.hash === '#invoice-settings' || location.hash === '#invoice-templates' || location.hash === '#printing') {
      history.replaceState(null, '', '#invoice-center');
    }
    if (location.hash === '#invoice-center') {
      if (window.bootstrap?.Tab) window.bootstrap.Tab.getOrCreateInstance(button).show();
      else button.click();
      setTimeout(renderDesignerPreview, 100);
    }
  }

  function productionCleanup() {
    document.querySelectorAll('[data-demo-only], .demo-only').forEach(function (item) { item.remove(); });

    const exactReplacements = new Map([
      ['Customer Ready Mode', 'Production Ready'],
      ['Local Browser Mode', 'Cloud Connected'],
      ['Demo invoice only.', ''],
      ['Demo data', 'Live data'],
      ['Demo Data', 'Live Data']
    ]);
    document.querySelectorAll('small, span, p, .badge, .alert').forEach(function (node) {
      const text = String(node.textContent || '').trim();
      if (exactReplacements.has(text)) node.textContent = exactReplacements.get(text);
    });

    document.querySelectorAll('input, textarea').forEach(function (field) {
      if (/\bDEMO\b/i.test(String(field.value || '')) && /cr|tax|vat|registration/i.test(String(field.name || field.id || field.dataset.companySetting || ''))) {
        field.value = '';
      }
    });
  }

  function run() {
    clearTimeout(scheduled);
    scheduled = setTimeout(function () {
      fixSidebar();
      removeLegacySalesUi();
      normalizeSavedActions();
      normalizeSettingsCenter();
      productionCleanup();
    }, 25);
  }

  function init() {
    if (page() === 'invoice-designer.html') {
      location.replace('settings.html#invoice-center');
      return;
    }
    migrateDesignerStorage();
    bindDocumentActions();
    run();
    setTimeout(run, 250);
    setTimeout(run, 900);
    setTimeout(run, 1800);
    setInterval(run, 2500);
    if (document.body && !observer) {
      observer = new MutationObserver(run);
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.AxtorRetailProductionFinalizer = { run: run, documentUrl: documentUrl };
})();
