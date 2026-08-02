const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '../demo-static');
const page = fs.readFileSync(path.join(root, 'grocery-reports.html'), 'utf8');
const sales = fs.readFileSync(path.join(root, 'js/grocery-sales-analytics.js'), 'utf8');
const operational = fs.readFileSync(path.join(root, 'js/grocery-operational-postgres.js'), 'utf8');

const salesIds = [
  'grocery-sales-category',
  'grocery-sales-brand',
  'grocery-payment-method',
  'grocery-cashier-sales',
  'grocery-terminal-sales'
];
const operationalIds = [
  'grocery-expiry-risk',
  'grocery-waste-share',
  'grocery-recall-share'
];

assert.match(page, /grocery-sales-analytics\.js\?v=20260802-all-postgres1/);
assert.match(page, /grocery-operational-postgres\.js\?v=20260802-all-postgres1/);

for (const id of salesIds) assert.match(sales, new RegExp(id));
for (const id of operationalIds) assert.match(operational, new RegExp(id));

assert.match(sales, /\/api\/v1\/reports\//);
assert.match(operational, /\/api\/v1\/reports\//);
assert.match(sales, /AxtorAPI\.apiGet/);
assert.match(operational, /AxtorAPI\.apiGet/);
assert.doesNotMatch(operational, /\/api\/v1\/industry\/batches/);
assert.doesNotMatch(operational, /entityType=grocery_waste/);
assert.doesNotMatch(operational, /entityType=grocery_recall/);

console.log('PASS: all eight Grocery reports are locked to authenticated PostgreSQL endpoints');
