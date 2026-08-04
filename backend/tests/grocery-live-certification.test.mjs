import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const scripts = [
  'qa-grocery-live-helpers.mjs',
  'qa-grocery-live-preflight.mjs',
  'qa-grocery-browser-preflight.mjs',
  'qa-grocery-full-live-audit.mjs',
  'qa-grocery-extended-operations.mjs',
  'qa-grocery-authenticated-browser-audit.mjs',
];
const source = Object.fromEntries(scripts.map((name) => [name, fs.readFileSync(new URL(`../scripts/${name}`, import.meta.url), 'utf8')]));
const workflow = fs.readFileSync(new URL('../../.github/workflows/grocery-live-certification.yml', import.meta.url), 'utf8');

for (const name of scripts) {
  test(`${name} has valid JavaScript syntax`, () => {
    const result = spawnSync(process.execPath, ['--check', new URL(`../scripts/${name}`, import.meta.url).pathname], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
}

test('Grocery core audit uses resilient registration and real FEFO batches', () => {
  const core = source['qa-grocery-full-live-audit.mjs'];
  assert.match(core, /retries: 4/);
  assert.match(core, /completeMandatoryPasswordRotation/);
  assert.match(core, /\/api\/v1\/industry\/grocery\/receiving/);
  assert.match(core, /inventoryBatchId: batch\.id/);
  assert.match(core, /scaleBarcode: \{ rawBarcode: product\.barcode, mode: 'weight', weight: qty \}/);
  assert.match(core, /Exactly 100 FEFO invoices posted/);
  assert.match(core, /uniqueDocumentNumbers/);
  assert.match(core, /grocery-live-cleanup\.sql/);
  assert.doesNotMatch(core, /--accept-data-loss|prisma db push|DELETE FROM "businesses"/);
});

test('Grocery extended audit uses current report IDs and atomic writes', () => {
  const extended = source['qa-grocery-extended-operations.mjs'];
  assert.match(extended, /\/api\/v1\/industry\/grocery\/receiving/);
  assert.match(extended, /\/api\/v1\/industry\/grocery\/waste/);
  assert.match(extended, /\/api\/v1\/reports\/sale-products/);
  assert.match(extended, /\/api\/v1\/reports\/profit-loss/);
  assert.match(extended, /grocery-expiry-risk/);
  assert.match(extended, /grocery-waste-share/);
  assert.match(extended, /grocery-recall-share/);
  assert.doesNotMatch(extended, /reports\/sales-by-product|reports\/profit-and-loss|\/api\/v1\/dashboard'/);
});

test('Authenticated browser audit uses stable Grocery shell selectors', () => {
  const browser = source['qa-grocery-authenticated-browser-audit.mjs'];
  assert.match(browser, /locator\('\.g-shell'\)/);
  assert.match(browser, /locator\('#app'\)/);
  assert.match(browser, /locator\('\.g-hero h1'\)/);
  assert.match(browser, /\.g-status\.error/);
  assert.match(browser, /results\.length === 14/);
  assert.doesNotMatch(browser, /\/404\|page not found\|authentication required\/i\.test\(body\) && \/grocery\|sales/);
});

test('Workflow encrypts credentials, shreds runtime and enforces all reports', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /grocery-live-credentials\.p7m/);
  assert.match(workflow, /shred -u grocery-live-credentials\.json/);
  assert.match(workflow, /shred -u grocery-live-runtime\.json/);
  assert.match(workflow, /test \"\$AUTH_BROWSER_OUTCOME\" = \"success\"/);
  assert.match(workflow, /core\.counts\?\.batches!==50/);
  assert.doesNotMatch(workflow, /grocery-live-runtime\.json\n\s+grocery-live-credentials\.json/);
});
