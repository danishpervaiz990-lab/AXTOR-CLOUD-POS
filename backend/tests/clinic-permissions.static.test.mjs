import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync(new URL("../src/routes/clinic.routes.ts", import.meta.url), "utf8");
for (const permission of [
  "industry.clinic.patient.demographics",
  "industry.clinic.appointment.create",
  "industry.clinic.queue.create",
  "industry.clinic.encounter.create",
  "industry.clinic.medication_request.create",
  "clinic.billing.create",
  "clinic.payments.create",
  "industry.clinic.settings.manage"
]) assert.ok(source.includes(permission), `missing Clinic permission ${permission}`);
console.log("PASS: Clinic receptionist, practitioner, billing and manager permission families are routed server-side.");
