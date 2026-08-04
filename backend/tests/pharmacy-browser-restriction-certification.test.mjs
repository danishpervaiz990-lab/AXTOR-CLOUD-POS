import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const browser = fs.readFileSync(new URL('../scripts/qa-pharmacy-browser-audit.mjs', import.meta.url), 'utf8');

test('Pharmacy Cashier supplier access is denied without exposing supplier rows', () => {
  assert.match(browser, /function isPharmacyCashier/);
  assert.ok(browser.includes('http 403:'), 'expected explicit HTTP 403 evidence filter');
  assert.ok(browser.includes('|suppliers)(?:\\?|$)'), 'expected supplier endpoint in restricted-role filter');
  assert.match(browser, /key === 'suppliers' && isPharmacyCashier\(user\)/);
  assert.match(browser, /const dataRows = rows\.filter/);
  assert.match(browser, /state\.dataRows === 0/);
  assert.match(browser, /restricted: true/);
  assert.match(browser, /cashierSupplierRestrictionPass/);
  assert.match(browser, /supplierPage\?\.dataRows === 0/);
});

test('Pharmacy launch result still requires every role, every page and clean unexplained errors', () => {
  assert.match(browser, /fiveIndependentUsers: results\.length === 5/);
  assert.match(browser, /allRolesCheckedEveryPage/);
  assert.match(browser, /dedicatedPharmacyPagesPass/);
  assert.match(browser, /expectedRoleRestrictionsPass/);
  assert.match(browser, /noUnexpectedBrowserErrors/);
  assert.match(browser, /Object\.values\(report\.browser\.checks\)\.every\(Boolean\)/);
});
