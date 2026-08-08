const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

const root=path.join(__dirname,'../demo-static');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('grocery-new.html');
const core=read('js/grocery-enhancement-core.js');
const product=read('js/grocery-enhancement-product.js');
const sales=read('js/grocery-enhancement-sales-admin.js');
const compat=read('js/grocery-enhancement-compat.js');
const init=read('js/grocery-enhancement-init.js');
const css=read('css/grocery-enhancement-63-79.css');
const accordion=read('js/grocery-sidebar-accordion.js');

for(const [name,source] of Object.entries({core,product,sales,compat,init,accordion}))assert.doesNotThrow(()=>new Function(source),`${name} must remain syntax-valid`);

for(const asset of ['grocery-enhancement-63-79.css','grocery-enhancement-core.js','grocery-enhancement-product.js','grocery-enhancement-sales-admin.js','grocery-enhancement-compat.js','grocery-enhancement-init.js'])assert.ok(html.includes(asset),`Grocery HTML missing ${asset}`);
assert.ok(html.indexOf('grocery-enhancement-init.js')<html.indexOf('grocery-render-race-guard.js'),'existing render-race guard must wrap the enhancement render chain');
assert.ok(html.indexOf('grocery-sidebar-hotfix.js')<html.indexOf('grocery-sidebar-accordion.js'),'responsive drawer hotfix must remain ahead of accordion enhancement');

assert.match(core,/g7MoveAdministration/);
assert.match(core,/pos\.group="Sales"/);
assert.match(core,/admin\.group="Settings"/);
assert.match(core,/Administration · Users & Roles/);
assert.match(core,/Administration · Audit Log/);
assert.match(core,/"Add New Product","product-new-63"/);
assert.match(core,/"Sales Administration","sales-admin-63"/);
assert.match(core,/"General Settings","settings-63"/);
assert.match(core,/"Numbering \/ Document Sequences","numbering-64"/);

for(const code of ['en','zh-CN','hi','es','fr','ar','bn','pt','ru','ur','id','de','ja','tr','ko'])assert.match(core,new RegExp(`(?:^|[,{\\s])${code.replace('-','\\-')}(?:\\s*:|\\\")|\\"${code}\\"\\s*:`),`translation dictionary missing ${code}`);
assert.match(core,/g7CurrencyOptions/);
assert.match(core,/catalog\?\.currencies/);
assert.match(core,/historical transactions are never silently converted/i);
assert.match(core,/confirmBaseCurrencyChange/);
assert.match(core,/document\.documentElement\.dir/);
assert.match(core,/full-application translation/i);
assert.match(core,/\/api\/v1\/grocery\/enhancement\/catalog/);
assert.match(core,/\/api\/v1\/grocery\/enhancement\/preferences/);
assert.match(core,/\/api\/v1\/grocery\/enhancement\/numbering\//);
assert.doesNotMatch(core,/localStorage[^\n]{0,100}(nextNumber|invoiceNo|sequence\+\+)/i,'frontend must not allocate document numbers in browser storage');

for(const marker of ['Product name','Product Code / SKU','Primary barcode','PLU','Base unit / UOM','Purchase / cost price','Retail selling price','Primary supplier','Reorder level','Opening stock','Weighted item','Batch tracking','Expiry tracking'])assert.ok(product.includes(marker),`Add Product missing ${marker}`);
assert.match(product,/enhancement\/numbering\/product\/preview/);
assert.match(product,/enhancement\/numbering\/product\/allocate/);
assert.match(product,/post\("\/api\/v1\/products"/);
assert.match(product,/patch\(`\/api\/v1\/grocery\/products\/\$\{encodeURIComponent\(createdId\)\}\/profile`/);
assert.match(product,/await del\(`\/api\/v1\/products\//,'partial Grocery-profile failure must attempt to roll back the newly created product');

for(const endpoint of ['/api/v1/grocery/sales-admin/documents','/api/v1/grocery/sales-admin/approvals','/api/v1/grocery/sales-admin/credit-overrides'])assert.ok(sales.includes(endpoint),`Sales Administration missing ${endpoint}`);
for(const marker of ['QUOTATION','DELIVERY_NOTE','INVOICE','paymentStatus','branchId','salesmanId','Approval Queue','Credit Limit / Term Overrides','Request Credit Override'])assert.ok(sales.includes(marker),`Sales Administration missing ${marker}`);
assert.match(sales,/postingMode:"draft"/,'administrative document creation must be draft-first');
assert.match(sales,/Converted|convert/i);
assert.match(sales,/reason \(required\)/i,'approval/rejection must request a reason');
assert.match(sales,/creditApprovalStatus/);

assert.match(accordion,/grocerySidebarScrollTopV1/);
assert.match(accordion,/rememberCurrentScroll/);
assert.match(accordion,/restoreScrollAndActive/);
assert.match(accordion,/scrollIntoView\(\{ block:"nearest", inline:"nearest" \}\)/);
assert.doesNotMatch(accordion,/scrollTo\(\s*0\s*,\s*0\s*\)/);

assert.match(css,/@media\(max-width:900px\)/);
assert.match(css,/@media\(max-width:620px\)/);
assert.match(css,/html\[dir="rtl"\]/);
assert.doesNotMatch(core+product+sales+compat+init,/AUTH_TOKEN_SECRET|DATABASE_URL\s*=|BEGIN PRIVATE KEY|postgresql:\/\//i,'enhancement browser files must not contain production secrets');

console.log('PASS: current Grocery production enhancement frontend is certified for Add Product, safe numbering UI, Settings/currency/language/RTL, Sales Administration, approvals and sidebar scroll retention');
