import fs from "node:fs";
import assert from "node:assert/strict";

const gym = fs.readFileSync(new URL("../src/routes/gym.routes.ts", import.meta.url), "utf8");
const operations = fs.readFileSync(new URL("../src/routes/gym-operations.routes.ts", import.meta.url), "utf8");
const release = fs.readFileSync(new URL("../src/routes/release-ab.routes.ts", import.meta.url), "utf8");

for (const route of [
  '/dashboard','/members','/membership-plans','/memberships','/trainers','/classes','/class-bookings',
  '/check-ins','/programs','/program-enrollments','/facilities','/facility-enrollments','/trainer-assignments',
  '/locker-assignments','/measurements','/membership-payments','/membership-renewals','/reports/filtered','/notification-rules'
]) assert.ok(gym.includes(route), `missing Gym route ${route}`);

for (const route of [
  '/memberships','/membership-payments','/class-bookings','/check-ins','/program-enrollments',
  '/facility-enrollments','/trainer-assignments','/locker-assignments','/measurements','/members/:id/summary'
]) assert.ok(operations.includes(route), `missing Gym operations route ${route}`);

assert.ok(gym.includes('requireIndustry("gym")'), "Gym industry guard missing");
assert.ok(gym.includes('requireAnyPermission'), "Gym action permissions missing");
assert.ok(!gym.includes('requireIndustryWritePermission("gym")'), "blanket Gym write middleware must not block read-only roles");
assert.ok(release.includes('export { default as gymRouter } from "./gym.routes.js"'), "dedicated Gym router is not exported");

console.log("PASS: dedicated Gym read APIs, industry guard and action-level permissions verified.");
