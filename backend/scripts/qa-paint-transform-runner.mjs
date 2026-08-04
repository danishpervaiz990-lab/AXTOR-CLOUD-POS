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

if (mode === 'live') {
  const managerLookup = "roleByName.get('paint manager') || roleByName.get('manager')";
  if (!source.includes(managerLookup)) throw new Error('Paint audit transformer could not locate inherited manager-role lookup');
  source = source
    .replaceAll(managerLookup, "roleByName.get('paint shop manager') || roleByName.get('manager')")
    .replace("const salesmanRole = roleByName.get('trade salesperson') || roleByName.get('salesperson');", "const salesmanRole = roleByName.get('paint salesperson') || roleByName.get('salesperson');")
    .replace('Required Paint Manager and Trade Salesperson roles are unavailable', 'Required Paint Shop Manager and Paint Salesperson roles are unavailable')
    .replaceAll('Paint Transaction Manager One', 'Paint Shop Manager One')
    .replaceAll('Paint Transaction Manager Two', 'Paint Shop Manager Two')
    .replaceAll('Trade Salesperson', 'Paint Salesperson')
    .replaceAll("roleShape: 'Owner + 3 Paint Managers + Paint Salesperson'", "roleShape: 'Owner + 3 Paint Shop Managers + Paint Salesperson'")
    .replace("roleCounts['paint manager'] === 3 && roleCounts['trade salesperson'] === 1", "roleCounts['paint shop manager'] === 3 && roleCounts['paint salesperson'] === 1");

  const cashierExact = `exact("const cashierRole = roleByName.get('cashier');", "const cashierRole = roleByName.get('paint shop manager') || roleByName.get('manager');", 'Paint transaction operator role');`;
  if (!source.includes(cashierExact)) throw new Error('Paint audit transformer could not locate the cashier-role transformation');
  const managerExact = `exact("const managerRole = roleByName.get('paint manager') || roleByName.get('manager');", "const managerRole = roleByName.get('paint shop manager') || roleByName.get('manager');", 'Paint Shop Manager role');`;
  source = source.replace(cashierExact, `${managerExact}\n${cashierExact}`);
}

if (mode === 'operations') {
  source = source
    .replaceAll('Trade Salesperson', 'Paint Salesperson')
    .replaceAll('trade salesperson', 'paint salesperson')
    .replaceAll('tradeSalesUsers', 'paintSalesUsers')
    .replaceAll('trade sales users', 'Paint sales users');
}

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
