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

if (mode === 'browser') {
  const deployedPaintPages = `const pages = [
  ['dashboard', '/apps/paint/paint-dashboard.html', ['Paint']],
  ['deliveries', '/apps/paint/paint-deliveries.html', ['Delivery']],
  ['reports', '/apps/paint/paint-reports.html', ['Reports']],
  ['settings', '/apps/paint/paint-settings.html', ['Settings']],
];`;
  const pagesPattern = /const pages = \[[\s\S]*?\n\];/;
  if (!pagesPattern.test(source)) throw new Error('Paint audit transformer could not locate browser pages list');
  source = source.replace(pagesPattern, deployedPaintPages);
  source = source.replace("dedicatedPaintPagesPass: results.every((item) => item.pages.every((entry) => entry.ok)),", "dedicatedPaintPagesPass: results.every((item) => item.pages.length === 4 && item.pages.every((entry) => entry.ok)),");
}

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
