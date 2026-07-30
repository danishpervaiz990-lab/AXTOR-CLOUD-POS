import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const mode = process.argv[2];
const map = {
  live: 'qa-hardware-live-audit.mjs',
  payment: 'qa-hardware-payment-finalizer.mjs',
  branding: 'qa-hardware-branding-audit.mjs',
  browser: 'qa-hardware-browser-audit.mjs',
  operations: 'qa-hardware-operations-audit.mjs',
};
const sourceName = map[mode];
if (!sourceName) throw new Error(`Unknown Paint audit mode: ${mode}`);
const sourceUrl = new URL(sourceName, import.meta.url);
let source = fs.readFileSync(sourceUrl, 'utf8');
source = source
  .replaceAll('Hardware', 'Paint')
  .replaceAll('hardware', 'paint')
  .replaceAll('HARDWARE', 'PAINT')
  .replaceAll('HWOPS', 'PTOPS')
  .replaceAll('qa-hw-', 'qa-paint-')
  .replaceAll('HWB', 'PTB');
const generatedUrl = new URL(`.qa-paint-${mode}.generated.mjs`, import.meta.url);
fs.writeFileSync(generatedUrl, source);
const result = spawnSync(process.execPath, [generatedUrl.pathname], {
  cwd: process.cwd(),
  env: { ...process.env, AXTOR_AUDIT_INDUSTRY: 'paint' },
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
fs.rmSync(generatedUrl, { force: true });
if (result.status !== 0) process.exit(result.status || 1);
