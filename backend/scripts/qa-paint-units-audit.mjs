import fs from 'node:fs/promises';

const runtime = JSON.parse(await fs.readFile('paint-live-audit-runtime.json', 'utf8'));
const report = JSON.parse(await fs.readFile('paint-live-audit-report.json', 'utf8'));
const owner = runtime.users?.find((user) => user.key === 'owner');
if (!owner?.token) throw new Error('Paint owner token missing');
const backend = runtime.backendOrigin || process.env.AXTOR_BACKEND_ORIGIN;
const units = [
  { code: 'ml', label: 'Millilitre', type: 'volume' },
  { code: 'ltr', label: 'Litre', type: 'volume' },
  { code: 'kg', label: 'Kilogram', type: 'weight' },
  { code: 'drum', label: 'Drum', type: 'container' },
  { code: 'gallon', label: 'Gallon', type: 'volume' },
  { code: 'nos', label: 'Numbers', type: 'count' },
];
async function request(path, options = {}) {
  const response = await fetch(`${backend}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${owner.token}`, Accept: 'application/json', 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} failed (${response.status}): ${JSON.stringify(payload)}`);
  return payload?.data ?? payload;
}
await request('/api/v1/settings/paint.units', { method: 'PUT', body: JSON.stringify({ value: units }) });
const saved = await request('/api/v1/settings/paint.units');
const value = saved?.value ?? saved?.setting?.value ?? saved;
const savedCodes = new Set((Array.isArray(value) ? value : []).map((unit) => String(unit.code).toLowerCase()));
const checks = Object.fromEntries(units.map((unit) => [`unit_${unit.code}`, savedCodes.has(unit.code)]));
report.paintUnits = { units: value, checks };
report.overall = report.overall === 'PASS' && Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL';
await fs.writeFile('paint-live-audit-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.paintUnits, null, 2));
if (!Object.values(checks).every(Boolean)) process.exitCode = 1;
