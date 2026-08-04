import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const runtime = readFileSync(new URL('../js/paint-isolation-branding-runtime.js', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../paint-dashboard.html', import.meta.url), 'utf8');
const settings = readFileSync(new URL('../paint-settings.html', import.meta.url), 'utf8');
const reports = readFileSync(new URL('../paint-reports.html', import.meta.url), 'utf8');

test('Paint runtime fails closed for every non-Paint tenant', () => {
  assert.match(runtime, /code !== 'paint'/);
  assert.match(runtime, /paint-industry-isolation/);
  assert.doesNotMatch(runtime, /hardware_paint/);
  assert.match(runtime, /sessionStorage\.removeItem\('axtorAuthReturnUrl'\)/);
});

test('Paint branding is cloud-backed and independently themed', () => {
  assert.match(runtime, /company\.profile/);
  assert.match(runtime, /appearance\.paint/);
  assert.match(runtime, /readAsDataURL/);
  assert.match(runtime, /Colour Studio/);
  assert.match(runtime, /Industrial Lab/);
  assert.match(runtime, /FORMULA · MIX · QUALITY · DELIVERY/);
  assert.match(runtime, /Colour Formula/);
  assert.match(runtime, /Tinting & Mixing/);
  assert.match(runtime, /Quality Approval/);
});

test('Paint reports include the requested financial movements and method filters', () => {
  assert.match(runtime, /transaction-ledger/);
  assert.match(runtime, /payment-receipt-methods/);
  for (const method of ['Cash', 'Online / Bank Transfer', 'POS / Card', 'Cheque', 'Debit Card', 'Credit Card']) {
    assert.ok(runtime.includes(method), `${method} option missing`);
  }
});

test('Paint entry points load the isolation runtime before paint-app', () => {
  for (const source of [dashboard, settings, reports]) {
    const guard = source.indexOf('paint-isolation-branding-runtime.js');
    const app = source.indexOf('paint-app.js');
    assert.ok(guard >= 0 && app > guard, 'Paint isolation runtime must load before paint-app');
    assert.doesNotMatch(source, /retail|grocery-app/i);
  }
});
