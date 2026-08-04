import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const adapterPath = new URL('../scripts/qa-retail-r13-seven-role-audit-with-password-rotation.mjs', import.meta.url);
const browserAuditPath = new URL('../scripts/qa-retail-r13-seven-role-browser-audit.mjs', import.meta.url);
const workflowPath = new URL('../../.github/workflows/retail-r13-seven-role-live-audit.yml', import.meta.url);
const adapter = fs.readFileSync(adapterPath, 'utf8');
const browserAudit = fs.readFileSync(browserAuditPath, 'utf8');
const workflow = fs.readFileSync(workflowPath, 'utf8');

test('R-13 live audit completes required first-login password rotation', () => {
  assert.match(adapter, /mustChangePassword === true/);
  assert.match(adapter, /\/api\/v1\/auth\/change-password/);
  assert.match(adapter, /currentPassword: user\.password/);
  assert.match(adapter, /newPassword: rotatedPassword/);
  assert.match(adapter, /user\.password = rotatedPassword/);
  assert.match(adapter, /passwordRotationBlocksRemaining/);
  assert.match(workflow, /qa-retail-r13-seven-role-audit-with-password-rotation\.mjs/);
  assert.match(workflow, /passwordRotationBlocksRemaining !== 0/);
});

test('seven-role browser readiness follows the current authenticated Retail shell', () => {
  assert.match(browserAudit, /page\.locator\('main\.page'\)\.isVisible/);
  assert.match(browserAudit, /page\.locator\('\.page-title h2'\)/);
  assert.match(browserAudit, /page\.locator\('#dashboardSyncText'\)/);
  assert.match(browserAudit, /page\.locator\('#retailStatus'\)/);
  assert.match(browserAudit, /permission denied\|unauthorized\|forbidden/);
  assert.match(browserAudit, /dashboardStatusClass/);
  assert.match(browserAudit, /dashboardShellVisible/);
  assert.doesNotMatch(browserAudit, /const body = await page\.locator\('body'\)\.innerText/);
  assert.doesNotMatch(browserAudit, /\/page not found\|404\|unauthorized\|forbidden\/i\.test\(body\)/);
});

test('password-rotation adapter applies cleanly to the current audit source', () => {
  const result = spawnSync(process.execPath, [adapterPath.pathname], {
    cwd: new URL('../..', import.meta.url),
    encoding: 'utf8',
    env: { ...process.env, AXTOR_R13_ADAPTER_VALIDATE_ONLY: '1' },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /PASS: Retail R-13 password-rotation adapter matches/);
});
