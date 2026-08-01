const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..','demo-static');
const expected=['gym-dashboard.html','gym-members.html','gym-member-profile.html','gym-new-admission.html','gym-membership-plans.html','gym-memberships.html','gym-renewals.html','gym-expired-memberships.html','gym-payments.html','gym-trainers.html','gym-trainer-profile.html','gym-classes.html','gym-class-calendar.html','gym-bookings.html','gym-check-ins.html','gym-programs.html','gym-facilities.html','gym-lockers.html','gym-measurements.html','gym-notifications.html','gym-reports.html','gym-settings.html'];
for(const file of expected){const html=fs.readFileSync(path.join(root,file),'utf8');assert.ok(/data-gym-page="[^"]+"/.test(html),`${file}: page identity missing`);assert.ok(html.includes('js/gym-app.js'),`${file}: runtime missing`);assert.ok(html.includes('css/gym-app.css'),`${file}: stylesheet missing`);assert.ok(!html.includes('industry.html?module='),`${file}: generic industry workspace link`);assert.ok(!/href=["']#["']/.test(html),`${file}: placeholder link`)}
const printPages=['gym-settings.html','gym-new-admission.html','gym-memberships.html','gym-renewals.html','gym-payments.html'];
for(const file of printPages){const html=fs.readFileSync(path.join(root,file),'utf8');assert.ok(html.includes('js/gym-print-settings-backend.js'),`${file}: tenant print settings missing`);assert.ok(html.includes('js/gym-document-routing.js'),`${file}: shared document routing missing`)}
const js=fs.readFileSync(path.join(root,'js','gym-app.js'),'utf8');
for(const token of ['/api/v1/gym/members','/api/v1/gym/memberships','/api/v1/gym/membership-payments','/api/v1/gym/membership-renewals','/api/v1/gym/trainers','/api/v1/gym/classes','/api/v1/gym/class-bookings','/api/v1/gym/check-ins','/api/v1/gym/programs','/api/v1/gym/facilities','/api/v1/gym/locker-assignments','/api/v1/gym/measurements'])assert.ok(js.includes(token),`runtime missing ${token}`);
assert.ok(js.includes('restricted to authenticated Gym tenants'),'Gym tenant guard missing');
assert.ok(js.includes('Idempotency-Key'),'Gym payment/renewal idempotency missing');
assert.ok(!js.includes('industry.html?module='),'Gym runtime routes to generic workspace');
const settings=fs.readFileSync(path.join(root,'js','gym-print-settings-backend.js'),'utf8');
assert.ok(settings.includes('/api/v1/settings'),'Gym print settings GET endpoint missing');
assert.ok(settings.includes('/api/v1/settings/invoice.settings'),'Gym print settings PUT endpoint missing');
for(const token of ['a4','thermal80','thermal58','showMemberNumber','showPlan','showMembershipPeriod','showNextDueDate'])assert.ok(settings.includes(token),`Gym print settings missing ${token}`);
const routing=fs.readFileSync(path.join(root,'js','gym-document-routing.js'),'utf8');
assert.ok(routing.includes('invoice-view.html'),'Gym shared invoice renderer missing');
for(const token of ['membership','payment','renewal'])assert.ok(routing.includes(token),`Gym document routing missing ${token}`);
console.log(`PASS: ${expected.length} purpose-built Gym pages; tenant print settings and shared membership document routing verified.`);
