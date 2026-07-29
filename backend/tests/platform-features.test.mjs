import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync(new URL('../src/routes/platform-features.routes.ts', import.meta.url), 'utf8');
const service = fs.readFileSync(new URL('../src/services/platform-config.service.ts', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/app.ts', import.meta.url), 'utf8');

test('platform features require authentication and expose expected routes', () => {
  assert.match(route, /router\.use\(requireAuth\)/);
  for (const path of ['status','audit-logs','gift-cards','api-keys','backups','resources']) assert.match(route, new RegExp(path));
});

test('platform records are tenant scoped and audited', () => {
  assert.match(service, /businessId_key/);
  assert.match(service, /prisma\.auditLog\.create/);
  assert.match(service, /createHash\("sha256"\)/);
  assert.match(service, /Insufficient gift card balance/);
  assert.match(service, /Prisma\.InputJsonValue/);
});

test('platform route is registered in application', () => {
  assert.match(app, /platformFeaturesRoutes/);
  assert.match(app, /\/api\/v1\/platform-features/);
});
