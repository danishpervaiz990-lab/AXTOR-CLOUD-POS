import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const keyService = fs.readFileSync(new URL('../src/services/developer-api-key.service.ts', import.meta.url), 'utf8');
const middleware = fs.readFileSync(new URL('../src/middleware/developer-api.middleware.ts', import.meta.url), 'utf8');
const routes = fs.readFileSync(new URL('../src/routes/developer-api.routes.ts', import.meta.url), 'utf8');
const controller = fs.readFileSync(new URL('../src/controllers/developer-api.controller.ts', import.meta.url), 'utf8');
const spec = fs.readFileSync(new URL('../src/services/developer-api-spec.ts', import.meta.url), 'utf8');
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

test('developer endpoints are isolated behind API-key, rate-limit and scope middleware', () => {
  assert.match(routes, /openapi\.json/);
  assert.match(routes, /router\.use\(requireDeveloperApiKey\)/);
  assert.match(routes, /router\.use\(developerApiRateLimit\)/);
  assert.match(routes, /requireDeveloperScope\("developer\.status\.read"\)/);
  assert.match(routes, /requireDeveloperScope\("products\.read"\)/);
  assert.match(middleware, /x-api-key/);
  assert.match(middleware, /ApiKey/);
  assert.match(middleware, /source: "api-key"/);
  assert.match(middleware, /API key scope denied/);
  assert.match(expressTypes, /'api-key'/);
  assert.match(expressTypes, /developerApiKey/);
});

test('developer rate limit is per key and IP with standard response headers', () => {
  assert.match(middleware, /DEVELOPER_RATE_LIMIT = 120/);
  assert.match(middleware, /DEVELOPER_RATE_WINDOW_MS = 60 \* 1000/);
  assert.match(middleware, /RateLimit-Limit/);
  assert.match(middleware, /RateLimit-Remaining/);
  assert.match(middleware, /RateLimit-Reset/);
  assert.match(middleware, /Retry-After/);
  assert.match(middleware, /Developer API rate limit exceeded/);
});

test('developer products are tenant-scoped, bounded and exclude cost data', () => {
  assert.match(controller, /businessId: context\.businessId/);
  assert.match(controller, /Math\.min\(Math\.max/);
  assert.match(controller, /active: true/);
  assert.match(controller, /deleted: false/);
  assert.match(controller, /updatedAfter/);
  assert.match(controller, /price: true/);
  assert.match(controller, /currentStock: true/);
  assert.doesNotMatch(controller, /costPrice: true/);
});

test('OpenAPI document describes authentication, products and rate errors', () => {
  assert.match(spec, /openapi: "3\.1\.0"/);
  assert.match(spec, /ApiKeyHeader/);
  assert.match(spec, /X-API-Key/);
  assert.match(spec, /ApiKeyAuthorization/);
  assert.match(spec, /developer\/status/);
  assert.match(spec, /developer\/products/);
  assert.match(spec, /updatedAfter/);
  assert.match(spec, /maximum: 200/);
  assert.match(spec, /"429"/);
  assert.match(controller, /developerApiSpec/);
  assert.match(controller, /Cache-Control/);
});

test('application registers developer route and API-key CORS header', () => {
  assert.match(app, /developerApiRoutes/);
  assert.match(app, /\/api\/v1\/developer/);
  assert.match(app, /X-API-Key/);
});
