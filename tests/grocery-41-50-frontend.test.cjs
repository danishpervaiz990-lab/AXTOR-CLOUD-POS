const fs=require('fs');const assert=require('assert');
const html=fs.readFileSync('demo-static/grocery-new.html','utf8');
const src=fs.readFileSync('demo-static/js/grocery-phase5-41-50.js','utf8');
const completion=fs.readFileSync('demo-static/js/grocery-phase5-completion.js','utf8');
const printProfile=fs.readFileSync('demo-static/js/grocery-phase5-print-profile.js','utf8');
const all=src+'\n'+completion+'\n'+printProfile;

assert(html.includes('/js/grocery-phase5-41-50.js?v=20260808-1'),'phase 5 runtime must load');
assert(html.includes('/js/grocery-phase5-completion.js?v=20260808-1'),'phase 5 completion runtime must load');
assert(html.includes('/js/grocery-phase5-print-profile.js?v=20260808-1'),'print profile runtime must load');
assert(html.indexOf('grocery-phase5-41-50.js')>html.indexOf('grocery-phase4-completion.js'),'phase 5 must load after 31-40 completion');
assert(html.indexOf('grocery-phase5-print-profile.js')>html.indexOf('grocery-phase5-completion.js'),'print-profile completion must load last');
assert(src.includes('Grocery · Requirements 1–50'),'shell must identify 1-50 completion');

for(const marker of ['Stock Valuation','Barcode & Shelf Labels','Purchase Cost History','Print Center','Notification Center','Grocery Settings','Bulk Import / Export','Global Search'])assert(src.includes(marker),`missing navigation/workspace: ${marker}`);
for(const endpoint of ['/api/v1/grocery/dashboard-v5','/api/v1/grocery/valuation','/api/v1/grocery/print/profiles','/api/v1/grocery/labels/preview','/api/v1/grocery/notification-rules','/api/v1/grocery/settings-v5','/api/v1/grocery/imports/preview','/api/v1/grocery/imports/commit','/api/v1/grocery/exports/','/api/v1/grocery/search'])assert(src.includes(endpoint),`missing endpoint: ${endpoint}`);

for(const marker of ['Sales Today','Profit Today','Purchases Today','Expenses Today','Net Cash','Current Stock Value','Receivables','Payables','Low Stock','Expiring Products','Cheques Due','Sales Trend','Profit Trend','Payment Methods','Sales by Category','Top Products','Top Customers','No valid prior period'])assert(src.includes(marker),`dashboard contract missing ${marker}`);
assert(completion.includes('salesVsPreviousMonth')&&completion.includes('Month vs Previous'),'previous-month comparison must be rendered');
assert(src.includes('Weighted Average')&&src.includes('FEFO'),'valuation policy must be visible');
assert(src.includes('server-paginated'),'valuation list must disclose server pagination');

for(const marker of ['58mm','80mm','A5','A4','Letter','p50-print-target','@media print','Print Center'])assert(src.includes(marker),`printing contract missing ${marker}`);
for(const marker of ['Print Profile Settings','showLogo','showAddress','showPhone','showTaxNumber','showQr','showBarcode','showCashier','showCounter','showCustomer','showInvoiceNumber','showTaxSummary','marginTopMm','fontScale','copies','terms'])assert(printProfile.includes(marker),`print profile UI missing ${marker}`);
assert(printProfile.includes('?profile=')&&printProfile.includes('p50ApplyPrintProfile'),'selected profile must drive printable preview');
for(const marker of ['product_barcode','shelf_label','price_label','maximum 500','CODE128','EAN13','EAN8','UPC'])assert(src.includes(marker),`label contract missing ${marker}`);
for(const marker of ['P50_CODE128','P50_L','P50_G','P50_R','p50Code128B','p50Ean13','p50Ean8','p50Upc','p50ModulesSvg'])assert(completion.includes(marker),`scannable barcode renderer missing ${marker}`);
assert(!completion.includes('repeating-linear-gradient'),'completion renderer must use encoded SVG modules, not decorative bars');

for(const marker of ['Low/out stock','expiry','customer/supplier dues','cheques','pending PO/transfers/counts','large discounts','refunds'])assert(src.toLowerCase().includes(marker.toLowerCase()),`notification UX missing ${marker}`);
for(const marker of ['grocery.business','grocery.pos','grocery.sales','grocery.purchases','grocery.inventory','grocery.accounting','grocery.printing','grocery.notifications'])assert(src.includes(marker),`settings group missing ${marker}`);

for(const marker of ['products','categories','customers','suppliers','opening_stock','product_pricing','Preview Import','Commit Exact Preview','rejected','CSV or JSON file'])assert(src.includes(marker),`bulk data contract missing ${marker}`);
assert(src.includes("setTimeout(async()=>")&&src.includes('300);'),'global search must be debounced 300ms');
assert(src.includes('limit=25'),'global search must be bounded per group');
assert(!all.includes('/api/v1/products?limit=10000'),'frontend must not load 10k products for search');
assert(!src.includes('localStorage')||!src.includes('fakeStock'),'phase 5 must not implement fake persisted business data');

console.log('PASS: Grocery requirements 41-50 frontend contracts certified.');
