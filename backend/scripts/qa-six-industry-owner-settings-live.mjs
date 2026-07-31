import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import catalog from '../config/owner-industry-settings.json' with { type: 'json' };

const backend = process.env.AXTOR_BACKEND_ORIGIN || 'https://axtor-cloud-pos-production.up.railway.app';
const password = process.env.AXTOR_INDUSTRY_DEMO_PASSWORD || 'AxtorIndustryDemo@2026';
const loginUrl = 'https://axtorpos.vercel.app/';
const runId = `SIX-INDUSTRY-SETTINGS-${Date.now()}`;
const industries = ['retail', 'grocery', 'pharmacy', 'hardware', 'paint', 'gym'];
const results = [];
const failures = [];
let sequence = 0;

const unwrap = (v) => v?.data ?? v;
async function request(path, { method = 'GET', token, body, expected = [200, 201] } = {}) {
  sequence += 1;
  const response = await fetch(`${backend}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Idempotency-Key': `six.industry.${Date.now()}.${sequence}.${crypto.randomUUID()}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!expected.includes(response.status)) throw new Error(`${method} ${path} -> ${response.status}: ${JSON.stringify(payload)}`);
  return unwrap(payload);
}

const publicCatalog = await request('/api/v1/public/catalog');
const planCode = publicCatalog.plans?.find((p) => Number(p.maxUsers || 0) >= 5)?.code || publicCatalog.plans?.[0]?.code;
if (!planCode) throw new Error('No active subscription plan available');

for (const [index, industry] of industries.entries()) {
  const email = `owner@${industry}.settings.axtor.demo`;
  try {
    const registration = await request('/api/v1/public/register', {
      method: 'POST',
      body: {
        businessName: `Axtor ${industry[0].toUpperCase()}${industry.slice(1)} Settings Demo`,
        ownerName: `${industry} Demo Owner`,
        email,
        password,
        country: 'QA', timezone: 'Asia/Qatar', baseCurrency: 'QAR', language: 'en',
        industryCode: industry, planCode, billingCycle: 'MONTHLY',
        firstBranch: `${industry} Main Branch`, firstWarehouse: `${industry} Main Warehouse`, firstCounter: `${industry} Counter 1`,
        taxSystem: 'none', taxLabel: 'Tax', invoicePrefix: industry.slice(0, 3).toUpperCase(), printProfile: 'a4',
        pricesIncludeTax: false, sampleDataRequested: false, acceptTerms: true, acceptPrivacy: true,
      },
    });
    const token = registration.auth?.token;
    if (!token) throw new Error('Registration did not return owner token');

    const values = {
      ...catalog.shared,
      ...(catalog.industries[industry] || {}),
      'owner.certification': { version: catalog.version, industry, runId, certifiedAt: new Date().toISOString() },
    };
    await request('/api/v1/settings/bulk', { method: 'PUT', token, body: { values } });

    const settings = await request('/api/v1/settings', { token });
    const stored = settings.values || {};
    const expectedKeys = Object.keys(values);
    const missingKeys = expectedKeys.filter((key) => !(key in stored));
    const settingsPass = missingKeys.length === 0;

    const products = [];
    const productTemplates = {
      retail: ['Retail Test Item', 'Retail Promotion Item'],
      grocery: ['Fresh Milk Batch Item', 'Weighted Produce Item'],
      pharmacy: ['Prescription Medicine Batch', 'OTC Health Product'],
      hardware: ['Hardware Unit Conversion Item', 'Contractor Bulk Item'],
      paint: ['Base Paint Tinting Item', 'Paint System Topcoat'],
      gym: ['Mineral Water', 'Protein Shaker'],
    };
    for (const [pIndex, name] of productTemplates[industry].entries()) {
      const created = await request('/api/v1/products', {
        method: 'POST', token,
        body: { sku: `${industry.toUpperCase()}-${Date.now()}-${pIndex}`, name, category: `${industry} live test`, brand: 'Axtor Certified', unit: 'PCS', price: 20 + pIndex * 5, costPrice: 10 + pIndex * 3, openingStock: 100 },
      });
      products.push(created.product || created);
    }

    await request('/api/v1/expenses', { method: 'POST', token, body: { category: `${industry} Operating Expense`, description: `Live ${industry} settings certification expense`, amount: 250 + index * 50 } });
    const salesContext = await request('/api/v1/sales-documents/context', { token });
    const product = products[0];
    await request('/api/v1/sales-documents', {
      method: 'POST', token,
      body: {
        documentType: 'invoice', postingMode: 'post', idempotencyKey: `${runId}:${industry}:invoice`,
        branchId: salesContext.branches?.[0]?.id, warehouseId: salesContext.warehouses?.[0]?.id,
        customerName: `${industry} Live Customer`, paymentMethod: 'cash', paidAmount: Number(product.price || 20),
        items: [{ productId: product.id, qty: 1, rate: Number(product.price || 20) }],
        salesChannel: `${industry}_certification`, referenceNo: `${industry.toUpperCase()}-LIVE-${Date.now()}`,
      },
    });

    const [expenseReport, invoices] = await Promise.all([
      request('/api/v1/expenses?limit=20', { token }),
      request('/api/v1/sales-documents?documentType=invoice&limit=20', { token }),
    ]);
    const invoiceRows = Array.isArray(invoices) ? invoices : invoices.data || [];
    const expenseCount = Number(expenseReport.count || expenseReport.expenses?.length || 0);
    const checks = {
      ownerSettingsPersisted: settingsPass,
      sharedSettingsCount: Object.keys(catalog.shared).length,
      industrySettingsPresent: Object.keys(catalog.industries[industry] || {}).every((key) => key in stored),
      productsCreated: products.length === 2,
      financialExpenseAvailable: expenseCount >= 1,
      financialInvoiceAvailable: invoiceRows.length >= 1,
    };
    if (Object.values(checks).some((v) => v === false)) throw new Error(`Validation failed ${JSON.stringify({ checks, missingKeys })}`);

    results.push({
      industry,
      businessId: registration.business?.id,
      businessName: registration.business?.name,
      businessSlug: registration.business?.slug,
      ownerEmail: email,
      password,
      loginUrl,
      settingsKeys: expectedKeys,
      checks,
    });
  } catch (error) {
    failures.push({ industry, message: error.message });
  }
}

const report = {
  runId,
  overall: failures.length === 0 && results.length === industries.length ? 'PASS' : 'FAIL',
  totals: { industries: results.length, settingsProfiles: results.length, products: results.length * 2, financialInvoices: results.length, financialExpenses: results.length },
  results,
  failures,
};
await fs.writeFile('six-industry-owner-settings-report.json', JSON.stringify(report, null, 2));
await fs.writeFile('six-industry-login-credentials.json', JSON.stringify({ generatedAt: new Date().toISOString(), businesses: results.map(({ industry, businessName, businessSlug, ownerEmail, password, loginUrl }) => ({ industry, businessName, businessSlug, ownerEmail, password, loginUrl })) }, null, 2));
await fs.writeFile('six-industry-settings-evidence.json', JSON.stringify({ catalogVersion: catalog.version, shared: catalog.shared, industries: catalog.industries, certifiedBusinesses: results.map(({ industry, businessId, businessSlug, checks }) => ({ industry, businessId, businessSlug, checks })) }, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.overall !== 'PASS') process.exitCode = 1;
