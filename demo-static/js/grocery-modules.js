(function(){
  'use strict';
  const page=document.body.dataset.page||'';
  const api=async(path)=>AxtorAPI.apiGet(path,{cache:false});
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const unwrap=v=>v&&Object.prototype.hasOwnProperty.call(v,'data')?v.data:v;
  async function listModule(title,subtitle,path,columns){
    if(typeof window.groceryShell==='function') window.groceryShell(title,subtitle);
    const app=document.getElementById('app');
    app.innerHTML='<section class="g-panel"><div class="g-toolbar"><h2>'+esc(title)+'</h2><input id="moduleSearch" class="g-search" placeholder="Search"></div><div class="g-table-wrap"><table class="g-table"><thead><tr>'+columns.map(c=>'<th>'+esc(c[1])+'</th>').join('')+'</tr></thead><tbody id="moduleRows"><tr><td colspan="'+columns.length+'">Loading…</td></tr></tbody></table></div></section>';
    const payload=unwrap(await api(path))||[];
    const rows=Array.isArray(payload)?payload:(payload.items||payload.records||payload.results||[]);
    const render=()=>{
      const q=(document.getElementById('moduleSearch').value||'').toLowerCase();
      const filtered=q?rows.filter(r=>JSON.stringify(r).toLowerCase().includes(q)):rows;
      document.getElementById('moduleRows').innerHTML=filtered.map(r=>'<tr>'+columns.map(c=>'<td>'+esc(c[0].split('.').reduce((v,k)=>v==null?v:v[k],r)??'—')+'</td>').join('')+'</tr>').join('')||'<tr><td colspan="'+columns.length+'">No records found.</td></tr>';
    };
    document.getElementById('moduleSearch').addEventListener('input',render); render();
  }
  const handlers={
    sales:()=>listModule('Sales & Returns','Posted Grocery invoices, returns and refunds','/api/v1/sales-documents?limit=500',[['documentNo','Document'],['documentType','Type'],['customerName','Customer'],['grandTotal','Total'],['status','Status'],['createdAt','Created']]),
    shifts:()=>listModule('Shifts / Closing','Cashier shifts and register closing','/api/v1/shifts?limit=500',[['shiftNo','Shift'],['cashier.name','Cashier'],['terminal.name','Terminal'],['openingCash','Opening'],['closingCash','Closing'],['status','Status']]),
    customers:()=>listModule('Customers','Grocery customer and loyalty profiles','/api/v1/customers?limit=500',[['code','Code'],['name','Customer'],['phone','Phone'],['email','Email'],['loyaltyPoints','Points'],['status','Status']]),
    categories:()=>listModule('Categories','Tenant-scoped Grocery departments and subcategories','/api/v1/categories?limit=500',[['code','Code'],['name','Category'],['parent.name','Parent'],['active','Active']]),
    inventory:()=>listModule('Inventory','Warehouse stock, reorder and availability','/api/v1/inventory?limit=500',[['product.sku','SKU'],['product.name','Product'],['warehouse.name','Warehouse'],['quantity','On Hand'],['reservedQuantity','Reserved'],['availableQuantity','Available']]),
    labels:()=>listModule('Barcode / Scale Labels','Barcode, PLU and scale label catalogue','/api/v1/products?active=true',[['sku','SKU'],['barcode','Barcode'],['customFields.plu','PLU'],['name','Product'],['unit','Unit'],['price','Price']]),
    purchases:()=>listModule('Purchases','Purchase orders, goods receipts and supplier invoices','/api/v1/purchases?limit=500',[['documentNo','Document'],['supplier.name','Supplier'],['documentType','Type'],['total','Total'],['status','Status'],['documentDate','Date']]),
    suppliers:()=>listModule('Suppliers','Supplier master and account status','/api/v1/suppliers?limit=500',[['code','Code'],['name','Supplier'],['phone','Phone'],['email','Email'],['balance','Balance'],['status','Status']]),
    promotions:()=>listModule('Promotions','Active promotions and markdown campaigns','/api/v1/promotions?limit=500',[['code','Code'],['name','Promotion'],['type','Type'],['startDate','Starts'],['endDate','Ends'],['status','Status']]),
    loyalty:()=>listModule('Loyalty','Customer points and reward activity','/api/v1/loyalty/transactions?limit=500',[['customer.name','Customer'],['type','Type'],['points','Points'],['referenceNo','Reference'],['createdAt','Created']]),
    expenses:()=>listModule('Expenses','Store operating expenses','/api/v1/expenses?limit=500',[['documentNo','Document'],['category.name','Category'],['description','Description'],['amount','Amount'],['paymentMethod','Payment'],['date','Date']]),
    accounts:()=>listModule('Accounts','Cash, bank and ledger balances','/api/v1/accounts?limit=500',[['code','Code'],['name','Account'],['type','Type'],['balance','Balance'],['currency','Currency']]),
    users:()=>listModule('Users / Roles','Grocery users and assigned roles','/api/v1/users?limit=500',[['name','User'],['email','Email'],['role.name','Role'],['status','Status'],['lastLoginAt','Last Login']]),
    notifications:()=>listModule('Notifications','Expiry, stock and operational alerts','/api/v1/notifications?limit=500',[['type','Type'],['title','Notification'],['severity','Severity'],['read','Read'],['createdAt','Created']])
  };
  document.addEventListener('DOMContentLoaded',()=>{if(handlers[page]) handlers[page]().catch(err=>{const app=document.getElementById('app'); if(app) app.innerHTML='<section class="g-panel"><div class="g-status error">'+esc(err.message||'Module failed to load')+'</div></section>';});});
})();