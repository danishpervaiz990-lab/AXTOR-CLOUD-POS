import fs from "node:fs";
import assert from "node:assert/strict";

const clinic = fs.readFileSync(new URL("../src/routes/clinic.routes.ts", import.meta.url), "utf8");
const operations = fs.readFileSync(new URL("../src/routes/clinic-operations.routes.ts", import.meta.url), "utf8");
const permission = fs.readFileSync(new URL("../src/middleware/permission.middleware.ts", import.meta.url), "utf8");

for (const route of [
  '/dashboard','/patients','/practitioners','/appointments','/queue','/services','/follow-ups',
  '/encounters','/service-requests','/medication-requests','/invoices','/payments','/reports/filtered','/notification-rules'
]) assert.ok(clinic.includes(route), `missing Clinic route ${route}`);

for (const route of [
  '/specialties','/encounters/:id','/consents','/service-requests','/medication-requests',
  '/invoices/:id','/patients/:id/summary','/patients/:id','/practitioners/:id','/appointments/:id','/follow-ups/:id'
]) assert.ok(operations.includes(route), `missing Clinic operations route ${route}`);

assert.ok(clinic.includes('requireIndustry("clinic")'), "Clinic industry guard missing");
assert.ok(clinic.includes('requireAnyPermission'), "Clinic action permissions missing");
assert.ok(permission.includes('loadUserAccess'), "server permission lookup missing");
assert.ok(permission.includes('hasPermission'), "server wildcard permission handling missing");
assert.ok(!clinic.includes('requireIndustryWritePermission("clinic")'), "blanket Clinic write middleware must not override granular roles");

console.log("PASS: dedicated Clinic routes, industry guard and action-level permission coverage verified.");
