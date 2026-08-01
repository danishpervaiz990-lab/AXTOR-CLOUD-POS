import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createRequestFingerprint } from "../dist/services/idempotency.service.js";

const migrationPath = new URL("../prisma/migrations/20260801090000_add_persistent_idempotency/migration.sql", import.meta.url);
const servicePath = new URL("../src/services/idempotency.service.ts", import.meta.url);

test("request fingerprints are stable across object key order", () => {
  const first = createRequestFingerprint({ amount: 20, payment: { card: 5, cash: 15 }, lines: [{ id: "p1", qty: 2 }] });
  const second = createRequestFingerprint({ lines: [{ qty: 2, id: "p1" }], payment: { cash: 15, card: 5 }, amount: 20 });
  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test("request fingerprints change when a financial payload changes", () => {
  assert.notEqual(
    createRequestFingerprint({ invoiceId: "inv-1", amount: "100.00" }),
    createRequestFingerprint({ invoiceId: "inv-1", amount: "101.00" }),
  );
});

test("idempotency migration is additive and tenant scoped", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "idempotency_records"/);
  assert.match(sql, /"business_id"/);
  assert.match(sql, /"user_id"/);
  assert.match(sql, /"request_fingerprint"/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS "idempotency_records_scope_key"/);
  assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE|DELETE)\b/i);
});

test("idempotent operation and claim use the same serializable transaction", () => {
  const source = fs.readFileSync(servicePath, "utf8");
  assert.match(source, /operation\(tx\)/);
  assert.match(source, /TransactionIsolationLevel\.Serializable/);
  assert.match(source, /ON CONFLICT \("business_id", "user_id", "action", "idempotency_key"\) DO NOTHING/);
  assert.match(source, /existing\.request_fingerprint !== fingerprint/);
  assert.match(source, /existing\.status === "COMPLETED"/);
});
