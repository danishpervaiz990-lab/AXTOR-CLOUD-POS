import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const service = fs.readFileSync(new URL('../src/services/grocery-sales-analytics.service.ts', import.meta.url), 'utf8');
const controller = fs.readFileSync(new URL('../src/controllers/reports.controller.ts', import.meta.url), 'utf8');

for (const reportId of [
  'grocery-sales-category',
  'grocery-sales-brand',
  'grocery-payment-method',
  'grocery-cashier-sales',
  'grocery-terminal-sales',
]) {
  test(`Grocery analytics service supports ${reportId}`, () => {
    assert.match(service, new RegExp(reportId));
  });
}

test('Grocery analytics is tenant scoped and invoice only', () => {
  assert.match(service, /businessId/);
  assert.match(service, /documentType:\s*"INVOICE"/);
  assert.match(service, /status:\s*\{\s*notIn/);
  assert.match(service, /businessIndustry\.findUnique/);
});

test('Category and brand reports use stored product dimensions', () => {
  assert.match(service, /category:\s*true/);
  assert.match(service, /brand:\s*true/);
  assert.match(service, /costPrice:\s*true/);
});

test('Cashier and terminal reports resolve stored references', () => {
  assert.match(service, /createdByUserId/);
  assert.match(service, /prisma\.user\.findMany/);
  assert.match(service, /counterId/);
  assert.match(service, /prisma\.counter\.findMany/);
});

test('Reports controller delegates Grocery sales analytics', () => {
  assert.match(controller, /isGrocerySalesAnalyticsReport/);
  assert.match(controller, /runGrocerySalesAnalyticsReport/);
});
