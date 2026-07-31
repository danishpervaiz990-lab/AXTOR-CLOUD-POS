import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const seedOwner = readFileSync(new URL('../src/scripts/seed-owner.ts', import.meta.url), 'utf8');
const cleanupMigration = readFileSync(
  new URL('../prisma/migrations/20260731203500_remove_demo_display_placeholders/migration.sql', import.meta.url),
  'utf8'
);

test('owner provisioning does not create a demo-named business by default', () => {
  assert.equal(seedOwner.includes("'Axtor Demo Business'"), false);
  assert.equal(seedOwner.includes("'Axtor Business'"), true);
});

test('display cleanup preserves tenant identity and transactional data', () => {
  assert.match(cleanupMigration, /UPDATE "businesses"/);
  assert.match(cleanupMigration, /UPDATE "users"/);
  assert.match(cleanupMigration, /UPDATE "salesmen"/);
  assert.match(cleanupMigration, /UPDATE "app_settings"/);
  assert.equal(/\b(?:DROP|TRUNCATE|DELETE)\b/i.test(cleanupMigration), false);
  assert.equal(/UPDATE\s+"businesses"[\s\S]*?"slug"\s*=/i.test(cleanupMigration), false);
  assert.equal(/UPDATE\s+"users"[\s\S]*?"email"\s*=/i.test(cleanupMigration), false);
});
