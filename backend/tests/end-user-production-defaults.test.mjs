import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const seedOwner = readFileSync(new URL('../src/scripts/seed-owner.ts', import.meta.url), 'utf8');
const cleanupService = readFileSync(
  new URL('../src/services/production-display-cleanup.ts', import.meta.url),
  'utf8'
);
const server = readFileSync(new URL('../src/server.ts', import.meta.url), 'utf8');

test('owner provisioning does not create a demo-named business by default', () => {
  assert.equal(seedOwner.includes("'Axtor Demo Business'"), false);
  assert.equal(seedOwner.includes("'Axtor Business'"), true);
});

test('startup display cleanup preserves tenant identity and transactional data', () => {
  assert.match(cleanupService, /UPDATE "businesses"/);
  assert.match(cleanupService, /UPDATE "users"/);
  assert.match(cleanupService, /UPDATE "salesmen"/);
  assert.match(cleanupService, /UPDATE "app_settings"/);
  assert.equal(/\b(?:DROP|TRUNCATE|DELETE)\b/i.test(cleanupService), false);
  assert.equal(/UPDATE\s+"businesses"[\s\S]*?"slug"\s*=/i.test(cleanupService), false);
  assert.equal(/UPDATE\s+"users"[\s\S]*?"email"\s*=/i.test(cleanupService), false);
  assert.equal(/password_hash\s*=/i.test(cleanupService), false);
  assert.equal(/sales_documents|customer_payments|inventory_stocks/i.test(cleanupService), false);
});

test('server runs cleanup before listening and cannot be blocked by cosmetic cleanup failure', () => {
  assert.match(server, /await runProductionDisplayCleanup\(\)/);
  assert.match(server, /catch \(error\)/);
  assert.ok(
    server.indexOf('await runProductionDisplayCleanup()') < server.indexOf('server.listen'),
    'cleanup must run before the API accepts traffic'
  );
});

test('cleanup is not represented as a pending Prisma migration', () => {
  assert.equal(cleanupService.includes('prisma.$transaction'), true);
  assert.equal(server.includes('production-display-cleanup.js'), true);
});
