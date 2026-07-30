import fs from 'node:fs/promises';

const runtime = JSON.parse(await fs.readFile('hardware-live-audit-runtime.json', 'utf8'));
const report = JSON.parse(await fs.readFile('hardware-live-audit-report.json', 'utf8'));
const owner = runtime.users.find((user) => user.key === 'owner');
if (!owner?.token) throw new Error('Owner token is missing from Hardware audit runtime.');

const backend = runtime.backendOrigin || process.env.AXTOR_BACKEND_ORIGIN;
const token = owner.token;
const logo = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="420" height="140"><rect width="420" height="140" rx="16" fill="#111827"/><path d="M45 98 78 35h22l33 63h-22l-8-16H73l-8 16H45Zm37-35h13l-7-15-6 15Z" fill="#facc15"/><text x="150" y="78" font-family="Arial" font-size="28" font-weight="700" fill="#fff">AXTOR HARDWARE QA</text><text x="150" y="104" font-family="Arial" font-size="15" fill="#d1d5db">Trade • Tools • Building Materials</text></svg>').toString('base64');
const company = {
  legalName: 'AXTOR Hardware Test Company W.L.L.',
  tradeName: 'AXTOR Hardware QA Store',
  taxId: 'QA-HW-20260730',
  phone: '+974 4400 7788',
  email: 'hardware.qa@axtor.invalid',
  address: 'Industrial Area, Doha, Qatar',
  currency: 'QAR',
  logoDataUrl: logo,
};
const branding = {
  companyName: company.tradeName,
  logoDataUrl: logo,
  invoiceFooter: 'Thank you for choosing AXTOR Hardware QA Store.',
  showTaxId: true,
  printProfiles: ['A4', '80mm', '58mm'],
};

async function request(path, options = {}) {
  const response = await fetch(`${backend}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} failed (${response.status}): ${JSON.stringify(payload)}`);
  return payload?.data ?? payload;
}

await request('/api/v1/settings/company.profile', { method: 'PUT', body: JSON.stringify({ value: company }) });
await request('/api/v1/settings/invoice.branding', { method: 'PUT', body: JSON.stringify({ value: branding }) });
const companyRead = await request('/api/v1/settings/company.profile');
const brandingRead = await request('/api/v1/settings/invoice.branding');
const valueOf = (entry) => entry?.value ?? entry?.setting?.value ?? entry;
const savedCompany = valueOf(companyRead);
const savedBranding = valueOf(brandingRead);

const checks = {
  dummyCompanyRegistered: savedCompany?.tradeName === company.tradeName,
  logoPersisted: String(savedCompany?.logoDataUrl || savedBranding?.logoDataUrl || '').startsWith('data:image/svg+xml;base64,'),
  invoiceBrandingPersisted: savedBranding?.companyName === company.tradeName && savedBranding?.invoiceFooter === branding.invoiceFooter,
  printProfilesConfigured: ['A4', '80mm', '58mm'].every((profile) => savedBranding?.printProfiles?.includes(profile)),
};
report.hardwareBranding = { company: { ...savedCompany, logoDataUrl: '[embedded SVG logo]' }, branding: { ...savedBranding, logoDataUrl: '[embedded SVG logo]' }, checks };
report.overall = report.overall === 'PASS' && Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL';
await fs.writeFile('hardware-live-audit-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ hardwareBranding: report.hardwareBranding }, null, 2));
if (!Object.values(checks).every(Boolean)) process.exitCode = 1;
