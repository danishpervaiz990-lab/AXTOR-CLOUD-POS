const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..', 'demo-static');
const expected = [
  'clinic-dashboard.html','clinic-patients.html','clinic-new-patient.html','clinic-patient-profile.html',
  'clinic-practitioners.html','clinic-practitioner-profile.html','clinic-appointments.html',
  'clinic-appointment-calendar.html','clinic-appointment-form.html','clinic-queue.html','clinic-check-in.html',
  'clinic-encounters.html','clinic-encounter-view.html','clinic-clinical-notes.html','clinic-services.html',
  'clinic-service-requests.html','clinic-medications.html','clinic-consents.html','clinic-billing.html',
  'clinic-invoices.html','clinic-payments.html','clinic-follow-ups.html','clinic-reports.html','clinic-settings.html'
];

for (const file of expected) {
  const full = path.join(root, file);
  assert.ok(fs.existsSync(full), `missing dedicated Clinic page: ${file}`);
  const html = fs.readFileSync(full, 'utf8');
  assert.ok(/data-clinic-page="[^"]+"/.test(html), `${file} missing page identity`);
  assert.ok(html.includes('js/clinic-app.js'), `${file} missing Clinic app runtime`);
  assert.ok(html.includes('css/clinic-app.css'), `${file} missing Clinic stylesheet`);
  assert.ok(!html.includes('industry.html?module='), `${file} still links to generic industry workspace`);
  assert.ok(!/href=["']#["']/.test(html), `${file} contains placeholder link`);
  const ids = [...html.matchAll(/\sid=["']([^"']+)["']/g)].map(m => m[1]);
  assert.strictEqual(ids.length, new Set(ids).size, `${file} contains duplicate element IDs`);
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    const ref = match[1];
    if (/^(?:https?:|data:|mailto:|tel:|#)/.test(ref)) continue;
    const clean = ref.split(/[?#]/)[0];
    if (!clean || !/\.(?:js|css|svg|png|jpg|jpeg|webp|html|webmanifest)$/.test(clean)) continue;
    assert.ok(fs.existsSync(path.resolve(root, clean)), `${file} references missing local asset: ${clean}`);
  }
}

const redirect = fs.readFileSync(path.join(root, 'clinic.html'), 'utf8');
assert.ok(redirect.includes('clinic-dashboard.html'), 'Clinic entry route must open the dedicated dashboard');

const js = fs.readFileSync(path.join(root, 'js', 'clinic-app.js'), 'utf8');
const requiredEndpoints = [
  '/api/v1/clinic/dashboard','/api/v1/clinic/patients','/api/v1/clinic/practitioners',
  '/api/v1/clinic/appointments','/api/v1/clinic/queue','/api/v1/clinic/encounters',
  '/api/v1/clinic/services','/api/v1/clinic/service-requests','/api/v1/clinic/medication-requests',
  '/api/v1/clinic/consents','/api/v1/clinic/follow-ups','/api/v1/clinic/invoices',
  '/api/v1/clinic/payments','/api/v1/clinic/reports/filtered','/api/v1/clinic/notification-rules'
];
for (const endpoint of requiredEndpoints) assert.ok(js.includes(endpoint), `Clinic runtime missing API integration: ${endpoint}`);
assert.ok(!js.includes('/api/v1/industry/records'), 'Clinic runtime must not use generic IndustryRecord APIs');
assert.ok(!js.includes('industry.html?module='), 'Clinic runtime must not route primary workflows to generic workspace');
assert.ok(js.includes('Idempotency-Key'), 'Clinic billing must send idempotency keys');
assert.ok(js.includes('This dedicated frontend is restricted to authenticated Clinic tenants.'), 'Clinic tenant guard missing');

const api = fs.readFileSync(path.join(root, 'js', 'axtor-api.js'), 'utf8');
assert.ok(api.includes('requestOptions'), 'shared API client custom request options missing');
assert.ok(api.includes('settings.headers'), 'shared API client custom headers missing');

console.log(`PASS: ${expected.length} purpose-built Clinic pages; dedicated Clinic APIs, tenant guard, idempotency, references and placeholder scans passed.`);
