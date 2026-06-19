/* Axtor POS Cloud - Invoice template engine and designer demo */
(function(){
  'use strict';

  const APP_DB_KEY='axtorAdvancedDemoDB';
  const DEFAULT_TAX_RATE=5;
  const LEGACY_DB_KEY='axtorDemoDB';
  const KEYS={
    company:'companySettings', invoice:'invoiceSettings', designer:'invoiceDesignerSettings', selected:'selectedInvoiceTemplate',
    customerPrefs:'customerInvoicePreferences', printHistory:'invoicePrintHistory', previewHistory:'invoicePreviewHistory',
    exports:'invoiceTemplateExports', columns:'invoiceColumnSettings'
  };

  const templateList=[
    {id:'modern-a4',name:'Modern A4 Invoice',use:'Retail, wholesale and general trading',size:'A4',badge:'Recommended'},
    {id:'compact-a4',name:'Compact A4 Invoice',use:'Fast counter invoice with more rows',size:'A4',badge:''},
    {id:'paint-store',name:'Paint Store Invoice',use:'Automotive paint, garage and color matching',size:'A4',badge:'Paint Store'},
    {id:'thermal-80',name:'Thermal Receipt 80mm',use:'POS terminal receipt printer',size:'80mm',badge:'Terminal'},
    {id:'tax-invoice',name:'Tax Invoice',use:'VAT/tax-ready invoice structure',size:'A4',badge:'Tax'},
    {id:'delivery-invoice',name:'Delivery Invoice',use:'Delivery note and driver handover',size:'A4',badge:''},
    {id:'quotation',name:'Quotation Template',use:'Quotation and estimate print layout',size:'A4',badge:''},
    {id:'minimal',name:'Minimal Invoice',use:'Simple clean invoice for quick print',size:'A4',badge:''},
    {id:'letterhead',name:'Professional Letterhead Invoice',use:'Premium corporate letterhead style',size:'A4',badge:'Premium'},
    {id:'bilingual',name:'Bilingual English/Arabic Invoice',use:'Qatar bilingual customer print',size:'A4',badge:'Arabic Ready'}
  ];

  const defaultCompany={companyName:'Axtor Trading',legalBusinessName:'Axtor Trading W.L.L',crNumber:'CR-000000-DEMO',taxNumber:'VAT-0000-DEMO',phone:'77790896',whatsapp:'77790896',email:'sales@axtortrading.com',website:'www.axtortrading.com',address:'Street 24, Al Attiyah Street, Industrial Area',city:'Doha',country:'Qatar',bankName:'Commercial Bank of Qatar',bankAccount:'0000 0000 0000',iban:'QA00 CBQA 0000 0000 0000 0000 0',paymentInstructions:'Please arrange payment by cash, card, bank transfer or approved credit terms.',footerNote:'Thank you for choosing Axtor Trading.',terms:'Goods once sold are returnable only as per company return policy. Demo invoice only.',logoData:'',stampData:'',signatureData:'',currency:'QAR',currencySymbol:'QAR '};
  const defaultInvoice={invoicePrefix:'INV-',nextInvoiceNumber:'0001',quotationPrefix:'QT-',deliveryPrefix:'DO-',creditPrefix:'CN-',returnPrefix:'RET-',defaultInvoiceTemplate:'modern-a4',defaultQuotationTemplate:'quotation',defaultReceiptTemplate:'thermal-80',defaultPrintSize:'A4',defaultLanguage:'Bilingual',showLogo:true,showTaxNumber:true,showCrNumber:true,showCustomerBalance:true,showSalesman:true,showBarcode:true,showQr:true,showPaymentTerms:true,showBankDetails:true,showSignatureBox:true,showStamp:true,showFooterNote:true,autoPrint:false,autoPreview:true,savePdfDemo:true,copyLabel:'Original',vatEnabled:true,taxRate:DEFAULT_TAX_RATE};
  const defaultDesigner={templateBase:'modern-a4',primaryColor:'#0f9f78',accentColor:'#113d32',headerStyle:'Modern',logoPosition:'Left',tableDensity:'Comfortable',fontSize:'Normal',borderStyle:'Soft',footerStyle:'Terms and signature',showLogo:true,showStamp:true,showSignature:true,showBankDetails:true,showTaxNumber:true,showCrNumber:true,showBarcode:true,showQr:true,showCustomerBalance:true,showPaymentTerms:true,showFooterNote:true,columns:{sku:true,barcode:false,brand:true,name:true,category:false,colorCode:true,batchNo:false,expiryDate:false,unit:true,qty:true,rate:true,discount:true,tax:true,total:true,warehouse:false}};
  const defaultCustomerPrefs={};

  function $(s,r=document){return r.querySelector(s)}
  function $$(s,r=document){return Array.from(r.querySelectorAll(s))}
  function clone(x){return JSON.parse(JSON.stringify(x))}
  function read(k,fallback){try{return JSON.parse(localStorage.getItem(k))??clone(fallback)}catch(e){return clone(fallback)}}
  function write(k,v){localStorage.setItem(k,JSON.stringify(v)); return v}
  function merge(target, defaults){let changed=false; Object.keys(defaults).forEach(k=>{ if(target[k]===undefined){target[k]=clone(defaults[k]); changed=true;} else if(defaults[k] && typeof defaults[k]==='object' && !Array.isArray(defaults[k]) && target[k] && typeof target[k]==='object' && !Array.isArray(target[k])){ if(merge(target[k], defaults[k])) changed=true; }}); return changed}
  function num(v){const n=Number(v); return isFinite(n)?n:0}
  function appDb(){let d={}; try{d=JSON.parse(localStorage.getItem(APP_DB_KEY)||'{}')||{}}catch(e){d={}} return d}
  function saveAppDb(d){localStorage.setItem(APP_DB_KEY,JSON.stringify(d));}
  function legacyDb(){let d={}; try{d=JSON.parse(localStorage.getItem(LEGACY_DB_KEY)||'{}')||{}}catch(e){d={}} return d}
  function salesmanName(id){const sm=(appDb().salesmen||[]).find(s=>String(s.id)===String(id)); return sm?sm.name:''}
  function resolveSalesman(data){const byId=data?.salesmanId?salesmanName(data.salesmanId):''; return byId || String(data?.salesman||'').trim()}
  function audit(action,before='-',after='-'){const d=appDb(); d.auditEvents=d.auditEvents||[]; d.auditEvents.unshift({user:'Local User',action,before,after,time:new Date().toLocaleString(),device:'Local browser / localStorage',approval:'Not required'}); saveAppDb(d)}
  function toast(msg,type='success'){const t=document.createElement('div'); t.className='position-fixed bottom-0 end-0 m-3 alert alert-'+type+' shadow'; t.style.zIndex=9999; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),2400)}
  function fallbackCopy(text){try{const ta=document.createElement('textarea'); ta.value=text; ta.setAttribute('readonly',''); ta.style.position='fixed'; ta.style.left='-9999px'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); return true;}catch(e){return false;}}
  function copyText(text){if(navigator.clipboard?.writeText){return navigator.clipboard.writeText(text).catch(()=>fallbackCopy(text));} return Promise.resolve(fallbackCopy(text));}
  function money(n){const c=getCompany(); return (c.currencySymbol||'QAR ')+num(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
  function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
  function stripSalesmanColumn(obj){if(!obj || typeof obj!=='object') return false; let changed=false; if(obj.salesman!==undefined){delete obj.salesman; changed=true;} if(obj.columns && typeof obj.columns==='object' && obj.columns.salesman!==undefined){delete obj.columns.salesman; changed=true;} return changed}
  function restoreNameColumn(cols){if(!cols || typeof cols!=='object') return false; let changed=false; if(cols.name!==true){cols.name=true; changed=true;} if(cols.salesman!==undefined){delete cols.salesman; changed=true;} return changed}
  function migrateDesignerColumns(obj){if(!obj || typeof obj!=='object') return false; let changed=stripSalesmanColumn(obj); if(obj.columns && typeof obj.columns==='object') changed=restoreNameColumn(obj.columns)||changed; return changed}
  function firstText(){for(const v of arguments){const s=String(v??'').trim(); if(s) return s;} return ''}
  function resolveItemName(item){return firstText(item?.name,item?.product,item?.productName,item?.itemName,item?.description,'Item')}
  function resolveCustomerPhone(data){const direct=firstText(data?.customerPhone,data?.customerMobile,data?.phone,data?.mobile,data?.whatsapp); if(direct && direct!=='-') return direct; const name=String(data?.customer||'').trim(); if(name){const sources=[appDb(),legacyDb()]; for(const src of sources){const c=(src.customers||[]).find(x=>String(x.name||'').trim()===name); const ph=firstText(c?.phone,c?.mobile,c?.whatsapp); if(ph && ph!=='-') return ph; }} return name==='Walk-in Customer'?'77790000':''}

  function ensure(){
    const c=read(KEYS.company,defaultCompany); if(merge(c,defaultCompany)) write(KEYS.company,c);
    const i=read(KEYS.invoice,defaultInvoice); if(merge(i,defaultInvoice)) write(KEYS.invoice,i);
    const de=read(KEYS.designer,defaultDesigner); const deMerged=merge(de,defaultDesigner); const deMigrated=migrateDesignerColumns(de); if(deMerged||deMigrated) write(KEYS.designer,de);
    if(!localStorage.getItem(KEYS.selected)) localStorage.setItem(KEYS.selected, i.defaultInvoiceTemplate||'modern-a4');
    const cp=read(KEYS.customerPrefs,defaultCustomerPrefs); if(merge(cp,defaultCustomerPrefs)) write(KEYS.customerPrefs,cp);
    [KEYS.printHistory,KEYS.previewHistory,KEYS.exports].forEach(k=>{if(!localStorage.getItem(k)) write(k,[])});
    const cols=read(KEYS.columns, defaultDesigner.columns); const colsMerged=merge(cols, defaultDesigner.columns); const colsMigrated=restoreNameColumn(cols); if(!localStorage.getItem(KEYS.columns) || colsMerged || colsMigrated) write(KEYS.columns, cols);
  }

  function getCompany(){ensure(); return read(KEYS.company,defaultCompany)}
  function getInvoice(){ensure(); return read(KEYS.invoice,defaultInvoice)}
  function getDesigner(){ensure(); const d=read(KEYS.designer,defaultDesigner); migrateDesignerColumns(d); return d}

  function sampleData(kind='invoice', customerName){
    const d=appDb(); const legacy=legacyDb();
    const customer=customerName || (d.customers&&d.customers[0]&&d.customers[0].name) || (legacy.customers&&legacy.customers[0]&&legacy.customers[0].name) || '';
    const invoice=getInvoice();
    const items=[
      {sku:'AX-2K-040',barcode:'629100001040',brand:'',category:'Automotive Paint',name:'Sample Product',product:'Sample Product',colorCode:'',shade:'Super White',formula:' Super White',batchNo:'B-2406',expiryDate:'2027-06-30',unit:'LTR',qty:2,rate:95,discount:0,taxRate:DEFAULT_TAX_RATE,warehouse:'Main WH'},
      {sku:'CC-HS-1L',barcode:'629100001055',brand:'',category:' Coat',name:'Sample Product 1L',product:'Sample Product 1L',colorCode:'',shade:'High solid gloss',formula:'',batchNo:'C-1120',expiryDate:'2027-05-15',unit:'PCS',qty:1,rate:55,discount:0,taxRate:DEFAULT_TAX_RATE,warehouse:'Main WH'},
      {sku:'TN-NC-5L',barcode:'629100001038',brand:'',category:'Thinner',name:'Sample Product',product:'Sample Product',colorCode:'N/A',shade:'',formula:'N/A',batchNo:'',expiryDate:'2027-01-20',unit:'PCS',qty:2,rate:38,discount:0,taxRate:DEFAULT_TAX_RATE,warehouse:'Main WH'}
    ];
    const sub=items.reduce((s,x)=>s+num(x.qty)*num(x.rate),0), disc=10, taxable=sub-disc, tax=invoice.vatEnabled?taxable*(num(invoice.taxRate||DEFAULT_TAX_RATE)/100):0, grand=taxable+tax;
    const type={quotation:'Quotation',delivery:'Delivery Note','delivery-invoice':'Delivery Note','tax-invoice':'Tax Invoice'}[kind]||'Invoice';
    const firstSalesman=(d.salesmen||[]).find(s=>s.active!==false);
    return {type,invoiceNo:(kind==='quotation'?invoice.quotationPrefix:kind==='delivery'||kind==='delivery-invoice'?invoice.deliveryPrefix:kind==='return'?invoice.returnPrefix:invoice.invoicePrefix)+(invoice.nextInvoiceNumber||'0001'),date:new Date().toLocaleDateString(),time:new Date().toLocaleTimeString(),customer,customerPhone:resolveCustomerPhone({customer})||'',customerTax:'',customerBalance:0,creditLimit:0,salesmanId:firstSalesman?.id||'',salesman:firstSalesman?.name||'',cashier:'Cashier',branch:'',vehicleRef:'',colorMatchingNote:'',thinnerRatio:'',deliveryAddress:'',paymentMethod:'Cash / Card / Credit',paid:grand,balance:0,subtotal:sub,discount:disc,tax,grand,total:grand,amount:grand,items};
  }

  function normalizeItem(x, invoiceTaxRate){
    x=x||{};
    const qty=num(x.qty ?? x.quantity ?? 1) || 1;
    const rate=num(x.rate ?? x.price ?? x.unitPrice ?? x.amount ?? x.total);
    const discount=num(x.discount ?? x.lineDiscount);
    const taxRate=x.taxRate!==undefined?num(x.taxRate):num(invoiceTaxRate||0);
    const base=Math.max(0,(qty*rate)-discount);
    const tax=x.tax!==undefined?num(x.tax):base*taxRate/100;
    const total=x.total!==undefined?num(x.total):base+tax;
    const name=resolveItemName(x);
    const product=firstText(x.product,x.productName,x.name,x.itemName,x.description,name);
    return Object.assign({}, x, {name, product, productName:firstText(x.productName,name), itemName:firstText(x.itemName,name), qty, rate, discount, taxRate, tax, total, unit:x.unit||'PCS'});
  }

  function normalizeData(templateId, opts={}){
    const inv=getInvoice();
    const base=sampleData(opts.kind||templateId, opts.customer);
    const directData = (!opts.data && (opts.invoiceNo || opts.no || opts.id || Array.isArray(opts.items) || opts.amount!==undefined || opts.total!==undefined || opts.grand!==undefined)) ? opts : null;
    const source=Object.assign({}, opts.data||directData||{});
    if(source.no && !source.invoiceNo) source.invoiceNo=source.no;
    if(source.documentNo && !source.invoiceNo) source.invoiceNo=source.documentNo;
    if(source.id && !source.invoiceNo) source.invoiceNo=source.id;
    const rawDocType=String(source.documentType||'').toLowerCase().replace(/[\s-]+/g,'_');
    if(!source.documentType){
      const ref=String(source.invoiceNo||source.no||source.id||'');
      source.documentType=ref.startsWith('QTN-')?'quotation':(ref.startsWith('DN-')?'delivery_note':'invoice');
    } else if(rawDocType==='dn'||rawDocType==='delivery'||rawDocType==='deliverynote') source.documentType='delivery_note';
    else if(rawDocType==='quote'||rawDocType==='qtn') source.documentType='quotation';
    const docTitleMap={invoice:'Sales Invoice',quotation:'Quotation',delivery_note:'Delivery Note'};
    source.documentTitle=source.documentTitle||docTitleMap[source.documentType]||'Sales Invoice';
    if(source.paymentType && !source.paymentMethod) source.paymentMethod=source.paymentType;
    source.lpoNo=String(source.lpoNo || source.customerLpoNo || source.customerPoNo || source.poNo || '').trim();
    source.customerLpoNo=source.lpoNo; source.customerPoNo=source.lpoNo; source.poNo=source.lpoNo;
    if(source.total!==undefined && source.grand===undefined) source.grand=source.total;
    if(source.amount!==undefined && source.grand===undefined) source.grand=source.amount;
    let data=Object.assign({}, base, source);
    data.customerPhone=resolveCustomerPhone(data)||data.customerPhone||'';
    let items=Array.isArray(source.items)?source.items:(Array.isArray(source.draftItems)?source.draftItems:null);
    if(!items || !items.length){
      const grand=num(data.grand ?? data.total ?? data.amount);
      const tax=num(data.tax ?? data.taxAmount);
      const net=Math.max(0, grand-tax);
      items=[{sku:data.invoiceNo||'', brand:'', name:data.status==='Draft'?'Draft invoice':'Invoice sale', product:data.status==='Draft'?'Draft invoice':'Invoice sale', unit:'Invoice', qty:1, rate:net||grand, discount:0, taxRate:0, tax, total:grand||net}];
    }
    data.items=items.map(x=>normalizeItem(x, inv.vatEnabled?inv.taxRate:0));
    const calcSub=data.items.reduce((s,x)=>s+(num(x.qty)*num(x.rate)),0);
    const calcDiscount=data.items.reduce((s,x)=>s+num(x.discount),0) + num(data.invoiceDiscount);
    const calcTax=data.items.reduce((s,x)=>s+num(x.tax),0);
    const calcGrand=data.items.reduce((s,x)=>s+num(x.total),0) - num(data.invoiceDiscount);
    data.subtotal=data.subtotal!==undefined?num(data.subtotal):calcSub;
    data.discount=data.discount!==undefined?num(data.discount):calcDiscount;
    data.tax=data.tax!==undefined?num(data.tax):calcTax;
    data.grand=data.grand!==undefined?num(data.grand):calcGrand;
    data.total=data.total!==undefined?num(data.total):data.grand;
    data.amount=data.amount!==undefined?num(data.amount):data.grand;
    data.paid=data.paid!==undefined?num(data.paid):data.grand;
    data.balance=data.balance!==undefined?num(data.balance):Math.max(0,data.grand-data.paid);
    return data;
  }

  function visibleColumns(templateId){
    const des=getDesigner();
    const cols=Object.assign({}, defaultDesigner.columns, read(KEYS.columns,des.columns), des.columns||{});
    restoreNameColumn(cols);
    if(templateId==='thermal-80') return ['name','qty','rate','total'];
    if(templateId==='paint-store') return ['sku','brand','name','colorCode','shade','unit','qty','rate','discount','tax','total'];
    return Object.keys(cols).filter(k=>k!=='salesman' && cols[k]);
  }

  const labelMap={sku:'SKU',barcode:'Barcode',brand:'Brand',category:'Category',name:'Product Name',product:'Product',colorCode:'Color Code',shade:'Shade / Formula',batchNo:'Batch No',expiryDate:'Expiry',unit:'Unit',qty:'Qty',rate:'Rate',discount:'Discount',tax:'Tax',total:'Total',warehouse:'Warehouse'};

  function tableHtml(items, templateId){
    const cols=visibleColumns(templateId).filter(c=>c!=='salesman');
    return `<table class="inv-table"><thead><tr>${cols.map(c=>`<th>${labelMap[c]||c}</th>`).join('')}</tr></thead><tbody>${items.map(x=>`<tr>${cols.map(c=>{let v=x[c]; if(c==='name'||c==='product') v=resolveItemName(x); if(c==='total') v=money(x.total); if(c==='tax') v=money(x.tax); if(c==='rate'||c==='discount') v=money(v||0); return `<td>${esc(v)}</td>`}).join('')}</tr>`).join('')}</tbody></table>`;
  }

  function brandBlock(c,inv){const logo=inv.showLogo&&c.logoData?`<img class="inv-logo" src="${c.logoData}">`:`<div class="inv-logo-mark">A</div>`; return `<div class="inv-brand">${logo}<div><h2>${esc(c.companyName)}</h2><p>${esc(c.address)}, ${esc(c.city)}, ${esc(c.country)}<br>${esc(c.phone)} • ${esc(c.email)} ${inv.showCrNumber?`<br>CR: ${esc(c.crNumber)}`:''} ${inv.showTaxNumber?` • Tax: ${esc(c.taxNumber)}`:''}</p></div></div>`}
  function totalsBlock(data){return `<div class="inv-totals"><div><span>Subtotal</span><strong>${money(data.subtotal)}</strong></div><div><span>Discount</span><strong>${money(data.discount)}</strong></div><div><span>Tax</span><strong>${money(data.tax)}</strong></div><div class="grand"><span>Grand Total</span><strong>${money(data.grand)}</strong></div></div>`}
  function salesmanFooterBlock(inv, name){return inv.showSalesman && name ? `<div><b>Salesman</b><br>${esc(name)}</div>` : ''}
  function footerBlock(c,inv,salesman,data={}){
    const info=[salesmanFooterBlock(inv,salesman), inv.showBankDetails?`<div><b>Bank Details</b><br>${esc(c.bankName)}<br>A/C: ${esc(c.bankAccount)}<br>IBAN: ${esc(c.iban)}</div>`:'', inv.showPaymentTerms?`<div><b>Payment Instructions</b><br>${esc(c.paymentInstructions)}</div>`:''].filter(Boolean).join('');
    const companyImages=`${inv.showStamp&&c.stampData?`<img src="${c.stampData}" alt="Company stamp">`:''}${inv.showSignatureBox&&c.signatureData?`<img src="${c.signatureData}" alt="Account signature">`:''}`;
    const companyBox=`<div class="signature-card"><h4>Company Stamp &amp; Account Signature</h4>${companyImages?`<div class="signature-images">${companyImages}</div>`:''}<div class="signature-line"><span>Company Stamp:</span></div><div class="signature-line"><span>Account Signature:</span></div><div class="signature-space"></div></div>`;
    const customerBox=`<div class="signature-card"><h4>Customer Acknowledgement</h4><div class="signature-detail"><span>Customer Name:</span><strong>${esc(data.customer||'Walk-in Customer')}</strong></div><div class="signature-detail"><span>Customer Phone:</span><strong>${esc(resolveCustomerPhone(data)||'-')}</strong></div><div class="signature-line"><span>Customer Stamp:</span></div><div class="signature-line"><span>Customer Signature:</span></div><div class="signature-space"></div></div>`;
    return `${info?`<div class="inv-footer-grid">${info}</div>`:''}<div class="inv-signature-grid">${companyBox}${customerBox}</div>${inv.showFooterNote?`<p class="inv-note">${esc(c.footerNote)}<br>${esc(c.terms)}</p>`:''}`;
  }

  function baseCss(des){return `<style>body{font-family:Inter,Arial,sans-serif;background:#eef5f0;margin:0;padding:22px;color:#17231d}.invoice-sheet{max-width:980px;margin:auto;background:white;border:1px solid #dbe8e1;border-radius:18px;padding:28px;box-shadow:0 12px 32px rgba(9,64,45,.12);font-size:${des.fontSize==='Small'?'12px':des.fontSize==='Large'?'15px':'13px'}}.invoice-sheet.compact{font-size:12px}.invoice-sheet.minimal{box-shadow:none;border-radius:4px}.invoice-sheet.thermal{width:302px;max-width:302px;padding:12px;border-radius:0;font-size:12px}.inv-head{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid ${des.primaryColor};padding-bottom:14px;margin-bottom:16px}.inv-brand{display:flex;align-items:center;gap:12px}.inv-brand h2{margin:0;color:${des.primaryColor};font-size:24px}.inv-brand p,.muted{color:#64766d;margin:4px 0;line-height:1.45}.inv-logo{max-height:66px;max-width:110px}.inv-logo-mark{width:54px;height:54px;border-radius:16px;background:${des.primaryColor};color:#fff;display:grid;place-items:center;font-size:28px;font-weight:900}.inv-title{text-align:right}.inv-title h1{margin:0;color:${des.accentColor};font-size:28px}.copy-label{display:inline-block;border:1px solid ${des.primaryColor};color:${des.primaryColor};padding:4px 9px;border-radius:999px;font-weight:800}.inv-box-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin:15px 0}.inv-footer-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:16px 0 12px}.inv-footer-grid>div{border:1px solid #dcebe3;border-radius:14px;padding:12px;background:#fbfffd}.inv-box{border:1px solid #dcebe3;border-radius:14px;padding:12px;background:#fbfffd}.inv-table{width:100%;border-collapse:collapse;margin-top:14px}.inv-table th{background:${des.primaryColor};color:white;text-align:left;padding:${des.tableDensity==='Ultra compact'?'5px':des.tableDensity==='Compact'?'7px':'10px'};font-size:.92em}.inv-table td{border-bottom:1px solid #e8f0ec;padding:${des.tableDensity==='Ultra compact'?'5px':des.tableDensity==='Compact'?'7px':'10px'};vertical-align:top}.inv-totals{margin-left:auto;width:310px;border:1px solid #dcebe3;border-radius:14px;overflow:hidden;margin-top:16px}.inv-totals div{display:flex;justify-content:space-between;padding:9px 12px;border-bottom:1px solid #eef5f1}.inv-totals .grand{background:${des.accentColor};color:white;font-size:1.1em}.inv-signature-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:14px}.signature-card{border:1.5px solid #9fb7aa;border-radius:12px;min-height:136px;padding:12px;background:#fff;page-break-inside:avoid;break-inside:avoid}.signature-card h4{margin:0 0 9px;color:${des.accentColor};font-size:14px}.signature-detail{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid #eef5f1;padding:4px 0}.signature-detail span,.signature-line span{color:#64766d}.signature-line{min-height:25px;border-bottom:1px dashed #9fb7aa;padding-top:8px}.signature-space{min-height:32px}.signature-images{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:6px 0}.signature-images img{max-height:52px;max-width:125px;object-fit:contain}.qr-box,.barcode-box{border:1px dashed #9fb7aa;width:92px;height:92px;display:grid;place-items:center;color:#6b7c73;font-size:11px}.inv-note{font-size:12px;color:#66756d;border-top:1px solid #e5eee9;margin-top:15px;padding-top:10px}.bilingual .ar{text-align:right;direction:rtl;color:#31443b}.letterhead .inv-head{border:0;background:linear-gradient(90deg,${des.primaryColor},${des.accentColor});color:white;border-radius:16px;padding:18px}.letterhead .inv-brand h2,.letterhead .inv-title h1,.letterhead .inv-brand p{color:white}.thermal .inv-head{display:block;text-align:center;border-bottom:1px dashed #333}.thermal .inv-brand{display:block}.thermal .inv-logo-mark{margin:0 auto 5px;width:38px;height:38px;border-radius:50%;font-size:18px}.thermal .inv-table th{background:#fff;color:#111;border-top:1px dashed #333;border-bottom:1px dashed #333}.thermal .inv-table td{padding:4px;border-bottom:0}.thermal .inv-totals{width:100%;border:0;border-radius:0}.thermal .inv-totals .grand{background:#111;color:#fff}.thermal .inv-footer-grid,.thermal .inv-signature-grid{display:grid;grid-template-columns:1fr;gap:8px;margin:10px 0}.thermal .inv-footer-grid>div,.thermal .signature-card{border-radius:6px;padding:8px;min-height:auto}.thermal .signature-card h4{font-size:12px}.thermal .signature-detail{display:block}.thermal .signature-line{min-height:20px}.thermal .signature-space{min-height:18px}.thermal .signature-images img{max-height:34px;max-width:80px}.print-actions{display:none}@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{background:white!important;padding:0}.invoice-sheet{box-shadow:none;border:0;background:white!important;border-radius:0;max-width:none}.inv-signature-grid,.inv-footer-grid{page-break-inside:avoid;break-inside:avoid}.signature-card{page-break-inside:avoid;break-inside:avoid}.no-print{display:none!important}}</style>`}

  function render(templateId, opts={}){
    ensure();
    const c=getCompany(), des=getDesigner();
    let inv=getInvoice();
    inv=Object.assign({}, inv, {showLogo:des.showLogo, showStamp:des.showStamp, showBankDetails:des.showBankDetails, showTaxNumber:des.showTaxNumber, showCrNumber:des.showCrNumber, showBarcode:des.showBarcode, showQr:des.showQr, showCustomerBalance:des.showCustomerBalance, showPaymentTerms:des.showPaymentTerms, showFooterNote:des.showFooterNote, showSignatureBox:des.showSignature});
    const data=normalizeData(templateId, opts);
    const resolvedSalesman=resolveSalesman(data);
    const t=templateList.find(x=>x.id===templateId)||templateList[0];
    const cls=[templateId==='thermal-80'?'thermal':'',templateId==='compact-a4'?'compact':'',templateId==='minimal'?'minimal':'',templateId==='letterhead'?'letterhead':'',templateId==='bilingual'?'bilingual':''].join(' ');
    const title=data.documentTitle || (data.documentType==='quotation'?'Quotation':data.documentType==='delivery_note'?'Delivery Note':(templateId==='tax-invoice'?'Tax Invoice':templateId==='quotation'?'Quotation':templateId==='delivery-invoice'?'Delivery Note':templateId==='thermal-80'?'Receipt':'Sales Invoice'));

    if(templateId==='thermal-80') return baseCss(des)+`<div class="invoice-sheet thermal"><div class="inv-head">${brandBlock(c,inv)}<p>${esc(data.branch)}<br>${esc(data.invoiceNo)} • ${esc(data.time)}</p></div><p><b>Cashier:</b> ${esc(data.cashier)}<br><b>Customer:</b> ${esc(data.customer)}${data.lpoNo?`<br><b>LPO No:</b> ${esc(data.lpoNo)}`:''}</p>${tableHtml(data.items,'thermal-80')}${totalsBlock(data)}<p><b>Payment:</b> ${esc(data.paymentMethod)}<br><b>Paid:</b> ${money(data.paid)}<br><b>Balance:</b> ${money(data.balance)}</p>${inv.showQr?'<div class="qr-box" style="margin:auto">QR Demo</div>':''}${footerBlock(c,inv,resolvedSalesman,data)}<p style="text-align:center">Thank you!</p></div>`;

    const bilingual=templateId==='bilingual'?`<div class="ar"><b>فاتورة / Invoice</b><br>التاريخ / Date: ${esc(data.date)}<br>العميل / Customer: ${esc(data.customer)}${data.lpoNo?`<br>LPO: ${esc(data.lpoNo)}`:''}<br>الإجمالي / Total: ${money(data.grand)}</div>`:'';
    const paint=templateId==='paint-store'?`<div class="inv-box-grid"><div class="inv-box"><b>Vehicle / Project Reference</b><br>${esc(data.vehicleRef)}<br><b>Color Matching Note</b><br>${esc(data.colorMatchingNote)}</div><div class="inv-box"><b>Thinner Ratio</b><br>${esc(data.thinnerRatio)}<br><b>Delivery Address</b><br>${esc(data.deliveryAddress)}</div></div>`:'';
    const tax=templateId==='tax-invoice'?`<div class="inv-box-grid"><div class="inv-box"><b>Taxable Amount:</b> ${money(data.subtotal-data.discount)}<br><b>Tax %:</b> ${esc(inv.taxRate)}%<br><b>Tax Amount:</b> ${money(data.tax)}</div><div class="inv-box"><b>Customer Tax No:</b> ${esc(data.customerTax)}<br><b>Net Amount:</b> ${money(data.subtotal-data.discount)}<br><small>Demo structure only, no real tax filing.</small></div></div>`:'';

    return baseCss(des)+`<div class="invoice-sheet ${cls}"><div class="inv-head">${brandBlock(c,inv)}<div class="inv-title"><h1>${title}${templateId==='bilingual'?' / فاتورة':''}</h1><p><span class="copy-label">${esc(inv.copyLabel)}</span></p><p><b>${esc(data.invoiceNo)}</b><br>${esc(data.date)}</p></div></div>${bilingual}<div class="inv-box-grid"><div class="inv-box"><b>Customer / العميل</b><br>${esc(data.customer)}<br>${esc(data.deliveryAddress)}${inv.showCustomerBalance?`<br>Balance: ${money(data.customerBalance)}`:''}</div><div class="inv-box"><b>Sales Info</b><br>Branch: ${esc(data.branch)}<br>Payment: ${esc(data.paymentMethod)}${data.lpoNo?`<br>LPO No: ${esc(data.lpoNo)}`:''}<br>Template: ${esc(t.name)}</div></div>${paint}${tax}${tableHtml(data.items,templateId)}<div style="display:flex;gap:20px;align-items:flex-start;justify-content:space-between"><div>${inv.showQr?'<div class="qr-box">QR Demo</div>':''}${inv.showBarcode?'<div class="barcode-box" style="width:180px;height:42px;margin-top:8px">Barcode Demo</div>':''}</div>${totalsBlock(data)}</div>${footerBlock(c,inv,resolvedSalesman,data)}</div>`;
  }

  function openPrint(html){const w=window.open('','_blank','width=1000,height=780'); if(!w){toast('Popup blocked. Allow popups to print.','warning'); return;} w.document.write(`<!doctype html><html><head><title>Axtor Document Print</title></head><body>${html}<script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>`); w.document.close();}
  function ensureModal(){let m=$('#axtorInvoicePreviewModal'); if(m) return m; document.body.insertAdjacentHTML('beforeend',`<div class="modal fade" id="axtorInvoicePreviewModal" tabindex="-1"><div class="modal-dialog modal-xl modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><h5 class="modal-title fw-bold">Document Preview</h5><button class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body bg-light"><iframe id="axtorInvoiceFrame" style="width:100%;height:72vh;border:0;background:white;border-radius:14px"></iframe></div><div class="modal-footer"><button class="btn btn-soft" data-invoice-whatsapp>Send WhatsApp</button><button class="btn btn-soft" data-invoice-copy-link>🔗 Copy Invoice Link</button><button class="btn btn-soft" data-invoice-pdf>Download PDF Preview</button><button class="btn btn-brand" data-invoice-modal-print>Print</button><button class="btn btn-soft" data-bs-dismiss="modal">Close</button></div></div></div></div>`); return $('#axtorInvoicePreviewModal')}

  let lastPreview={template:'modern-a4',html:'',data:null};
  function preview(templateId, opts={}){const id=templateId||selectedTemplate(opts.customer); const data=normalizeData(id, opts); const html=render(id,{data}); lastPreview={template:id,html,data}; const m=ensureModal(), f=$('#axtorInvoiceFrame'); if(f) f.srcdoc=html; if(m && window.bootstrap?.Modal){ window.bootstrap.Modal.getOrCreateInstance(m).show(); } else { toast('Invoice preview is unavailable on this page','warning'); } const h=read(KEYS.previewHistory,[]); h.unshift({template:lastPreview.template,ref:data.invoiceNo,time:new Date().toLocaleString()}); write(KEYS.previewHistory,h.slice(0,50)); audit('Invoice preview opened','-',data.invoiceNo||lastPreview.template)}
  function print(templateId, opts={}){const id=templateId||selectedTemplate(opts.customer); const data=normalizeData(id, opts); const html=render(id,{data}); openPrint(html); const h=read(KEYS.printHistory,[]); h.unshift({template:id,time:new Date().toLocaleString(),ref:data.invoiceNo}); write(KEYS.printHistory,h.slice(0,50)); audit('Invoice printed','-',data.invoiceNo||id)}
  function selectedTemplate(customer){const prefs=read(KEYS.customerPrefs,{}); if(customer&&prefs[customer]&&prefs[customer].template) return prefs[customer].template; return localStorage.getItem(KEYS.selected)||getInvoice().defaultInvoiceTemplate||'modern-a4'}

  function saveCompanyForm(){const obj=getCompany(); $$('[data-company-setting]').forEach(el=>obj[el.dataset.companySetting]=el.value); const symbols={QAR:'QAR ',AED:'AED ',SAR:'SAR ',KWD:'KWD ',BHD:'BHD ',USD:'$ ',EUR:'€ ',GBP:'£ '}; obj.currency=obj.currency||'QAR'; obj.currencySymbol=symbols[obj.currency]||((obj.currency||'QAR')+' '); write(KEYS.company,obj); audit('Company settings changed','Company profile','Saved'); toast('Company settings saved'); updateLivePreview(); renderSettingsSummary();}
  function loadCompanyForm(){const obj=getCompany(); $$('[data-company-setting]').forEach(el=>{el.value=obj[el.dataset.companySetting]||''}); ['logoData','stampData','signatureData'].forEach(k=>{const img=$(`[data-company-preview="${k}"]`); if(img&&obj[k]) img.src=obj[k]})}
  function saveInvoiceForm(){const obj=getInvoice(); $$('[data-invoice-setting]').forEach(el=>{obj[el.dataset.invoiceSetting]=el.type==='checkbox'?el.checked:el.value}); write(KEYS.invoice,obj); localStorage.setItem(KEYS.selected,obj.defaultInvoiceTemplate); audit('Invoice settings changed','Invoice preferences','Saved'); toast('Invoice settings saved'); renderSettingsSummary(); updateLivePreview()}
  function loadInvoiceForm(){const obj=getInvoice(); $$('[data-invoice-setting]').forEach(el=>{if(el.type==='checkbox') el.checked=!!obj[el.dataset.invoiceSetting]; else el.value=obj[el.dataset.invoiceSetting]??''}); renderSettingsSummary()}
  function renderSettingsSummary(){let boxes=$$('.invoice-settings-summary'); const legacy=$('#invoiceSettingsSummary'); if(!boxes.length && legacy) boxes=[legacy]; if(!boxes.length) return; const i=getInvoice(), t=templateList.find(x=>x.id===selectedTemplate())||templateList[0]; const html=`<div class="smallcaps">Current invoice setup</div><h5 class="mt-2">${esc(t.name)}</h5><p class="text-muted mb-2">${esc(i.defaultPrintSize)} • ${esc(i.defaultLanguage)} • ${esc(i.copyLabel)}</p><div class="d-flex gap-2 flex-wrap"><span class="badge-soft badge-paid">${esc(i.invoicePrefix)}${esc(i.nextInvoiceNumber)}</span><span class="badge-soft badge-pending">VAT ${i.vatEnabled?'On':'Off'}</span><span class="badge-soft badge-paid">Auto preview ${i.autoPreview?'On':'Off'}</span></div>`; boxes.forEach(box=>{ if(box) box.innerHTML=html; });}
  function renderGallery(){const wrap=$('#invoiceTemplateGallery'); if(!wrap) return; const selected=selectedTemplate(); wrap.innerHTML=templateList.map(t=>`<div class="col-md-6 col-xl-4"><div class="invoice-template-card ${selected===t.id?'active':''}"><div class="d-flex justify-content-between align-items-start"><div><h5>${esc(t.name)}</h5><p class="text-muted small">${esc(t.use)}</p></div>${t.badge?`<span class="badge-soft badge-paid">${esc(t.badge)}</span>`:''}</div><div class="invoice-thumb"><div></div><span>${esc(t.size)}</span></div><div class="d-flex gap-2 mt-3 flex-wrap"><button class="btn btn-sm btn-brand" data-select-template="${t.id}">Select default</button><button class="btn btn-sm btn-soft" data-preview-template="${t.id}">Preview</button><button class="btn btn-sm btn-soft" data-print-template="${t.id}">Print sample</button></div>${selected===t.id?'<div class="mt-2 text-brand fw-bold"><i class="bi bi-check-circle"></i> Selected default</div>':''}</div></div>`).join('')}
  function updateLivePreview(){const box=$('#invoiceLivePreview'); if(box){box.innerHTML='<iframe class="w-100" style="height:620px;border:0;background:white;border-radius:14px" sandbox="allow-same-origin allow-modals allow-popups"></iframe>'; const f=box.querySelector('iframe'); f.srcdoc=render(selectedTemplate());}}
  function initSettingsPage(){if(!$('#invoiceTemplateGallery') && !$('#invoiceSettingsForm')) return; loadCompanyForm(); loadInvoiceForm(); renderGallery(); updateLivePreview(); $('#saveCompanySettingsBtn')?.addEventListener('click',saveCompanyForm); $('#saveInvoiceSettingsBtn')?.addEventListener('click',saveInvoiceForm); $$('[data-image-upload]').forEach(input=>input.addEventListener('change',e=>{const file=e.target.files[0]; if(!file) return; const key=input.dataset.imageUpload; const r=new FileReader(); r.onload=()=>{const c=getCompany(); c[key]=r.result; write(KEYS.company,c); loadCompanyForm(); toast('Image saved in demo localStorage')}; r.readAsDataURL(file)})); }
  function loadDesignerForm(){const d=getDesigner(); $$('[data-designer]').forEach(el=>{const key=el.dataset.designer; if(key==='columns.salesman'){el.checked=false; el.disabled=true; return;} if(key.startsWith('columns.')) el.checked=!!d.columns[key.split('.')[1]]; else if(el.type==='checkbox') el.checked=!!d[key]; else el.value=d[key]??''}); updateLivePreview();}
  function saveDesignerForm(){const d=getDesigner(); $$('[data-designer]').forEach(el=>{const key=el.dataset.designer; if(key==='columns.salesman') return; if(key.startsWith('columns.')){d.columns=d.columns||{}; d.columns[key.split('.')[1]]=el.checked;} else d[key]=el.type==='checkbox'?el.checked:el.value}); migrateDesignerColumns(d); write(KEYS.designer,d); write(KEYS.columns,d.columns); audit('Invoice design saved','Designer','Saved'); toast('Invoice design saved'); updateLivePreview();}
  function initDesignerPage(){if(!$('#invoiceDesignerForm')) return; loadDesignerForm(); document.addEventListener('input',e=>{if(e.target.closest('#invoiceDesignerForm')){saveDesignerForm()}}); $('#saveInvoiceDesignBtn')?.addEventListener('click',saveDesignerForm); $('#resetInvoiceDesignBtn')?.addEventListener('click',()=>{write(KEYS.designer,clone(defaultDesigner)); write(KEYS.columns,clone(defaultDesigner.columns)); loadDesignerForm(); audit('Invoice design reset'); toast('Invoice design reset')}); $('#saveDesignerDefaultBtn')?.addEventListener('click',()=>{const d=getDesigner(); localStorage.setItem(KEYS.selected,d.templateBase); const i=getInvoice(); i.defaultInvoiceTemplate=d.templateBase; write(KEYS.invoice,i); toast('Designer base saved as default template')}); $('#exportTemplateJsonBtn')?.addEventListener('click',()=>{const data=getDesigner(); stripSalesmanColumn(data); const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='axtor-invoice-template.json'; a.click(); URL.revokeObjectURL(a.href); const ex=read(KEYS.exports,[]); ex.unshift({time:new Date().toLocaleString(),template:data.templateBase}); write(KEYS.exports,ex); audit('Exported invoice template JSON')}); $('#importTemplateJsonInput')?.addEventListener('change',e=>{const file=e.target.files[0]; if(!file) return; const r=new FileReader(); r.onload=()=>{try{const json=JSON.parse(r.result); const d=getDesigner(); merge(json,d); migrateDesignerColumns(json); write(KEYS.designer,json); write(KEYS.columns,json.columns||{}); loadDesignerForm(); toast('Template JSON imported')}catch(err){toast('Invalid template JSON','danger')}}; r.readAsText(file)});}
  function initCustomerPrefs(){const form=$('#customerInvoicePrefsForm'); if(!form) return; const prefs=read(KEYS.customerPrefs,defaultCustomerPrefs); function load(){const name=$('#customerPrefName').value; const p=prefs[name]||{}; $$('[data-customer-pref]').forEach(el=>{const k=el.dataset.customerPref; if(el.type==='checkbox') el.checked=!!p[k]; else el.value=p[k]??(k==='template'?selectedTemplate(): '')})} $('#customerPrefName')?.addEventListener('change',load); $('#saveCustomerInvoicePrefsBtn')?.addEventListener('click',()=>{const name=$('#customerPrefName').value; prefs[name]=prefs[name]||{}; $$('[data-customer-pref]').forEach(el=>{prefs[name][el.dataset.customerPref]=el.type==='checkbox'?el.checked:el.value}); write(KEYS.customerPrefs,prefs); audit('Customer invoice preferences changed','-',name); toast('Customer invoice preferences saved')}); load();}
  function whatsAppMessage(){const data=lastPreview.data||normalizeData(selectedTemplate(),{}); const t=templateList.find(x=>x.id===(lastPreview.template||selectedTemplate()))||templateList[0]; return `Dear ${data.customer},\n${data.documentTitle||'Sales Invoice'} ${data.invoiceNo} from Axtor Trading is ready.\nAmount: ${money(data.grand)}\nTemplate: ${t.name}\nPlease arrange payment if pending.\nThank you.`}
  function initGlobalButtons(){document.addEventListener('click',e=>{const sel=e.target.closest('[data-select-template]'); if(sel){const i=getInvoice(); const before=selectedTemplate(); i.defaultInvoiceTemplate=sel.dataset.selectTemplate; write(KEYS.invoice,i); localStorage.setItem(KEYS.selected,sel.dataset.selectTemplate); audit('Default invoice template changed',before,sel.dataset.selectTemplate); toast('Default invoice template selected'); renderGallery(); renderSettingsSummary(); updateLivePreview()} const pre=e.target.closest('[data-preview-template],[data-invoice-preview]'); if(pre){e.preventDefault(); const id=pre.dataset.previewTemplate||pre.dataset.invoicePreview||selectedTemplate(); preview(id)} const pr=e.target.closest('[data-print-template],[data-invoice-print]'); if(pr){e.preventDefault(); const id=pr.dataset.printTemplate||pr.dataset.invoicePrint||selectedTemplate(); print(id)} const modPrint=e.target.closest('[data-invoice-modal-print]'); if(modPrint){e.preventDefault(); openPrint(lastPreview.html||render(lastPreview.template||selectedTemplate()))} const pdf=e.target.closest('[data-invoice-pdf]'); if(pdf){const blob=new Blob(['Axtor POS Cloud PDF preview generated for '+(lastPreview.data?.invoiceNo||lastPreview.template)],{type:'text/plain'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='axtor-invoice-pdf-preview.txt'; a.click(); URL.revokeObjectURL(a.href); toast('PDF preview generated')} const link=e.target.closest('[data-invoice-copy-link]'); if(link){const payload=Object.assign({template:lastPreview.template||selectedTemplate()}, lastPreview.data||normalizeData(lastPreview.template||selectedTemplate(),{})); const encoded=btoa(unescape(encodeURIComponent(JSON.stringify(payload)))); const url=new URL('invoice-view.html', location.href); url.searchParams.set('data', encoded); copyText(url.href); audit('Invoice link copied','-',payload.invoiceNo); toast('Invoice link copied')} const wa=e.target.closest('[data-invoice-whatsapp],[data-whatsapp-invoice]'); if(wa){const msg=whatsAppMessage(); copyText(msg); const d=appDb(); d.communicationHistory=d.communicationHistory||[]; d.communicationHistory.unshift({time:new Date().toLocaleString(),type:'WhatsApp Invoice',message:msg,status:'Prepared'}); saveAppDb(d); const company=getCompany(); if(company.whatsapp) window.open('https://wa.me/'+company.whatsapp+'?text='+encodeURIComponent(msg),'_blank'); audit('WhatsApp invoice message prepared','-',lastPreview.data?.invoiceNo||selectedTemplate()); toast('WhatsApp invoice message copied and WhatsApp opened')}} , true);
    const oldModal=$('#invoiceModal'); if(oldModal){oldModal.addEventListener('show.bs.modal',()=>setTimeout(()=>{const body=oldModal.querySelector('.modal-body'); if(body){ body.innerHTML='<iframe style="width:100%;height:72vh;border:0;background:white;border-radius:14px"></iframe>'; body.querySelector('iframe').srcdoc=lastPreview.html||render(selectedTemplate()); } const footer=oldModal.querySelector('.modal-footer'); if(footer) footer.innerHTML='<button class="btn btn-soft" data-bs-dismiss="modal">Close</button><button class="btn btn-soft" data-whatsapp-invoice>WhatsApp</button><button class="btn btn-soft" data-invoice-copy-link>🔗 Copy Invoice Link</button><button class="btn btn-brand" data-invoice-modal-print>Print Invoice</button>';},20))}
  }
  function init(){ensure(); initSettingsPage(); initDesignerPage(); initCustomerPrefs(); initGlobalButtons();}
  window.AxtorInvoice={templates:templateList,render,preview,print,selectedTemplate,getCompany,getInvoice,getDesigner,toast,audit,sampleData,normalizeData,resolveSalesman};
  document.addEventListener('DOMContentLoaded',init);
})();
