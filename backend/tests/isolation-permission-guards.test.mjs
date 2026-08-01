import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const industry = fs.readFileSync(new URL('../src/middleware/industry-guard.middleware.ts', import.meta.url), 'utf8');
const permission = fs.readFileSync(new URL('../src/middleware/permission.middleware.ts', import.meta.url), 'utf8');
const gymRoutes = fs.readFileSync(new URL('../src/routes/gym.routes.ts', import.meta.url), 'utf8');
const releaseCRoutes = fs.readFileSync(new URL('../src/routes/release-c.routes.ts', import.meta.url), 'utf8');

test('industry guard returns stable 403 contract for mismatched tenants', () => {
  assert.match(industry, /INDUSTRY_ACCESS_DENIED/);
  assert.match(industry, /status\(403\)/);
  assert.match(industry, /businessIndustry\.findUnique/);
  assert.match(industry, /where:\s*\{\s*businessId\s*\}/);
});

test('permission guard resolves access inside authenticated tenant scope', () => {
  assert.match(permission, /loadUserAccess\(prisma, businessId, userId\)/);
  assert.match(permission, /PERMISSION_DENIED/);
  assert.match(permission, /status\(403\)/);
});

test('industry routers enforce auth and industry before handlers', () => {
  assert.match(gymRoutes, /router\.use\(requireAuth, requireIndustry\("gym"\)\)/);
  assert.match(releaseCRoutes, /hardwareRouter\.use\(requireAuth, requireIndustry\("hardware", "hardware_paint"\)\)/);
  assert.match(releaseCRoutes, /paintRouter\.use\(requireAuth, requireIndustry\("paint", "hardware_paint"\)\)/);
});

test('sensitive industry writes require server-side permissions', () => {
  assert.match(gymRoutes, /membership-payments", paymentWrite/);
  assert.match(releaseCRoutes, /mix-jobs\/:id\/post-consumption", paintStockWrite/);
  assert.match(releaseCRoutes, /rentals\/:id\/return", hardwareRentalWrite/);
});
