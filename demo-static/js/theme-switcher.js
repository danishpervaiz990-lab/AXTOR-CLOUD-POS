/* Axtor POS Cloud — theme switcher and live Retail UI corrections. */
(function(){
  'use strict';

  const STORAGE_KEY='axtorThemeStyle';
  const RETRO_VALUE='retro-pos';
  const DEFAULT_VALUE='default';
  const INVOICE_SETTINGS_KEY='invoiceSettings';
  const PRINT_PROFILE_KEY='axtorInvoiceOutputProfile';

  function readStyle(){
    try{return localStorage.getItem(STORAGE_KEY)===RETRO_VALUE?RETRO_VALUE:DEFAULT_VALUE;}catch(e){return DEFAULT_VALUE;}
  }

  function persistStyle(style){
    const normalized=style===RETRO_VALUE?RETRO_VALUE:DEFAULT_VALUE;
    try{localStorage.setItem(STORAGE_KEY,normalized);}catch(e){}
    applyStyle(normalized);
  }

  function applyStyle(style){
    const enabled=style===RETRO_VALUE;
    document.documentElement.classList.toggle('theme-retro-pos',enabled);
    if(document.body) document.body.classList.toggle('theme-retro-pos',enabled);
    document.querySelectorAll('[data-theme-style-choice]').forEach(function(el){
      const active=el.getAttribute('data-theme-style-choice')===(enabled?RETRO_VALUE:DEFAULT_VALUE);
      el.classList.toggle('active',active);
      el.setAttribute('aria-pressed',active?'true':'false');
    });
    document.querySelectorAll('[data-theme-style-select]').forEach(function(el){el.value=enabled?RETRO_VALUE:DEFAULT_VALUE;});
  }

  function injectStyles(){
    if(document.getElementById('axtorLiveRetailFixStyles')) return;
    const style=document.createElement('style');
    style.id='axtorLiveRetailFixStyles';
    style.textContent=`
      .invoice-center-intro{display:flex;align-items:center;gap:14px;padding:18px 20px;margin-bottom:16px;border:1px solid rgba(15,159,120,.2);border-radius:18px;background:linear-gradient(135deg,rgba(15,159,120,.12),rgba(255,255,255,.9))}
      .invoice-center-intro i{display:grid;place-items:center;width:48px;height:48px;border-radius:15px;background:#0f9f78;color:#fff;font-size:1.3rem;box-shadow:0 10px 24px rgba(15,159,120,.22)}
      .invoice-center-block{margin-bottom:18px;padding:18px;border:1px solid rgba(15,159,120,.16);border-radius:18px;background:rgba(255,255,255,.74);box-shadow:0 12px 32px rgba(15,75,57,.06)}
      .invoice-center-heading{display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid rgba(15,159,120,.14)}
      .invoice-center-heading i{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:rgba(15,159,120,.11);color:#0f8b6c}
      .invoice-center-heading h4{margin:0;font-size:1.04rem;font-weight:850}.invoice-center-heading p{margin:2px 0 0;color:#64756e;font-size:.82rem}
      .invoice-designer-grid{display:grid;grid-template-columns:minmax(280px,360px) minmax(0,1fr);gap:16px}
      .invoice-designer-actions{display:grid;gap:8px;margin-top:14px}.invoice-designer-preview{min-height:420px}
      #axtorSalesBackendPanel{margin-top:0!important}.axtor-live-doc-title{font-size:1rem;font-weight:850}.axtor-live-doc-subtitle{font-size:.78rem;color:#64756e}
      @media(max-width:900px){.invoice-designer-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function removeInvoiceDesignerNavigation(){
    document.querySelectorAll('a[href]').forEach(function(link){
      const href=String(link.getAttribute('href')||'').split('?')[0].split('#')[0].toLowerCase();
      if(href.endsWith('invoice-designer.html')){
        const item=link.closest('li.nav-item');
        if(item) item.remove(); else link.remove();
      }
    });
  }

  function redirectLegacyDesignerPage(){
    const page=(location.pathname.split('/').pop()||'').toLowerCase();
    if(page==='invoice-designer.html') location.replace('settings.html#invoice-center');
  }

  function designerMarkup(){
    return `
      <div class="invoice-designer-grid">
        <form class="cardx" id="invoiceDesignerForm">
          <h5 class="cardx-title mb-3"><i class="bi bi-palette2"></i> Designer Controls</h5>
          <label class="form-label">Template base</label>
          <select class="form-select mb-2" data-designer="templateBase">
            <option value="modern-a4">Modern A4 Invoice</option><option value="compact-a4">Compact A4 Invoice</option><option value="paint-store">Paint Store Invoice</option><option value="tax-invoice">Tax Invoice</option><option value="delivery-invoice">Delivery Invoice</option><option value="quotation">Quotation Template</option><option value="minimal">Minimal Invoice</option><option value="letterhead">Professional Letterhead Invoice</option><option value="bilingual">Bilingual English/Arabic Invoice</option><option value="thermal-80">Thermal Receipt 80mm</option><option value="thermal-58">Thermal Receipt 58mm</option>
          </select>
          <div class="row g-2"><div class="col-6"><label class="form-label">Primary color</label><input class="form-control form-control-color w-100" data-designer="primaryColor" type="color"></div><div class="col-6"><label class="form-label">Accent color</label><input class="form-control form-control-color w-100" data-designer="accentColor" type="color"></div></div>
          <label class="form-label mt-2">Header style</label><select class="form-select" data-designer="headerStyle"><option>Classic</option><option>Modern</option><option>Letterhead</option><option>Boxed</option><option>Minimal</option></select>
          <label class="form-label mt-2">Logo position</label><select class="form-select" data-designer="logoPosition"><option>Left</option><option>Center</option><option>Right</option></select>
          <label class="form-label mt-2">Table density</label><select class="form-select" data-designer="tableDensity"><option>Comfortable</option><option>Compact</option><option>Ultra compact</option></select>
          <label class="form-label mt-2">Font size</label><select class="form-select" data-designer="fontSize"><option>Small</option><option>Normal</option><option>Large</option></select>
          <hr><h6 class="fw-bold">Show / Hide</h6>
          <div class="row g-2">
            <div class="col-6"><label class="form-check"><input class="form-check-input" data-designer="showLogo" type="checkbox"> Logo</label></div>
            <div class="col-6"><label class="form-check"><input class="form-check-input" data-designer="showStamp" type="checkbox"> Stamp</label></div>
            <div class="col-6"><label class="form-check"><input class="form-check-input" data-designer="showSignature" type="checkbox"> Signature</label></div>
            <div class="col-6"><label class="form-check"><input class="form-check-input" data-designer="showBankDetails" type="checkbox"> Bank details</label></div>
            <div class="col-6"><label class="form-check"><input class="form-check-input" data-designer="showTaxNumber" type="checkbox"> Tax number</label></div>
            <div class="col-6"><label class="form-check"><input class="form-check-input" data-designer="showCrNumber" type="checkbox"> CR number</label></div>
            <div class="col-6"><label class="form-check"><input class="form-check-input" data-designer="showBarcode" type="checkbox"> Barcode</label></div>
            <div class="col-6"><label class="form-check"><input class="form-check-input" data-designer="showQr" type="checkbox"> QR code</label></div>
            <div class="col-6"><label class="form-check"><input class="form-check-input" data-designer="columns.sku" type="checkbox"> SKU column</label></div>
            <div class="col-6"><label class="form-check"><input class="form-check-input" data-designer="columns.qty" type="checkbox"> Qty column</label></div>
            <div class="col-6"><label class="form-check"><input class="form-check-input" data-designer="columns.rate" type="checkbox"> Rate column</label></div>
            <div class="col-6"><label class="form-check"><input class="form-check-input" data-designer="columns.total" type="checkbox"> Total column</label></div>
          </div>
          <div class="invoice-designer-actions">
            <button class="btn btn-brand" id="saveInvoiceDesignBtn" type="button"><i class="bi bi-save"></i> Save Design</button>
            <button class="btn btn-soft" id="resetInvoiceDesignBtn" type="button">Reset Design</button>
            <button class="btn btn-soft" data-invoice-preview="" type="button">Preview Invoice</button>
            <button class="btn btn-soft" data-invoice-print="" type="button">Print Sample</button>
            <button class="btn btn-brand" id="saveDesignerDefaultBtn" type="button">Save as Default Template</button>
          </div>
        </form>
        <div class="cardx invoice-designer-preview"><div class="d-flex justify-content-between align-items-center mb-3"><h5 class="cardx-title mb-0"><i class="bi bi-file-earmark-richtext"></i> Live Invoice Preview</h5><span class="badge-soft badge-paid">Connected to saved settings</span></div><div id="invoiceLivePreview"></div></div>
      </div>`;
  }

  function movePaneIntoBlock(pane,icon,title,description,host){
    if(!pane) return;
    const block=document.createElement('div');
    block.className='invoice-center-block';
    block.innerHTML='<div class="invoice-center-heading"><i class="bi '+icon+'"></i><div><h4>'+title+'</h4><p>'+description+'</p></div></div><div class="invoice-center-content"></div>';
    const content=block.querySelector('.invoice-center-content');
    while(pane.firstChild) content.appendChild(pane.firstChild);
    host.appendChild(block);
    pane.remove();
  }

  function activateInvoiceCenter(trigger,pane){
    document.querySelectorAll('main .nav-tabs .nav-link.active').forEach(function(x){x.classList.remove('active');});
    document.querySelectorAll('main .tab-content>.tab-pane.active,main .tab-content>.tab-pane.show').forEach(function(x){x.classList.remove('active','show');});
    trigger.classList.add('active');
    pane.classList.add('active','show');
  }

  function buildInvoiceCenter(){
    const page=(location.pathname.split('/').pop()||'').toLowerCase();
    if(page!=='settings.html'||document.getElementById('invoice-center')) return;
    const tabs=document.querySelector('main .nav.nav-tabs');
    const tabContent=document.querySelector('main .tab-content');
    if(!tabs||!tabContent) return;

    const pane=document.createElement('section');
    pane.id='invoice-center';
    pane.className='tab-pane fade section-anchor';
    pane.innerHTML='<div class="invoice-center-intro"><i class="bi bi-receipt-cutoff"></i><div><h3 class="mb-1">Invoice & Print Center</h3><p class="text-muted mb-0">Numbering, templates, print sizes and invoice design are managed together in this single tab.</p></div></div>';

    movePaneIntoBlock(document.getElementById('invoice-settings'),'bi-sliders','Invoice Settings','Numbering, defaults, language and document visibility.',pane);
    movePaneIntoBlock(document.getElementById('invoice-templates'),'bi-layout-text-window','Invoice Templates','Choose, preview and save the default invoice layout.',pane);
    movePaneIntoBlock(document.getElementById('printing'),'bi-printer','Print Settings','A4, 80mm and 58mm output profiles and printer behaviour.',pane);

    const designer=document.createElement('div');
    designer.className='invoice-center-block';
    designer.innerHTML='<div class="invoice-center-heading"><i class="bi bi-palette2"></i><div><h4>Invoice Designer</h4><p>Customize the selected template without leaving Settings.</p></div></div>'+designerMarkup();
    pane.appendChild(designer);
    tabContent.appendChild(pane);

    tabs.querySelectorAll('[data-bs-target="#invoice-settings"],[data-bs-target="#invoice-templates"],[data-bs-target="#printing"],a[href$="invoice-designer.html"]').forEach(function(link){const li=link.closest('li');if(li)li.remove();else link.remove();});

    const li=document.createElement('li');
    li.className='nav-item';
    li.innerHTML='<button class="nav-link" type="button" data-bs-toggle="tab" data-bs-target="#invoice-center"><i class="bi bi-receipt-cutoff me-1"></i> Invoice & Print</button>';
    const company=tabs.querySelector('[data-bs-target="#company-profile"]');
    if(company&&company.closest('li')) company.closest('li').insertAdjacentElement('afterend',li); else tabs.prepend(li);
    const trigger=li.querySelector('button');
    trigger.addEventListener('click',function(){history.replaceState(null,'','#invoice-center');});

    if(['#invoice-center','#invoice-settings','#invoice-templates','#printing'].includes(location.hash)){
      activateInvoiceCenter(trigger,pane);
      history.replaceState(null,'','#invoice-center');
    }
  }

  function removeLegacySalesDocuments(){
    const legacyBody=document.getElementById('savedInvoicesBody');
    if(legacyBody){
      const card=legacyBody.closest('.cardx,.card,section');
      if(card&&!card.closest('#axtorSalesBackendPanel')) card.remove();
    }
    const panel=document.getElementById('axtorSalesBackendPanel');
    if(panel){
      const header=panel.querySelector('.card-header>div:first-child');
      if(header&&!header.dataset.axtorRenamed){
        header.dataset.axtorRenamed='1';
        header.innerHTML='<div class="axtor-live-doc-title"><i class="bi bi-receipt-cutoff me-2"></i>Saved Invoices / Quotations / Delivery Notes</div><div id="axtorSalesBackendStatus" class="axtor-live-doc-subtitle">Loading PostgreSQL documents…</div>';
      }
      panel.querySelectorAll('button[data-sales-view-id]').forEach(function(btn){
        if(/^print$/i.test(btn.textContent.trim())) btn.title='Print using the invoice template selected in Settings';
      });
    }
  }

  function readInvoiceSettings(){
    try{return JSON.parse(localStorage.getItem(INVOICE_SETTINGS_KEY)||'{}')||{};}catch(e){return {};}
  }

  function preferredProfile(){
    let raw='';
    try{raw=localStorage.getItem(PRINT_PROFILE_KEY)||readInvoiceSettings().defaultPrintSize||'A4';}catch(e){raw='A4';}
    raw=String(raw).toLowerCase();
    if(raw.includes('58')) return 'thermal-58';
    if(raw.includes('80')) return 'thermal-80';
    return 'a4';
  }

  function openConfiguredInvoice(documentId,autoPrint){
    if(!documentId) return;
    const url=new URL('invoice-view.html',location.href);
    url.searchParams.set('id',documentId);
    url.searchParams.set('profile',preferredProfile());
    if(autoPrint) url.searchParams.set('print','1');
    window.open(url.href,'_blank','noopener');
  }

  function bindPrintRouting(){
    document.addEventListener('click',function(event){
      const backendPrint=event.target.closest('#axtorSalesBackendPanel button[data-sales-view-id]');
      if(backendPrint&&/^print$/i.test(backendPrint.textContent.trim())){
        event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
        openConfiguredInvoice(backendPrint.getAttribute('data-sales-view-id'),true);
        return;
      }
      const legacyPrint=event.target.closest('[data-print-invoice]');
      if(legacyPrint){
        event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
        const docNo=legacyPrint.getAttribute('data-print-invoice');
        const url=new URL('invoice-view.html',location.href);
        url.searchParams.set('documentNo',docNo);url.searchParams.set('profile',preferredProfile());url.searchParams.set('print','1');
        window.open(url.href,'_blank','noopener');
      }
    },true);
  }

  function wrapInvoiceTemplateEngine(){
    const page=(location.pathname.split('/').pop()||'').toLowerCase();
    if(page!=='invoice-view.html'||!window.AxtorInvoice||window.AxtorInvoice.__axtorConfiguredView) return;
    const original=window.AxtorInvoice.render.bind(window.AxtorInvoice);
    window.AxtorInvoice.render=function(templateId,options){
      let resolved=templateId;
      const data=options&&options.data||{};
      const type=String(data.documentType||'invoice').toLowerCase();
      if(type==='invoice'&&(!resolved||resolved==='modern-a4')){
        const selected=window.AxtorInvoice.selectedTemplate(data.customerName||data.customer);
        if(selected&&!String(selected).startsWith('thermal-')) resolved=selected;
      }
      return original(resolved,options);
    };
    window.AxtorInvoice.__axtorConfiguredView=true;
  }

  function observeLiveUi(){
    if(!document.body||window.__axtorLiveRetailObserver) return;
    const observer=new MutationObserver(function(){removeInvoiceDesignerNavigation();removeLegacySalesDocuments();});
    observer.observe(document.body,{childList:true,subtree:true});
    window.__axtorLiveRetailObserver=observer;
  }

  function initControls(){
    applyStyle(readStyle());
    injectStyles();
    redirectLegacyDesignerPage();
    removeInvoiceDesignerNavigation();
    buildInvoiceCenter();
    removeLegacySalesDocuments();
    wrapInvoiceTemplateEngine();
    bindPrintRouting();
    observeLiveUi();
    document.querySelectorAll('[data-theme-style-choice]').forEach(function(btn){
      btn.setAttribute('type',btn.getAttribute('type')||'button');
      btn.addEventListener('click',function(){persistStyle(btn.getAttribute('data-theme-style-choice'));});
    });
    document.querySelectorAll('[data-theme-style-select]').forEach(function(select){select.addEventListener('change',function(){persistStyle(select.value);});});
  }

  applyStyle(readStyle());
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initControls); else initControls();

  window.AxtorThemeSwitcher={key:STORAGE_KEY,getStyle:readStyle,setStyle:persistStyle,applyStyle:applyStyle,getPrintProfile:preferredProfile};
})();
