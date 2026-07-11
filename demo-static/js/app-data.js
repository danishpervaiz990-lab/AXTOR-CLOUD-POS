/* Customer-ready localStorage layer: POS cart + customer/supplier payment allocations */
(function(){
  const KEY='axtorAdvancedDemoDB';
  const DEFAULT_TAX_RATE=5;
  const CART='axtorPosCart';
  const EDIT_KEY='axtorEditingInvoiceNo';
  const EDIT_CUSTOMER_KEY='axtorEditingCustomer';
  const EDIT_PAYMENT_KEY='axtorEditingPayment';
  const seed={};

  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  function companySettings(){try{return JSON.parse(localStorage.getItem('companySettings')||'{}')||{}}catch(e){return {}}}
  const number=n=>Number(n||0);
  const safeText=v=>String(v??'').replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
  function deepClone(x){return JSON.parse(JSON.stringify(x));}
  
  
  function ensure(){ return window.runMigrations ? window.runMigrations() : db(); }
  
  function audit(action, icon='bi-list-check'){ const data=db(); data.auditEvents=data.auditEvents||[]; data.auditEvents.unshift({user:'Local User',action,before:icon,after:'-',time:new Date().toLocaleString(),device:'Local browser / localStorage',approval:'Not required'}); save(data); }
  function badge(status){
    const map={Paid:'badge-paid',Clear:'badge-paid','In stock':'badge-paid',Cash:'badge-paid',Due:'badge-pending',Credit:'badge-pending',Draft:'badge-draft',Low:'badge-danger-soft','Partially Paid':'badge-pending',Unpaid:'badge-danger-soft',Payable:'badge-pending'};
    return `<span class="badge-soft ${map[status]||'badge-draft'}">${status}</span>`;
  }
  function invoiceStatus(x){ const bal=number(x.total)-number(x.paid); return bal<=0?'Paid':x.paid>0?'Partially Paid':'Unpaid'; }
  function balance(x){ return Math.max(0, number(x.total)-number(x.paid)); }
  function isPayableCustomerInvoiceRow(x){ const no=String(x?.no||x?.invoiceNo||x?.documentNo||x?.id||''); return !!no && !no.startsWith('DRAFT') && !no.startsWith('QTN-') && !no.startsWith('DN-'); }
  function receiptNo(prefix, count){ return `${prefix}-${String(1001+count).padStart(4,'0')}`; }

  const DOCUMENT_TYPES={
    invoice:{value:'invoice',label:'Sales Invoice',prefix:'INV',template:'modern-a4'},
    quotation:{value:'quotation',label:'Quotation',prefix:'QTN',template:'quotation'},
    delivery_note:{value:'delivery_note',label:'Delivery Note',prefix:'DN',template:'delivery-invoice'}
  };
  function normalizeDocumentType(type){
    const raw=String(type||'').toLowerCase().replace(/[\s-]+/g,'_');
    if(raw==='quote'||raw==='qtn') return 'quotation';
    if(raw==='dn'||raw==='delivery'||raw==='deliverynote') return 'delivery_note';
    if(raw==='delivery_note'||raw==='quotation'||raw==='invoice') return raw;
    return 'invoice';
  }
  function docMeta(type){ return DOCUMENT_TYPES[normalizeDocumentType(type)]||DOCUMENT_TYPES.invoice; }
  function inferDocumentTypeFromNo(no,status){
    const n=String(no||'');
    if(n.startsWith('QTN-')) return 'quotation';
    if(n.startsWith('DN-')) return 'delivery_note';
    return 'invoice';
  }
  function enrichDocument(doc){
    if(!doc) return doc;
    const no=String(doc.no||doc.invoiceNo||doc.id||'');
    const type=normalizeDocumentType(doc.documentType || inferDocumentTypeFromNo(no,doc.status));
    const meta=docMeta(type);
    doc.documentType=type;
    doc.documentPrefix=doc.documentPrefix||meta.prefix;
    doc.documentNo=doc.documentNo||no;
    if(!doc.no && doc.documentNo) doc.no=doc.documentNo;
    if(!doc.invoiceNo && doc.documentNo) doc.invoiceNo=doc.documentNo;
    doc.stockStatus=doc.stockStatus || (type==='invoice'?'deducted':'not_deducted');
    doc.updatedAt=doc.updatedAt||doc.createdAt||'';
    doc.createdAt=doc.createdAt||doc.date||'';
    return doc;
  }
  function isSalesInvoice(doc){ return normalizeDocumentType(doc?.documentType || inferDocumentTypeFromNo(doc?.no||doc?.invoiceNo||doc?.id,doc?.status))==='invoice'; }
  function isFinalInvoice(doc){ return isSalesInvoice(doc) && String(doc?.status||'').toLowerCase()!=='draft' && !String(doc?.no||doc?.invoiceNo||doc?.id||'').startsWith('DRAFT'); }
  function selectedDocumentType(){ return normalizeDocumentType($('#newSaleDocumentType')?.value || 'invoice'); }
  function reserveSalesDocumentNumber(dataArg,type='invoice'){
    const data=dataArg||db();
    data.documentCounters=data.documentCounters||{};
    const meta=docMeta(type);
    const key=meta.value;
    const used=new Set();
    (data.invoices||[]).concat(data.customerCreditInvoices||[]).forEach(x=>{ const no=String(x?.documentNo||x?.no||x?.invoiceNo||x?.id||''); if(no && !no.startsWith('DRAFT')) used.add(no); });
    let next=Number(data.documentCounters[key]||1);
    (data.invoices||[]).forEach(x=>{ const no=String(x?.documentNo||x?.no||x?.invoiceNo||x?.id||''); if(no.startsWith(meta.prefix+'-')){ const n=Number(no.slice(meta.prefix.length+1).replace(/\D/g,'')); if(n>=next) next=n+1; } });
    let documentNo=`${meta.prefix}-${String(next).padStart(6,'0')}`;
    while(used.has(documentNo)){ next+=1; documentNo=`${meta.prefix}-${String(next).padStart(6,'0')}`; }
    data.documentCounters[key]=next+1;
    save(data);
    return documentNo;
  }

  function readInvoiceSettings(){
    let s={};
    try{s=JSON.parse(localStorage.getItem('invoiceSettings')||'{}')||{};}catch(e){s={};}
    return s;
  }
  function writeInvoiceSettings(s){ localStorage.setItem('invoiceSettings', JSON.stringify(s||{})); }
  function parseTaxRateValue(v){
    const raw=String(v??'').replace('%','').trim();
    const n=Number(raw);
    return Number.isFinite(n) && n>=0 ? n : DEFAULT_TAX_RATE;
  }
  function isTaxEnabled(){
    const s=readInvoiceSettings();
    return s.vatEnabled!==false && s.taxEnabled!==false && s.taxDisabled!==true;
  }
  function getDefaultTaxRate(){
    const s=readInvoiceSettings();
    if(!isTaxEnabled()) return 0;
    const value=s.taxRate!==undefined ? s.taxRate : (s.defaultTaxRate!==undefined ? s.defaultTaxRate : DEFAULT_TAX_RATE);
    return parseTaxRateValue(value);
  }
  function getTaxLabel(){ return `Tax ${getDefaultTaxRate()}%`; }
  function updateTaxLabels(){
    const label=getTaxLabel();
    const pos=$('#posTaxLabel'); if(pos) pos.textContent=label;
    const term=$('#terminalTaxLabel'); if(term) term.textContent=label;
  }
  function applyCurrentTaxRateToCart(cart){
    const rate=getDefaultTaxRate();
    return (cart||[]).map(x=>({...x,taxRate:rate}));
  }

  function invoiceSettings(){ const s=readInvoiceSettings(); s.invoicePrefix=s.invoicePrefix||'INV-'; s.nextInvoiceNumber=s.nextInvoiceNumber||'0001'; if(s.taxRate===undefined) s.taxRate=DEFAULT_TAX_RATE; if(s.vatEnabled===undefined) s.vatEnabled=true; return s; }
  function reserveInvoiceNumber(dataArg){
    return reserveSalesDocumentNumber(dataArg||db(),'invoice');
  }
  function dueDateFrom(dateValue){ const d=new Date(); d.setDate(d.getDate()+30); return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); }
  function invoiceBalance(inv){ return Math.max(0, number(inv?.balance!==undefined?inv.balance:(number(inv?.total??inv?.amount??inv?.grand)-number(inv?.paid)))); }
  function syncCustomerReceivable(data, inv){
    data.customerCreditInvoices=data.customerCreditInvoices||[];
    if(!inv) return;
    const no=String(inv.no||inv.invoiceNo||inv.id||'');
    if(!no || no.startsWith('DRAFT') || !isSalesInvoice(inv)) return;
    const total=number(inv.total??inv.amount??inv.grand);
    const paid=number(inv.paid);
    const bal=Math.max(0,total-paid);
    data.customerCreditInvoices=data.customerCreditInvoices.filter((x,i,arr)=>String(x.no)!==no || arr.findIndex(y=>String(y.no)===no)===i);
    let row=data.customerCreditInvoices.find(x=>String(x.no)===no);
    if(bal>0 && inv.customer && inv.customer!=='Walk-in Customer'){
      if(!row){ row={no}; data.customerCreditInvoices.unshift(row); }
      row.customer=inv.customer; row.date=inv.date||new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); row.due=row.due||dueDateFrom(row.date); row.total=total; row.paid=paid; row.balance=bal; row.status=paid>0?'Partially Paid':'Open'; row.paymentMethod=inv.paymentMethod||inv.paymentType||'Customer credit'; row.customerCreditApplied=!!inv.customerCreditApplied || String(row.paymentMethod||'').toLowerCase().includes('credit'); row.creditAmount=number(inv.creditAmount||bal);
    } else if(row){
      row.customer=inv.customer||row.customer; row.total=total; row.paid=total; row.balance=0; row.status='Closed';
    }
  }
  function productMatch(product,item){ const sku=String(item?.sku||'').trim(); const name=itemDisplayName(item); return (sku && String(product.sku||'')===sku) || (!sku && String(product.name||'')===name); }
  function negativeStockAllowed(){ try{ const cs=companySettings(); return cs.allowNegativeStock===true || localStorage.getItem('allowNegativeStock')==='1' || localStorage.getItem('axtorAllowNegativeStock')==='1'; }catch(e){ return false; } }
  function moveStockForInvoice(data, inv, type, direction){
    data.products=data.products||[]; data.stockMovements=data.stockMovements||[];
    const items=invoiceSourceItems(inv); const no=String(inv?.no||inv?.invoiceNo||inv?.id||'');
    const allowNegative=negativeStockAllowed();
    if(direction<0 && !allowNegative){
      for(const it of items){ const qty=number(it.qty)||0; if(qty<=0) continue; const p=data.products.find(prod=>productMatch(prod,it)); if(p && number(p.stock)<qty){ return {ok:false,message:`Insufficient stock for ${itemDisplayName(it)}. Available ${number(p.stock)}, requested ${qty}.`}; } }
    }
    items.forEach(it=>{
      const qty=number(it.qty)||0; if(qty<=0) return;
      const p=data.products.find(prod=>productMatch(prod,it)); if(!p) return;
      const before=number(p.stock); const after=before+(direction*qty); p.stock=allowNegative?after:Math.max(0,after); p.status=number(p.stock)<=0?'Out of stock':number(p.stock)<10?'Low':'In stock';
      data.stockMovements.unshift({dateTime:new Date().toLocaleString(),type,invoiceNo:no,sku:p.sku||it.sku||'',productName:p.name||itemDisplayName(it),quantity:direction<0?-qty:qty,beforeStock:before,afterStock:p.stock});
    });
    return {ok:true};
  }
  function applyInvoiceStock(data, inv, type='sale'){ return moveStockForInvoice(data, inv, type, -1); }
  function reverseInvoiceStock(data, inv, type='edit-reversal'){ return moveStockForInvoice(data, inv, type, 1); }
  function restockInvoiceItem(data, invNo, itemName){
    const inv=(data.invoices||[]).find(x=>String(x.no||x.invoiceNo||x.id)===String(invNo));
    const item=(invoiceSourceItems(inv)||[]).find(x=>itemDisplayName(x)===itemName) || {name:itemName,qty:1};
    return moveStockForInvoice(data,{no:invNo,items:[item]},'return',1);
  }

  function updateCustomerBalances(data){
    data.customers.forEach(c=>{
      if(c.name==='Walk-in Customer') return;
      const bal=data.customerCreditInvoices.filter(i=>i.customer===c.name && isPayableCustomerInvoiceRow(i)).reduce((a,i)=>a+balance(i),0);
      c.balance=bal; c.status=bal>0?'Due':'';
    });
  }
  function updateSupplierBalancesUI(data){
    const body=$('#supplierListBody'); if(!body) return;
    const suppliers=[...new Set(data.supplierBills.map(b=>b.supplier))];
    body.innerHTML=suppliers.map(name=>{
      const bal=data.supplierBills.filter(b=>b.supplier===name).reduce((a,b)=>a+balance(b),0);
      return `<tr><td>${name}</td><td></td><td>${money(bal)}</td><td>${badge(bal>0?'Payable':'')}</td></tr>`;
    }).join('');
  }

  function renderCustomers(){
    const body=$('#customersTableBody'); if(!body) return;
    const data=db(); updateCustomerBalances(data); save(data);
    body.innerHTML=data.customers.map(c=>`<tr><td>${safeText(c.name)}</td><td>${safeText(c.phone)}</td><td>${safeText(c.type)}</td><td>${money(c.balance)}</td><td>${badge(c.status)}</td></tr>`).join('');
  }
  function renderProducts(){
    const body=$('#productsTableBody'); if(!body) return;
    body.innerHTML=db().products.map(p=>`<tr><td>${safeText(p.sku)}</td><td>${safeText(p.name)}</td><td>${safeText(p.category)}</td><td>${money(p.price)}</td><td>${number(p.stock)}</td><td>${badge(p.status)}</td></tr>`).join('');
  }
  function documentAmount(inv){ return number(inv?.amount ?? inv?.total ?? inv?.grand ?? inv?.grandTotal); }
  function documentNo(inv){ return String(inv?.no||inv?.invoiceNo||inv?.documentNo||inv?.id||''); }
  function documentStatus(inv){ return String(inv?.status||inv?.paymentStatus||'Saved'); }
  function lpoValue(source){ return String(source?.lpoNo || source?.customerLpoNo || source?.customerPoNo || source?.poNo || '').trim(); }
  function savedDocumentText(inv){
    const no=documentNo(inv); const meta=docMeta(inv.documentType);
    return `${no} ${meta.label} ${inv.customer||inv.customerName||''} ${inv.date||''} ${documentAmount(inv)} ${documentStatus(inv)} ${lpoValue(inv)}`.toLowerCase();
  }
  function renderInvoices(){
    const body=$('#savedInvoicesBody'); if(!body) return;
    const term=($('#savedInvoicesSearch')?.value||'').trim().toLowerCase();
    const rows=(db().invoices||[]).map(enrichDocument).filter(inv=>{
      const no=documentNo(inv);
      const isDraft=String(documentStatus(inv)).toLowerCase()==='draft' || no.startsWith('DRAFT');
      const allowed=isDraft || ['invoice','quotation','delivery_note'].includes(inv.documentType);
      return allowed && (!term || savedDocumentText(inv).includes(term));
    });
    body.innerHTML=rows.map(inv=>{
      const no=documentNo(inv);
      const meta=docMeta(inv.documentType);
      const isDraft=String(documentStatus(inv)).toLowerCase()==='draft' || no.startsWith('DRAFT');
      const canEdit=isSalesInvoice(inv);
      const action=isDraft
        ? `<div class="d-flex gap-1 flex-wrap"><button class="btn btn-sm btn-brand" type="button" data-resume-draft="${safeText(no)}"><i class="bi bi-arrow-clockwise"></i> Resume Draft</button><button class="btn btn-sm btn-soft text-danger" type="button" data-delete-draft="${safeText(no)}"><i class="bi bi-trash"></i> Delete Draft</button></div>`
        : `<div class="d-flex gap-1 flex-wrap"><button class="btn btn-sm btn-soft" type="button" data-view-invoice="${safeText(no)}"><i class="bi bi-eye"></i> View</button><button class="btn btn-sm btn-brand" type="button" data-print-invoice="${safeText(no)}"><i class="bi bi-printer"></i> Print</button>${canEdit?`<button class="btn btn-sm btn-soft" type="button" data-edit-invoice="${safeText(no)}"><i class="bi bi-pencil-square"></i> Edit</button>`:`<button class="btn btn-sm btn-soft" type="button" disabled title="Conversion/editing is planned for backend phase"><i class="bi bi-arrow-repeat"></i> Convert Later</button>`}</div>`;
      const lpo=lpoValue(inv); return `<tr><td><strong>${safeText(no)}</strong><br><small class="text-muted">${safeText(meta.label)}</small>${lpo?`<br><small class="text-brand fw-semibold">LPO: ${safeText(lpo)}</small>`:''}</td><td>${safeText(inv.customer||inv.customerName||'-')}</td><td>${safeText(inv.date||'-')}</td><td>${money(documentAmount(inv))}</td><td>${badge(documentStatus(inv)||'Paid')}</td><td>${action}</td></tr>`;
    }).join('') || `<tr><td colspan="6" class="text-center text-muted py-4">${term?'No saved document found for this search.':'No saved documents.'}</td></tr>`;
  }

  function itemDisplayName(x){ return String(x?.name||x?.product||x?.productName||x?.itemName||x?.description||'Item').trim() || 'Item'; }
  function getEditingInvoiceNo(){ return sessionStorage.getItem(EDIT_KEY) || localStorage.getItem(EDIT_KEY) || ''; }
  function findInvoiceByNo(no){ return (db().invoices||[]).find(x=>String(x.no||x.invoiceNo||x.id)===String(no)); }
  function clearInvoiceEditMode(clearCart=false){
    sessionStorage.removeItem(EDIT_KEY); localStorage.removeItem(EDIT_KEY); sessionStorage.removeItem(EDIT_CUSTOMER_KEY); sessionStorage.removeItem(EDIT_PAYMENT_KEY); localStorage.removeItem('axtorResumeSalesmanId');
    if(clearCart) sessionStorage.setItem(CART,'[]');
    updateEditModeUi();
  }
  function invoiceSourceItems(inv){
    if(Array.isArray(inv?.items) && inv.items.length) return inv.items;
    if(Array.isArray(inv?.draftItems) && inv.draftItems.length) return inv.draftItems;
    return [];
  }
  function normalizeCartItem(x){
    const itemName=itemDisplayName(x);
    const price=number(x?.price ?? x?.rate ?? x?.unitPrice);
    return {sku:x?.sku||'', barcode:x?.barcode||'', brand:x?.brand||'', category:x?.category||'', colorCode:x?.colorCode||'', shade:x?.shade||x?.formula||'', batchNo:x?.batchNo||'', expiryDate:x?.expiryDate||'', warehouse:x?.warehouse||'', unit:x?.unit||'PCS', name:itemName, product:itemName, productName:itemName, itemName:itemName, description:itemName, qty:number(x?.qty)||1, price, rate:price, discount:number(x?.discount), taxRate:getDefaultTaxRate()};
  }
  function buildInvoiceItemsFromCart(cart){
    return (cart||[]).map(x=>{ const itemName=itemDisplayName(x); const qty=number(x.qty)||1; const price=number(x.price ?? x.rate); const discount=number(x.discount); const taxRate=getDefaultTaxRate(); const taxable=Math.max(0,(qty*price)-discount); return {sku:x.sku||'', barcode:x.barcode||'', brand:x.brand||'', category:x.category||'', colorCode:x.colorCode||'', shade:x.shade||'', batchNo:x.batchNo||'', expiryDate:x.expiryDate||'', warehouse:x.warehouse||'', name:itemName, product:itemName, productName:itemName, itemName:itemName, description:itemName, unit:x.unit||'PCS', qty, rate:price, price, discount, taxRate, tax:taxable*(taxRate/100), total:taxable+(taxable*(taxRate/100))}; });
  }
  function populateNewSaleMetaControls(inv){
    ensureNewSaleEditControls();
    const editing=!!getEditingInvoiceNo();
    const dt=$('#newSaleDocumentType');
    if(dt){ dt.value=normalizeDocumentType(editing ? (inv?.documentType||'invoice') : (dt.value||'invoice')); dt.disabled=editing; }
    const c=$('#newSaleCustomer');
    if(c){ const stored=sessionStorage.getItem(EDIT_CUSTOMER_KEY); const current=editing ? (stored || inv?.customer || c.value || 'Walk-in Customer') : (c.value || stored || inv?.customer || 'Walk-in Customer'); const names=[...new Set(['Walk-in Customer'].concat((db().customers||[]).map(x=>x.name)).filter(Boolean))]; c.innerHTML=names.map(name=>`<option ${name===current?'selected':''}>${safeText(name)}</option>`).join(''); c.value=current; }
    const p=$('#newSalePaymentMethod');
    if(p){ const stored=sessionStorage.getItem(EDIT_PAYMENT_KEY); const val=editing ? (stored || inv?.paymentMethod || inv?.paymentType || (String(inv?.status||'').toLowerCase()==='credit'?'Customer credit':'Cash')) : (stored || p.value || 'Cash'); p.value=val; }
    const lpo=$('#newSaleLpoNo');
    if(lpo){ lpo.value=editing ? lpoValue(inv) : (lpo.value || lpoValue(inv)); }
  }
  function ensureNewSaleEditControls(){
    const salesEl=$('#newSaleSalesmanId'); if(!salesEl) return;
    const card=salesEl.closest('.cardx'); if(!card) return;
    const title=card.querySelector('.cardx-title');
    if(title && !$('#invoiceEditModeBanner')) title.insertAdjacentHTML('afterend', `<div id="invoiceEditModeBanner" class="alert alert-warning d-none mt-2 mb-3"><div class="d-flex flex-wrap align-items-center justify-content-between gap-2"><div><i class="bi bi-pencil-square me-1"></i><strong>Editing Invoice:</strong> <span id="invoiceEditModeNo" class="mono"></span><div class="small text-muted">Updating will keep the same invoice number and replace the saved invoice data.</div></div><button type="button" class="btn btn-sm btn-soft" data-cancel-invoice-edit><i class="bi bi-x-circle"></i> Cancel Edit</button></div></div>`);
    const salesRow=salesEl.closest('.row');
    if(salesRow && !$('#newSaleCustomer')) salesRow.insertAdjacentHTML('beforebegin', `<div class="row g-3 align-items-end mb-3 axtor-sale-meta-row" id="newSaleMetaRow"><div class="col-12 col-md-3"><label class="form-label fw-semibold"><i class="bi bi-file-earmark-text me-1"></i>Document Type</label><select id="newSaleDocumentType" class="form-select"><option value="invoice">Sales Invoice</option><option value="quotation">Quotation</option><option value="delivery_note">Delivery Note / DN</option></select></div><div class="col-12 col-md-3"><label class="form-label fw-semibold"><i class="bi bi-person me-1"></i>Customer</label><select id="newSaleCustomer" class="form-select"></select></div><div class="col-12 col-md-3"><label class="form-label fw-semibold"><i class="bi bi-card-checklist me-1"></i>LPO / PO No</label><input id="newSaleLpoNo" class="form-control" placeholder="Optional customer LPO"></div><div class="col-12 col-md-3"><label class="form-label fw-semibold"><i class="bi bi-credit-card me-1"></i>Payment</label><select id="newSalePaymentMethod" class="form-select"><option>Cash</option><option>Card</option><option>Bank transfer</option><option>Customer credit</option><option>Cash/Card</option></select></div></div>`);
  }
  function updateEditModeUi(){
    ensureNewSaleEditControls();
    const no=getEditingInvoiceNo(); const banner=$('#invoiceEditModeBanner');
    if(banner){ banner.classList.toggle('d-none',!no); const label=$('#invoiceEditModeNo'); if(label) label.textContent=no; }
    const btn=$('#completeSaleBtn');
    if(btn){ const meta=docMeta(selectedDocumentType()); btn.innerHTML=no?'<i class="bi bi-check2-circle"></i> Update Invoice':`Save ${meta.label}`; }
    const paymentLaunch=document.querySelector('[data-bs-target="#paymentModal"]');
    if(paymentLaunch){ const meta=docMeta(selectedDocumentType()); paymentLaunch.innerHTML=meta.value==='invoice'?'Proceed Payment':`Save / Preview ${meta.label}`; }
    const title=$('#paymentModal .modal-title'); if(title) title.textContent=no?`Update Invoice ${no}`:'Payment Details';
    const inv=no?findInvoiceByNo(no):null; populateNewSaleMetaControls(inv||{}); updateNewSaleSalesmanSummary();
  }
  function activateNewSaleTab(){
    if(location.hash!=='#new-sale') history.pushState(null,'','#new-sale');
    if(window.AxtorActivateHash) window.AxtorActivateHash();
    const trigger=document.querySelector('[data-bs-target="#new-sale"]'); if(trigger && window.bootstrap?.Tab) new bootstrap.Tab(trigger).show();
  }
  function startInvoiceEdit(no){
    const inv=findInvoiceByNo(no);
    if(!inv){ toast('Invoice not found','warning'); return; }
    const isDraft=String(inv.status||'').toLowerCase()==='draft' || String(inv.no||inv.invoiceNo||inv.id||'').startsWith('DRAFT');
    if(isDraft){ clearInvoiceEditMode(false); resumeDraft(inv.no||inv.invoiceNo||inv.id||no); return; }
    const items=invoiceSourceItems(inv);
    if(!items.length){ toast('This invoice has no saved items to edit. Nothing was changed.','warning'); return; }
    const invNo=inv.no||inv.invoiceNo||inv.id||no;
    sessionStorage.setItem(CART,JSON.stringify(items.map(normalizeCartItem)));
    sessionStorage.setItem(EDIT_KEY,invNo); localStorage.setItem(EDIT_KEY,invNo);
    sessionStorage.setItem(EDIT_CUSTOMER_KEY,inv.customer||'Walk-in Customer');
    sessionStorage.setItem(EDIT_PAYMENT_KEY,inv.paymentMethod||inv.paymentType||(String(inv.status||'').toLowerCase()==='credit'?'Customer credit':'Cash'));
    if(inv.salesmanId) localStorage.setItem('axtorResumeSalesmanId', inv.salesmanId); else localStorage.removeItem('axtorResumeSalesmanId');
    if(location.pathname.split('/').pop()==='sales.html' || location.pathname.split('/').pop()===''){
      activateNewSaleTab(); populateNewSaleMetaControls(inv); if($('#newSaleSalesmanId')) $('#newSaleSalesmanId').value=inv.salesmanId||''; updateNewSaleSalesmanSummary(); renderCart(); updateEditModeUi(); toast(`Editing invoice ${invNo}`);
    } else {
      location.href='sales.html#new-sale';
    }
  }
  function invoiceCustomerPhone(inv){
    const direct=String(inv?.customerPhone||inv?.customerMobile||inv?.phone||inv?.mobile||'').trim();
    if(direct && direct!=='-') return direct;
    const c=(db().customers||[]).find(x=>x.name===inv?.customer);
    const ph=String(c?.phone||'').trim();
    return ph && ph!=='-' ? ph : (inv?.customer==='Walk-in Customer'?'77790000':'');
  }
  function fallbackInvoiceItems(inv){
    const no=String(inv?.no||inv?.invoiceNo||inv?.id||'');
    if(no==='INV-1048') return [
      {sku:'AX-2K-101',brand:'',name:'Sample Product',product:'Sample Product',productName:'Sample Product',colorCode:'',unit:'LTR',qty:2,rate:95,price:95,discount:0,taxRate:DEFAULT_TAX_RATE},
      {sku:'CC-HS-1L',brand:'',name:'Sample Product 1L',product:'Sample Product 1L',productName:'Sample Product 1L',colorCode:'',unit:'PCS',qty:1,rate:55,price:55,discount:0,taxRate:DEFAULT_TAX_RATE},
      {sku:'TN-NC-5L',brand:'',name:'Sample Product',product:'Sample Product',productName:'Sample Product',colorCode:'N/A',unit:'PCS',qty:1,rate:45,price:45,discount:0,taxRate:DEFAULT_TAX_RATE}
    ];
    if(no==='INV-1047') return [
      {sku:'EP-PR-4L',brand:'',name:'Sample Product',product:'Sample Product',productName:'Sample Product',colorCode:'',unit:'PCS',qty:4,rate:165,price:165,discount:0,taxRate:0},
      {sku:'AX-2K-101',brand:'',name:'Sample Product',product:'Sample Product',productName:'Sample Product',colorCode:'',unit:'LTR',qty:5,rate:95,price:95,discount:0,taxRate:0},
      {sku:'CC-HS-1L',brand:'',name:'Sample Product 1L',product:'Sample Product 1L',productName:'Sample Product 1L',colorCode:'',unit:'PCS',qty:3,rate:55,price:55,discount:0,taxRate:0},
      {sku:'TN-NC-5L',brand:'',name:'Sample Product',product:'Sample Product',productName:'Sample Product',colorCode:'N/A',unit:'PCS',qty:4,rate:45,price:45,discount:0,taxRate:0}
    ];
    const total=number(inv?.grand ?? inv?.total ?? inv?.amount);
    return [{sku:no,brand:'',name:'Invoice sale item',product:'Invoice sale item',productName:'Invoice sale item',unit:'Invoice',qty:1,rate:total,price:total,discount:0,taxRate:0,total}];
  }

  function invoicePrintData(inv){
    if(!inv) return null;
    const total=number(inv.grand ?? inv.total ?? inv.amount);
    const tax=number(inv.tax ?? inv.taxAmount);
    const rawItems=Array.isArray(inv.items) && inv.items.length ? inv.items : (Array.isArray(inv.draftItems) && inv.draftItems.length ? inv.draftItems : fallbackInvoiceItems(inv));
    const items=rawItems.map(x=>{ const itemName=itemDisplayName(x); return {
      sku:x.sku||'', barcode:x.barcode||'', brand:x.brand||'', category:x.category||'', colorCode:x.colorCode||'', shade:x.shade||x.formula||'', batchNo:x.batchNo||'', expiryDate:x.expiryDate||'', warehouse:x.warehouse||'',
      name:itemName, product:x.product||x.productName||itemName, productName:x.productName||itemName, itemName:x.itemName||itemName, description:x.description||itemName, unit:x.unit||'PCS', qty:number(x.qty)||1, rate:number(x.rate ?? x.price ?? x.unitPrice), price:number(x.price ?? x.rate ?? x.unitPrice), discount:number(x.discount), taxRate:x.taxRate!==undefined?number(x.taxRate):getDefaultTaxRate(), tax:x.tax, total:x.total
    }; });
    return {
      invoiceNo:inv.invoiceNo||inv.no||inv.id,
      no:inv.no||inv.invoiceNo||inv.id,
      documentType: normalizeDocumentType(inv.documentType || inferDocumentTypeFromNo(inv.no||inv.invoiceNo||inv.id, inv.status)),
      lpoNo: lpoValue(inv), customerLpoNo: lpoValue(inv), customerPoNo: lpoValue(inv), poNo: lpoValue(inv),
      date:inv.date||new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}),
      time:inv.time||new Date().toLocaleTimeString(),
      customer:inv.customer||'Walk-in Customer',
      customerPhone:invoiceCustomerPhone(inv),
      salesmanId:inv.salesmanId||'',
      salesman:salesmanName(inv.salesmanId)||inv.salesman||'',
      branch:inv.branch||'Main Branch',
      cashier:inv.cashier||'Cashier',
      paymentMethod:inv.paymentMethod||inv.paymentType||inv.status||'Cash/Card',
      paymentType:inv.paymentType||inv.paymentMethod||'',
      subtotal:inv.subtotal,
      discount:inv.discount,
      tax:tax,
      total:total,
      amount:total,
      grand:total,
      paid:inv.paid!==undefined?number(inv.paid):(String(inv.status).toLowerCase()==='credit'?0:total),
      balance:inv.balance!==undefined?number(inv.balance):(String(inv.status).toLowerCase()==='credit'?total:0),
      status:inv.status||'Paid',
      customerTax:inv.customerTax||'',
      customerBalance:inv.customerBalance||0,
      deliveryAddress:inv.deliveryAddress||'Doha, Qatar',
      vehicleRef:inv.vehicleRef||'',
      colorMatchingNote:inv.colorMatchingNote||'',
      thinnerRatio:inv.thinnerRatio||'',
      invoiceDiscount:inv.invoiceDiscount||0,
      items
    };
  }

  function openSavedInvoice(no, printMode=false){
    const inv=(db().invoices||[]).find(x=>String(x.no||x.invoiceNo||x.id)===String(no));
    if(!inv){ toast('Invoice not found','warning'); return; }
    const isDraft=String(inv.status||'').toLowerCase()==='draft' || String(inv.no||'').startsWith('DRAFT');
    if(isDraft){ resumeDraft(inv.no||no); return; }
    if(!window.AxtorInvoice){ toast('Invoice engine is not loaded yet','warning'); return; }
    const data=invoicePrintData(inv);
    const template=docMeta(data.documentType).template || window.AxtorInvoice.selectedTemplate?.(data.customer) || localStorage.getItem('selectedInvoiceTemplate') || 'modern-a4';
    if(printMode) window.AxtorInvoice.print(template,{data}); else window.AxtorInvoice.preview(template,{data});
  }

  function paymentSearchText(row){
    return `${row.no||''} ${row.customer||''} ${row.date||''} ${row.due||''} ${row.total||0} ${row.paid||0} ${row.balance||0} ${row.status||''} ${row.label||''}`.toLowerCase();
  }
  function populateCustomerPaymentSelect(data){
    const sel=$('#customerPaymentCustomer'); if(!sel) return;
    const current=sel.value;
    const names=[...new Set((data.customers||[]).map(c=>c.name||c.customer).concat((data.customerCreditInvoices||[]).map(i=>i.customer)).filter(Boolean).filter(n=>n!=='Walk-in Customer'))];
    sel.innerHTML=names.map(n=>`<option>${safeText(n)}</option>`).join('') || '<option value="">No customer invoices yet</option>';
    if(current && names.includes(current)) sel.value=current;
  }
  function receivePaymentRows(data, customer, term){
    const q=String(term||'').trim().toLowerCase();
    const rows=[]; const seen=new Set();
    (data.customerCreditInvoices||[]).forEach(i=>{
      if(!isPayableCustomerInvoiceRow(i)) return;
      const row={...i,no:String(i.no||''),label:'Sales Invoice — Payable',payable:true,type:'invoice',balance:balance(i),status:i.status||invoiceStatus(i)};
      if(!row.no || row.balance<=0) return;
      if(customer && row.customer!==customer) return;
      if(q && !paymentSearchText(row).includes(q)) return;
      rows.push(row); seen.add(row.no);
    });
    if(q){
      (data.invoices||[]).map(enrichDocument).forEach(inv=>{
        const no=documentNo(inv); if(!no || seen.has(no)) return;
        const type=normalizeDocumentType(inv.documentType);
        if(!['quotation','delivery_note'].includes(type)) return;
        const row={no,customer:inv.customer||inv.customerName||'',date:inv.date||'',due:inv.dueDate||inv.due||'—',total:documentAmount(inv),paid:number(inv.paid),balance:0,status:documentStatus(inv),label:type==='quotation'?'Quotation — Not payable':'Delivery Note / DN — Not payable',payable:false,type};
        if(customer && row.customer!==customer) return;
        if(paymentSearchText(row).includes(q)) rows.push(row);
      });
    }
    return rows;
  }
  function renderCustomerPayments(){
    const body=$('#customerPaymentInvoicesBody'); if(!body) return;
    const data=db(); populateCustomerPaymentSelect(data); const customer=$('#customerPaymentCustomer')?.value || '';
    const term=$('#customerPaymentSearch')?.value || '';
    const rows=receivePaymentRows(data,customer,term);
    body.innerHTML=rows.map(i=>{
      const label=i.payable?'Sales Invoice — Payable':i.label;
      const check=i.payable?'<input class="form-check-input" type="checkbox" data-customer-check checked>':'<span class="badge-soft badge-draft">Not payable</span>';
      const apply=i.payable?`<input class="form-control form-control-sm allocation-input" data-customer-apply="${safeText(i.no)}" type="number" min="0" max="${balance(i)}" value="0">`:'<input class="form-control form-control-sm" disabled value="Not payable">';
      return `<tr data-invoice="${safeText(i.no)}" class="${i.payable?'':'opacity-75'}"><td>${check}</td><td><strong>${safeText(i.no)}</strong><br><small class="text-muted">${safeText(label)}</small><br><small class="text-muted">${safeText(i.customer||'')}</small></td><td>${safeText(i.due||'—')}</td><td>${money(i.total)}</td><td>${money(i.paid)}</td><td>${i.payable?money(balance(i)):'—'}</td><td>${apply}</td></tr>`;
    }).join('') || `<tr><td colspan="7" class="text-center text-muted py-4">${String(term).trim()?'No open document found for this search.':'No open invoices for this customer.'}</td></tr>`;
    renderCustomerPaymentHistory(); updateCustomerPaymentSummary();
  }
  function updateCustomerPaymentSummary(){
    const data=db(); const customer=$('#customerPaymentCustomer')?.value || '';
    const currentBalance=data.customerCreditInvoices.filter(i=>i.customer===customer && isPayableCustomerInvoiceRow(i)).reduce((a,i)=>a+balance(i),0);
    const allocated=$$('[data-customer-apply]').reduce((a,input)=>a+number(input.value),0);
    const received=number($('#customerReceivedTotal')?.value||allocated);
    $('#customerCurrentBalance') && ($('#customerCurrentBalance').textContent=money(currentBalance));
    $('#customerAllocatedTotal') && ($('#customerAllocatedTotal').textContent=money(allocated));
    $('#customerUnallocated') && ($('#customerUnallocated').textContent=money(Math.max(0,received-allocated)));
    $('#customerBalanceAfter') && ($('#customerBalanceAfter').textContent=money(Math.max(0,currentBalance-allocated)));
  }
  function renderCustomerPaymentHistory(){
    const body=$('#customerPaymentHistoryBody'); if(!body) return;
    const data=db(); const customer=$('#customerPaymentCustomer')?.value || '';
    body.innerHTML=data.customerPayments.filter(p=>p.customer===customer).map(p=>`<tr><td>${safeText(p.no)}</td><td>${safeText(p.date)}</td><td>${money(p.total)}</td><td>${safeText(p.method)}</td><td>${p.allocations.map(a=>safeText(a.invoiceNo)+': '+money(a.amount)).join('<br>')}</td></tr>`).join('') || '<tr><td colspan="5" class="text-center text-muted py-3">No payments recorded yet.</td></tr>';
  }
  function autoAllocateCustomer(){
    let remaining=number($('#customerReceivedTotal')?.value); if(remaining<=0) return toast('Enter received amount first','warning');
    $$('[data-customer-apply]').forEach(input=>{ const max=number(input.max); const apply=Math.min(max,remaining); input.value=apply||0; remaining-=apply; });
    updateCustomerPaymentSummary();
  }
  function saveCustomerPayment(){
    const data=db(); const customer=$('#customerPaymentCustomer')?.value || '';
    const allocations=[];
    $$('[data-customer-apply]').forEach(input=>{
      const amount=number(input.value); if(amount<=0) return;
      const inv=data.customerCreditInvoices.find(i=>i.no===input.dataset.customerApply && isPayableCustomerInvoiceRow(i)); if(!inv) return;
      const applied=Math.min(amount,balance(inv));
      if(applied>0){
        inv.paid=number(inv.paid)+applied; inv.balance=Math.max(0,number(inv.total)-number(inv.paid)); inv.status=inv.balance>0?'Partially Paid':'Closed';
        const saved=(data.invoices||[]).find(x=>String(x.no||x.invoiceNo||x.id)===String(inv.no));
        if(saved){ saved.paid=Math.min(number(saved.total||saved.amount), number(saved.paid)+applied); saved.balance=Math.max(0,number(saved.total||saved.amount)-number(saved.paid)); saved.status=saved.balance<=0?'Paid':'Partially Paid'; }
        allocations.push({invoiceNo:inv.no,amount:applied});
      }
    });
    const total=allocations.reduce((a,x)=>a+x.amount,0); if(total<=0) return toast('Allocate payment to at least one invoice','warning');
    const payment={no:receiptNo('REC',data.customerPayments.length),customer,date:$('#customerPaymentDate')?.value||new Date().toISOString().slice(0,10),method:$('#customerPaymentMethod')?.value||'Cash',account:$('#customerPaymentAccount')?.value||'Cash Account',ref:$('#customerPaymentRef')?.value||'',total,allocations};
    data.customerPayments.unshift(payment); data.activity.unshift(`${payment.no} received from ${customer} for ${money(total)}`); updateCustomerBalances(data); save(data);
    renderCustomers(); renderCustomerPayments(); renderInvoices(); toast(`${payment.no} saved. Customer balance updated.`);
  }

  function renderSupplierPayments(){
    const body=$('#supplierPaymentBillsBody'); if(!body) return;
    const data=db(); const supplier=$('#supplierPaymentSupplier')?.value || '';
    const rows=data.supplierBills.filter(b=>b.supplier===supplier && balance(b)>0);
    body.innerHTML=rows.map(b=>`<tr data-bill="${b.no}"><td><input class="form-check-input" type="checkbox" data-supplier-check checked></td><td><strong>${b.no}</strong><br><small class="text-muted">${b.date}</small></td><td>${b.due}</td><td>${money(b.total)}</td><td>${money(b.paid)}</td><td>${money(balance(b))}</td><td><input class="form-control form-control-sm allocation-input" data-supplier-apply="${b.no}" type="number" min="0" max="${balance(b)}" value="0"></td></tr>`).join('') || '<tr><td colspan="7" class="text-center text-muted py-4">No open purchase invoices for this supplier.</td></tr>';
    renderSupplierPaymentHistory(); updateSupplierPaymentSummary(); updateSupplierBalancesUI(data);
  }
  function updateSupplierPaymentSummary(){
    const data=db(); const supplier=$('#supplierPaymentSupplier')?.value || '';
    const currentBalance=data.supplierBills.filter(b=>b.supplier===supplier).reduce((a,b)=>a+balance(b),0);
    const allocated=$$('[data-supplier-apply]').reduce((a,input)=>a+number(input.value),0);
    const paid=number($('#supplierPaidTotal')?.value||allocated);
    $('#supplierCurrentBalance') && ($('#supplierCurrentBalance').textContent=money(currentBalance));
    $('#supplierAllocatedTotal') && ($('#supplierAllocatedTotal').textContent=money(allocated));
    $('#supplierUnallocated') && ($('#supplierUnallocated').textContent=money(Math.max(0,paid-allocated)));
    $('#supplierBalanceAfter') && ($('#supplierBalanceAfter').textContent=money(Math.max(0,currentBalance-allocated)));
  }
  function renderSupplierPaymentHistory(){
    const body=$('#supplierPaymentHistoryBody'); if(!body) return;
    const data=db(); const supplier=$('#supplierPaymentSupplier')?.value || '';
    body.innerHTML=data.supplierPayments.filter(p=>p.supplier===supplier).map(p=>`<tr><td>${p.no}</td><td>${p.date}</td><td>${money(p.total)}</td><td>${p.method}</td><td>${p.allocations.map(a=>a.billNo+': '+money(a.amount)).join('<br>')}</td></tr>`).join('') || '<tr><td colspan="5" class="text-center text-muted py-3">No supplier payments recorded yet.</td></tr>';
  }
  function autoAllocateSupplier(){
    let remaining=number($('#supplierPaidTotal')?.value); if(remaining<=0) return toast('Enter paid amount first','warning');
    $$('[data-supplier-apply]').forEach(input=>{ const max=number(input.max); const apply=Math.min(max,remaining); input.value=apply||0; remaining-=apply; });
    updateSupplierPaymentSummary();
  }
  function saveSupplierPayment(){
    const data=db(); const supplier=$('#supplierPaymentSupplier')?.value || '';
    const allocations=[];
    $$('[data-supplier-apply]').forEach(input=>{
      const amount=number(input.value); if(amount<=0) return;
      const bill=data.supplierBills.find(b=>b.no===input.dataset.supplierApply); if(!bill) return;
      const applied=Math.min(amount,balance(bill)); if(applied>0){ bill.paid=number(bill.paid)+applied; allocations.push({billNo:bill.no,amount:applied}); }
    });
    const total=allocations.reduce((a,x)=>a+x.amount,0); if(total<=0) return toast('Allocate payment to at least one purchase invoice','warning');
    const payment={no:receiptNo('SP',data.supplierPayments.length),supplier,date:$('#supplierPaymentDate')?.value||new Date().toISOString().slice(0,10),method:$('#supplierPaymentMethod')?.value||'Bank Transfer',account:$('#supplierPaymentAccount')?.value||'CBQ Bank',ref:$('#supplierPaymentRef')?.value||'',total,allocations};
    data.supplierPayments.unshift(payment); data.activity.unshift(`${payment.no} paid to ${supplier} for ${money(total)}`); save(data);
    renderSupplierPayments(); toast(`${payment.no} saved. Supplier balance updated.`);
  }

  const PRODUCT_SCAN_FIELDS=['sku','barcode','qrCode','code','itemCode','productCode'];
  function productCatalog(){
    const data=db();
    const extra=[{sku:'TN-NC-5L',barcode:'TN-NC-5L',qrCode:'TN-NC-5L',name:'Sample Product',category:'Thinner',price:45,stock:310,status:'In stock'},{sku:'AX-EN-4L',barcode:'AX-EN-4L',qrCode:'AX-EN-4L',name:'Enamel Paint 4L',category:'Industrial',price:88,stock:54,status:'In stock'}];
    const byKey={};
    (data.products||[]).concat(extra).forEach(product=>{
      if(!product || product.deleted===true) return;
      const key=String(product.sku||product.barcode||product.qrCode||product.code||product.itemCode||product.productCode||product.name||'').trim().toLowerCase();
      if(key) byKey[key]=product;
    });
    return Object.values(byKey);
  }
  function cleanScanCode(value){ return String(value??'').trim(); }
  function normalizeScanCode(value){ return cleanScanCode(value).toLowerCase(); }
  function uniqueScanCodes(values){
    const seen=new Set();
    return (values||[]).map(cleanScanCode).filter(v=>{ const key=normalizeScanCode(v); if(!key || seen.has(key)) return false; seen.add(key); return true; });
  }
  function extractScanCodes(raw){
    const source=cleanScanCode(raw);
    const values=[];
    if(source) values.push(source);
    try{
      const parsed=JSON.parse(source);
      if(parsed && typeof parsed==='object'){
        PRODUCT_SCAN_FIELDS.concat(['value','id']).forEach(field=>{ if(parsed[field]!==undefined) values.push(parsed[field]); });
        if(parsed.product && typeof parsed.product==='object') PRODUCT_SCAN_FIELDS.forEach(field=>{ if(parsed.product[field]!==undefined) values.push(parsed.product[field]); });
      }
    }catch(e){}
    const pairRe=/(?:^|[\s,;|{"'])(sku|barcode|qrCode|code|itemCode|productCode)\s*[:=]\s*([^\s,;|}"']+)/ig;
    let pair;
    while((pair=pairRe.exec(source))) values.push(pair[2]);
    try{
      const url=source.includes('://') ? new URL(source) : null;
      if(url) PRODUCT_SCAN_FIELDS.forEach(field=>{ const v=url.searchParams.get(field); if(v) values.push(v); });
    }catch(e){}
    return uniqueScanCodes(values);
  }
  function productScanText(product){ return PRODUCT_SCAN_FIELDS.concat(['name','category','brand']).map(field=>String(product?.[field]??'')).join(' '); }
  function findProduct(query){
    const codes=extractScanCodes(query);
    if(!codes.length) return null;
    const list=productCatalog();
    for(const code of codes){
      const q=normalizeScanCode(code);
      const exact=list.find(product=>PRODUCT_SCAN_FIELDS.some(field=>normalizeScanCode(product?.[field])===q));
      if(exact) return exact;
    }
    for(const code of codes){
      const q=normalizeScanCode(code);
      const nameExact=list.find(product=>normalizeScanCode(product?.name)===q || normalizeScanCode(product?.productName)===q || normalizeScanCode(product?.product)===q);
      if(nameExact) return nameExact;
    }
    for(const code of codes){
      const q=normalizeScanCode(code);
      if(q.length<3) continue;
      const partial=list.filter(product=>productScanText(product).toLowerCase().includes(q));
      if(partial.length===1) return partial[0];
    }
    return null;
  }
  function productIconClass(p){
    const text=`${p?.category||''} ${p?.name||''}`.toLowerCase();
    if(text.includes('clear')) return 'bi bi-bucket';
    if(text.includes('thinner') || text.includes('fuel')) return 'bi bi-fuel-pump';
    if(text.includes('primer') || text.includes('industrial')) return 'bi bi-paint-bucket';
    return 'bi bi-droplet';
  }
  function renderNewSaleProductGrid(term=''){
    const grid=$('#newSaleProductGrid');
    if(!grid) return;
    const q=String(term||'').trim().toLowerCase();
    const list=productCatalog().filter(p=>!q || `${p.sku||''} ${p.barcode||''} ${p.qrCode||''} ${p.code||''} ${p.itemCode||''} ${p.productCode||''} ${p.name||''} ${p.category||''}`.toLowerCase().includes(q));
    grid.innerHTML=list.map(p=>`<div class="col-md-4"><div class="pos-product"><div class="pos-img"><i class="${productIconClass(p)}"></i></div><strong>${safeText(p.name)}</strong><small class="text-muted">SKU ${safeText(p.sku||'-')}${p.barcode?` • ${safeText(p.barcode)}`:''}</small><div class="d-flex justify-content-between"><span class="fw-bold">${money(p.price)}</span><button class="btn btn-sm btn-brand" data-add-cart data-sku="${safeText(p.sku||'')}" data-name="${safeText(p.name)}" data-price="${number(p.price)}">Add</button></div></div></div>`).join('') || '<div class="col-12"><div class="text-muted text-center py-4">No product found.</div></div>';
  }
  function getCart(){ try{ const raw=sessionStorage.getItem(CART); return raw===null ? [] : applyCurrentTaxRateToCart(JSON.parse(raw)||[]); }catch(e){return[]} }
  function setCart(cart){ sessionStorage.setItem(CART,JSON.stringify(applyCurrentTaxRateToCart(cart||[]))); renderCart(); }
  function addSaleItem(query,source='manual'){
    const p=findProduct(query);
    if(!p){ toast(source==='scan'?`Product not found for scanned code: ${cleanScanCode(query)}`:'Product not found in demo list','warning'); return false; }
    const itemName=itemDisplayName(p);
    let cart=getCart(); const found=cart.find(x=>(x.sku&&p.sku&&String(x.sku)===String(p.sku)) || (x.barcode&&p.barcode&&String(x.barcode)===String(p.barcode)) || (x.qrCode&&p.qrCode&&String(x.qrCode)===String(p.qrCode)) || x.name===itemName);
    if(found) found.qty=number(found.qty)+1; else cart.push({sku:p.sku||'',barcode:p.barcode||'',qrCode:p.qrCode||'',code:p.code||'',itemCode:p.itemCode||'',productCode:p.productCode||'',brand:p.brand||'',category:p.category||'',name:itemName,product:itemName,productName:itemName,itemName:itemName,description:itemName,price:number(p.price),rate:number(p.price),qty:1,discount:0,taxRate:getDefaultTaxRate()});
    setCart(cart); toast(source==='scan'?`Product added: ${itemName}`:`${itemName} added to cart`); return true;
  }

  const salesScannerState={stream:null,raf:null,detector:null,scanning:false,lastCode:'',lastAt:0,modal:null};
  function setSalesScannerStatus(message,type='muted'){
    const el=$('#salesScannerStatus');
    if(el){ el.className=`alert py-2 mb-0 alert-${type==='success'?'success':type==='warning'?'warning':type==='danger'?'danger':'secondary'}`; el.textContent=message; }
  }
  function ensureSalesScannerModal(){
    if($('#salesScannerModal')) return;
    document.body.insertAdjacentHTML('beforeend',`<div class="modal fade" id="salesScannerModal" tabindex="-1" aria-hidden="true"><div class="modal-dialog modal-dialog-centered modal-lg axtor-scanner-dialog"><div class="modal-content cardx"><div class="modal-header"><h5 class="modal-title fw-bold"><i class="bi bi-qr-code-scan me-2 text-brand"></i>Scan Product QR / Barcode</h5><button class="btn-close" type="button" data-bs-dismiss="modal" aria-label="Close"></button></div><div class="modal-body"><div class="axtor-scanner-preview mb-3"><video id="salesScannerVideo" class="axtor-scanner-video" autoplay muted playsinline></video><div class="axtor-scanner-frame" aria-hidden="true"></div></div><div id="salesScannerStatus" class="alert alert-secondary py-2 mb-3">Allow camera permission to scan product code.</div><label class="form-label fw-semibold" for="salesScannerManualInput">Enter SKU / Barcode manually</label><div class="input-group axtor-scanner-manual mb-3"><span class="input-group-text"><i class="bi bi-upc-scan"></i></span><input id="salesScannerManualInput" class="form-control" placeholder="Enter SKU / Barcode manually" autocomplete="off"><button id="salesScannerManualAdd" class="btn btn-brand" type="button">Add Manually</button></div><div class="axtor-scanner-actions"><button id="salesScannerStart" class="btn btn-brand" type="button"><i class="bi bi-camera-video me-1"></i>Start Camera</button><button id="salesScannerStop" class="btn btn-soft" type="button"><i class="bi bi-camera-video-off me-1"></i>Stop Camera</button><button class="btn btn-soft" type="button" data-bs-dismiss="modal">Close</button></div><small class="text-muted d-block mt-3">Camera scan works on HTTPS/localhost when the browser supports BarcodeDetector. Manual SKU/barcode entry always works.</small></div></div></div></div>`);
    $('#salesScannerStart')?.addEventListener('click',startSalesScannerCamera);
    $('#salesScannerStop')?.addEventListener('click',stopSalesScannerCamera);
    $('#salesScannerManualAdd')?.addEventListener('click',addSalesScannerManualCode);
    $('#salesScannerManualInput')?.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); addSalesScannerManualCode(); } });
    $('#salesScannerModal')?.addEventListener('hidden.bs.modal',stopSalesScannerCamera);
  }
  function openSalesScanner(){
    ensureSalesScannerModal();
    $('#salesScannerManualInput') && ($('#salesScannerManualInput').value='');
    setSalesScannerStatus('Allow camera permission to scan product code.');
    salesScannerState.modal=window.bootstrap?.Modal?.getOrCreateInstance($('#salesScannerModal'));
    salesScannerState.modal?.show();
    if(!('BarcodeDetector' in window)){
      setSalesScannerStatus('Camera scanner is not supported on this browser. Use manual SKU/barcode entry.','warning');
      setTimeout(()=>$('#salesScannerManualInput')?.focus(),200);
      return;
    }
    if(!navigator.mediaDevices?.getUserMedia){
      setSalesScannerStatus('Camera is not available in this browser. Use manual SKU/barcode entry.','warning');
      setTimeout(()=>$('#salesScannerManualInput')?.focus(),200);
      return;
    }
    setTimeout(startSalesScannerCamera,250);
  }
  async function startSalesScannerCamera(){
    ensureSalesScannerModal();
    if(salesScannerState.scanning) return;
    if(!('BarcodeDetector' in window)){
      setSalesScannerStatus('Camera scanner is not supported on this browser. Use manual SKU/barcode entry.','warning');
      return;
    }
    if(!navigator.mediaDevices?.getUserMedia){
      setSalesScannerStatus('Camera is not available in this browser. Use manual SKU/barcode entry.','warning');
      return;
    }
    const video=$('#salesScannerVideo');
    if(!video) return;
    try{
      setSalesScannerStatus('Scanning...');
      try{ salesScannerState.detector=new BarcodeDetector({formats:['qr_code','code_128','code_39','ean_13','ean_8','upc_a','upc_e','itf','codabar','data_matrix','pdf417']}); }
      catch(e){ salesScannerState.detector=new BarcodeDetector(); }
      salesScannerState.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
      video.srcObject=salesScannerState.stream;
      await video.play();
      salesScannerState.scanning=true;
      scanSalesCameraFrame();
    }catch(err){
      stopSalesScannerCamera();
      const denied=String(err?.name||'').toLowerCase().includes('denied') || String(err?.name||'').toLowerCase().includes('notallowed') || String(err?.message||'').toLowerCase().includes('permission');
      setSalesScannerStatus(denied?'Camera permission denied. You can enter SKU/barcode manually.':'Camera scanner could not start. Use manual SKU/barcode entry.','warning');
      $('#salesScannerManualInput')?.focus();
    }
  }
  function stopSalesScannerCamera(){
    salesScannerState.scanning=false;
    if(salesScannerState.raf) cancelAnimationFrame(salesScannerState.raf);
    salesScannerState.raf=null;
    if(salesScannerState.stream){ salesScannerState.stream.getTracks().forEach(track=>track.stop()); }
    salesScannerState.stream=null;
    const video=$('#salesScannerVideo');
    if(video){ video.pause(); video.srcObject=null; }
  }
  function handleScannedProductCode(raw){
    const scanned=cleanScanCode(extractScanCodes(raw)[0]||raw);
    const now=Date.now();
    if(scanned && salesScannerState.lastCode===scanned && now-salesScannerState.lastAt<1800) return false;
    salesScannerState.lastCode=scanned; salesScannerState.lastAt=now;
    const product=findProduct(raw);
    if(!product){
      setSalesScannerStatus(`Product not found for scanned code: ${scanned || cleanScanCode(raw)}`,'warning');
      toast(`Product not found for scanned code: ${scanned || cleanScanCode(raw)}`,'warning');
      return false;
    }
    const name=itemDisplayName(product);
    addSaleItem(raw,'scan');
    setSalesScannerStatus(`Product found: ${name}`,'success');
    stopSalesScannerCamera();
    setTimeout(()=>salesScannerState.modal?.hide(),550);
    return true;
  }
  function scanSalesCameraFrame(){
    if(!salesScannerState.scanning) return;
    const video=$('#salesScannerVideo');
    if(!video || !salesScannerState.detector){ salesScannerState.raf=requestAnimationFrame(scanSalesCameraFrame); return; }
    salesScannerState.detector.detect(video).then(codes=>{
      const raw=codes?.[0]?.rawValue || codes?.[0]?.rawData || '';
      if(raw) handleScannedProductCode(raw);
      if(salesScannerState.scanning) salesScannerState.raf=requestAnimationFrame(scanSalesCameraFrame);
    }).catch(()=>{ if(salesScannerState.scanning) salesScannerState.raf=requestAnimationFrame(scanSalesCameraFrame); });
  }
  function addSalesScannerManualCode(){
    const input=$('#salesScannerManualInput');
    const code=cleanScanCode(input?.value);
    if(!code){ setSalesScannerStatus('Enter SKU / Barcode manually.','warning'); input?.focus(); return; }
    if(addSaleItem(code,'scan')){
      const product=findProduct(code);
      setSalesScannerStatus(`Product found: ${itemDisplayName(product)}`,'success');
      stopSalesScannerCamera();
      input.value='';
      salesScannerState.modal?.hide();
    } else {
      setSalesScannerStatus(`Product not found for scanned code: ${code}`,'warning');
      input?.select();
    }
  }
  function initSalesScanner(){
    if(!$('#newSaleProductSearch')) return;
    ensureSalesScannerModal();
    $('#newSaleScanBtn')?.addEventListener('click',e=>{ e.preventDefault(); openSalesScanner(); });
  }
  function cartTotals(cart=getCart()){
    const sub=cart.reduce((a,x)=>a+(number(x.qty)*number(x.price ?? x.rate)),0);
    const discount=cart.reduce((a,x)=>a+number(x.discount),0);
    const tax=cart.reduce((a,x)=>{ const base=Math.max(0,(number(x.qty)*number(x.price ?? x.rate))-number(x.discount)); const rate=getDefaultTaxRate(); return a+(base*(rate/100)); },0);
    const total=Math.max(0,sub-discount)+tax;
    return {sub,discount,tax,total};
  }
  function renderCart(){
    const body=$('#posCartBody'); if(!body) return;
    let cart=getCart();
    const editing=!!getEditingInvoiceNo();
    const table=body.closest('table'); const head=table?.querySelector('thead tr');
    if(head) head.innerHTML=editing?'<th>Item</th><th>Qty</th><th>Rate</th><th>Discount</th><th>Total</th><th></th>':'<th>Item</th><th>Qty</th><th>Total</th>';
    body.innerHTML=cart.map((x,i)=>{ const itemName=itemDisplayName(x); const qty=number(x.qty)||1; const price=number(x.price ?? x.rate); const disc=number(x.discount); const taxRate=getDefaultTaxRate(); const taxable=Math.max(0,(qty*price)-disc); const lineTotal=taxable+(taxable*(taxRate/100)); return editing
      ? `<tr><td>${safeText(itemName)}${x.sku?`<br><small class="text-muted mono">${safeText(x.sku)}</small>`:''}</td><td><input class="form-control form-control-sm text-center" type="number" min="0" step="1" data-cart-qty-input="${i}" value="${qty}" style="width:76px"></td><td><input class="form-control form-control-sm" type="number" min="0" step="0.01" data-cart-price-input="${i}" value="${price}" style="width:96px"></td><td><input class="form-control form-control-sm" type="number" min="0" step="0.01" data-cart-discount-input="${i}" value="${disc}" style="width:96px"></td><td class="fw-semibold">${money(lineTotal)}</td><td><button class="btn btn-sm btn-soft text-danger" type="button" data-cart-remove="${i}"><i class="bi bi-x-lg"></i></button></td></tr>`
      : `<tr><td>${safeText(itemName)}${x.sku?`<br><small class="text-muted mono">${safeText(x.sku)}</small>`:''}</td><td><button class="btn btn-sm btn-soft" data-cart-minus="${i}">−</button> <span class="mx-1">${qty}</span> <button class="btn btn-sm btn-soft" data-cart-plus="${i}">+</button></td><td>${money(qty*price)}</td></tr>`; }).join('') || `<tr><td colspan="${editing?6:3}" class="text-muted">Cart is empty. Scan SKU or add product.</td></tr>`;
    const t=cartTotals(cart);
    updateTaxLabels();
    $('#posSubtotal') && ($('#posSubtotal').textContent=money(t.sub)); $('#posTax') && ($('#posTax').textContent=money(t.tax)); $('#posTotal') && ($('#posTotal').textContent=money(t.total)); $('[data-payment-total]') && ($('[data-payment-total]').textContent=money(t.total));
    updateEditModeUi();
  }

  function salesmanName(id){ const sm=(db().salesmen||[]).find(s=>s.id===id); return sm?sm.name:''; }
  function populateSalesmanDropdown(){
    const opts=['<option value="">— No Salesman Assigned —</option>'].concat((db().salesmen||[]).filter(s=>s.active).map(s=>`<option value="${safeText(s.id)}">${safeText(s.name)}${s.branch?' — '+safeText(s.branch):''}</option>`)).join('');
    ['newSaleSalesmanId'].forEach(id=>{ const el=$('#'+id); if(el){ const current=el.value; el.innerHTML=opts; const resume=localStorage.getItem('axtorResumeSalesmanId'); const editNo=getEditingInvoiceNo() || new URLSearchParams(location.search).get('edit'); const inv=editNo?findInvoiceByNo(editNo):null; if(resume){ el.value=resume; localStorage.removeItem('axtorResumeSalesmanId'); } else if(current){ el.value=current; } else if(inv?.salesmanId){ el.value=inv.salesmanId; } } });
  }
  function updateNewSaleSalesmanSummary(){ const id=$('#newSaleSalesmanId')?.value||''; const sm=salesmanName(id); const row=$('#posSalesmanSummary'); if(row) row.innerHTML=sm?`<div class="d-flex justify-content-between"><span>Salesman</span><strong><i class="bi bi-person-badge me-1 text-brand"></i>${sm}</strong></div>`:''; }

  function saveDraftInvoice(){
    if(getEditingInvoiceNo()) return toast('Update or cancel the current invoice edit before saving a new draft.','warning');
    const cart=getCart(); if(!cart.length) return toast('Cart is empty. Add items before saving draft.','warning');
    const totals=cartTotals(cart); const data=db(); data.invoices=data.invoices||[];
    const resumedDraft=sessionStorage.getItem('axtorResumingDraftNo');
    if(resumedDraft){
      const draftIndex=data.invoices.findIndex(x=>String(x.no||x.invoiceNo||x.id)===String(resumedDraft) && String(x.status||'').toLowerCase()==='draft');
      if(draftIndex>=0) data.invoices.splice(draftIndex,1);
      sessionStorage.removeItem('axtorResumingDraftNo');
    }
    let no='DRAFT-'+Date.now().toString().slice(-6);
    while(data.invoices.some(x=>x.no===no)) no='DRAFT-'+Math.floor(1000+Math.random()*9000);
    const salesmanId=$('#newSaleSalesmanId')?.value||'';
    const lpoNo=String($('#newSaleLpoNo')?.value||'').trim();
    const documentType=selectedDocumentType(); const meta=docMeta(documentType);
    const customer=$('#newSaleCustomer')?.value||sessionStorage.getItem(EDIT_CUSTOMER_KEY)||'Walk-in Customer'; const paymentMethod=$('#newSalePaymentMethod')?.value||sessionStorage.getItem(EDIT_PAYMENT_KEY)||'Cash'; const draft={id:no,no,invoiceNo:no,documentNo:no,documentType,documentPrefix:meta.prefix,lpoNo,customerLpoNo:lpoNo,customerPoNo:lpoNo,poNo:lpoNo,customerId:'',customerName:customer,customer,date:new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),amount:totals.total,total:totals.total,subtotal:totals.sub,discount:totals.discount,tax:totals.tax,salesmanId,paymentMethod,paymentType:paymentMethod,paymentStatus:'draft',stockStatus:'not_deducted',status:'Draft',draftItems:cart.map(x=>({sku:x.sku||'',name:itemDisplayName(x),product:itemDisplayName(x),productName:itemDisplayName(x),itemName:itemDisplayName(x),description:itemDisplayName(x),qty:number(x.qty),price:number(x.price),rate:number(x.price),discount:number(x.discount),taxRate:getDefaultTaxRate()}))};
    data.invoices.unshift(draft); data.activity=data.activity||[]; data.activity.unshift(`${no} draft saved for ${money(totals.total)}${salesmanId?' by '+salesmanName(salesmanId):''}`); save(data); renderInvoices(); toast(`${no} saved as draft`);
  }
  function resumeDraft(no){
    clearInvoiceEditMode(false);
    const inv=(db().invoices||[]).find(x=>x.no===no && String(x.status).toLowerCase()==='draft');
    if(!inv){ toast('Draft invoice not found','warning'); return; }
    const items=(inv.draftItems||inv.items||[]).map(x=>{ const itemName=itemDisplayName(x); return {sku:x.sku||'',name:itemName,product:itemName,productName:itemName,itemName:itemName,description:itemName,qty:number(x.qty)||1,price:number(x.price||x.rate)}; });
    sessionStorage.setItem(CART,JSON.stringify(items));
    sessionStorage.setItem('axtorResumingDraftNo', no);
    sessionStorage.setItem(EDIT_CUSTOMER_KEY, inv.customer||'Walk-in Customer');
    sessionStorage.setItem(EDIT_PAYMENT_KEY, inv.paymentMethod||inv.paymentType||'Cash');
    if(inv.salesmanId) localStorage.setItem('axtorResumeSalesmanId', inv.salesmanId);
    if(location.pathname.split('/').pop()==='sales.html' || location.pathname.split('/').pop()===''){
      if($('#newSaleSalesmanId') && inv.salesmanId){ $('#newSaleSalesmanId').value=inv.salesmanId; updateNewSaleSalesmanSummary(); }
      renderCart();
      populateNewSaleMetaControls(inv);
      if(location.hash!=='#new-sale') history.pushState(null,'','#new-sale');
      if(window.AxtorActivateHash) window.AxtorActivateHash();
      toast('Draft resumed');
    } else {
      location.href='sales.html#new-sale';
    }
  }

  function updatePaymentModalTotals(force=false){
    const total=cartTotals(getCart()).total;
    const totalEl=$('[data-payment-total]'); if(totalEl) totalEl.textContent=money(total);
    const method=$('#paymentModalMethod'); const amount=$('#paymentModalAmount'); const bal=$('#paymentModalBalance');
    if(method && $('#newSalePaymentMethod') && !force) method.value=$('#newSalePaymentMethod').value || method.value || 'Cash';
    if(amount && String(method?.value||'').toLowerCase().includes('credit')) amount.value='0.00';
    else if(amount && amount.value==='') amount.value='0.00';
    const paid=String(method?.value||'').toLowerCase().includes('credit') ? 0 : Math.min(total, number(amount?.value));
    if(bal) bal.textContent=money(Math.max(0,total-paid));
  }
  function readNewSalePayment(totals, oldInv={}){
    const modalMethod=$('#paymentModalMethod')?.value;
    const pageMethod=$('#newSalePaymentMethod')?.value || sessionStorage.getItem(EDIT_PAYMENT_KEY);
    const creditChecked=!!$('#paymentModalCustomerCredit')?.checked;
    const baseMethod=modalMethod || pageMethod || oldInv.paymentMethod || oldInv.paymentType || 'Cash';
    const isFullCredit=String(baseMethod).toLowerCase().includes('credit');
    const rawAmount=$('#paymentModalAmount')?.value;
    const amountEntered=rawAmount===''||rawAmount===undefined ? totals.total : number(rawAmount);
    const paid=isFullCredit ? 0 : Math.min(totals.total, Math.max(0, amountEntered));
    const balanceDue=Math.max(0, totals.total-paid);
    const paymentMethod=(creditChecked && balanceDue>0 && !isFullCredit) ? `${baseMethod} / Customer credit` : baseMethod;
    const status=balanceDue<=0?'Paid':(paid>0?'Partially Paid':'Credit');
    return {paymentMethod, paymentType:paymentMethod, paid, balance:balanceDue, customerCreditApplied:creditChecked && balanceDue>0, creditAmount:(creditChecked||isFullCredit)?balanceDue:0, status, reference:$('#paymentModalReference')?.value||oldInv.reference||'', account:$('#paymentModalAccount')?.value||oldInv.account||''};
  }

  function initCart(){
    renderNewSaleProductGrid();
    initSalesScanner();
    document.addEventListener('click',e=>{
      const addBtn=e.target.closest('[data-add-cart]');
      if(addBtn){ e.preventDefault(); const key=addBtn.dataset.sku || addBtn.dataset.barcode || addBtn.dataset.name; if(!addSaleItem(key)){ const name=addBtn.dataset.name, price=number(addBtn.dataset.price); let cart=getCart(); const found=cart.find(x=>x.name===name); found?found.qty++:cart.push({name,product:name,productName:name,itemName:name,description:name,price,rate:price,qty:1,discount:0,taxRate:getDefaultTaxRate()}); setCart(cart); toast(`${name} added to cart`); } return; }
      const plus=e.target.closest('[data-cart-plus]'), minus=e.target.closest('[data-cart-minus]');
      if(plus||minus){ let cart=getCart(); const i=Number((plus||minus).dataset.cartPlus ?? (plus||minus).dataset.cartMinus); if(!cart[i]) return; if(plus) cart[i].qty=number(cart[i].qty)+1; if(minus){ cart[i].qty=number(cart[i].qty)-1; if(cart[i].qty<=0) cart.splice(i,1); } setCart(cart); return; }
      const remove=e.target.closest('[data-cart-remove]');
      if(remove){ let cart=getCart(); const i=Number(remove.dataset.cartRemove); if(cart[i]){ cart.splice(i,1); setCart(cart); } return; }
      const cancel=e.target.closest('[data-cancel-invoice-edit]');
      if(cancel){ e.preventDefault(); clearInvoiceEditMode(true); if($('#newSaleSalesmanId')) $('#newSaleSalesmanId').value=''; if($('#newSaleCustomer')) $('#newSaleCustomer').value='Walk-in Customer'; updateNewSaleSalesmanSummary(); renderCart(); toast('Invoice edit cancelled'); return; }
      const edit=e.target.closest('[data-edit-invoice]');
      if(edit){ e.preventDefault(); startInvoiceEdit(edit.dataset.editInvoice); return; }
      const resume=e.target.closest('[data-resume-draft]'); if(resume){ e.preventDefault(); resumeDraft(resume.dataset.resumeDraft); return; }
      const deleteDraft=e.target.closest('[data-delete-draft]'); if(deleteDraft){ e.preventDefault(); const no=deleteDraft.dataset.deleteDraft; if(!confirm(`Delete draft ${no}? This cannot be undone.`)) return; const data=db(); const idx=(data.invoices||[]).findIndex(x=>String(x.no||x.invoiceNo||x.id)===String(no) && (String(x.status||'').toLowerCase()==='draft' || String(x.no||'').startsWith('DRAFT'))); if(idx<0) return toast('Draft invoice not found','warning'); data.invoices.splice(idx,1); if(sessionStorage.getItem('axtorResumingDraftNo')===no) sessionStorage.removeItem('axtorResumingDraftNo'); save(data); renderInvoices(); toast(`${no} deleted`); return; }
      const view=e.target.closest('[data-view-invoice]'); if(view){ e.preventDefault(); openSavedInvoice(view.dataset.viewInvoice,false); return; }
      const print=e.target.closest('[data-print-invoice]'); if(print){ e.preventDefault(); openSavedInvoice(print.dataset.printInvoice,true); return; }
    });
    document.addEventListener('change',e=>{
      const qty=e.target.closest('[data-cart-qty-input]'), price=e.target.closest('[data-cart-price-input]'), disc=e.target.closest('[data-cart-discount-input]');
      if(qty||price||disc){ const input=qty||price||disc; let cart=getCart(); const i=Number(input.dataset.cartQtyInput ?? input.dataset.cartPriceInput ?? input.dataset.cartDiscountInput); if(!cart[i]) return; if(qty) cart[i].qty=Math.max(0,number(input.value)); if(price){ cart[i].price=Math.max(0,number(input.value)); cart[i].rate=cart[i].price; } if(disc) cart[i].discount=Math.max(0,number(input.value)); if(number(cart[i].qty)<=0) cart.splice(i,1); setCart(cart); }
      if(e.target.matches('#newSaleCustomer')) sessionStorage.setItem(EDIT_CUSTOMER_KEY,e.target.value||'Walk-in Customer');
      if(e.target.matches('#newSalePaymentMethod')) sessionStorage.setItem(EDIT_PAYMENT_KEY,e.target.value||'Cash');
      if(e.target.matches('#newSaleDocumentType')) updateEditModeUi();
    });
    $('#newSaleProductSearch')?.addEventListener('input',e=>renderNewSaleProductGrid(e.currentTarget.value));
    $('#newSaleProductSearch')?.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); const input=e.currentTarget; if(addSaleItem(input.value.trim())){ input.value=''; renderNewSaleProductGrid(); } }});
    $('#paymentModal')?.addEventListener('show.bs.modal',()=>updatePaymentModalTotals(true));
    $('#paymentModalMethod')?.addEventListener('change',()=>{ if($('#newSalePaymentMethod')) $('#newSalePaymentMethod').value=$('#paymentModalMethod').value; updatePaymentModalTotals(true); });
    $('#paymentModalAmount')?.addEventListener('input',()=>updatePaymentModalTotals(false));
    $('#paymentModalCustomerCredit')?.addEventListener('change',()=>updatePaymentModalTotals(false));
    $('#saveDraftBtn')?.addEventListener('click',saveDraftInvoice);
    $('#completeSaleBtn')?.addEventListener('click',()=>{
      const cart=getCart(); if(!cart.length) return toast('Cart is empty','warning');
      const totals=cartTotals(cart); const data=db(); data.invoices=data.invoices||[]; data.activity=data.activity||[];
      const editingNo=getEditingInvoiceNo(); const existingIndex=editingNo?data.invoices.findIndex(x=>String(x.no||x.invoiceNo||x.id)===String(editingNo)):-1;
      if(editingNo && existingIndex<0){ toast('Cannot update. Original invoice was not found.','warning'); return; }
      const oldInv=editingNo?data.invoices[existingIndex]:{};
      const documentType=editingNo ? normalizeDocumentType(oldInv.documentType) : selectedDocumentType();
      const meta=docMeta(documentType);
      const no=editingNo || reserveSalesDocumentNumber(data, documentType);
      const salesmanId=$('#newSaleSalesmanId')?.value||oldInv.salesmanId||'';
      const customer=$('#newSaleCustomer')?.value||sessionStorage.getItem(EDIT_CUSTOMER_KEY)||oldInv.customer||'Walk-in Customer';
      const lpoNo=String($('#newSaleLpoNo')?.value||lpoValue(oldInv)||'').trim();
      let pay=readNewSalePayment(totals, oldInv);
      if(documentType!=='invoice') pay={paymentMethod:'Not applicable',paymentType:'Not applicable',paid:0,balance:totals.total,status:'Issued',reference:'',account:''};
      const invoice={...oldInv,id:oldInv.id||no,no,invoiceNo:no,documentNo:no,documentType,documentPrefix:meta.prefix,lpoNo,customerLpoNo:lpoNo,customerPoNo:lpoNo,poNo:lpoNo,customerId:oldInv.customerId||'',customerName:customer,customer,date:oldInv.date||new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}),time:oldInv.time||new Date().toLocaleTimeString(),createdAt:oldInv.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),amount:totals.total,total:totals.total,subtotal:totals.sub,discount:totals.discount,tax:totals.tax,grand:totals.total,paid:pay.paid,balance:pay.balance,creditAmount:pay.creditAmount||0,customerCreditApplied:!!pay.customerCreditApplied,salesmanId,salesman:salesmanName(salesmanId),status:pay.status,paymentStatus:documentType==='invoice'?pay.status:'not_applicable',stockStatus:documentType==='invoice'?'deducted':'not_deducted',paymentType:pay.paymentType,paymentMethod:pay.paymentMethod,reference:pay.reference,account:pay.account,items:buildInvoiceItemsFromCart(cart)};
      delete invoice.draftItems;
      const stockData=deepClone(data);
      let stockResult;
      if(documentType==='invoice'){
        if(editingNo){ reverseInvoiceStock(stockData, oldInv, 'edit-reversal'); stockResult=applyInvoiceStock(stockData, invoice, 'edit-new'); }
        else { stockResult=applyInvoiceStock(stockData, invoice, 'sale'); }
      } else { stockResult={ok:true}; }
      if(!stockResult.ok){ toast(stockResult.message||'Insufficient stock','warning'); return; }
      if(documentType==='invoice'){ data.products=stockData.products; data.stockMovements=stockData.stockMovements; syncCustomerReceivable(data, invoice); }
      updateCustomerBalances(data);
      const resumedDraft=sessionStorage.getItem('axtorResumingDraftNo');
      if(editingNo){
        data.invoices[existingIndex]=invoice;
        data.activity.unshift(`${no} ${meta.label} updated for ${money(totals.total)}${salesmanId?' by '+salesmanName(salesmanId):''}`);
        save(data); audit(`${meta.label} ${no} updated${salesmanId?' with salesman '+salesmanName(salesmanId):''}`,'bi-pencil-square'); clearInvoiceEditMode(false); sessionStorage.setItem(CART,'[]');
        if($('#newSaleSalesmanId')) $('#newSaleSalesmanId').value=''; updateNewSaleSalesmanSummary(); renderCustomers(); renderProducts(); renderCustomerPayments(); renderInvoices(); renderCart(); toast(`${no} updated without duplicate`); if(window.AxtorInvoice && invoiceSettings().autoPreview){ setTimeout(()=>openSavedInvoice(no,false),80); } return;
      }
      if(resumedDraft){ const draftIndex=data.invoices.findIndex(x=>String(x.no||x.invoiceNo||x.id)===String(resumedDraft) && String(x.status||'').toLowerCase()==='draft'); if(draftIndex>=0) data.invoices.splice(draftIndex,1); sessionStorage.removeItem('axtorResumingDraftNo'); }
      data.invoices.unshift(invoice); data.activity.unshift(`${no} ${meta.label} saved for ${money(totals.total)}${salesmanId?' by '+salesmanName(salesmanId):''}`); save(data); audit(`${meta.label} ${no} saved${salesmanId?' with salesman '+salesmanName(salesmanId):''}`,'bi-receipt'); sessionStorage.setItem(CART,'[]'); if($('#newSaleSalesmanId')) $('#newSaleSalesmanId').value=''; if($('#newSaleDocumentType')) $('#newSaleDocumentType').value='invoice'; if($('#newSaleLpoNo')) $('#newSaleLpoNo').value=''; updateNewSaleSalesmanSummary(); renderCustomers(); renderProducts(); renderCustomerPayments(); renderInvoices(); renderCart(); toast(`${no} ${meta.label} saved`); if(window.AxtorInvoice && invoiceSettings().autoPreview){ setTimeout(()=>openSavedInvoice(no,false),80); }
    });
    $('#newSaleSalesmanId')?.addEventListener('change',updateNewSaleSalesmanSummary); ensureNewSaleEditControls(); populateSalesmanDropdown(); populateNewSaleMetaControls(findInvoiceByNo(getEditingInvoiceNo())||{}); updateNewSaleSalesmanSummary(); renderCart(); updateEditModeUi();
  }
  function initCustomerSave(){ const btn=$('#saveCustomerBtn') || $('#add-customer .btn-brand'); if(!btn) return; btn.addEventListener('click',e=>{ e.preventDefault(); e.stopImmediatePropagation(); const pane=$('#add-customer'), inputs=$$('.form-control',pane), type=$('.form-select',pane)?.value||'Retail'; const name=inputs[0]?.value?.trim(); if(!name) return toast('Customer name required','warning'); const opening=number(inputs[3]?.value); const data=db(); const row={name,phone:inputs[1]?.value?.trim()||'-',email:inputs[2]?.value?.trim()||'',type,openingBalance:opening,balance:opening,creditLimit:number(inputs[4]?.value),address:$('textarea',pane)?.value?.trim()||'',status:opening>0?'Due':''}; data.customers=data.customers||[]; const existing=data.customers.findIndex(c=>String(c.name).toLowerCase()===name.toLowerCase()); if(existing>=0) data.customers[existing]={...data.customers[existing],...row}; else data.customers.unshift(row); if(opening>0){ syncCustomerReceivable(data,{no:'OPEN-'+Date.now().toString().slice(-6),customer:name,date:new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}),total:opening,paid:0,balance:opening,status:'Credit',paymentMethod:'Opening balance'}); } updateCustomerBalances(data); save(data); renderCustomers(); toast('Customer saved to localStorage'); }); }
  function initProductSave(){
    const btn=$('#saveProductBtn') || $('#add-product .btn-brand');
    if(!btn) return;
    btn.addEventListener('click',e=>{
      e.preventDefault(); e.stopImmediatePropagation();
      const pane=$('#add-product');
      const inputs=$$('.form-control',pane);
      const name=($('#productNameInput')?.value ?? inputs[0]?.value ?? '').trim();
      if(!name) return toast('Product name required','warning');
      const sku=($('#productSkuInput')?.value ?? inputs[1]?.value ?? '').trim() || 'SKU-'+Date.now().toString().slice(-6);
      const barcode=($('#productBarcodeInput')?.value ?? inputs[2]?.value ?? '').trim();
      const qrCode=($('#productQrCodeInput')?.value ?? '').trim();
      const category=$('#productCategoryInput')?.value || $('.form-select',pane)?.value || 'General';
      const price=number($('#productSalePriceInput')?.value ?? inputs[3]?.value);
      const stock=number($('#productOpeningStockInput')?.value ?? inputs[4]?.value);
      const row={sku,name,barcode,qrCode,category,price,stock,status:stock<=0?'Out of stock':stock<10?'Low':'In stock'};
      const data=db(); data.products=data.products||[];
      const existing=data.products.findIndex(p=>String(p.sku||'').toLowerCase()===String(row.sku).toLowerCase());
      const action=existing>=0?'updated':'saved';
      if(existing>=0) data.products[existing]={...data.products[existing],...row}; else data.products.unshift(row);
      save(data); renderProducts(); renderNewSaleProductGrid($('#newSaleProductSearch')?.value||'');
      toast(`Product ${action}: ${row.name}`);
    });
  }
  function initTaxSettings(){
    const section=$('#tax-settings');
    if(!section) return;
    const rateInput=$('#defaultTaxRateInput') || section.querySelector('input.form-control');
    const enabledInput=$('#taxEnabledInput');
    const modeInput=$('#taxModeInput') || section.querySelector('select.form-select');
    const saveBtn=$('#saveTaxSettingsBtn') || section.querySelector('.btn-brand');
    function load(){
      const s=invoiceSettings();
      if(rateInput) rateInput.value=String(s.taxRate!==undefined?s.taxRate:DEFAULT_TAX_RATE);
      if(enabledInput) enabledInput.checked=s.vatEnabled!==false && s.taxEnabled!==false && s.taxDisabled!==true;
      if(modeInput && s.taxMode) modeInput.value=s.taxMode;
      updateTaxLabels();
    }
    saveBtn?.addEventListener('click',e=>{
      e.preventDefault(); e.stopImmediatePropagation();
      const s=invoiceSettings();
      s.taxRate=parseTaxRateValue(rateInput?.value);
      s.defaultTaxRate=s.taxRate;
      s.vatEnabled=enabledInput ? !!enabledInput.checked : true;
      s.taxEnabled=s.vatEnabled;
      s.taxMode=modeInput?.value || s.taxMode || 'Tax exclusive';
      writeInvoiceSettings(s);
      setCart(getCart());
      updateTaxLabels();
      toast(`Tax settings saved — ${s.vatEnabled?`Tax ${s.taxRate}%`:'Tax disabled'}`);
    });
    load();
  }


  function stockAdjustmentProductName(p){ return String(p?.name||p?.product||p?.productName||p?.description||p?.sku||'Unnamed product').trim() || 'Unnamed product'; }
  function stockAdjustmentProductKey(p){ return String(p?.sku||p?.barcode||stockAdjustmentProductName(p)).trim(); }
  function stockAdjustmentSearchText(p){ return [p?.name,p?.product,p?.productName,p?.sku,p?.barcode,p?.category,p?.brand,p?.status].map(v=>String(v??'').toLowerCase()).join(' '); }
  function inventoryAdjustmentProducts(data=db()){ return (data.products||[]).filter(p=>p && p.deleted!==true); }
  function stockAdjustmentMatches(p, term){ const q=String(term||'').toLowerCase().trim(); if(!q) return true; return stockAdjustmentSearchText(p).includes(q); }
  function stockAdjustmentResults(term){
    const q=String(term||'').toLowerCase().trim();
    const rows=inventoryAdjustmentProducts().filter(p=>stockAdjustmentMatches(p,q));
    return rows.sort((a,b)=>{
      const ak=String(a.sku||a.barcode||stockAdjustmentProductName(a)).toLowerCase();
      const bk=String(b.sku||b.barcode||stockAdjustmentProductName(b)).toLowerCase();
      const an=stockAdjustmentProductName(a).toLowerCase();
      const bn=stockAdjustmentProductName(b).toLowerCase();
      const as=(ak===q?0:an===q?1:ak.startsWith(q)?2:an.startsWith(q)?3:4);
      const bs=(bk===q?0:bn===q?1:bk.startsWith(q)?2:bn.startsWith(q)?3:4);
      return as-bs || an.localeCompare(bn);
    }).slice(0,8);
  }
  function renderStockAdjustmentSuggestions(showEmpty=false){
    const input=$('#stockAdjustmentProductSearch'), box=$('#stockAdjustmentProductSuggestions');
    if(!input || !box) return;
    const term=input.value.trim();
    const rows=stockAdjustmentResults(term);
    if(!term && !showEmpty){ box.classList.add('d-none'); box.innerHTML=''; return; }
    if(!rows.length){ box.innerHTML='<div class="axtor-suggestion-empty">No matching product found. Try product name, SKU, barcode, category or brand.</div>'; box.classList.remove('d-none'); return; }
    box.innerHTML=rows.map(p=>{
      const key=safeText(stockAdjustmentProductKey(p));
      const barcode=p.barcode?`<span>Barcode: ${safeText(p.barcode)}</span>`:'';
      const brand=p.brand?`<span>Brand: ${safeText(p.brand)}</span>`:'';
      return `<button type="button" class="axtor-suggestion-item" data-stock-adjust-select="${key}" role="option"><span class="axtor-suggestion-title"><span>${safeText(stockAdjustmentProductName(p))}</span><span class="badge-soft ${number(p.stock)>0?'badge-paid':'badge-danger-soft'}">Stock ${number(p.stock)}</span></span><span class="axtor-suggestion-meta"><span>SKU: ${safeText(p.sku||'-')}</span>${barcode}<span>Category: ${safeText(p.category||'-')}</span>${brand}</span></button>`;
    }).join('');
    box.classList.remove('d-none');
  }
  function findStockAdjustmentProduct(key){
    const q=String(key||'').trim().toLowerCase();
    if(!q) return null;
    return inventoryAdjustmentProducts().find(p=>[p.sku,p.barcode,stockAdjustmentProductName(p)].some(v=>String(v||'').trim().toLowerCase()===q)) || null;
  }
  function selectStockAdjustmentProduct(key, silent=false){
    const input=$('#stockAdjustmentProductSearch'), box=$('#stockAdjustmentProductSuggestions');
    const product=findStockAdjustmentProduct(key);
    if(!input || !product){ if(!silent) toast('Product not found','warning'); return null; }
    input.dataset.selectedSku=stockAdjustmentProductKey(product);
    input.value=`${stockAdjustmentProductName(product)} (${product.sku||product.barcode||'No SKU'})`;
    box?.classList.add('d-none');
    if(!silent) toast(`Product selected: ${stockAdjustmentProductName(product)}`);
    $('#stockAdjustmentQty')?.focus();
    return product;
  }
  function selectedStockAdjustmentProduct(){
    const input=$('#stockAdjustmentProductSearch'); if(!input) return null;
    if(input.dataset.selectedSku) return findStockAdjustmentProduct(input.dataset.selectedSku);
    const typed=input.value.trim();
    const exact=findStockAdjustmentProduct(typed);
    if(exact) return exact;
    const rows=stockAdjustmentResults(typed);
    return rows.length===1 ? rows[0] : null;
  }
  function stockMovementDate(m){ return String(m?.date || (m?.dateTime?String(m.dateTime).split(',')[0]:'') || new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})); }
  function stockMovementQty(m){ const raw=m?.qty!==undefined?m.qty:m?.quantity; return Math.abs(number(raw)); }
  function stockMovementIsIn(m){
    const dir=String(m?.direction||'').toLowerCase();
    if(dir==='in') return true;
    if(dir==='out') return false;
    const qty=m?.quantity!==undefined?number(m.quantity):number(m?.qty);
    return qty>=0;
  }
  function renderStockLedger(){
    const body=$('#stockLedgerBody'); if(!body) return;
    const rows=(db().stockMovements||[]).slice(0,40);
    body.innerHTML=rows.map(m=>{
      const inQty=stockMovementIsIn(m)?stockMovementQty(m):0;
      const outQty=stockMovementIsIn(m)?0:stockMovementQty(m);
      const bal=m.afterStock!==undefined?m.afterStock:(m.after!==undefined?m.after:m.balance);
      return `<tr><td>${safeText(stockMovementDate(m))}</td><td><strong>${safeText(m.productName||m.product||m.name||m.sku||'-')}</strong><br><small class="text-muted">${safeText(m.sku||'')}</small></td><td>${safeText(m.ref||m.invoiceNo||m.no||m.id||'-')}<br><small class="text-muted">${safeText(m.type||'Stock movement')}</small></td><td>${inQty?number(inQty):'-'}</td><td>${outQty?number(outQty):'-'}</td><td>${bal!==undefined?number(bal):'-'}</td></tr>`;
    }).join('') || '<tr><td colspan="6" class="text-center text-muted py-4">No stock movement yet. Save a stock adjustment to create the first ledger row.</td></tr>';
  }
  function stockAdjustmentNo(data){
    if(window.AxtorCoreData?.nextNo) return window.AxtorCoreData.nextNo('ADJ', data.stockMovements||[]);
    const n=(data.stockMovements||[]).length+1;
    return 'ADJ-'+String(1000+n).padStart(4,'0');
  }
  function saveStockAdjustment(){
    const input=$('#stockAdjustmentProductSearch'), qtyInput=$('#stockAdjustmentQty'), typeEl=$('#stockAdjustmentType');
    const data=db(); data.products=data.products||[]; data.stockMovements=data.stockMovements||[]; data.activity=data.activity||[];
    const selected=selectedStockAdjustmentProduct();
    if(!input || !selected) return toast(input?.value.trim()?'Select a product from suggestions first':'Product not found','warning');
    const selectedKey=stockAdjustmentProductKey(selected).toLowerCase();
    const product=(data.products||[]).find(p=>stockAdjustmentProductKey(p).toLowerCase()===selectedKey || String(p.sku||'').toLowerCase()===selectedKey || String(p.barcode||'').toLowerCase()===selectedKey || stockAdjustmentProductName(p).toLowerCase()===stockAdjustmentProductName(selected).toLowerCase());
    if(!product) return toast('Product not found','warning');
    const qty=number(qtyInput?.value);
    if(qty<=0) return toast('Enter a valid quantity greater than 0','warning');
    const decrease=String(typeEl?.value||'').toLowerCase().includes('decrease');
    const before=number(product.stock);
    const after=decrease ? before-qty : before+qty;
    if(decrease && after<0 && !negativeStockAllowed()) return toast(`Insufficient stock. Available ${before}, requested ${qty}.`,'warning');
    product.stock=after<0 && !negativeStockAllowed() ? 0 : after;
    product.status=number(product.stock)<=0?'Out of stock':number(product.stock)<10?'Low':'In stock';
    const no=stockAdjustmentNo(data);
    const dateIso=$('#stockAdjustmentDate')?.value || new Date().toISOString().slice(0,10);
    const displayDate=new Date(dateIso).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
    data.stockMovements.unshift({id:no,no,date:displayDate,dateIso,dateTime:new Date().toLocaleString(),type:decrease?'Stock Adjustment - Decrease':'Stock Adjustment - Increase',direction:decrease?'out':'in',ref:no,warehouse:$('#stockAdjustmentWarehouse')?.value||'Main Warehouse',sku:product.sku||'',barcode:product.barcode||'',product:stockAdjustmentProductName(product),productName:stockAdjustmentProductName(product),qty,quantity:decrease?-qty:qty,before,beforeStock:before,after:product.stock,afterStock:product.stock,source:'inventory-stock-adjustment'});
    data.activity.unshift(`${no} ${decrease?'decreased':'increased'} ${stockAdjustmentProductName(product)} by ${qty}`);
    save(data);
    input.value=''; delete input.dataset.selectedSku;
    if(qtyInput) qtyInput.value='';
    $('#stockAdjustmentProductSuggestions')?.classList.add('d-none');
    renderStockLedger(); renderProducts();
    toast(`${no} saved. Stock ${decrease?'decreased':'increased'} for ${stockAdjustmentProductName(product)}.`);
  }
  function initInventoryStockAdjustment(){
    const input=$('#stockAdjustmentProductSearch');
    if(!input) return;
    const date=$('#stockAdjustmentDate');
    if(date && (!date.value || date.value==='2026-06-13')) date.value=new Date().toISOString().slice(0,10);
    renderStockLedger();
    input.addEventListener('input',()=>{ delete input.dataset.selectedSku; renderStockAdjustmentSuggestions(false); });
    input.addEventListener('focus',()=>renderStockAdjustmentSuggestions(!!input.value.trim()));
    input.addEventListener('keydown',e=>{
      if(e.key==='Enter'){
        e.preventDefault();
        const first=$('#stockAdjustmentProductSuggestions [data-stock-adjust-select]');
        const rows=stockAdjustmentResults(input.value.trim());
        if(first) selectStockAdjustmentProduct(first.dataset.stockAdjustSelect);
        else if(rows.length) selectStockAdjustmentProduct(stockAdjustmentProductKey(rows[0]));
        else toast('Product not found','warning');
      }
      if(e.key==='Escape') $('#stockAdjustmentProductSuggestions')?.classList.add('d-none');
    });
    document.addEventListener('click',e=>{
      const pick=e.target.closest('[data-stock-adjust-select]');
      if(pick){ e.preventDefault(); selectStockAdjustmentProduct(pick.dataset.stockAdjustSelect); return; }
      if(!e.target.closest('.stock-search-wrap')) $('#stockAdjustmentProductSuggestions')?.classList.add('d-none');
    });
    $('#saveStockAdjustmentBtn')?.addEventListener('click',e=>{ e.preventDefault(); e.stopImmediatePropagation(); saveStockAdjustment(); });
  }


  function initDataTools(){ $('#exportDataBtn')?.addEventListener('click',()=>{ const blob=new Blob([JSON.stringify(db(),null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='axtor-pos-customer-data.json'; a.click(); URL.revokeObjectURL(a.href); }); $('#resetDataBtn')?.addEventListener('click',()=>{ if(window.AxtorResetToFreshCustomer){ window.AxtorResetToFreshCustomer({confirm:true}); return; } localStorage.removeItem(KEY); sessionStorage.removeItem(CART); ensure(); populateSalesmanDropdown(); renderCustomers(); renderProducts(); renderInvoices(); renderCustomerPayments(); renderSupplierPayments(); renderCart(); toast('Fresh customer data reset'); }); $('#importDataInput')?.addEventListener('change',e=>{ const file=e.target.files[0]; if(!file) return; const reader=new FileReader(); reader.onload=()=>{ try{ save(JSON.parse(reader.result)); toast('Data imported'); location.reload(); }catch(err){ toast('Invalid JSON file','danger'); } }; reader.readAsText(file); }); }
  function initPaymentModules(){
    $('#customerPaymentCustomer')?.addEventListener('change',renderCustomerPayments); $('#customerPaymentSearch')?.addEventListener('input',renderCustomerPayments); $('#clearCustomerPaymentSearch')?.addEventListener('click',()=>{ const i=$('#customerPaymentSearch'); if(i){i.value=''; renderCustomerPayments(); i.focus();} }); $('#customerReceivedTotal')?.addEventListener('input',updateCustomerPaymentSummary); document.addEventListener('input',e=>{ if(e.target.matches('[data-customer-apply]')) updateCustomerPaymentSummary(); if(e.target.matches('[data-supplier-apply]')) updateSupplierPaymentSummary(); }); $('#customerAutoAllocateBtn')?.addEventListener('click',autoAllocateCustomer); $('#saveCustomerPaymentBtn')?.addEventListener('click',saveCustomerPayment);
    $('#supplierPaymentSupplier')?.addEventListener('change',renderSupplierPayments); $('#supplierPaidTotal')?.addEventListener('input',updateSupplierPaymentSummary); $('#supplierAutoAllocateBtn')?.addEventListener('click',autoAllocateSupplier); $('#saveSupplierPaymentBtn')?.addEventListener('click',saveSupplierPayment);
  }
  function initShortcuts(){ document.addEventListener('keydown',e=>{ if(!e.ctrlKey || !e.altKey) return; const k=e.key.toLowerCase(); if(k==='n') location.href='sales.html#new-sale'; if(k==='c') location.href='customer.html#add-customer'; if(k==='p') location.href='products.html#add-product'; if(k==='r') location.href='sales.html#receive-payment'; if(k==='s') location.href='purchase.html#pay-supplier'; }); }
  function initPWA(){ if('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js?v=20260711-auth-sales-fix').then(reg=>reg.update&&reg.update()).catch(()=>{}); }
  ensure();
  window.AxtorDemoData={db,save,reserveInvoiceNumber,reserveSalesDocumentNumber,docMeta,normalizeDocumentType,isSalesInvoice,isFinalInvoice,syncCustomerReceivable,updateCustomerBalances,applyInvoiceStock,reverseInvoiceStock,restockInvoiceItem,safeText,money,number,getDefaultTaxRate,getTaxLabel,updateTaxLabels,renderNewSaleProductGrid};
  document.addEventListener('DOMContentLoaded',()=>{ if(window.AXTOR_BACKEND_SALES_MODE){ initSalesScanner(); initShortcuts(); initPWA(); return; } ensure(); $('#savedInvoicesSearch')?.addEventListener('input',renderInvoices); $('#clearSavedInvoicesSearch')?.addEventListener('click',()=>{ const i=$('#savedInvoicesSearch'); if(i){i.value=''; renderInvoices(); i.focus();} }); renderCustomers(); renderProducts(); renderInvoices(); renderCustomerPayments(); renderSupplierPayments(); initCart(); initCustomerSave(); initProductSave(); initTaxSettings(); initDataTools(); initPaymentModules(); initInventoryStockAdjustment(); initShortcuts(); initPWA(); });
})();
