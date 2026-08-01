const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..','demo-static');
const expected=['pharmacy-dashboard.html','pharmacy-terminal.html','pharmacy-medicines.html','pharmacy-medicine-form.html','pharmacy-prescriptions.html','pharmacy-prescription-view.html','pharmacy-patients.html','pharmacy-doctors.html','pharmacy-batches.html','pharmacy-expiry-alerts.html','pharmacy-near-expiry.html','pharmacy-expired-stock.html','pharmacy-stock.html','pharmacy-suppliers.html','pharmacy-purchases.html','pharmacy-returns.html','pharmacy-billing.html','pharmacy-reports.html','pharmacy-settings.html'];
for(const file of expected){const html=fs.readFileSync(path.join(root,file),'utf8');assert.ok(/data-pharmacy-page="[^"]+"/.test(html),`${file}: page identity missing`);assert.ok(html.includes('js/pharmacy-app.js'),`${file}: runtime missing`);assert.ok(html.includes('css/pharmacy-app.css'),`${file}: stylesheet missing`);assert.ok(!html.includes('industry.html?module='),`${file}: generic industry landing link`);assert.ok(!/href=["']#["']/.test(html),`${file}: placeholder link`);const ids=[...html.matchAll(/\sid=["']([^"']+)["']/g)].map(x=>x[1]);assert.equal(ids.length,new Set(ids).size,`${file}: duplicate ids`)}
const js=fs.readFileSync(path.join(root,'js','pharmacy-app.js'),'utf8');
const printSettings=fs.readFileSync(path.join(root,'js','pharmacy-print-settings-backend.js'),'utf8');
const documents=fs.readFileSync(path.join(root,'js','pharmacy-document-routing.js'),'utf8');
for(const token of ['/api/v1/products','/api/v1/industry/batches','pharmacy_prescription','pharmacy_recall','/api/v1/sales-documents','inventoryBatchId','prescriptionId','idempotencyKey'])assert.ok(js.includes(token),`runtime missing ${token}`);
assert.ok(js.includes('restricted to authenticated Pharmacy tenants'),'tenant guard missing');
assert.ok(js.includes('saleableBatches'),'FEFO saleable batch selector missing');
assert.ok(js.includes('No saleable batch'),'blocked batch UX missing');
assert.ok(!js.includes('industry.html?module='),'runtime routes to generic workspace');
for(const token of ['/api/v1/settings','invoice.settings','defaultPrintSize','showPrescriptionReference','showPharmacist','showBatchExpiry'])assert.ok(printSettings.includes(token),`print settings missing ${token}`);
for(const token of ['invoice-view.html','thermal-80','thermal-58','prescriptionReference','pharmacist','batchNo','expiryDate','data-pharmacy-document-id','data-pharmacy-print-record'])assert.ok(documents.includes(token),`document routing missing ${token}`);
for(const file of ['pharmacy-settings.html','pharmacy-terminal.html','pharmacy-billing.html'])assert.ok(fs.readFileSync(path.join(root,file),'utf8').includes('pharmacy-print-settings-backend.js'),`${file}: print settings module missing`);
for(const file of ['pharmacy-terminal.html','pharmacy-billing.html','pharmacy-returns.html'])assert.ok(fs.readFileSync(path.join(root,file),'utf8').includes('pharmacy-document-routing.js'),`${file}: document router missing`);
const redirect=fs.readFileSync(path.join(root,'pharmacy.html'),'utf8');assert.ok(redirect.includes('pharmacy-dashboard.html'),'entry redirect missing');
console.log(`PASS: ${expected.length} Pharmacy pages with FEFO, prescription safety, tenant print settings and shared document routing.`);
