const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const routes = fs.readFileSync(path.join(__dirname, '../src/routes/release-c.routes.ts'), 'utf8');
assert.match(routes, /requireAnyPermission/);
assert.doesNotMatch(routes, /requireIndustryWritePermission/);
assert.match(routes, /requireIndustry\("restaurant"\)/);
assert.match(routes, /requireIndustry\("hardware", "hardware_paint"\)/);
assert.match(routes, /requireIndustry\("paint", "hardware_paint"\)/);
for (const area of ['restaurantTableWrite','restaurantMenuWrite','restaurantOrderWrite','restaurantReservationWrite','hardwareProjectWrite','hardwareDeliveryWrite','hardwareRentalWrite','paintCatalogueWrite','paintMixWrite','paintQualityWrite']) {
  assert.match(routes, new RegExp(area));
}
for (const route of ['/orders/:id/move-table','/wastage/:id/reverse','/rentals/:id/return','/projects/:id/credit-check','/mix-jobs/:id/reverse','/mix-jobs/:id/deliver']) {
  assert.ok(routes.includes(route), `Missing protected route ${route}`);
}
console.log('PASS: Release C routes use granular server-side permissions');
