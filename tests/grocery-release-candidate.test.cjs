const fs=require('node:fs');
const assert=require('node:assert/strict');
const root='demo-static/';
const config=JSON.parse(fs.readFileSync(root+'vercel.json','utf8'));
const routes=new Map((config.rewrites||[]).map(r=>[r.source,r.destination]));
const expected={
  '/':'/grocery-dashboard.html','/dashboard':'/grocery-dashboard.html','/terminal':'/grocery-terminal.html',
  '/products':'/grocery-products.html','/batches':'/grocery-batches.html','/expiry':'/grocery-expiry.html',
  '/receiving':'/grocery-receiving.html','/waste':'/grocery-waste.html','/recalls':'/grocery-recalls.html',
  '/reports':'/grocery-reports.html','/customers':'/grocery-customers.html','/payments':'/grocery-customers.html',
  '/sales':'/grocery-sales.html','/returns':'/grocery-sales.html','/refunds':'/grocery-sales.html',
  '/purchases':'/grocery-purchases.html','/grn':'/grocery-purchases.html','/inventory':'/grocery-inventory.html',
  '/settings':'/grocery-settings.html','/invoice':'/invoice-view.html'
};
for(const [source,destination] of Object.entries(expected)){
  assert.equal(routes.get(source),destination,source+' route mismatch');
  assert.ok(fs.existsSync(root+destination.slice(1)),destination+' target missing');
}
for(const page of new Set(Object.values(expected))){
  const html=fs.readFileSync(root+page.slice(1),'utf8');
  assert.match(html,/axtor-api\.js\?v=/,page+' missing API runtime');
}
for(const page of ['/grocery-dashboard.html','/grocery-terminal.html','/grocery-reports.html','/grocery-customers.html','/grocery-sales.html','/grocery-purchases.html','/grocery-inventory.html','/grocery-settings.html']){
  const html=fs.readFileSync(root+page.slice(1),'utf8');
  assert.match(html,/grocery-tenant-locale\.js\?v=/,page+' missing tenant locale runtime');
}
assert.equal(config.git?.deploymentEnabled,false,'Grocery branch must remain gateway-certified, not direct Git deploy');
console.log('PASS: Grocery v1 release-candidate routes and runtimes are complete');
