const fs = require('node:fs');
const assert = require('node:assert/strict');

const routes = fs.readFileSync(new URL('../src/routes/school.routes.ts', import.meta.url), 'utf8');
const operations = fs.readFileSync(new URL('../src/routes/school-operations.routes.ts', import.meta.url), 'utf8');
const release = fs.readFileSync(new URL('../src/routes/release-ab.routes.ts', import.meta.url), 'utf8');

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
