import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { completeMandatoryPasswordRotation, logicalKey, request, unwrap } from './qa-grocery-live-helpers.mjs';

const backend = process.env.AXTOR_BACKEND_ORIGIN || 'https://axtor-cloud-pos-production.up.railway.app';
const publicOrigin = process.env.AXTOR_PUBLIC_ORIGIN || 'https://axtorpos.vercel.app';
const runTag = `${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${crypto.randomBytes(3).toString('hex')}`;
const initialPassword = `Qa!Grocery${runTag.replace(/\W/g, '').slice(-12)}Z9`;
const rotatedPassword = `Qa!GroceryRotated${runTag.replace(/\W/g, '').slice(-8)}Y8`;
const email = `owner+${runTag}@axtor-grocery-qa.test`;
const businessName = `AXTOR GROCERY QA TEST ${runTag}`;
const report = {
  generatedAt: new Date().toISOString(),
  environment: { backend, publicOrigin },
  tenant: null,
  counts: { suppliers: 0, customers: 0, products: 0, batches: 0, receipts: 0, invoices: 0 },
  paymentDistribution: { cash: 0, card: 0, bank_transfer: 0, credit: 0, mixed: 0 },
  checks: [],
  blockers: [],
  overall: 'FAIL',
};

function pass(name, details = {}) { report.checks.push({ name, status: 'PASS', ...details }); }
function fail(name, error, details = {}) { report.checks.push({ name, status: 'FAIL', error: String(error?.message || error), ...details }); }
function rows(value) {
  const data = unwrap(value);
  if (Array.isArray(data)) return data;
  for (const key of ['data', 'items', 'products', 'customers', 'suppliers', 'batches']) {
    if (Array.isArray(data?.[key])) return data[key];
  }
  return [];
}

try {
  const memoryHealth = await request(backend, '/health', { expected: [200], retries: 3 });
  const databaseHealth = await request(backend, '/api/v1/health/db', { expected: [200], retries: 3 });
  if (!memoryHealth.payload?.ok || !databaseHealth.payload?.ok || databaseHealth.payload?.database !== 'ok') {
    throw new Error('Backend or database health is not OK');
  }
  pass('Backend and database health');

  const catalogResponse = await request(backend, '/api/v1/public/catalog', { expected: [200], retries: 3 });
  const catalog = catalogResponse.data || {};
  const grocery = (catalog.industries || []).find((item) => String(item.code).toLowerCase() === 'grocery' && item.canRegister !== false);
  const registerablePlans = (catalog.plans || []).filter((item) => item.canRegister !== false);
  const plan = registerablePlans.find((item) => /enterprise|premium|custom|value|moderate|pro/i.test(`${item.code || ''} ${item.name || ''}`)) || registerablePlans.at(-1) || catalog.plans?.[0];
  const currency = (catalog.currencies || []).find((item) => item.code === 'QAR') || { code: 'QAR' };
  const language = (catalog.languages || []).find((item) => ['en', 'EN', 'english'].includes(item.code)) || catalog.languages?.[0];
  if (!grocery || !plan || !language) throw new Error('Grocery registration catalogue is incomplete');
  pass('Registration catalogue', { groceryCode: grocery.code, planCode: plan.code });

  const registrationBody = {
    businessName,
    ownerName: 'QA Grocery Owner',
    email,
    password: initialPassword,
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
  };
  const registration = await request(backend, '/api/v1/public/register', {
    method: 'POST',
    idempotencyKey: logicalKey('grocery-cert-register', { runTag, email }),
    body: registrationBody,
    expected: [201],
    retries: 4,
    timeoutMs: 60000,
  });
  const registered = registration.data || {};
  const token = registered.auth?.token;
  const business = registered.business || registered.auth?.business;
  if (!token || !business?.id || !business?.slug) throw new Error('Registration did not return an authenticated Grocery tenant');
  const rotation = await completeMandatoryPasswordRotation({ backend, token, password: initialPassword, nextPassword: rotatedPassword });
  const password = rotation.password;
  report.tenant = {
    name: businessName,
    id: business.id,
    slug: business.slug,
    ownerUserId: registered.auth?.user?.id || registered.owner?.id || null,
    industry: grocery.code,
    plan: plan.code,
    passwordRotation: rotation.passwordRotation,
  };
  const observedIndustry = String(rotation.me?.business?.industryCode || rotation.me?.industry?.code || rotation.me?.business?.industry || '').toLowerCase();
  if (String(rotation.me?.business?.slug || '').toLowerCase() !== String(business.slug).toLowerCase()) throw new Error('Owner session resolved to the wrong tenant');
  if (observedIndustry && observedIndustry !== 'grocery') throw new Error(`Owner session resolved to ${observedIndustry} instead of Grocery`);
  pass('Fresh Grocery tenant provisioned and authenticated', { businessId: business.id, slug: business.slug, passwordRotation: rotation.passwordRotation });

  const suppliers = [];
  for (let index = 1; index <= 5; index += 1) {
    const body = {
      name: `QA Grocery Supplier ${String(index).padStart(2, '0')} ${runTag}`,
      company: `QA Grocery Supply ${index}`,
      phone: `+9744400${String(index).padStart(4, '0')}`,
      email: `supplier${index}.${runTag}@qa.invalid`,
      address: `QA Industrial Area ${index}`,
      creditDays: 30,
      openingBalance: 0,
      active: true,
    };
    const created = await request(backend, '/api/v1/suppliers', { method: 'POST', token, body, expected: [201] });
    suppliers.push(created.data);
  }
  report.counts.suppliers = suppliers.length;
  pass('Five suppliers persisted', { count: suppliers.length });

  const customers = [];
  for (let index = 1; index <= 10; index += 1) {
    const body = {
      name: `QA Grocery Customer ${String(index).padStart(2, '0')} ${runTag}`,
      code: `QAG-${runTag.slice(-6)}-C${String(index).padStart(3, '0')}`,
      phone: `+9745500${String(index).padStart(4, '0')}`,
      email: `customer${index}.${runTag}@qa.invalid`,
      type: index <= 3 ? 'Cash' : 'Credit',
      address: `QA Zone ${10 + index}, Doha`,
      creditLimit: index >= 4 ? 25000 : 0,
      creditDays: index >= 4 ? 30 : 0,
      openingBalance: 0,
      active: true,
    };
    const created = await request(backend, '/api/v1/customers', { method: 'POST', token, body, expected: [201] });
    customers.push(created.data?.customer || created.data);
  }
  report.counts.customers = customers.length;
  pass('Ten customers persisted', { count: customers.length });

  const categories = ['Fresh Produce', 'Dairy', 'Bakery', 'Beverages', 'Rice and Grains', 'Canned Foods', 'Snacks', 'Frozen Foods', 'Household Cleaning', 'Personal Care'];
  const names = ['Apples', 'Bananas', 'Tomatoes', 'Potatoes', 'Fresh Milk', 'Yogurt', 'Cheese', 'Butter', 'White Bread', 'Brown Bread', 'Croissant', 'Bottled Water', 'Orange Juice', 'Cola', 'Tea', 'Coffee', 'Basmati Rice', 'Flour', 'Sugar', 'Lentils', 'Chickpeas', 'Canned Beans', 'Tuna', 'Tomato Paste', 'Biscuits', 'Chips', 'Chocolate', 'Ice Cream', 'Frozen Chicken', 'Frozen Vegetables', 'Dishwashing Liquid', 'Laundry Detergent', 'Tissue Paper', 'Hand Soap', 'Shampoo', 'Eggs', 'Cucumber', 'Onion', 'Cooking Oil', 'Salt', 'Corn Flakes', 'Pasta', 'Noodles', 'Mayonnaise', 'Ketchup', 'Baby Wipes', 'Toothpaste', 'Body Wash', 'Paper Cups', 'Garbage Bags'];
  const products = [];
  for (let index = 0; index < 50; index += 1) {
    const weighted = index < 10;
    const price = Number((2.5 + (index % 17) * 1.35).toFixed(2));
    const barcode = `629${String(1000000000 + index).padStart(10, '0')}`.slice(0, 13);
    const body = {
      sku: `QAG-${runTag.slice(-6)}-${String(index + 1).padStart(4, '0')}`,
      barcode,
      name: `QA ${names[index]} ${runTag}`,
      category: categories[index % categories.length],
      brand: `QA Brand ${(index % 5) + 1}`,
      unit: weighted ? 'kg' : (index % 3 === 0 ? 'pack' : 'pcs'),
      costPrice: Number((price * 0.72).toFixed(2)),
      price,
      minStock: 20,
      openingStock: 0,
      currentStock: 0,
      active: true,
      customFields: { weighted, isWeighted: weighted, scaleBarcodeMode: weighted ? 'weight' : null, qaRun: runTag },
    };
    const created = await request(backend, '/api/v1/products', { method: 'POST', token, body, expected: [201] });
    products.push(created.data?.product || created.data);
  }
  report.counts.products = products.length;
  pass('Fifty Grocery products persisted', { count: products.length, categories: new Set(products.map((product) => product.category)).size, weighted: products.filter((product) => product.customFields?.weighted || product.customFields?.isWeighted).length });

  const contextResponse = await request(backend, '/api/v1/sales-documents/context', { token, expected: [200] });
  const context = contextResponse.data || {};
  const branchId = context.branches?.[0]?.id || context.branch?.id || null;
  const warehouseId = context.warehouses?.[0]?.id || context.warehouse?.id || null;
  if (!warehouseId) throw new Error('Sales context has no active warehouse');
  pass('Sales operational context', { branchId, warehouseId });

  const expiryBase = Date.now() + 120 * 86400000;
  for (let receiptIndex = 0; receiptIndex < 5; receiptIndex += 1) {
    const receiptItems = products.slice(receiptIndex * 10, receiptIndex * 10 + 10).map((product, itemIndex) => ({
      productId: product.id,
      quantity: 1000,
      freeQuantity: itemIndex === 0 ? 5 : 0,
      cost: Number(product.costPrice || 1),
      batchNo: `QAG-${runTag.slice(-6)}-B${String(receiptIndex * 10 + itemIndex + 1).padStart(3, '0')}`,
      expiryDate: new Date(expiryBase + (receiptIndex * 10 + itemIndex) * 86400000).toISOString(),
    }));
    await request(backend, '/api/v1/industry/grocery/receiving', {
      method: 'POST',
      token,
      idempotencyKey: logicalKey('grocery-cert-receiving', { runTag, receiptIndex }),
      body: {
        supplierId: suppliers[receiptIndex % suppliers.length].id,
        warehouseId,
        supplierInvoiceNo: `QA-GRN-${runTag}-${receiptIndex + 1}`,
        supplierInvoiceDate: new Date().toISOString(),
        freight: receiptIndex + 1,
        items: receiptItems,
      },
      expected: [201],
      retries: 2,
      timeoutMs: 60000,
    });
    report.counts.receipts += 1;
  }
  const batchResponse = await request(backend, '/api/v1/industry/batches?limit=500', { token, expected: [200] });
  const batches = rows(batchResponse.payload).filter((batch) => products.some((product) => product.id === batch.productId));
  const batchByProduct = new Map(batches.sort((a, b) => new Date(a.expiryDate || '2999-01-01') - new Date(b.expiryDate || '2999-01-01')).map((batch) => [batch.productId, batch]));
  if (batchByProduct.size !== 50) throw new Error(`Expected 50 saleable Grocery batches, found ${batchByProduct.size}`);
  report.counts.batches = batchByProduct.size;
  pass('Atomic receiving created saleable FEFO batches', { receipts: report.counts.receipts, batches: report.counts.batches });

  const createdInvoices = [];
  for (let invoiceIndex = 0; invoiceIndex < 100; invoiceIndex += 1) {
    const itemCount = 1 + (invoiceIndex % 4);
    const items = [];
    for (let lineIndex = 0; lineIndex < itemCount; lineIndex += 1) {
      const product = products[(invoiceIndex * 3 + lineIndex * 7) % products.length];
      const batch = batchByProduct.get(product.id);
      if (!batch) throw new Error(`No saleable batch found for ${product.name}`);
      const weighted = Boolean(product.customFields?.weighted || product.customFields?.isWeighted);
      const qty = weighted ? Number((0.25 + ((invoiceIndex + lineIndex) % 7) * 0.125).toFixed(3)) : 1 + ((invoiceIndex + lineIndex) % 4);
      items.push({
        productId: product.id,
        inventoryBatchId: batch.id,
        qty,
        unit: product.unit,
        unitPrice: Number(product.price),
        discountAmount: invoiceIndex % 10 === 0 ? 0.25 : 0,
        taxRate: 0,
        ...(weighted ? { scaleBarcode: { rawBarcode: product.barcode, mode: 'weight', weight: qty } } : {}),
      });
    }
    const total = Number(items.reduce((sum, item) => sum + item.qty * item.unitPrice - item.discountAmount, 0).toFixed(2));
    let paymentMethod;
    let paymentLines = [];
    let customerId = invoiceIndex < 35 ? null : customers[invoiceIndex % customers.length].id;
    let dueDate = customerId ? new Date(Date.now() + 30 * 86400000).toISOString() : undefined;
    if (invoiceIndex < 40) {
      paymentMethod = 'cash'; paymentLines = [{ method: 'cash', amount: total }];
    } else if (invoiceIndex < 60) {
      paymentMethod = 'card'; paymentLines = [{ method: 'card', amount: total, referenceNo: `CARD-${runTag}-${invoiceIndex + 1}` }];
    } else if (invoiceIndex < 70) {
      paymentMethod = 'bank_transfer'; paymentLines = [{ method: 'bank_transfer', amount: total, referenceNo: `BANK-${runTag}-${invoiceIndex + 1}` }];
    } else if (invoiceIndex < 80) {
      paymentMethod = 'credit'; paymentLines = []; customerId = customers[invoiceIndex % customers.length].id; dueDate = new Date(Date.now() + 30 * 86400000).toISOString();
    } else {
      paymentMethod = 'mixed';
      const cash = Number((total * 0.4).toFixed(2));
      paymentLines = [{ method: 'cash', amount: cash }, { method: 'card', amount: Number((total - cash).toFixed(2)), referenceNo: `MIX-${runTag}-${invoiceIndex + 1}` }];
    }
    const body = {
      documentType: 'invoice',
      postingMode: 'post',
      branchId,
      warehouseId,
      customerId,
      customerName: customerId ? undefined : 'Walk-in Customer',
      dueDate,
      paymentMethod,
      paymentLines,
      items,
      salesChannel: 'qa_grocery_certification',
      referenceNo: `QA-${runTag}-${String(invoiceIndex + 1).padStart(3, '0')}`,
    };
    const invoice = await request(backend, '/api/v1/sales-documents', {
      method: 'POST',
      token,
      idempotencyKey: logicalKey('grocery-cert-sale', { runTag, invoiceIndex, body }),
      body,
      expected: [201],
      retries: 2,
      timeoutMs: 60000,
    });
    if (!invoice.data?.id || !invoice.data?.documentNo) throw new Error(`Invoice ${invoiceIndex + 1} did not persist correctly`);
    createdInvoices.push(invoice.data);
    report.paymentDistribution[paymentMethod] += 1;
  }
  report.counts.invoices = createdInvoices.length;
  pass('Exactly 100 FEFO invoices posted', { count: createdInvoices.length, paymentDistribution: report.paymentDistribution });

  const listed = await request(backend, '/api/v1/sales-documents?documentType=invoice&limit=250', { token, expected: [200] });
  const qaDocuments = rows(listed.payload).filter((document) => String(document.referenceNo || '').startsWith(`QA-${runTag}-`));
  const uniqueIds = new Set(qaDocuments.map((document) => document.id));
  const uniqueNumbers = new Set(qaDocuments.map((document) => document.documentNo));
  if (qaDocuments.length !== 100 || uniqueIds.size !== 100 || uniqueNumbers.size !== 100) {
    throw new Error(`Invoice verification mismatch: found ${qaDocuments.length}, unique IDs ${uniqueIds.size}, unique numbers ${uniqueNumbers.size}`);
  }
  pass('Invoice persistence and uniqueness', { found: qaDocuments.length, uniqueIds: uniqueIds.size, uniqueDocumentNumbers: uniqueNumbers.size });

  const persistedProducts = rows((await request(backend, '/api/v1/products?active=true&limit=500', { token, expected: [200] })).payload);
  const persistedCustomers = rows((await request(backend, '/api/v1/customers?active=true&limit=500', { token, expected: [200] })).payload);
  if (persistedProducts.filter((product) => String(product.sku || '').includes(runTag.slice(-6))).length !== 50) throw new Error('Product persistence check failed');
  if (persistedCustomers.filter((customer) => String(customer.code || '').includes(runTag.slice(-6))).length !== 10) throw new Error('Customer persistence check failed');
  pass('Post-refresh API persistence');

  await fs.writeFile('grocery-live-runtime.json', JSON.stringify({
    publicOrigin,
    backendOrigin: backend,
    businessSlug: business.slug,
    email,
    password,
    businessId: business.id,
    token,
    runTag,
    branchId,
    warehouseId,
    supplierIds: suppliers.map((supplier) => supplier.id),
    productIds: products.map((product) => product.id),
    customerIds: customers.map((customer) => customer.id),
    batchIds: [...batchByProduct.values()].map((batch) => batch.id),
  }, null, 2), { mode: 0o600 });
  await fs.writeFile('grocery-live-credentials.json', JSON.stringify({ businessSlug: business.slug, email, password }, null, 2), { mode: 0o600 });
  const escapedBusinessId = String(business.id).replaceAll("'", "''");
  await fs.writeFile('grocery-live-cleanup.sql', `-- Review before execution. Isolated QA tenant only.\nDELETE FROM "businesses" WHERE "id" = '${escapedBusinessId}';\n`);
  report.overall = 'PASS_CORE_TRANSACTIONS';
} catch (error) {
  fail('Full Grocery transaction audit', error, { status: error?.status || null, details: error?.details || null });
  report.blockers.push({ message: String(error?.message || error), status: error?.status || null, details: error?.details || null });
  report.overall = 'FAIL';
}

await fs.writeFile('grocery-full-live-audit-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.overall === 'FAIL') process.exitCode = 1;
