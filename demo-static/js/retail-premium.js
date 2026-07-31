/* Axtor Retail premium UI layer: one sidebar, saved-invoice template printing,
   one invoice studio, and persistent grid/detail product views. */
(function () {
  'use strict';

  const PRODUCT_VIEW_KEY = 'axtorProductView';
  const DESIGN_KEY = 'invoiceDesigner';
  const NAV = [
    ['retail-dashboard.html', 'bi-speedometer2', 'Dashboard'],
    ['terminal.html', 'bi-upc-scan', 'POS Terminal'],
    ['sales.html', 'bi-cart-check', 'Sales & Returns'],
    ['shifts.html', 'bi-clock-history', 'Shifts / Closing'],
    ['customer.html', 'bi-people', 'Customers'],
    ['salesmen.html', 'bi-person-badge', 'Sales Team'],
    ['products.html', 'bi-box-seam', 'Products'],
    ['inventory.html', 'bi-boxes', 'Inventory'],
    ['barcode-labels.html', 'bi-upc', 'Barcode Labels'],
    ['purchase.html', 'bi-bag-plus', 'Purchases'],
    ['suppliers.html', 'bi-truck', 'Suppliers'],
    ['branches.html', 'bi-building', 'Branches'],
    ['promotions.html', 'bi-percent', 'Promotions'],
    ['loyalty.html', 'bi-gem', 'Loyalty'],
    ['approvals.html', 'bi-shield-check', 'Approvals'],
    ['reports.html', 'bi-graph-up-arrow', 'Reports'],
    ['accounts.html', 'bi-bank', 'Accounts'],
    ['expenses.html', 'bi-wallet2', 'Expenses'],
    ['notifications.html', 'bi-bell', 'Notifications'],
    ['setup.html', 'bi-magic', 'Setup Wizard'],
    ['settings.html#invoice-center', 'bi-sliders2-square', 'Settings & Invoice Studio']
  ];
  let observer = null;
  let refreshTimer = 0;

  function page() {
    const name = (location.pathname.split('/').pop() || 'retail-dashboard.html').toLowerCase();
    return name === 'index.html' ? 'retail-dashboard.html' : name;
  }
  function base(value) { return String(value || '').split('#')[0].toLowerCase(); }
  function readJson(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '');
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (_) { return fallback; }
  }
  function writeJson(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }
  function printProfile() {
    if (window.AxtorThemeSwitcher && AxtorThemeSwitcher.getPrintProfile) return AxtorThemeSwitcher.getPrintProfile();
    try {
      const value = String(localStorage.getItem('axtorInvoiceOutputProfile') || 'a4').toLowerCase();
      return value.includes('58') ? 'thermal-58' : value.includes('80') ? 'thermal-80' : 'a4';
    } catch (_) { return 'a4'; }
  }

  function syncSidebar() {
    const nav = document.querySelector('.nav-menu');
    if (!nav) return;
    const current = page();
    nav.innerHTML = NAV.map(function (item) {
      return '<a class="nav-linkx' + (base(item[0]) === current ? ' active' : '') + '" href="' + item[0] + '">' +
        '<i class="bi ' + item[1] + '"></i><span>' + item[2] + '</span></a>';
    }).join('');
    const brand = document.querySelector('.sidebar .brand');
    if (brand) brand.href = 'retail-dashboard.html';
    const subtitle = document.querySelector('.sidebar .brand span');
    if (subtitle) subtitle.textContent = 'General Retail POS / ERP';
    const footer = document.querySelector('.sidebar-footer');
    if (footer) footer.innerHTML = '<span class="status-dot"></span>Retail Cloud Workspace<br><small>Unified Navigation</small>';
  }

  function styles() {
    if (document.getElementById('axtorRetailPremiumStyles')) return;
    const style = document.createElement('style');
    style.id = 'axtorRetailPremiumStyles';
    style.textContent = `
      :root{--axtor-premium-shadow:0 18px 45px rgba(8,54,43,.10);--axtor-premium-soft:rgba(15,159,120,.10)}
      body.axtor-retail-premium{background:radial-gradient(circle at 92% 2%,rgba(15,159,120,.08),transparent 30%),radial-gradient(circle at 45% 100%,rgba(17,114,204,.05),transparent 32%),var(--body-bg,#f4f8f6)}
      body.axtor-retail-premium .sidebar{box-shadow:18px 0 45px rgba(5,42,34,.08)}
      body.axtor-retail-premium .brand-mark{box-shadow:0 10px 28px rgba(15,159,120,.28)}
      body.axtor-retail-premium .nav-linkx{position:relative;overflow:hidden;border:1px solid transparent;transition:.18s ease}
      body.axtor-retail-premium .nav-linkx:hover{transform:translateX(3px);border-color:rgba(15,159,120,.15)}
      body.axtor-retail-premium .nav-linkx.active:after{content:"";position:absolute;right:9px;width:5px;height:5px;border-radius:50%;background:currentColor;box-shadow:0 0 0 5px rgba(255,255,255,.16)}
      body.axtor-retail-premium .topbar{backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}
      body.axtor-retail-premium .cardx,body.axtor-retail-premium .card{position:relative;overflow:hidden;transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}
      body.axtor-retail-premium .cardx:before,body.axtor-retail-premium .card:before{content:"";position:absolute;inset:0 auto auto 0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.85),transparent);pointer-events:none}
      body.axtor-retail-premium .cardx:hover,body.axtor-retail-premium .card:hover{transform:translateY(-2px);box-shadow:var(--axtor-premium-shadow);border-color:rgba(15,159,120,.25)}
      body.axtor-retail-premium .cardx-title{display:flex;align-items:center;gap:.65rem}
      .axtor-card-icon{display:inline-grid;place-items:center;width:36px;height:36px;flex:0 0 36px;border-radius:12px;background:linear-gradient(145deg,rgba(15,159,120,.14),rgba(15,159,120,.06));color:#0f8b6c;border:1px solid rgba(15,159,120,.18)}
      .axtor-view-switch{display:inline-flex;align-items:center;gap:3px;padding:3px;border:1px solid rgba(15,159,120,.18);background:rgba(255,255,255,.76);border-radius:12px;box-shadow:0 7px 18px rgba(8,54,43,.07)}
      .axtor-view-switch button{border:0;background:transparent;color:#667a72;border-radius:9px;padding:.4rem .6rem;line-height:1}.axtor-view-switch button.active{background:#0f9f78;color:#fff;box-shadow:0 6px 14px rgba(15,159,120,.26)}
      .axtor-product-toolbar{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;justify-content:flex-end}
      .axtor-product-view-list.fast-grid,.axtor-product-view-list.axtor-backend-product-grid,.axtor-product-view-list.row{display:flex!important;flex-direction:column!important;gap:.65rem!important}
      .axtor-product-view-list .fast-product,.axtor-product-view-list .axtor-backend-product-card,.axtor-product-view-list>.col,.axtor-product-view-list>[class*="col-"]{width:100%!important;max-width:none!important;display:grid!important;grid-template-columns:42px minmax(180px,2fr) minmax(115px,1fr) minmax(110px,auto);align-items:center;gap:.8rem;margin:0!important;padding:.8rem 1rem!important;min-height:68px!important}
      .axtor-product-view-list .product-icon,.axtor-product-view-list .axtor-product-icon{width:40px!important;height:40px!important;margin:0!important;font-size:1rem!important}
      .axtor-product-view-list .fast-product>.d-flex{margin:0!important;justify-content:flex-end!important;gap:.75rem}.axtor-product-view-list .axtor-backend-product-card .axtor-stock-location{display:none}.axtor-product-view-list .axtor-backend-product-card>div:last-child{margin:0!important;justify-content:flex-end!important;gap:.75rem}
      .axtor-invoice-studio-header{display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;padding:1.2rem 1.25rem;border-radius:18px;background:linear-gradient(135deg,#073b30,#0f9f78 65%,#38c695);color:#fff;box-shadow:0 20px 50px rgba(15,159,120,.23);margin-bottom:1rem}.axtor-invoice-studio-header h3{font-weight:900;margin:0}.axtor-invoice-studio-header p{margin:.3rem 0 0;color:rgba(255,255,255,.78)}
      .axtor-studio-section{margin-bottom:1rem}.axtor-studio-label{display:flex;align-items:center;gap:.7rem;font-weight:900;font-size:1.05rem;margin:0 0 .7rem}.axtor-studio-label i{display:grid;place-items:center;width:36px;height:36px;border-radius:11px;background:var(--axtor-premium-soft);color:#0f8b6c}.axtor-designer-grid{display:grid;grid-template-columns:minmax(280px,380px) minmax(340px,1fr);gap:1rem}.axtor-designer-preview{min-height:420px;background:#edf4f1;border:1px dashed rgba(15,159,120,.28);border-radius:16px;padding:1rem;overflow:auto}
      .retail-premium-widget{height:100%;padding:1.15rem;border-radius:18px;background:linear-gradient(145deg,rgba(255,255,255,.94),rgba(244,250,247,.90));border:1px solid rgba(15,159,120,.13);box-shadow:0 14px 34px rgba(8,54,43,.08)}.retail-premium-widget .widget-icon{display:grid;place-items:center;width:48px;height:48px;border-radius:15px;background:linear-gradient(135deg,#0f9f78,#45cda5);color:#fff;font-size:1.25rem;box-shadow:0 12px 24px rgba(15,159,120,.24)}.retail-premium-widget h4{font-size:1rem;font-weight:850;margin:.85rem 0 .2rem}.retail-premium-widget p{font-size:.84rem;color:#6c7d76;margin:0}
      @media(max-width:1199px){.nav-menu{max-height:calc(100vh - 170px);overflow:auto}.axtor-designer-grid{grid-template-columns:1fr}}
      @media(max-width:700px){.axtor-product-view-list .fast-product,.axtor-product-view-list .axtor-backend-product-card,.axtor-product-view-list>.col,.axtor-product-view-list>[class*="col-"]{grid-template-columns:38px 1fr!important}.axtor-product-view-list .fast-product>.d-flex,.axtor-product-view-list .axtor-backend-product-card>div:last-child{grid-column:1/-1;justify-content:space-between!important}.axtor-product-view-list .fast-product>small{grid-column:2}}
    `;
    document.head.appendChild(style);
    document.body?.classList.add('axtor-retail-premium');
  }

  function cardIcons() {
    document.querySelectorAll('.cardx-title').forEach(function (title) {
      if (title.querySelector('.axtor-card-icon')) return;
      const text = String(title.textContent || '').toLowerCase();
      const icon = /purchase|supplier/.test(text) ? 'bi-bag-check' : /sale|invoice|terminal|receipt/.test(text) ? 'bi-receipt-cutoff' : /product|stock|inventory/.test(text) ? 'bi-box-seam' : /customer|loyalty|member/.test(text) ? 'bi-people' : /report|trend|profit|chart/.test(text) ? 'bi-graph-up-arrow' : /account|payment|expense|cash/.test(text) ? 'bi-wallet2' : /setting|configuration|control/.test(text) ? 'bi-sliders2' : 'bi-grid-1x2';
      const badge = document.createElement('span');
      badge.className = 'axtor-card-icon';
      badge.innerHTML = '<i class="bi ' + icon + '"></i>';
      title.insertBefore(badge, title.firstChild);
    });
  }

  function invoiceUrl(identifier, number, autoPrint) {
    const url = new URL('invoice-view.html', location.href);
    url.searchParams.set(number ? 'documentNo' : 'id', identifier);
    url.searchParams.set('profile', printProfile());
    if (autoPrint !== false) url.searchParams.set('print', '1');
    return url.href;
  }
  function savedInvoicePrint() {
    document.addEventListener('click', function (event) {
      const backend = event.target.closest('[data-sales-view-id]');
      if (backend && /print/i.test(backend.textContent || '')) {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
        window.open(invoiceUrl(backend.dataset.salesViewId, false, true), '_blank', 'noopener');
        return;
      }
      const local = event.target.closest('[data-print-invoice]');
      if (local) {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
        window.open(invoiceUrl(local.dataset.printInvoice, true, true), '_blank', 'noopener');
      }
    }, true);
  }

  function productView() { try { return localStorage.getItem(PRODUCT_VIEW_KEY) === 'list' ? 'list' : 'grid'; } catch (_) { return 'grid'; } }
  function setProductView(value) { const view = value === 'list' ? 'list' : 'grid'; try { localStorage.setItem(PRODUCT_VIEW_KEY, view); } catch (_) {} applyProductView(); }
  function switchMarkup() {
    const view = productView();
    return '<div class="axtor-view-switch" role="group" aria-label="Product view"><button type="button" title="Grid view" data-axtor-product-view="grid" class="' + (view === 'grid' ? 'active' : '') + '"><i class="bi bi-grid-3x3-gap"></i></button><button type="button" title="Detailed list view" data-axtor-product-view="list" class="' + (view === 'list' ? 'active' : '') + '"><i class="bi bi-list-ul"></i></button></div>';
  }
  function ensureViewControls() {
    const terminal = document.getElementById('terminalProductGrid');
    if (terminal) {
      const row = terminal.closest('.cardx')?.querySelector('.d-flex.justify-content-between');
      if (row && !row.querySelector('.axtor-view-switch')) {
        const tools = document.createElement('div'); tools.className = 'axtor-product-toolbar'; tools.innerHTML = '<span class="kbd-hint">F8 Search</span>' + switchMarkup();
        row.querySelector('.kbd-hint')?.remove(); row.appendChild(tools);
      }
    }
    const backend = document.getElementById('axtorBackendProductGridBody');
    if (backend) {
      const header = document.querySelector('#axtorBackendProductGrid .card-header');
      const controls = header?.lastElementChild;
      if (controls && !header.querySelector('.axtor-view-switch')) controls.insertAdjacentHTML('beforeend', switchMarkup());
    }
    const local = document.getElementById('newSaleProductGrid');
    if (local) {
      const row = local.closest('.cardx')?.querySelector('.d-flex.justify-content-between');
      if (row && !row.querySelector('.axtor-view-switch')) row.insertAdjacentHTML('beforeend', switchMarkup());
    }
  }
  function applyProductView() {
    const view = productView();
    ['#terminalProductGrid','#axtorBackendProductGridBody','#newSaleProductGrid','#productGrid','#productsGrid'].forEach(function (selector) {
      document.querySelectorAll(selector).forEach(function (container) {
        container.classList.toggle('axtor-product-view-list', view === 'list');
        container.classList.toggle('axtor-product-view-grid', view === 'grid');
        container.dataset.productView = view;
      });
    });
    document.querySelectorAll('[data-axtor-product-view]').forEach(function (button) { button.classList.toggle('active', button.dataset.axtorProductView === view); });
  }
  function refresh() { clearTimeout(refreshTimer); refreshTimer = setTimeout(function () { ensureViewControls(); applyProductView(); cardIcons(); }, 40); }
  function productViews() {
    document.addEventListener('click', function (event) { const button = event.target.closest('[data-axtor-product-view]'); if (!button) return; event.preventDefault(); setProductView(button.dataset.axtorProductView); });
    refresh();
    if (!observer && document.body) { observer = new MutationObserver(refresh); observer.observe(document.body, { childList: true, subtree: true }); }
  }

  function defaults() { return { templateBase:'modern-a4',primaryColor:'#0f9f78',accentColor:'#073b30',headerStyle:'Modern',logoPosition:'Left',tableDensity:'Comfortable',fontSize:'Normal',showLogo:true,showTaxNumber:true,showCrNumber:true,showBankDetails:true,showSignature:true,showStamp:true,showBarcode:false,showQr:true,showCustomerBalance:false,showPaymentTerms:true }; }
  function config() { return Object.assign(defaults(), readJson(DESIGN_KEY, {})); }
  function designerHtml(value) {
    function selected(option, current) { return option === current ? ' selected' : ''; }
    function checked(flag) { return flag ? ' checked' : ''; }
    return `<div class="cardx"><h5 class="cardx-title mb-3">Designer Controls</h5><label class="form-label">Template base</label><select class="form-select mb-2" data-studio-designer="templateBase"><option value="modern-a4"${selected('modern-a4',value.templateBase)}>Modern A4</option><option value="compact-a4"${selected('compact-a4',value.templateBase)}>Compact A4</option><option value="tax-invoice"${selected('tax-invoice',value.templateBase)}>Tax Invoice</option><option value="minimal"${selected('minimal',value.templateBase)}>Minimal Invoice</option><option value="letterhead"${selected('letterhead',value.templateBase)}>Letterhead Invoice</option><option value="bilingual"${selected('bilingual',value.templateBase)}>Bilingual Invoice</option><option value="thermal-80"${selected('thermal-80',value.templateBase)}>Thermal 80mm</option><option value="thermal-58"${selected('thermal-58',value.templateBase)}>Thermal 58mm</option></select><div class="row g-2"><div class="col-6"><label class="form-label">Primary color</label><input class="form-control form-control-color w-100" type="color" data-studio-designer="primaryColor" value="${value.primaryColor}"></div><div class="col-6"><label class="form-label">Accent color</label><input class="form-control form-control-color w-100" type="color" data-studio-designer="accentColor" value="${value.accentColor}"></div></div><div class="row g-2 mt-1"><div class="col-md-6"><label class="form-label">Header style</label><select class="form-select" data-studio-designer="headerStyle">${['Classic','Modern','Letterhead','Boxed','Minimal'].map(function(v){return '<option'+selected(v,value.headerStyle)+'>'+v+'</option>';}).join('')}</select></div><div class="col-md-6"><label class="form-label">Logo position</label><select class="form-select" data-studio-designer="logoPosition">${['Left','Center','Right'].map(function(v){return '<option'+selected(v,value.logoPosition)+'>'+v+'</option>';}).join('')}</select></div></div><div class="row g-2 mt-1"><div class="col-md-6"><label class="form-label">Table density</label><select class="form-select" data-studio-designer="tableDensity">${['Comfortable','Compact','Ultra compact'].map(function(v){return '<option'+selected(v,value.tableDensity)+'>'+v+'</option>';}).join('')}</select></div><div class="col-md-6"><label class="form-label">Font size</label><select class="form-select" data-studio-designer="fontSize">${['Small','Normal','Large'].map(function(v){return '<option'+selected(v,value.fontSize)+'>'+v+'</option>';}).join('')}</select></div></div><hr><h6 class="fw-bold">Show on document</h6><div class="row g-2">${[['showLogo','Company logo'],['showTaxNumber','Tax number'],['showCrNumber','CR number'],['showBankDetails','Bank details'],['showSignature','Signature'],['showStamp','Stamp'],['showBarcode','Barcode'],['showQr','QR code'],['showCustomerBalance','Customer balance'],['showPaymentTerms','Payment terms']].map(function(row){return '<div class="col-md-6"><label class="form-check"><input class="form-check-input" type="checkbox" data-studio-designer="'+row[0]+'"'+checked(value[row[0]])+'> '+row[1]+'</label></div>';}).join('')}</div><div class="d-grid gap-2 mt-3"><button class="btn btn-brand" type="button" id="axtorSaveStudioDesign"><i class="bi bi-save me-1"></i>Save Design</button><button class="btn btn-soft" type="button" id="axtorResetStudioDesign"><i class="bi bi-arrow-counterclockwise me-1"></i>Reset Design</button><button class="btn btn-soft" type="button" id="axtorPrintStudioSample"><i class="bi bi-printer me-1"></i>Print Sample</button></div></div>`;
  }
  function collect() { const value = config(); document.querySelectorAll('[data-studio-designer]').forEach(function (input) { value[input.dataset.studioDesigner] = input.type === 'checkbox' ? input.checked : input.value; }); return value; }
  function preview() {
    const host = document.getElementById('axtorStudioPreview'); if (!host) return;
    const value = config();
    if (window.AxtorInvoice?.setDesigner) AxtorInvoice.setDesigner(value);
    host.innerHTML = window.AxtorInvoice?.render ? AxtorInvoice.render(value.templateBase, {}) : '<div class="text-center text-muted py-5"><i class="bi bi-receipt fs-1 d-block mb-2"></i>Invoice preview engine is loading…</div>';
  }
  function studio() {
    if (page() !== 'settings.html') return;
    const tabs = document.querySelector('.nav.nav-tabs'); const content = document.querySelector('.tab-content');
    if (!tabs || !content || document.getElementById('invoice-center')) return;
    const ids = ['invoice-settings','invoice-templates','printing'];
    const sections = ids.map(function(id){return document.getElementById(id);}).filter(Boolean); if (!sections.length) return;
    Array.from(tabs.querySelectorAll('.nav-item')).forEach(function(item){const control=item.querySelector('[data-bs-target],a');const target=control&&(control.getAttribute('data-bs-target')||control.getAttribute('href')||'');if(ids.some(function(id){return target.includes(id);})||target.includes('invoice-designer.html'))item.remove();});
    const item = document.createElement('li'); item.className='nav-item'; item.innerHTML='<button class="nav-link" data-bs-target="#invoice-center" data-bs-toggle="tab"><i class="bi bi-sliders2-square me-1"></i>Invoice & Print Studio</button>';
    const pos = Array.from(tabs.children).find(function(node){return /POS Settings/i.test(node.textContent||'');}); tabs.insertBefore(item,pos||tabs.children[1]||null);
    const center=document.createElement('section'); center.id='invoice-center'; center.className='tab-pane fade section-anchor'; center.innerHTML='<div class="axtor-invoice-studio-header"><div><h3><i class="bi bi-stars me-2"></i>Invoice & Print Studio</h3><p>One place for numbering, templates, print size, document design and live preview.</p></div><span class="badge rounded-pill text-bg-light text-success px-3 py-2"><i class="bi bi-cloud-check me-1"></i>Unified</span></div>';
    const labels={'invoice-settings':['bi-receipt-cutoff','Invoice Rules & Defaults'],'invoice-templates':['bi-grid-3x3-gap','Template Gallery'],'printing':['bi-printer','Printer & Paper Settings']};
    sections.forEach(function(section){const wrap=document.createElement('div');wrap.className='axtor-studio-section';const meta=labels[section.id];wrap.innerHTML='<div class="axtor-studio-label"><i class="bi '+meta[0]+'"></i><span>'+meta[1]+'</span></div>';section.classList.remove('tab-pane','fade','show','active','section-anchor');section.removeAttribute('id');wrap.appendChild(section);center.appendChild(wrap);});
    const design=document.createElement('div');design.className='axtor-studio-section';design.innerHTML='<div class="axtor-studio-label"><i class="bi bi-brush"></i><span>Document Designer & Live Preview</span></div><div class="axtor-designer-grid">'+designerHtml(config())+'<div class="cardx"><div class="d-flex justify-content-between align-items-center gap-2 mb-3"><h5 class="cardx-title mb-0">Live Invoice Preview</h5><span class="badge-soft badge-paid">Instant Preview</span></div><div class="axtor-designer-preview" id="axtorStudioPreview"></div></div></div>';center.appendChild(design);content.appendChild(center);
    function activate(){if(location.hash!=='#invoice-center')return;const button=tabs.querySelector('[data-bs-target="#invoice-center"]');if(button&&window.bootstrap?.Tab)bootstrap.Tab.getOrCreateInstance(button).show();else button?.click();setTimeout(preview,120);}
    document.addEventListener('input',function(event){if(!event.target.matches('[data-studio-designer]'))return;writeJson(DESIGN_KEY,collect());preview();});
    document.addEventListener('change',function(event){if(!event.target.matches('[data-studio-designer]'))return;writeJson(DESIGN_KEY,collect());preview();});
    document.getElementById('axtorSaveStudioDesign')?.addEventListener('click',function(){writeJson(DESIGN_KEY,collect());window.AxtorPage?.toast?.('Invoice design saved','success');preview();});
    document.getElementById('axtorResetStudioDesign')?.addEventListener('click',function(){writeJson(DESIGN_KEY,defaults());location.reload();});
    document.getElementById('axtorPrintStudioSample')?.addEventListener('click',function(){const value=collect();writeJson(DESIGN_KEY,value);if(window.AxtorInvoice?.print)AxtorInvoice.print(value.templateBase);else window.print();});
    setTimeout(preview,250);activate();addEventListener('hashchange',activate);
  }

  function widgets() {
    if (page() !== 'retail-dashboard.html' || document.getElementById('axtorPremiumDashboardWidgets')) return;
    const quick = document.querySelector('.retail-actions')?.closest('.retail-panel'); if (!quick) return;
    const section=document.createElement('section');section.id='axtorPremiumDashboardWidgets';section.className='retail-panel';section.innerHTML='<div class="retail-panel-head"><div><span class="retail-section-icon"><i class="bi bi-stars"></i></span><div><h2>Premium Retail Workspace</h2><p>Fast operational shortcuts with a clear POS-style visual hierarchy.</p></div></div></div><div class="row g-3"><div class="col-md-6 col-xl-3"><a class="retail-premium-widget d-block text-decoration-none text-reset" href="terminal.html"><span class="widget-icon"><i class="bi bi-lightning-charge"></i></span><h4>Express Checkout</h4><p>Barcode, search, customer and split payment.</p></a></div><div class="col-md-6 col-xl-3"><a class="retail-premium-widget d-block text-decoration-none text-reset" href="inventory.html"><span class="widget-icon"><i class="bi bi-boxes"></i></span><h4>Stock Intelligence</h4><p>Availability, low-stock and transfer controls.</p></a></div><div class="col-md-6 col-xl-3"><a class="retail-premium-widget d-block text-decoration-none text-reset" href="customer.html"><span class="widget-icon"><i class="bi bi-person-heart"></i></span><h4>Customer Hub</h4><p>Balances, loyalty and buying history.</p></a></div><div class="col-md-6 col-xl-3"><a class="retail-premium-widget d-block text-decoration-none text-reset" href="settings.html#invoice-center"><span class="widget-icon"><i class="bi bi-receipt"></i></span><h4>Invoice Studio</h4><p>A4, 58mm, 80mm and premium templates.</p></a></div></div>';
    quick.parentElement.insertBefore(section,quick);
  }

  function init() {
    if (page() === 'invoice-designer.html') { location.replace('settings.html#invoice-center'); return; }
    styles(); syncSidebar(); cardIcons(); savedInvoicePrint(); productViews(); studio(); widgets();
    setTimeout(function(){syncSidebar();cardIcons();refresh();widgets();},350);
    setTimeout(function(){syncSidebar();cardIcons();refresh();widgets();},1400);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init); else init();
  window.AxtorRetailPremium={syncSidebar:syncSidebar,getProductView:productView,setProductView:setProductView,invoiceUrl:invoiceUrl};
})();
