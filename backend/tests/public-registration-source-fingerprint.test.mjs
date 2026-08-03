import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const controller = fs.readFileSync(new URL('../src/controllers/public-catalog.controller.ts', import.meta.url), 'utf8');

test('registration diagnostics expose only safe error fingerprints', () => {
  assert.match(controller, /function safeErrorType/);
  assert.match(controller, /function safeSourceLocation/);
  assert.match(controller, /function safeModelName/);
  assert.match(controller, /public-catalog-launch\\\.service/);
  assert.match(controller, /sourceLocation/);
  assert.match(controller, /errorType/);
  assert.match(controller, /modelName/);
  assert.doesNotMatch(controller, /details:\s*\{[\s\S]*message:\s*String\(\(error/);
  assert.doesNotMatch(controller, /details:\s*\{[\s\S]*stack/);
});

test('source fingerprint strips paths and exposes only service line', () => {
  assert.match(controller, /`public-catalog-launch\.service:\$\{match\[1\]\}`/);
  assert.match(controller, /\^\[A-Za-z\]\[A-Za-z0-9_\]\{0,63\}\$/);
});
