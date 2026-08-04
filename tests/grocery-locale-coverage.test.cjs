const fs=require('node:fs');
const assert=require('node:assert/strict');
const pages=['grocery-settings.html','grocery-dashboard.html','grocery-terminal.html','grocery-reports.html','grocery-sales.html','grocery-customers.html','grocery-purchases.html','grocery-inventory.html','grocery-products.html','grocery-batches.html','grocery-expiry.html','grocery-receiving.html','grocery-waste.html','grocery-recalls.html'];
for(const page of pages){
  const html=fs.readFileSync('demo-static/'+page,'utf8');
  assert.match(html,/grocery-tenant-locale\.js\?v=/,page+' missing tenant locale runtime');
  const api=html.indexOf('axtor-api.js');
  const locale=html.indexOf('grocery-tenant-locale.js');
  assert(api>=0&&locale>api,page+' locale runtime must load after API');
}
const invoiceHtml=fs.readFileSync('demo-static/invoice-view.html','utf8');
const invoiceAdapter=fs.readFileSync('demo-static/js/grocery-invoice-print-reconciliation.js','utf8');
assert.match(invoiceHtml,/grocery-tenant-locale\.js\?v=20260804-grocery-document1/);
assert(invoiceHtml.indexOf('grocery-tenant-locale.js')>invoiceHtml.indexOf('axtor-api.js'),'Invoice locale runtime must load after API');
assert.match(invoiceAdapter,/AxtorLocale\?\.money/);
assert.match(invoiceAdapter,/AxtorLocale\?\.date/);
assert.match(invoiceAdapter,/dedicatedGroceryPage/);
console.log('PASS: tenant locale runtime covers all Grocery release-critical pages and dedicated invoice printing');
