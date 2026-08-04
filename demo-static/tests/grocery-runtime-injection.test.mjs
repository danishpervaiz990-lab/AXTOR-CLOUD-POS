import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../api/industry-asset.js', import.meta.url), 'utf8');

test('gateway excludes certified Grocery workspaces from the legacy repair injection', () => {
  assert.match(source, /GROCERY_REPAIR_EXCLUDED_PAGES/);
  assert.match(source, /grocery-dashboard\|grocery-reports\|invoice-view/);
  assert.match(source, /shouldInjectGroceryRepair\(pathname, html\)/);
  assert.match(source, /!GROCERY_REPAIR_EXCLUDED_PAGES\.test\(pathname\)/);
  assert.match(source, /grocery-sidebar-repair\.js\?v=20260803-sidebar-repair1/);
});

test('gateway keeps Grocery repair injection available for legacy pages only', () => {
  assert.match(source, /industry === "grocery" && shouldInjectGroceryRepair/);
  assert.doesNotMatch(source, /industry === "grocery" && !html\.includes\("grocery-sidebar-repair\.js"\)/);
  assert.match(source, /User-Agent": "Axtor-POS-Industry-Delivery\/2\.4"/);
});
