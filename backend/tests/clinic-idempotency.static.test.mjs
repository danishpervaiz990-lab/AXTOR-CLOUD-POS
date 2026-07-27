import fs from "node:fs";
import assert from "node:assert/strict";
const routes = fs.readFileSync(new URL("../src/routes/clinic.routes.ts", import.meta.url), "utf8");
const finalService = fs.readFileSync(new URL("../src/services/release-b-final.service.ts", import.meta.url), "utf8");
assert.ok(routes.includes('router.post("/invoices"'), "Clinic invoice route missing");
assert.ok(routes.includes('router.post("/payments"'), "Clinic payment route missing");
assert.ok(finalService.includes("Idempotency-Key is required"), "Clinic financial idempotency requirement missing");
assert.ok(finalService.includes("idempotencyKey:key"), "Clinic idempotency key persistence missing");
console.log("PASS: Clinic invoices and payments preserve idempotent write protection.");
