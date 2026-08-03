import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const controller = fs.readFileSync(new URL('../src/controllers/public-catalog.controller.ts', import.meta.url), 'utf8');

test('registration failures expose safe stage and retry metadata without raw messages', () => {
  assert.match(controller, /type RegistrationStage = "tenant_provisioning" \| "owner_session"/);
  assert.match(controller, /REGISTRATION_DATABASE_ERROR/);
  assert.match(controller, /REGISTRATION_INTERNAL_ERROR/);
  assert.match(controller, /details: \{[\s\S]*stage,[\s\S]*retryable/);
  assert.match(controller, /databaseCode/);
  assert.match(controller, /Retry-After/);
  assert.match(controller, /stage = "owner_session"/);
  assert.doesNotMatch(controller, /message:\s*String\(error/);
});

test('only known transient Prisma failures are advertised as retryable', () => {
  for (const code of ['P1001', 'P1002', 'P2024', 'P2028', 'P2034']) {
    assert.match(controller, new RegExp(code));
  }
  assert.match(controller, /\^P\\d\{4\}\$/);
});
