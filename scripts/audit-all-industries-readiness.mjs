import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(process.env.AXTOR_AUDIT_ROOT || 'audit-worktrees');
const output = path.resolve(process.env.AXTOR_AUDIT_OUTPUT || 'all-industries-readiness-report.json');

const industries = [
  { code: 'retail', ref: 'frontend-retail', dashboard: 'retail-dashboard.html', runtime: 'js/retail-app.js', minPages: 12 },
  { code: 'grocery', ref: 'frontend-grocery', dashboard: 'grocery-dashboard.html', runtime: 'js/grocery-app.js', minPages: 10 },
  { code: 'pharmacy', ref: 'frontend-pharmacy', dashboard: 'pharmacy-dashboard.html', runtime: 'js/pharmacy-app.js', minPages: 19 },
  { code: 'gym', ref: 'frontend-gym', dashboard: 'gym-dashboard.html', runtime: 'js/gym-app.js', minPages: 22 },
  { code: 'school', ref: 'frontend-school', dashboard: 'school-dashboard.html', runtime: 'js/school-app.js', minPages: 21 },
  { code: 'clinic', ref: 'frontend-clinic', dashboard: 'clinic-dashboard.html', runtime: 'js/clinic-app.js', minPages: 24 },
  { code: 'restaurant', ref: 'frontend-restaurant', dashboard: 'restaurant-dashboard.html', runtime: 'js/restaurant-app.js', minPages: 11 },
  { code: 'hardware', ref: 'frontend-hardware', dashboard: 'hardware-dashboard.html', runtime: 'js/hardware-app.js', minPages: 12 },
  { code: 'paint', ref: 'frontend-paint', dashboard: 'paint-dashboard.html', runtime: 'js/paint-app.js', minPages: 12 },
  { code: 'furniture', ref: 'frontend-furniture', dashboard: 'furniture-dashboard.html', runtime: 'js/furniture-app.js', minPages: 13 },
  { code: 'workshop', ref: 'frontend-workshop', dashboard: 'workshop-dashboard.html', runtime: 'js/workshop-app.js', minPages: 13 },
  { code: 'wholesale', ref: 'frontend-wholesale', dashboard: 'wholesale-dashboard.html', runtime: 'js/wholesale-app.js', minPages: 15 },
  { code: 'manufacturing', ref: 'fix/manufacturing/dedicated-frontend-v1', dashboard: 'manufacturing-dashboard.html', runtime: 'js/manufacturing-app.js', minPages: 16 },
];

const retailPages = new Set([
  'retail-dashboard.html', 'terminal.html', 'sales.html', 'customer.html', 'customers.html', 'products.html', 'inventory.html',
  'purchase.html', 'purchases.html', 'suppliers.html', 'branches.html', 'counters.html', 'shifts.html', 'returns.html',
  'payments.html', 'salesmen.html', 'promotions.html', 'loyalty.html', 'reports.html', 'accounts.html', 'expenses.html',
  'settings.html', 'barcode-labels.html', 'approvals.html', 'notifications.html', 'invoice-designer.html', 'setup.html'
]);

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const absolute = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

const text = file => fs.readFileSync(file, 'utf8');
const unique = values => [...new Set(values)];

function localRefs(html) {
  const refs = [];
  const re = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  for (const match of html.matchAll(re)) {
    const value = match[1].trim();
    if (!value || value.startsWith('#') || /^(?:https?:|data:|mailto:|tel:|javascript:|\/\/)/i.test(value)) continue;
    refs.push(value.split(/[?#]/)[0]);
  }
  return unique(refs.filter(Boolean));
}

function duplicateIds(html) {
  const ids = [...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map(match => match[1]);
  const seen = new Set();
  const duplicates = new Set();
  for (const id of ids) seen.has(id) ? duplicates.add(id) : seen.add(id);
  return [...duplicates];
}

function navSignature(runtime, dashboard) {
  const labels = [];
  for (const match of runtime.matchAll(/\[\s*["'][^"']+["']\s*,\s*["']([^"']+)["']\s*,\s*["'][^"']+\.html["']/g)) {
    labels.push(match[1].trim());
  }
  for (const match of runtime.matchAll(/\[\s*["'][^"']+\.html["']\s*,\s*["']([^"']+)["']\s*\]/g)) {
    labels.push(match[1].trim());
  }
  for (const match of dashboard.matchAll(/<a\b[^>]*href=["'][^"']+\.html[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (label) labels.push(label);
  }
  return unique(labels).slice(0, 60);
}

function credentialFindings(content, file) {
  const findings = [];
  if (/\bvalue\s*=\s*["'][^"']+@(?:gmail|yahoo|outlook|axtorpos)\.[^"']+["']/i.test(content)) findings.push(`${file}: public email value`);
  if (/\bvalue\s*=\s*["'][^"']{8,}["'][^>]*type\s*=\s*["']password["']/i.test(content) || /type\s*=\s*["']password["'][^>]*\bvalue\s*=\s*["'][^"']{8,}["']/i.test(content)) findings.push(`${file}: public password value`);
  if (/AxtorTemp\d+/i.test(content)) findings.push(`${file}: temporary credential string`);
  return findings;
}

function activePages(spec, staticRoot) {
  const nestedRoot = path.join(staticRoot, 'demo-static') + path.sep;
  const allHtml = walk(staticRoot).filter(file => file.endsWith('.html') && !file.startsWith(nestedRoot));
  if (spec.code === 'retail') return allHtml.filter(file => retailPages.has(path.basename(file)));
  return allHtml.filter(file => path.basename(file).startsWith(`${spec.code}-`));
}

function resultCheck(result, status, code, message, evidence = null) {
  result.checks.push({ status, code, message, evidence });
  if (status === 'FAIL') result.failures += 1;
  if (status === 'WARN') result.warnings += 1;
}

const report = {
  generatedAt: new Date().toISOString(),
  mode: 'deployment-free-code-and-static-readiness-audit',
  deploymentAttempted: false,
  industries: [],
  summary: { PASS: 0, WARN: 0, FAIL: 0 },
};

const signatures = new Map();
const dashboardHashes = new Map();

for (const spec of industries) {
  const repoRoot = path.join(root, spec.code);
  const staticRoot = path.join(repoRoot, 'demo-static');
  const dashboardPath = path.join(staticRoot, spec.dashboard);
  const runtimePath = path.join(staticRoot, spec.runtime);
  const result = { industry: spec.code, ref: spec.ref, status: 'PASS', failures: 0, warnings: 0, checks: [], pages: [], navigation: [] };

  resultCheck(result, fs.existsSync(dashboardPath) ? 'PASS' : 'FAIL', 'dashboard.exists', `${spec.dashboard} exists`);
  resultCheck(result, fs.existsSync(runtimePath) ? 'PASS' : 'FAIL', 'runtime.exists', `${spec.runtime} exists`);
  resultCheck(result, fs.existsSync(path.join(staticRoot, 'session-handoff.html')) ? 'PASS' : 'FAIL', 'handoff.exists', 'Session handoff receiver exists');
  resultCheck(result, fs.existsSync(path.join(staticRoot, 'vercel.json')) ? 'PASS' : 'FAIL', 'vercel.exists', 'Branch-local Vercel configuration exists');

  const nestedRoot = path.join(staticRoot, 'demo-static');
  const nestedFiles = walk(nestedRoot).map(file => path.relative(staticRoot, file).replaceAll('\\', '/'));
  resultCheck(
    result,
    nestedFiles.length ? 'FAIL' : 'PASS',
    'structure.nested_demo_static',
    nestedFiles.length ? `Nested demo-static/demo-static directory contains ${nestedFiles.length} files` : 'No nested demo-static/demo-static directory',
    nestedFiles
  );

  if (!fs.existsSync(dashboardPath) || !fs.existsSync(runtimePath) || !fs.existsSync(path.join(staticRoot, 'vercel.json'))) {
    result.status = 'FAIL';
    report.industries.push(result);
    continue;
  }

  const dashboard = text(dashboardPath);
  const runtime = text(runtimePath);
  const pages = activePages(spec, staticRoot);
  result.pages = pages.map(file => path.relative(staticRoot, file).replaceAll('\\', '/'));
  resultCheck(result, pages.length >= spec.minPages ? 'PASS' : 'FAIL', 'pages.minimum', `${pages.length} dedicated pages found; minimum ${spec.minPages}`, result.pages);

  try {
    new vm.Script(runtime, { filename: `${spec.ref}/${spec.runtime}` });
    resultCheck(result, 'PASS', 'runtime.syntax', 'Primary runtime parses as JavaScript');
  } catch (error) {
    resultCheck(result, 'FAIL', 'runtime.syntax', error.message);
  }

  resultCheck(result, /\/api\/v1\//.test(runtime) ? 'PASS' : 'FAIL', 'api.integration', 'Runtime contains authenticated backend API integration');
  resultCheck(result, /industry\/registry|commercial\/context|verifyTenant|tenant|available only/i.test(runtime) ? 'PASS' : 'FAIL', 'tenant.guard', 'Runtime contains tenant/industry guard');
  resultCheck(result, !/industry\.html\?module=/i.test(`${dashboard}\n${runtime}`) ? 'PASS' : 'FAIL', 'generic.workspace', 'No generic industry workspace route is used');
  resultCheck(result, !/(?:searchParams\.set\s*\(\s*["']token|[?&](?:token|access_token)=)/i.test(runtime) ? 'PASS' : 'FAIL', 'token.url', 'Permanent access tokens are not placed in URLs');
  resultCheck(result, !/localStorage\.setItem\s*\([^,]*(?:patients|members|students|orders|sales|products|inventory|appointments)/i.test(runtime) ? 'PASS' : 'WARN', 'localstorage.records', 'Runtime does not appear to persist production records in localStorage');

  const nav = navSignature(runtime, dashboard);
  result.navigation = nav;
  resultCheck(result, nav.length >= 4 ? 'PASS' : 'FAIL', 'navigation.minimum', `${nav.length} dedicated navigation labels detected`, nav);
  signatures.set(spec.code, crypto.createHash('sha256').update(nav.join('|').toLowerCase()).digest('hex'));
  dashboardHashes.set(spec.code, crypto.createHash('sha256').update(dashboard.replace(/\s+/g, ' ').trim()).digest('hex'));

  const testFiles = walk(path.join(repoRoot, 'tests')).filter(file => path.basename(file).toLowerCase().includes(spec.code));
  resultCheck(result, testFiles.length > 0 ? 'PASS' : 'WARN', 'tests.present', `${testFiles.length} industry-named test files found`, testFiles.map(file => path.relative(repoRoot, file)));

  const allCredentialFindings = [];
  for (const file of pages) {
    const html = text(file);
    const relative = path.relative(staticRoot, file).replaceAll('\\', '/');
    const duplicates = duplicateIds(html);
    if (duplicates.length) resultCheck(result, 'FAIL', 'html.duplicate_ids', `${relative} contains duplicate IDs`, duplicates);
    if (/href\s*=\s*["'](?:#|javascript:void\(0\)|javascript:;?)["']/i.test(html)) resultCheck(result, 'WARN', 'html.placeholder_link', `${relative} contains a placeholder link`);
    allCredentialFindings.push(...credentialFindings(html, relative));
    for (const reference of localRefs(html)) {
      const resolved = path.resolve(path.dirname(file), reference);
      if (!resolved.startsWith(staticRoot + path.sep) && resolved !== staticRoot) continue;
      if (!fs.existsSync(resolved)) resultCheck(result, 'FAIL', 'asset.missing', `${relative} references missing local asset ${reference}`);
    }
  }
  allCredentialFindings.push(...credentialFindings(runtime, spec.runtime));
  resultCheck(result, allCredentialFindings.length ? 'FAIL' : 'PASS', 'credentials.public', allCredentialFindings.length ? 'Public credential-like values detected' : 'No public working credential values detected', allCredentialFindings);

  try {
    const vercel = JSON.parse(text(path.join(staticRoot, 'vercel.json')));
    const rewrites = Array.isArray(vercel.rewrites) ? vercel.rewrites : [];
    resultCheck(result, rewrites.some(row => row.source === '/') ? 'PASS' : 'FAIL', 'vercel.root', 'Branch root has an explicit industry dashboard route');
  } catch (error) {
    resultCheck(result, 'FAIL', 'vercel.json', `Invalid branch-local vercel.json: ${error.message}`);
  }

  result.status = result.failures ? 'FAIL' : result.warnings ? 'WARN' : 'PASS';
  report.industries.push(result);
}

for (let i = 0; i < industries.length; i += 1) {
  for (let j = i + 1; j < industries.length; j += 1) {
    const left = industries[i].code;
    const right = industries[j].code;
    if (signatures.get(left) && signatures.get(left) === signatures.get(right)) {
      const target = report.industries.find(item => item.industry === right);
      resultCheck(target, 'FAIL', 'navigation.not_unique', `Navigation signature is identical to ${left}`);
      target.status = 'FAIL';
    }
    if (dashboardHashes.get(left) && dashboardHashes.get(left) === dashboardHashes.get(right)) {
      const target = report.industries.find(item => item.industry === right);
      resultCheck(target, 'FAIL', 'dashboard.not_unique', `Dashboard HTML is identical to ${left}`);
      target.status = 'FAIL';
    }
  }
}

for (const item of report.industries) report.summary[item.status] += 1;
fs.writeFileSync(output, JSON.stringify(report, null, 2));

const lines = [
  '# Axtor POS — All Industries Production Readiness Audit',
  '',
  `Generated: ${report.generatedAt}`,
  '',
  `Summary: PASS ${report.summary.PASS} · WARN ${report.summary.WARN} · FAIL ${report.summary.FAIL}`,
  '',
  '| Industry | Branch/ref | Status | Pages | Warnings | Failures |',
  '|---|---|---:|---:|---:|---:|',
  ...report.industries.map(item => `| ${item.industry} | ${item.ref} | ${item.status} | ${item.pages.length} | ${item.warnings} | ${item.failures} |`),
  '',
  ...report.industries.flatMap(item => [
    `## ${item.industry} — ${item.status}`,
    '',
    ...item.checks.filter(check => check.status !== 'PASS').map(check => `- **${check.status} ${check.code}:** ${check.message}`),
    ...(item.checks.every(check => check.status === 'PASS') ? ['- All automated static/code readiness checks passed.'] : []),
    ''
  ])
];
fs.writeFileSync(output.replace(/\.json$/i, '.md'), lines.join('\n'));
console.table(report.industries.map(item => ({ industry: item.industry, ref: item.ref, status: item.status, pages: item.pages.length, warnings: item.warnings, failures: item.failures })));
console.log(`Audit report written to ${output}`);
assert.equal(report.summary.FAIL, 0, `${report.summary.FAIL} industries failed production-readiness audit`);
