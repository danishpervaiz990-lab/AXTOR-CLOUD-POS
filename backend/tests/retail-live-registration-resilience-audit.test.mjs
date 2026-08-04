import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const adapterPath = new URL('../scripts/qa-retail-live-audit-with-registration-resilience.mjs', import.meta.url);
const workflowPath = new URL('../../.github/workflows/retail-r13-seven-role-live-audit.yml', import.meta.url);
const adapter = fs.readFileSync(adapterPath, 'utf8');
const workflow = fs.readFileSync(workflowPath, 'utf8');

test('Retail live registration respects the five-attempt limiter and preserves safe diagnostics', () => {
  assert.match(adapter, /retries: 4/);
  assert.doesNotMatch(adapter, /retries: 5/);
  assert.match(adapter, /referenceId/);
  assert.match(adapter, /safeDetails\.stage/);
  assert.match(adapter, /safeDetails\.errorType/);
  assert.match(adapter, /safeDetails\.sourceLocation/);
  assert.match(adapter, /safeDetails\.modelName/);
  assert.match(adapter, /safeDetails\.databaseCode/);
  assert.match(adapter, /safeDetails\.businessInsertCompatibility/);
  assert.match(adapter, /JSON\.stringify\(safeDetails\.businessInsertCompatibility\)/);
  assert.match(adapter, /public API error diagnostics/);
  assert.match(adapter, /rate-limit-safe tenant-registration retries/);
  assert.match(workflow, /qa-retail-live-audit-with-registration-resilience\.mjs/);
});

test('registration resilience adapter applies to the current live audit source', () => {
  const result = spawnSync(process.execPath, [adapterPath.pathname], {
    cwd: new URL('../..', import.meta.url),
    encoding: 'utf8',
    env: { ...process.env, AXTOR_RETAIL_REGISTRATION_ADAPTER_VALIDATE_ONLY: '1' },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /PASS: Retail live registration resilience adapter matches/);
});
