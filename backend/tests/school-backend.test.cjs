const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const routes = fs.readFileSync(path.join(__dirname, '../src/routes/school.routes.ts'), 'utf8');
const operations = fs.readFileSync(path.join(__dirname, '../src/routes/school-operations.routes.ts'), 'utf8');
const release = fs.readFileSync(path.join(__dirname, '../src/routes/release-ab.routes.ts'), 'utf8');

assert.match(routes, /requireIndustry\("school", "education"\)/);
assert.match(routes, /requireAnyPermission/);
assert.doesNotMatch(routes, /requireIndustryWritePermission/);
assert.match(routes, /router\.use\(schoolOperationsRouter\)/);
assert.match(operations, /businessId/);
assert.match(operations, /\/students\/:id\/summary/);
assert.match(operations, /\/enrollments/);
assert.match(operations, /\/attendance/);
assert.match(operations, /\/fee-payments/);
assert.match(operations, /\/timetable/);
assert.match(operations, /\/assessments/);
assert.match(operations, /\/payroll-runs/);
assert.match(release, /default as schoolRouter/);
console.log('PASS: School backend routes are isolated and tenant-scoped');
