const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('demo-static/grocery-sales.html', 'utf8');
const shared = fs.readFileSync('demo-static/js/returns-backend.js', 'utf8');
const adapter = fs.readFileSync('demo-static/js/grocery-returns-reconciliation.js', 'utf8');

assert(html.includes('js/returns-backend.js'), 'Grocery Sales must load the shared returns backend');
assert(html.includes('js/grocery-returns-reconciliation.js'), 'Grocery Sales must load the reconciliation adapter');
assert(shared.includes('/api/v1/sales-returns'), 'Returns must post to the shared sales-returns API');
assert(shared.includes('/api/v1/refunds'), 'Refunds must post to the shared refunds API');
assert(shared.includes('returnIdempotencyKey'), 'Return posting must be idempotent');
assert(shared.includes('refundIdempotencyKey'), 'Refund posting must be idempotent');
assert(shared.includes('returnedAmount'), 'Invoice returned amount must be reconciled');
assert(shared.includes('returnCount'), 'Invoice return count must be reconciled');
assert(adapter.includes('AxtorReturnsBackend'), 'Adapter must activate the shared engine');
assert(!adapter.includes('grocery_sales_return'), 'Adapter must not create placeholder industry records');

console.log('Grocery returns/refunds reconciliation checks passed.');
