const fs=require('fs');
const js=fs.readFileSync('demo-static/js/grocery-customer-payments.js','utf8');
const html=fs.readFileSync('demo-static/grocery-customers.html','utf8');
for(const token of ['/api/v1/customers','/api/v1/sales-documents','/api/v1/payments','Idempotency-Key','Allocate Oldest First','View / Print Receipt','90+']){
  if(!js.includes(token))throw new Error('Missing customer-payment control: '+token);
}
if(!/grocery-customer-payments\.js\?v=/.test(html))throw new Error('Customer payments adapter is not loaded');
if(js.includes('grocery_customer_note'))throw new Error('Generic customer-note storage must not drive receivables');
console.log('Grocery customer payments reconciliation verified');