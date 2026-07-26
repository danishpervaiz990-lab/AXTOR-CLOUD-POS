/* Axtor POS Cloud — canonical localStorage data layer
   Loaded first on every page. All modules use these shared helpers. */
const AXTOR_DB_KEY = 'axtorAdvancedDemoDB';
const DEFAULT_TAX_RATE = 5;
const AXTOR_SCHEMA_VERSION = 5;
const AXTOR_MODE = 'customer-ready';
const AXTOR_NEUTRAL_USERS = [
  {user:'Owner', role:'Owner'},
  {user:'Manager', role:'Manager'},
  {user:'Cashier', role:'Cashier'},
  {user:'Warehouse User', role:'Warehouse User'}
];
const AXTOR_FRESH_ARRAY_KEYS = [
  'customers','suppliers','products','invoices','customerCreditInvoices','supplierBills',
  'customerPayments','supplierPayments','purchases','purchaseReturns','stockMovements',
  'stockTransfers','stockCountSessions','shiftRecords','terminalCart','heldSales','expenses',
  'returnsExchanges','approvalRequests','approvalHistory','auditEvents','loyaltyPoints',
  'loyaltyHistory','commissionPayouts','salesmanTargets','salesmen','promotions','activity',
  'syncQueue','branches','warehouses','counters','productCategories','reorderSuggestions',
  'creditAging','creditReminders','supplierAging','supplierNotes'
];
function freshCustomerData(){
  const d={
    _schemaVersion: AXTOR_SCHEMA_VERSION,
    _mode: AXTOR_MODE,
    _freshCustomerReady: true,
    setupCompleted: false,
    selectedIndustry: '',
    documentCounters: {invoice:1, quotation:1, delivery_note:1},
    purchaseCounter: 1,
    currentShift: null,
    terminalSession: null,
    purchaseFlow: {requests:[], pos:[], grns:[], bills:[], returns:[]},
    userRoles: AXTOR_NEUTRAL_USERS.map(u=>({...u})),
    rolesPermissions: {Owner:{}, Manager:{}, Cashier:{}, Accountant:{}, 'Warehouse User':{}, Salesman:{}, Purchaser:{}, Auditor:{}},
    barcodeTemplates: [{size:'40x30 mm'}, {size:'50x25 mm'}, {size:'80x40 mm'}],
    hardwareSettings: [
      {name:'Receipt printer', status:'Not Configured'},
      {name:'Barcode scanner', status:'Not Configured'},
      {name:'Cash drawer', status:'Not Configured'},
      {name:'Customer display', status:'Not Configured'},
      {name:'Weighing scale', status:'Not Configured'},
      {name:'Card terminal', status:'Not Configured'},
      {name:'Label printer', status:'Not Configured'}
    ],
    syncStatus: {online:true, lastSync:'Never'}
  };
  AXTOR_FRESH_ARRAY_KEYS.forEach(k=>{ if(!Array.isArray(d[k])) d[k]=[]; });
  return d;
}
const AXTOR_BASE_SEED = freshCustomerData();
const AXTOR_ADVANCED_SEED = {};

function clone(x){ return JSON.parse(JSON.stringify(x)); }
function save(data){ localStorage.setItem(AXTOR_DB_KEY, JSON.stringify(data || {})); }
function num(v){ const n = Number(v); return Number.isFinite(n) ? n : 0; }
function readCompanySettings(){ try{ return JSON.parse(localStorage.getItem('companySettings') || '{}') || {}; }catch(e){ return {}; } }
function money(v){ const currency = readCompanySettings().currencySymbol || 'QAR '; const n = num(v); return currency + n.toLocaleString(undefined, {minimumFractionDigits:n%1?2:0, maximumFractionDigits:2}); }
function esc(v){ return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function toast(msg, type='success'){ const el=document.createElement('div'); el.className=`position-fixed bottom-0 end-0 m-3 alert alert-${type} shadow`; el.style.zIndex=10000; el.textContent=msg; document.body.appendChild(el); setTimeout(()=>el.remove(),2600); }
function nextNo(prefix, arr){ const nums=(arr||[]).map(x=>parseInt(String(x?.id||x?.no||'').replace(/\D/g,''),10)||0); return prefix+'-'+String((nums.length?Math.max(...nums):1000)+1).padStart(4,'0'); }
function promoStableId(){ return 'PROMO-' + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

function mergeSeed(target, src){
  let changed=false;
  Object.keys(src||{}).forEach(k=>{
    if(target[k]===undefined){ target[k]=clone(src[k]); changed=true; }
    else if(src[k] && typeof src[k]==='object' && !Array.isArray(src[k]) && target[k] && typeof target[k]==='object' && !Array.isArray(target[k])){
      Object.keys(src[k]).forEach(sk=>{ if(target[k][sk]===undefined){ target[k][sk]=clone(src[k][sk]); changed=true; } });
    }
  });
  return changed;
}

function normalizePromotionFields(d){
  let changed=false;
  (d.promotions||[]).forEach(p=>{
    if(!p.id){ p.id = promoStableId(); changed=true; }
    if(p.discountValue === undefined && p.value){
      const parsed = parseFloat(String(p.value).replace(/[^0-9.]/g,''));
      if(!isNaN(parsed)){ p.discountValue = parsed; changed=true; }
      if(!p.discountType){ p.discountType = String(p.value).includes('%') ? 'Percentage' : 'Fixed amount'; changed=true; }
    }
    if(!p.discountType){ p.discountType='Percentage'; changed=true; }
    if(p.deleted===undefined){ p.deleted=false; changed=true; }
  });
  return changed;
}

function dueDateFrom(dateValue){ const d=new Date(); d.setDate(d.getDate()+30); return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); }
function syncCustomerReceivableCore(data, inv){
  data.customerCreditInvoices=data.customerCreditInvoices||[];
  if(!inv) return false;
  const no=String(inv.no||inv.invoiceNo||inv.id||'');
  if(!no || no.startsWith('DRAFT')) return false;
  const total=num(inv.total??inv.amount??inv.grand);
  const paid=num(inv.paid);
  const bal=Math.max(0,total-paid);
  const before=JSON.stringify(data.customerCreditInvoices.filter(x=>String(x.no)===no));
  data.customerCreditInvoices=data.customerCreditInvoices.filter((x,i,arr)=>String(x.no)!==no || arr.findIndex(y=>String(y.no)===no)===i);
  let row=data.customerCreditInvoices.find(x=>String(x.no)===no);
  if(bal>0 && inv.customer && inv.customer!=='Walk-in Customer'){
    if(!row){ row={no}; data.customerCreditInvoices.unshift(row); }
    row.customer=inv.customer;
    row.date=inv.date||new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
    row.due=row.due||dueDateFrom(row.date);
    row.total=total;
    row.paid=paid;
    row.balance=bal;
    row.status=paid>0?'Partially Paid':'Open';
    row.paymentMethod=inv.paymentMethod||inv.paymentType||'Customer credit';
  } else if(row){
    row.customer=inv.customer||row.customer;
    row.total=total;
    row.paid=total;
    row.balance=0;
    row.status='Closed';
  }
  return before!==JSON.stringify(data.customerCreditInvoices.filter(x=>String(x.no)===no));
}
function updateCustomerBalancesCore(data){
  let changed=false;
  (data.customers||[]).forEach(c=>{
    if(!c || c.name==='Walk-in Customer') return;
    const bal=(data.customerCreditInvoices||[]).filter(i=>i.customer===c.name && customerCreditRowIsPayableCore(i)).reduce((a,i)=>a+Math.max(0,num(i.total)-num(i.paid)),0);
    if(num(c.balance)!==bal || c.status!==(bal>0?'Due':'Clear')){ c.balance=bal; c.status=bal>0?'Due':'Clear'; changed=true; }
  });
  return changed;
}

function normalizeDocumentTypeCore(type,no){
  const raw=String(type||'').toLowerCase().replace(/[\s-]+/g,'_');
  if(raw==='quotation'||raw==='quote'||raw==='qtn') return 'quotation';
  if(raw==='delivery_note'||raw==='delivery'||raw==='dn'||raw==='deliverynote') return 'delivery_note';
  const n=String(no||'');
  if(n.startsWith('QTN-')) return 'quotation';
  if(n.startsWith('DN-')) return 'delivery_note';
  return 'invoice';
}
function documentPrefixCore(type){ return type==='quotation'?'QTN':(type==='delivery_note'?'DN':'INV'); }
function customerCreditRowIsPayableCore(row){ const no=String(row?.no||row?.invoiceNo||row?.documentNo||row?.id||''); return !!no && !no.startsWith('DRAFT') && !no.startsWith('QTN-') && !no.startsWith('DN-'); }
function invoiceIsFinalCore(inv){
  const no=String(inv?.no||inv?.invoiceNo||inv?.id||'');
  return normalizeDocumentTypeCore(inv?.documentType,no)==='invoice' && !no.startsWith('DRAFT') && String(inv?.status||'').toLowerCase()!=='draft';
}

function normalizeCoreCollections(d){
  let changed=false;
  if(!d || typeof d!=='object') return false;
  if(d._schemaVersion!==AXTOR_SCHEMA_VERSION){ d._schemaVersion=AXTOR_SCHEMA_VERSION; changed=true; }
  if(d._mode!==AXTOR_MODE){ d._mode=AXTOR_MODE; changed=true; }
  if(d._freshCustomerReady!==true){ d._freshCustomerReady=true; changed=true; }
  AXTOR_FRESH_ARRAY_KEYS.forEach(k=>{ if(!Array.isArray(d[k])){ d[k]=[]; changed=true; } });
  if(!d.rolesPermissions || typeof d.rolesPermissions!=='object' || Array.isArray(d.rolesPermissions)){
    d.rolesPermissions={Owner:{},Manager:{},Cashier:{},Accountant:{},'Warehouse User':{},Salesman:{},Purchaser:{},Auditor:{}}; changed=true;
  }
  if(!Array.isArray(d.userRoles)) { d.userRoles=[]; changed=true; }
  AXTOR_NEUTRAL_USERS.forEach(u=>{
    if(!d.userRoles.some(x=>String(x?.user||'').toLowerCase()===u.user.toLowerCase())){ d.userRoles.push({...u}); changed=true; }
  });
  if(!d.documentCounters || typeof d.documentCounters!=='object' || Array.isArray(d.documentCounters)){ d.documentCounters={invoice:1,quotation:1,delivery_note:1}; changed=true; }
  ['invoice','quotation','delivery_note'].forEach(type=>{
    if(!Number.isFinite(Number(d.documentCounters[type])) || Number(d.documentCounters[type])<1){ d.documentCounters[type]=1; changed=true; }
  });
  if(!Number.isFinite(Number(d.purchaseCounter)) || Number(d.purchaseCounter)<1){ d.purchaseCounter=1; changed=true; }
  if(d.currentShift===undefined){ d.currentShift=null; changed=true; }
  if(d.terminalSession===undefined){ d.terminalSession=null; changed=true; }
  if(d.setupCompleted===undefined){ d.setupCompleted=false; changed=true; }
  if(d.selectedIndustry===undefined || d.selectedIndustry==='Paint Store'){ d.selectedIndustry=''; changed=true; }
  if(!d.purchaseFlow || typeof d.purchaseFlow!=='object' || Array.isArray(d.purchaseFlow)){ d.purchaseFlow={requests:[],pos:[],grns:[],bills:[],returns:[]}; changed=true; }
  ['requests','pos','grns','bills','returns'].forEach(k=>{ if(!Array.isArray(d.purchaseFlow[k])){ d.purchaseFlow[k]=[]; changed=true; } });
  if(!Array.isArray(d.barcodeTemplates) || !d.barcodeTemplates.length){ d.barcodeTemplates=[{size:'40x30 mm'},{size:'50x25 mm'},{size:'80x40 mm'}]; changed=true; }
  if(!d.hardwareSettings || !Array.isArray(d.hardwareSettings)){ d.hardwareSettings=clone(freshCustomerData().hardwareSettings); changed=true; }
  if(!d.syncStatus || typeof d.syncStatus!=='object' || Array.isArray(d.syncStatus)){ d.syncStatus={online:true,lastSync:'Never'}; changed=true; }
  const catSet=new Set((d.productCategories||[]).map(c=>String(c).toLowerCase()));
  (d.products||[]).forEach(p=>{
    if(p && p.category && !catSet.has(String(p.category).toLowerCase())){ d.productCategories.push(p.category); catSet.add(String(p.category).toLowerCase()); changed=true; }
    if(p && p.deleted===undefined){ p.deleted=false; changed=true; }
  });
  const supplierNames=new Set((d.suppliers||[]).map(s=>String(s.name||'').toLowerCase()));
  (d.supplierBills||[]).forEach(b=>{
    if(b.supplier && !supplierNames.has(String(b.supplier).toLowerCase())){
      d.suppliers.push({id:'SUP-'+String(d.suppliers.length+1).padStart(3,'0'), name:b.supplier, phone:'', email:'', company:b.supplier, address:'', openingBalance:0, creditDays:30, active:true});
      supplierNames.add(String(b.supplier).toLowerCase()); changed=true;
    }
  });
  (d.customers||[]).forEach(c=>{ if(c && !c.creditDays){ c.creditDays=30; changed=true; } });
  (d.counters||[]).forEach((c,i)=>{
    if(!c.id){ c.id='CTR-'+String(1001+i).padStart(4,'0'); changed=true; }
    if(!c.name){ c.name='Counter '+(i+1); changed=true; }
    if(!c.assignedCashier && c.cashier){ c.assignedCashier=c.cashier; changed=true; }
    if(!c.cashier && c.assignedCashier){ c.cashier=c.assignedCashier; changed=true; }
    if(!c.status || c.status==='Online'){ c.status='Active'; c.active=true; changed=true; }
    if(c.status==='Offline'){ c.status='Inactive'; c.active=false; changed=true; }
    if(c.active===undefined){ c.active=c.status!=='Inactive'; changed=true; }
  });
  (d.invoices||[]).forEach((inv)=>{
    const currentNo=String(inv.no||inv.invoiceNo||inv.id||'');
    const docType=normalizeDocumentTypeCore(inv.documentType,currentNo);
    const prefix=documentPrefixCore(docType);
    if(inv.documentType!==docType){ inv.documentType=docType; changed=true; }
    if(inv.documentPrefix!==prefix){ inv.documentPrefix=prefix; changed=true; }
    if(!inv.documentNo && currentNo){ inv.documentNo=currentNo; changed=true; }
    if(!inv.id && currentNo){ inv.id=currentNo; changed=true; }
    if(!inv.invoiceNo && currentNo){ inv.invoiceNo=currentNo; changed=true; }
    if(!inv.customerName && inv.customer){ inv.customerName=inv.customer; changed=true; }
    if(!inv.paymentStatus){ inv.paymentStatus=docType==='invoice'?(inv.status||'Paid'):'not_applicable'; changed=true; }
    if(!inv.stockStatus){ inv.stockStatus=docType==='invoice'?'deducted':'not_deducted'; changed=true; }
    if(!inv.createdAt){ inv.createdAt=inv.date||''; changed=true; }
    if(inv.total===undefined && inv.amount!==undefined){ inv.total=inv.amount; changed=true; }
    const lpo=String(inv.lpoNo || inv.customerLpoNo || inv.customerPoNo || inv.poNo || '').trim();
    if(lpo){
      if(inv.lpoNo!==lpo){ inv.lpoNo=lpo; changed=true; }
      if(inv.customerLpoNo!==lpo){ inv.customerLpoNo=lpo; changed=true; }
      if(inv.customerPoNo!==lpo){ inv.customerPoNo=lpo; changed=true; }
      if(inv.poNo!==lpo){ inv.poNo=lpo; changed=true; }
    }
    if(inv.paid===undefined && String(inv.status||'').toLowerCase()!=='draft'){
      inv.paid=(docType==='invoice' && String(inv.status||'').toLowerCase()==='credit')?0:(docType==='invoice'?num(inv.total||inv.amount):0); changed=true;
    }
    if(inv.balance===undefined && String(inv.status||'').toLowerCase()!=='draft'){ inv.balance=Math.max(0,num(inv.total||inv.amount)-num(inv.paid)); changed=true; }
    if(invoiceIsFinalCore(inv) && (String(inv.status||'').toLowerCase()==='credit' || num(inv.balance)>0)){ if(syncCustomerReceivableCore(d,inv)) changed=true; }
  });
  ['invoice','quotation','delivery_note'].forEach(type=>{
    const prefix=documentPrefixCore(type); let next=num(d.documentCounters[type]||1);
    (d.invoices||[]).forEach(inv=>{ const no=String(inv.documentNo||inv.no||inv.invoiceNo||inv.id||''); if(no.startsWith(prefix+'-')){ const n=num(no.slice(prefix.length+1).replace(/\D/g,'')); if(n>=next) next=n+1; } });
    if(num(d.documentCounters[type])!==next){ d.documentCounters[type]=next; changed=true; }
  });
  if(updateCustomerBalancesCore(d)) changed=true;
  if(normalizePromotionFields(d)) changed=true;
  return changed;
}

function isCustomerReadyData(d){
  return d && typeof d==='object' && d._mode===AXTOR_MODE && d._freshCustomerReady===true && num(d._schemaVersion)>=AXTOR_SCHEMA_VERSION;
}
function cleanBusinessDraftKeys(){
  ['axtorPurchaseCart','axtorInventoryStockCountDraft','axtorSelectedPurchaseSupplier','axtorPosCart','axtorEditingInvoiceNo','axtorEditingCustomer','axtorEditingPayment','axtorTerminalCart','axtorHeldSales','axtorStockCountDraft','companySettings','axtorSelectedIndustry','currentUser','axtorCurrentUser','axtorCurrentRole','axtorDemoRole'].forEach(k=>{
    try{ localStorage.removeItem(k); }catch(e){}
    try{ sessionStorage.removeItem(k); }catch(e){}
  });
}
function resetInvoiceNumbering(){
  const current=readCompanySettings();
  const invoiceSettings={
    invoicePrefix:'INV-', nextInvoiceNumber:'0001', quotationPrefix:'QTN-', nextQuotationNumber:'0001', deliveryNotePrefix:'DN-', nextDeliveryNoteNumber:'0001',
    vatEnabled:true, taxEnabled:true, vatPercent: current.vatPercent ?? current.taxRate ?? DEFAULT_TAX_RATE, taxRate: current.taxRate ?? current.vatPercent ?? DEFAULT_TAX_RATE
  };
  try{ localStorage.setItem('invoiceSettings', JSON.stringify(invoiceSettings)); }catch(e){}
}
function resetToFreshCustomer(options={}){
  const shouldConfirm = options.confirm !== false;
  if(shouldConfirm && typeof confirm==='function' && !confirm('This will remove all local demo business data and start as a new customer. Continue?')) return null;
  const keepTheme = {
    axtorTheme: localStorage.getItem('axtorTheme'),
    axtorThemeStyle: localStorage.getItem('axtorThemeStyle'),
    axtorAccent: localStorage.getItem('axtorAccent')
  };
  const data=freshCustomerData();
  cleanBusinessDraftKeys();
  resetInvoiceNumbering();
  save(data);
  Object.entries(keepTheme).forEach(([k,v])=>{ if(v!==null) localStorage.setItem(k,v); });
  return data;
}
function setupIsComplete(dataArg){
  const d=dataArg||db();
  const company=readCompanySettings();
  return d.setupCompleted===true || !!(company.companyName || company.businessName || d.companyName) || (Array.isArray(d.branches)&&d.branches.length>0 && Array.isArray(d.warehouses)&&d.warehouses.length>0);
}
function markSetupComplete(){
  const d=db();
  d.setupCompleted=true;
  d.setupCompletedAt=new Date().toISOString();
  save(d);
  const banner=document.getElementById('freshCustomerOnboardingBanner');
  if(banner) banner.remove();
  return d;
}
function injectFreshCustomerBanner(){
  if(setupIsComplete()) return;
  if(document.getElementById('freshCustomerOnboardingBanner')) return;
  const page=document.querySelector('main.page') || document.querySelector('.page') || document.body;
  const html=`<div id="freshCustomerOnboardingBanner" class="fresh-customer-banner alert alert-info shadow-sm d-flex flex-wrap justify-content-between align-items-center gap-2" role="alert"><div><strong>Welcome to Axtor POS Cloud.</strong> Complete setup to start your company.</div><a class="btn btn-sm btn-brand" href="setup.html"><i class="bi bi-magic"></i> Open Setup Wizard</a></div>`;
  page.insertAdjacentHTML('afterbegin', html);
}
function injectFreshCustomerResetTools(){
  if(!/settings\.html$/i.test(location.pathname) || document.getElementById('freshCustomerResetCard')) return;
  const page=document.querySelector('main.page') || document.querySelector('.page') || document.body;
  page.insertAdjacentHTML('beforeend', `<section id="freshCustomerResetCard" class="cardx mt-4"><div class="d-flex flex-wrap justify-content-between align-items-center gap-2"><div><h5 class="cardx-title mb-1">Fresh Customer Copy</h5><p class="text-muted mb-0">Reset local business data so the system opens like a brand-new customer account.</p></div><button id="resetFreshCustomerCopyBtn" class="btn btn-outline-danger"><i class="bi bi-arrow-counterclockwise"></i> Reset to Fresh Customer Copy</button></div></section>`);
  document.getElementById('resetFreshCustomerCopyBtn')?.addEventListener('click',()=>{
    const data=resetToFreshCustomer({confirm:true});
    if(data){ toast('Fresh customer copy created. Reloading...','success'); setTimeout(()=>location.reload(),700); }
  });
}
function installFreshCustomerHooks(){
  injectFreshCustomerBanner();
  injectFreshCustomerResetTools();
  document.addEventListener('click',e=>{
    if(e.target.closest('#saveSetupBtn,#finishSetupBtn,#saveCompanySettingsBtn,#saveTaxSettingsBtn,[data-complete-setup]')) setTimeout(markSetupComplete,80);
  });
}

function db(){
  let data=null;
  const raw=localStorage.getItem(AXTOR_DB_KEY);
  if(raw){
    try{ data=JSON.parse(raw)||{}; }catch(e){ data=null; }
  }
  if(!isCustomerReadyData(data)){
    data=freshCustomerData();
    cleanBusinessDraftKeys();
    resetInvoiceNumbering();
    save(data);
    return data;
  }
  let changed=false;
  if(normalizeCoreCollections(data)) changed=true;
  if(changed) save(data);
  return data;
}

function runMigrations(){
  const d=db();
  if(normalizeCoreCollections(d) || normalizePromotionFields(d)) save(d);
  return d;
}

function loadOptionalDemoData(){
  const d=freshCustomerData();
  d._mode='customer-ready';
  d._freshCustomerReady=true;
  d.setupCompleted=true;
  d.selectedIndustry='Paint Store';
  d.customers=[{name:'Walk-in Customer',phone:'-',type:'Retail',balance:0,status:'Cash',creditDays:30}];
  d.products=[{sku:'SAMPLE-001',name:'Sample Product',category:'Sample',price:10,stock:25,status:'In stock'}];
  d.productCategories=['Sample'];
  d.branches=[{name:'Main Branch',status:'Active'}];
  d.warehouses=[{name:'Main Warehouse',branch:'Main Branch',stockValue:0}];
  d.counters=[{id:'CTR-1001',name:'Counter 1',branch:'Main Branch',assignedCashier:'Cashier',cashier:'Cashier',status:'Active',active:true}];
  save(d);
  return d;
}

window.AxtorCoreData={db,save,num,money,esc,toast,nextNo,runMigrations,promoStableId,freshCustomerData,resetToFreshCustomer,setupIsComplete,markSetupComplete,cleanBusinessDraftKeys};
window.AxtorToast = toast;
window.runMigrations = runMigrations;
window.AxtorResetToFreshCustomer = function(options){ const data=resetToFreshCustomer(options||{}); if(data && (!options || options.reload!==false)) location.reload(); return data; };
window.AxtorLoadDemoData = function(options){ const data=loadOptionalDemoData(); if(!options || options.reload!==false) location.reload(); return data; };
runMigrations();
document.addEventListener('DOMContentLoaded', installFreshCustomerHooks);
