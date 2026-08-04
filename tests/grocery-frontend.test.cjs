const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'../demo-static');
const pages=['grocery-dashboard.html','grocery-terminal.html','grocery-sales.html','grocery-shifts.html','grocery-customers.html','grocery-products.html','grocery-categories.html','grocery-inventory.html','grocery-batches.html','grocery-expiry.html','grocery-labels.html','grocery-purchases.html','grocery-receiving.html','grocery-suppliers.html','grocery-waste.html','grocery-recalls.html','grocery-promotions.html','grocery-loyalty.html','grocery-expenses.html','grocery-accounts.html','grocery-reports.html','grocery-users.html','grocery-notifications.html','grocery-settings.html'];
const reportPages=new Set(['grocery-dashboard.html','grocery-reports.html']);
for(const file of pages){
  const html=fs.readFileSync(path.join(root,file),'utf8');
  if(reportPages.has(file)){
    assert.match(html,/grocery-report-shell\.js/);
    assert.match(html,/grocery-report-sync\.js/);
    assert.doesNotMatch(html,/grocery-app\.js/);
  }else{
    assert.match(html,/grocery-app\.js/);
  }
  assert.match(html,/data-page=/);
  assert.doesNotMatch(html,/industry\.html\?module=/);
}
const app=fs.readFileSync(path.join(root,'js/grocery-app.js'),'utf8');
const reportShell=fs.readFileSync(path.join(root,'js/grocery-report-shell.js'),'utf8');
const readiness=fs.readFileSync(path.join(root,'js/grocery-production-readiness.js'),'utf8');
const printSettings=fs.readFileSync(path.join(root,'js/grocery-print-settings-backend.js'),'utf8');
const documentRouting=fs.readFileSync(path.join(root,'js/grocery-document-routing.js'),'utf8');
const transactionGuard=fs.readFileSync(path.join(root,'js/grocery-transaction-guard.js'),'utf8');
const operations=fs.readFileSync(path.join(root,'js/grocery-operations-pack.js'),'utf8');
const reporting=fs.readFileSync(path.join(root,'js/grocery-report-sync.js'),'utf8');
const settingsHtml=fs.readFileSync(path.join(root,'grocery-settings.html'),'utf8');
const terminalHtml=fs.readFileSync(path.join(root,'grocery-terminal.html'),'utf8');
const salesHtml=fs.readFileSync(path.join(root,'grocery-sales.html'),'utf8');
assert.match(app,/\/api\/v1\/industry\/registry/);assert.match(app,/inventoryBatchId/);
assert.match(reportShell,/groceryReportShell/);assert.match(reportShell,/id=\"app\"/);assert.doesNotMatch(reportShell,/\/api\/v1\/reports\//);
assert.match(readiness,/parseScaleBarcode/);assert.match(readiness,/Thermal 80mm/);assert.match(readiness,/Invoice & Print/);
assert.match(printSettings,/invoice\.settings/);assert.match(printSettings,/\/api\/v1\/settings/);assert.match(printSettings,/apiPut|request\('PUT'/);assert.match(printSettings,/defaultPrintSize/);assert.match(printSettings,/Thermal 80mm/);assert.match(printSettings,/Thermal 58mm/);assert.match(printSettings,/localStorage\.setItem\(CACHE_KEY/);assert.match(settingsHtml,/grocery-print-settings-backend\.js/);assert.match(terminalHtml,/grocery-print-settings-backend\.js/);assert.match(salesHtml,/grocery-print-settings-backend\.js/);
assert.match(documentRouting,/new URL\("invoice-view\.html",location\.href\)/);assert.match(documentRouting,/data-grocery-document-id/);assert.match(documentRouting,/data-grocery-return-print/);assert.match(documentRouting,/data-grocery-refund-print/);assert.match(documentRouting,/grocery_sales_return/);assert.match(documentRouting,/Disposition:/);assert.match(documentRouting,/thermal-58/);assert.match(documentRouting,/thermal-80/);assert.match(documentRouting,/url\.searchParams\.set\("print","1"\)/);assert.match(salesHtml,/grocery-document-routing\.js/);
assert.match(terminalHtml,/grocery-transaction-guard\.js/);assert.ok(terminalHtml.indexOf('grocery-transaction-guard.js')<terminalHtml.indexOf('grocery-app.js'));
assert.match(transactionGuard,/qtyOnHandBase/);assert.match(transactionGuard,/qtyReservedBase/);assert.match(transactionGuard,/expired/);assert.match(transactionGuard,/quarantined/);assert.match(transactionGuard,/recalled/);assert.match(transactionGuard,/blocked/);assert.match(transactionGuard,/Requested quantity exceeds available FEFO batch stock/);assert.match(transactionGuard,/Every Grocery sale line requires a FEFO inventory batch/);assert.match(transactionGuard,/named customer is required for Grocery credit sales/i);assert.match(transactionGuard,/Idempotency-Key/);assert.match(transactionGuard,/retryKeys/);assert.match(transactionGuard,/inFlight/);assert.match(transactionGuard,/already being posted/);assert.match(transactionGuard,/roundQty/);
assert.match(operations,/Search saved products/);assert.match(operations,/grocery_purchase_receipt/);assert.match(operations,/\/api\/v1\/industry\/batches/);assert.match(operations,/Expiry date cannot be earlier than receiving date/);assert.match(operations,/landedCost/);assert.match(operations,/grocery_stock_count/);assert.match(operations,/variance/);assert.match(operations,/grocery_sales_return/);assert.match(operations,/pending_approval/);assert.match(operations,/supplier_return/);assert.match(operations,/grocery_promotion/);assert.match(operations,/grocery_role_assignment/);assert.match(operations,/\/api\/v1\/products\?active=true/);assert.match(operations,/Idempotency-Key/);
assert.match(reporting,/reportPath\("daily-sales"/);assert.doesNotMatch(reporting,/JSON\.stringify\(report,\s*null,\s*2\)/);
console.log(`PASS: ${pages.length} Grocery pages with dedicated report shell, tenant-backed output, FEFO transaction guard, receiving and reports`);
