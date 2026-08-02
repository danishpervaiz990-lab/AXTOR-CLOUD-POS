import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const backend = process.env.AXTOR_BACKEND_ORIGIN || 'https://axtor-cloud-pos-production.up.railway.app';
const runTag = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const password = `Qa!Grocery${runTag}Z9`;
const email = `owner+${runTag}@axtor-grocery-qa.test`;
const businessName = `AXTOR GROCERY QA TEST ${runTag}`;
const report = {
  generatedAt: new Date().toISOString(),
  environment: { backend },
  tenant: null,
  counts: { suppliers: 0, customers: 0, products: 0, invoices: 0 },
  paymentDistribution: { cash: 0, card: 0, bank_transfer: 0, credit: 0, mixed: 0 },
  checks: [],
  blockers: [],
  overall: 'FAIL',
};

function unwrap(body) { return body && Object.prototype.hasOwnProperty.call(body, 'data') ? body.data : body; }
function pass(name, details = {}) { report.checks.push({ name, status: 'PASS', ...details }); }
function fail(name, error, details = {}) { report.checks.push({ name, status: 'FAIL', error: String(error?.message || error), ...details }); }

async function request(path, { method = 'GET', token, body, idempotencyKey, expected = [200, 201] } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const response = await fetch(`${backend}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!expected.includes(response.status)) {
    const error = new Error(json?.error?.message || `${method} ${path} returned ${response.status}`);
    error.status = response.status;
    error.body = json || text.slice(0, 1000);
    throw error;
  }
  return json;
}

try {
  const health = await request('/api/v1/health/db');
  if (!health?.ok || health?.database !== 'ok') throw new Error('Database health is not OK');
  pass('Database health');

  const catalogBody = await request('/api/v1/public/catalog');
  const catalog = unwrap(catalogBody);
  const grocery = (catalog.industries || []).find(item => String(item.code).toLowerCase() === 'grocery' && item.canRegister !== false);
  const plan = (catalog.plans || []).find(item => item.canRegister !== false) || (catalog.plans || [])[0];
  const currency = (catalog.currencies || []).find(item => item.code === 'QAR') || { code: 'QAR' };
  const language = (catalog.languages || []).find(item => ['en', 'EN', 'english'].includes(item.code)) || (catalog.languages || [])[0];
  if (!grocery || !plan || !language) throw new Error('Grocery registration catalogue is incomplete');
  pass('Registration catalogue', { groceryCode: grocery.code, planCode: plan.code });

  const registration = unwrap(await request('/api/v1/public/register', {
    method: 'POST',
    idempotencyKey: `grocery-cert-register-${runTag}`,
    body: {
      businessName,
      ownerName: 'QA Grocery Owner',
      email,
      password,
      industryCode: grocery.code,
      planCode: plan.code,
      billingCycle: 'MONTHLY',
      country: 'QA',
      timezone: 'Asia/Qatar',
      baseCurrency: currency.code,
      language: language.code,
      firstBranch: 'QA Main Branch',
      firstWarehouse: 'QA Main Warehouse',
      firstCounter: 'QA Counter 01',
      taxSystem: 'none',
      taxLabel: 'Tax',
      invoicePrefix: 'QAG',
      printProfile: 'a4',
      pricesIncludeTax: false,
      sampleDataRequested: false,
      acceptTerms: true,
      acceptPrivacy: true,
    },
  }));

  const token = registration?.auth?.token;
  const business = registration?.business || registration?.auth?.business;
  if (!token || !business?.id || !business?.slug) throw new Error('Registration did not return an authenticated tenant');
  report.tenant = { name: businessName, id: business.id, slug: business.slug, ownerUserId: registration?.auth?.user?.id || registration?.owner?.id || null, industry: grocery.code, plan: plan.code };
  pass('Fresh Grocery tenant provisioned', { businessId: business.id, slug: business.slug });

  const me = await request('/api/v1/auth/me', { token });
  if (!me?.ok) throw new Error('Owner token verification failed');
  pass('Owner authenticated');

  const suppliers = [];
  for (let i = 1; i <= 5; i += 1) {
    const created = unwrap(await request('/api/v1/suppliers', {
      method: 'POST', token,
      body: { name: `QA Supplier ${String(i).padStart(2, '0')}`, company: `QA Grocery Supply ${i}`, phone: `+9744400${String(i).padStart(4, '0')}`, email: `supplier${i}@qa.invalid`, address: `QA Industrial Area ${i}`, creditDays: 30, openingBalance: i === 5 ? 250 : 0, active: true },
    }));
    suppliers.push(created);
  }
  report.counts.suppliers = suppliers.length;
  pass('Five suppliers persisted', { count: suppliers.length });

  const customers = [];
  for (let i = 1; i <= 10; i += 1) {
    const createdBody = await request('/api/v1/customers', {
      method: 'POST', token,
      body: {
        name: `QA Customer ${String(i).padStart(2, '0')}`,
        code: `QA-CUST-${String(i).padStart(3, '0')}`,
        phone: `+9745500${String(i).padStart(4, '0')}`,
        email: `customer${i}@qa.invalid`,
        type: i <= 3 ? 'Cash' : 'Credit',
        address: `QA Zone ${10 + i}, Doha`,
        creditLimit: i >= 4 ? 5000 : 0,
        creditDays: i >= 4 ? 30 : 0,
        openingBalance: i === 10 ? 100 : 0,
        active: true,
      },
    });
    customers.push(createdBody.customer || unwrap(createdBody));
  }
  report.counts.customers = customers.length;
  pass('Ten customers persisted', { count: customers.length });

  const categories = ['Fresh Produce','Dairy','Bakery','Beverages','Rice and Grains','Canned Foods','Snacks','Frozen Foods','Household Cleaning','Personal Care'];
  const names = ['Apples','Bananas','Tomatoes','Potatoes','Fresh Milk','Yogurt','Cheese','Butter','White Bread','Brown Bread','Croissant','Bottled Water','Orange Juice','Cola','Tea','Coffee','Basmati Rice','Flour','Sugar','Lentils','Chickpeas','Canned Beans','Tuna','Tomato Paste','Biscuits','Chips','Chocolate','Ice Cream','Frozen Chicken','Frozen Vegetables','Dishwashing Liquid','Laundry Detergent','Tissue Paper','Hand Soap','Shampoo','Eggs','Cucumber','Onion','Cooking Oil','Salt','Corn Flakes','Pasta','Noodles','Mayonnaise','Ketchup','Baby Wipes','Toothpaste','Body Wash','Paper Cups','Garbage Bags'];
  const products = [];
  for (let i = 0; i < 50; i += 1) {
    const weighted = i < 10;
    const price = Number((2.5 + (i % 17) * 1.35).toFixed(2));
    const productBody = await request('/api/v1/products', {
      method: 'POST', token,
      body: {
        sku: `QA-G-${String(i + 1).padStart(4, '0')}`,
        barcode: `629${String(1000000000 + i).padStart(10, '0')}`.slice(0, 13),
        name: `QA ${names[i]}`,
        category: categories[i % categories.length],
        brand: `QA Brand ${(i % 5) + 1}`,
        unit: weighted ? 'kg' : (i % 3 === 0 ? 'pack' : 'pcs'),
        costPrice: Number((price * 0.72).toFixed(2)),
        price,
        minStock: 20,
        openingStock: 1000,
        currentStock: 1000,
        active: true,
        customFields: { weighted, isWeighted: weighted, taxFree: i < 5, promotional: i >= 5 && i < 10, qaRun: runTag },
      },
    });
    products.push(productBody.product || unwrap(productBody));
  }
  report.counts.products = products.length;
  pass('Fifty Grocery products persisted', { count: products.length, categories: new Set(products.map(p => p.category)).size, weighted: products.filter(p => p.customFields?.weighted).length });

  const contextBody = await request('/api/v1/sales-documents/context', { token });
  const context = unwrap(contextBody);
  const branchId = context?.branches?.[0]?.id || context?.branch?.id || null;
  const warehouseId = context?.warehouses?.[0]?.id || context?.warehouse?.id || null;
  if (!warehouseId) throw new Error('Sales context has no active warehouse');
  pass('Sales operational context', { branchId, warehouseId });

  const createdInvoices = [];
  for (let index = 0; index < 100; index += 1) {
    const itemCount = 1 + (index % 4);
    const items = [];
    for (let line = 0; line < itemCount; line += 1) {
      const product = products[(index * 3 + line * 7) % products.length];
      const weighted = Boolean(product.customFields?.weighted);
      const qty = weighted ? Number((0.25 + ((index + line) % 7) * 0.125).toFixed(3)) : 1 + ((index + line) % 4);
      items.push({ productId: product.id, qty, unit: product.unit, unitPrice: Number(product.price), discountAmount: index % 10 === 0 ? 0.25 : 0, taxRate: 0 });
    }
    const total = Number(items.reduce((sum, item) => sum + item.qty * item.unitPrice - item.discountAmount, 0).toFixed(2));
    let paymentMethod;
    let paymentLines = [];
    let customerId = index < 35 ? null : customers[index % customers.length].id;
    let dueDate;
    if (index < 40) { paymentMethod = 'cash'; paymentLines = [{ method: 'cash', amount: total }]; }
    else if (index < 60) { paymentMethod = 'card'; paymentLines = [{ method: 'card', amount: total, referenceNo: `CARD-${runTag}-${index + 1}` }]; }
    else if (index < 70) { paymentMethod = 'bank_transfer'; paymentLines = [{ method: 'bank_transfer', amount: total, referenceNo: `BANK-${runTag}-${index + 1}` }]; }
    else if (index < 80) { paymentMethod = 'credit'; paymentLines = []; customerId = customers[index % customers.length].id; dueDate = new Date(Date.now() + 30 * 86400000).toISOString(); }
    else { paymentMethod = 'mixed'; const cash = Number((total * 0.4).toFixed(2)); paymentLines = [{ method: 'cash', amount: cash }, { method: 'card', amount: Number((total - cash).toFixed(2)), referenceNo: `MIX-${runTag}-${index + 1}` }]; }

    const invoiceBody = await request('/api/v1/sales-documents', {
      method: 'POST', token,
      idempotencyKey: `grocery-cert-${runTag}-invoice-${String(index + 1).padStart(3, '0')}`,
      body: {
        documentType: 'invoice', postingMode: 'post', branchId, warehouseId,
        customerId, customerName: customerId ? undefined : 'Walk-in Customer',
        dueDate, paymentMethod, paymentLines, items,
        salesChannel: 'qa_grocery_certification',
        referenceNo: `QA-${runTag}-${String(index + 1).padStart(3, '0')}`,
      },
    });
    const invoice = unwrap(invoiceBody);
    if (!invoice?.id || !invoice?.documentNo) throw new Error(`Invoice ${index + 1} did not persist correctly`);
    createdInvoices.push(invoice);
    report.paymentDistribution[paymentMethod] += 1;
  }
  report.counts.invoices = createdInvoices.length;
  pass('Exactly 100 invoices posted', { count: createdInvoices.length, paymentDistribution: report.paymentDistribution });

  const listed = unwrap(await request('/api/v1/sales-documents?documentType=invoice&limit=250', { token }));
  const documents = Array.isArray(listed) ? listed : listed?.data || [];
  const qaDocs = documents.filter(doc => String(doc.referenceNo || '').startsWith(`QA-${runTag}-`));
  const uniqueNumbers = new Set(qaDocs.map(doc => doc.documentNo));
  if (qaDocs.length !== 100 || uniqueNumbers.size !== 100) throw new Error(`Invoice verification mismatch: found ${qaDocs.length}, unique ${uniqueNumbers.size}`);
  pass('Invoice persistence and uniqueness', { found: qaDocs.length, unique: uniqueNumbers.size });

  const productsList = await request('/api/v1/products', { token });
  const persistedProducts = productsList.products || unwrap(productsList)?.products || unwrap(productsList) || [];
  const customersList = await request('/api/v1/customers', { token });
  const persistedCustomers = customersList.customers || unwrap(customersList)?.customers || unwrap(customersList) || [];
  if (persistedProducts.filter(p => String(p.sku || '').startsWith('QA-G-')).length !== 50) throw new Error('Product persistence check failed');
  if (persistedCustomers.filter(c => String(c.code || '').startsWith('QA-CUST-')).length !== 10) throw new Error('Customer persistence check failed');
  pass('Post-refresh API persistence');

  await fs.writeFile('grocery-live-runtime.json', JSON.stringify({ publicOrigin: process.env.AXTOR_PUBLIC_ORIGIN || 'https://axtorpos.vercel.app', businessSlug: business.slug, email, password, businessId: business.id, token }, null, 2));
  report.overall = 'PASS_CORE_TRANSACTIONS';
} catch (error) {
  fail('Full Grocery transaction audit', error, { status: error.status, response: error.body });
  report.blockers.push({ message: String(error.message || error), status: error.status || null, response: error.body || null });
  report.overall = 'FAIL';
}

await fs.writeFile('grocery-full-live-audit-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, credentials: undefined }, null, 2));
if (report.overall === 'FAIL') process.exitCode = 1;
