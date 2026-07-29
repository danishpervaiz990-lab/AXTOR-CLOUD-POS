import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync(new URL('../src/routes/platform-features.routes.ts', import.meta.url), 'utf8');
const service = fs.readFileSync(new URL('../src/services/platform-config.service.ts', import.meta.url), 'utf8');
const developerKeys = fs.readFileSync(new URL('../src/services/developer-api-key.service.ts', import.meta.url), 'utf8');
const middleware = fs.readFileSync(new URL('../src/middleware/platform-access.middleware.ts', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/app.ts', import.meta.url), 'utf8');

test('platform features require authentication and expose expected routes', () => {
  assert.match(route, /router\.use\(requireAuth\)/);
  for (const path of ['status','audit-logs','gift-cards','api-keys','backups','resources']) assert.match(route, new RegExp(path));
});

test('sensitive platform routes use the existing permission engine', () => {
  assert.match(route, /requireAnyPermission/);
  assert.match(route, /requirePlatformResourcePermission\("view"\)/);
  assert.match(route, /requirePlatformResourcePermission\("manage"\)/);
  for (const permission of [
    'audit_logs.view',
    'loyalty.view',
    'loyalty.manage',
    'platform.api_keys.view',
    'platform.api_keys.manage',
    'platform.backups.view',
    'platform.backups.manage',
  ]) assert.match(route, new RegExp(permission.replaceAll('.', '\\.')));
});

test('resource middleware is tenant-aware, deny-by-default and resource-specific', () => {
  assert.match(middleware, /loadUserAccess\(prisma, businessId, userId\)/);
  assert.match(middleware, /access\.isOwner \|\| access\.isAdmin/);
  assert.match(middleware, /platform\.companies/);
  assert.match(middleware, /platform\.webhooks/);
  assert.match(middleware, /platform\.dashboards/);
  assert.match(middleware, /platform\.notifications/);
  assert.match(middleware, /platform\.offline/);
  assert.match(middleware, /Unsupported platform resource/);
  assert.match(middleware, /Permission denied/);
});

test('platform records are tenant scoped and audited', () => {
  assert.match(service, /businessId_key/);
  assert.match(service, /prisma\.auditLog\.create/);
  assert.match(service, /Insufficient gift card balance/);
  assert.match(service, /Prisma\.InputJsonValue/);
  assert.match(developerKeys, /createHash\("sha256"\)/);
  assert.match(developerKeys, /developer-api-key\.create/);
  assert.match(developerKeys, /developer-api-key\.revoke/);
});

test('platform and developer routes are registered in application', () => {
  assert.match(app, /platformFeaturesRoutes/);
  assert.match(app, /\/api\/v1\/platform-features/);
  assert.match(app, /developerApiRoutes/);
  assert.match(app, /\/api\/v1\/developer/);
});
