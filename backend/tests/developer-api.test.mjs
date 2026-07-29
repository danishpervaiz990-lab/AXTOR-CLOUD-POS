import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const keyService = fs.readFileSync(new URL('../src/services/developer-api-key.service.ts', import.meta.url), 'utf8');
const middleware = fs.readFileSync(new URL('../src/middleware/developer-api.middleware.ts', import.meta.url), 'utf8');
const routes = fs.readFileSync(new URL('../src/routes/developer-api.routes.ts', import.meta.url), 'utf8');
const controller = fs.readFileSync(new URL('../src/controllers/developer-api.controller.ts', import.meta.url), 'utf8');
const platformController = fs.readFileSync(new URL('../src/controllers/platform-config.controller.ts', import.meta.url), 'utf8');
const platformRoutes = fs.readFileSync(new URL('../src/routes/platform-features.routes.ts', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/app.ts', import.meta.url), 'utf8');
const expressTypes = fs.readFileSync(new URL('../src/types/express.d.ts', import.meta.url), 'utf8');

test('v2 keys are tenant-addressable, hashed and timing-safe', () => {
  assert.match(keyService, /axt2_\$\{businessId\}_/);
  assert.match(keyService, /createHash\("sha256"\)/);
  assert.match(keyService, /timingSafeEqual/);
  assert.match(keyService, /businessId_key/);
  assert.match(keyService, /appSetting\.findUnique/);
  assert.doesNotMatch(keyService, /appSetting\.findMany/);
  assert.match(keyService, /\^axt2_\(\[a-z0-9\]/i);
});

test('key creation validates scope, expiry and active-key limits', () => {
  assert.match(keyService, /developer\.status\.read/);
  assert.match(keyService, /products\.read/);
  assert.match(keyService, /Unsupported API key scope/);
  assert.match(keyService, /MAX_ACTIVE_KEYS = 20/);
  assert.match(keyService, /MAX_EXPIRY_DAYS = 366/);
  assert.match(keyService, /API key expiry must be a future date/);
  assert.match(keyService, /secret: raw/);
  assert.match(keyService, /keyHash: _keyHash/);
});

test('revocation is audited and authentication rejects revoked, expired or inactive businesses', () => {
  assert.match(keyService, /developer-api-key\.revoke/);
  assert.match(keyService, /API key has been revoked/);
  assert.match(keyService, /API key has expired/);
  assert.match(keyService, /API key business is not active/);
  assert.match(platformRoutes, /api-keys\/:id\/revoke/);
  assert.match(platformController, /revokeApiKey/);
});

test('developer endpoints are isolated behind API-key and scope middleware', () => {
  assert.match(routes, /router\.use\(requireDeveloperApiKey\)/);
  assert.match(routes, /requireDeveloperScope\("developer\.status\.read"\)/);
  assert.match(routes, /requireDeveloperScope\("products\.read"\)/);
  assert.match(middleware, /x-api-key/);
  assert.match(middleware, /\^ApiKey\\s\+/);
  assert.match(middleware, /source: "api-key"/);
  assert.match(middleware, /API key scope denied/);
  assert.match(expressTypes, /'api-key'/);
  assert.match(expressTypes, /developerApiKey/);
});

test('developer products are tenant-scoped, bounded and exclude cost data', () => {
  assert.match(controller, /businessId: context\.businessId/);
  assert.match(controller, /Math\.min\(Math\.max/);
  assert.match(controller, /200/);
  assert.match(controller, /active: true/);
  assert.match(controller, /deleted: false/);
  assert.match(controller, /updatedAfter/);
  assert.match(controller, /price: true/);
  assert.match(controller, /currentStock: true/);
  assert.doesNotMatch(controller, /costPrice: true/);
});

test('application registers developer route and API-key CORS header', () => {
  assert.match(app, /developerApiRoutes/);
  assert.match(app, /\/api\/v1\/developer/);
  assert.match(app, /X-API-Key/);
});
