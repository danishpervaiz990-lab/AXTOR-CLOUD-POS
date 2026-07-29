import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("../prisma/migrations/20260730000000_report_entitlement_hierarchy/migration.sql", import.meta.url), "utf8");

test("migration adds the Standard daily-sales entry capability", () => {
  assert.match(sql, /WHERE "code" = 'standard'/);
  assert.match(sql, /'reports\.daily_sales'/);
});

test("migration adds the Professional report wildcard", () => {
  assert.match(sql, /WHERE "code" = 'professional'/);
  assert.match(sql, /'reports\.\*'/);
});

test("migration is idempotent and non-destructive", () => {
  assert.match(sql, /ON CONFLICT \("plan_id", "feature_key"\) DO UPDATE/g);
  assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE|DELETE)\b/i);
});
