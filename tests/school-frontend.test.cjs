const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '../demo-static');
const pages = [
  'school-dashboard.html','school-admissions.html','school-students.html','school-student-profile.html','school-guardians.html','school-classes.html','school-enrollments.html','school-attendance.html','school-timetable.html','school-fees.html','school-fee-payments.html','school-assessments.html','school-results.html','school-teachers.html','school-employees.html','school-payroll.html','school-reports.html','school-settings.html','school-academic-years.html','school-subjects.html','school-rooms.html'
];
for (const file of pages) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(html, /school-app\.js/);
  assert.match(html, /data-page=/);
  assert.doesNotMatch(html, /industry\.html\?module=/);
}
const app = fs.readFileSync(path.join(root, 'js/school-app.js'), 'utf8');
assert.match(app, /\/api\/v1\/school/);
assert.match(app, /\/api\/v1\/industry\/registry/);
assert.match(app, /Idempotency-Key/);
assert.match(app, /School tenants/);
assert.match(app, /encodeURIComponent\(id\).*\/summary/);
console.log(`PASS: ${pages.length} purpose-built School pages`);
