import fs from 'node:fs/promises';
import { logicalKey, request, unwrap } from './qa-grocery-live-helpers.mjs';

const runtime = JSON.parse(await fs.readFile('grocery-live-runtime.json', 'utf8'));
const backend = runtime.backendOrigin;
const token = runtime.token;
const results = [];
const counts = { additionalReceipts: 0, waste: 0, returns: 0, refunds: 0 };

function rows(value) {
  const data = unwrap(value);
  if (Array.isArray(data)) return data;
  for (const key of ['data', 'items', 'products', 'suppliers', 'batches']) {
    if (Array.isArray(data?.[key])) return data[key];
  }
  return [];
}
function pass(name, details = {}) { results.push({ name, status: 'PASS', ...details }); }
function fail(name, error, details = {}) { results.push({ name, status: 'FAIL', error: String(error?.message || error), ...details }); }

try {
  const products = rows((await request(backend, '/api/v1/products?active=true&limit=500', { token, expected: [200] })).payload)
    .filter((product) => runtime.productIds.includes(product.id));
  const suppliers = rows((await request(backend, '/api/v1/suppliers?active=true&limit=100', { token, expected: [200] })).payload)
    .filter((supplier) => runtime.supplierIds.includes(supplier.id));
  if (products.length !== 50 || suppliers.length !== 5 || !runtime.warehouseId) throw new Error('Core Grocery tenant data is incomplete');

  for (let receiptIndex = 0; receiptIndex < 5; receiptIndex += 1) {
    const items = products.slice(receiptIndex * 10, receiptIndex * 10 + 10).map((product, itemIndex) => ({
      productId: product.id,
      quantity: 25 + itemIndex,
      freeQuantity: itemIndex === 0 ? 1 : 0,
      cost: Number(product.costPrice || 1),
      batchNo: `QAG-${runtime.runTag.slice(-6)}-R2-${String(receiptIndex * 10 + itemIndex + 1).padStart(3, '0')}`,
      expiryDate: new Date(Date.now() + (240 + receiptIndex * 10 + itemIndex) * 86400000).toISOString(),
    }));
    await request(backend, '/api/v1/industry/grocery/receiving', {
      method: 'POST',
      token,
      idempotencyKey: logicalKey('grocery-cert-extra-receiving', { businessId: runtime.businessId, receiptIndex }),
      body: {
        supplierId: suppliers[receiptIndex % suppliers.length].id,
        warehouseId: runtime.warehouseId,
        supplierInvoiceNo: `QA-GRN-EXTRA-${runtime.runTag}-${receiptIndex + 1}`,
        supplierInvoiceDate: new Date().toISOString(),
        freight: 2,
        items,
      },
      expected: [201],
      retries: 2,
      timeoutMs: 60000,
    });
    counts.additionalReceipts += 1;
  }
  pass('Five additional atomic Grocery receipts', { count: counts.additionalReceipts, totalCertificationReceipts: 10 });

  const batches = rows((await request(backend, '/api/v1/industry/batches?limit=500', { token, expected: [200] })).payload)
    .filter((batch) => runtime.batchIds.includes(batch.id));
  if (batches.length < 5) throw new Error('Not enough certification batches are available for waste testing');
  for (let index = 0; index < 5; index += 1) {
    const batch = batches[index];
    const quantity = Number((0.5 + index * 0.25).toFixed(3));
    const waste = await request(backend, '/api/v1/industry/grocery/waste', {
      method: 'POST',
      token,
      idempotencyKey: logicalKey('grocery-cert-waste', { businessId: runtime.businessId, batchId: batch.id, quantity }),
      body: { batchId: batch.id, quantity, reason: 'QA certification spoilage', notes: `Run ${runtime.runTag}` },
      expected: [201],
      retries: 2,
    });
    if (!waste.data?.wasteNo) throw new Error(`Waste ${index + 1} did not persist`);
    counts.waste += 1;
  }
  pass('Five batch-scoped waste postings', { count: counts.waste });

  const documents = rows((await request(backend, '/api/v1/sales-documents?documentType=invoice&limit=250', { token, expected: [200] })).payload)
    .filter((document) => String(document.referenceNo || '').startsWith(`QA-${runtime.runTag}-`));
  const candidates = documents.filter((document) => Array.isArray(document.items) && document.items.length && Number(document.paid || document.paidAmount || 0) > 0).slice(0, 15);
  if (candidates.length < 15) throw new Error(`Only ${candidates.length} paid certification invoices are available for returns`);
  const createdReturns = [];
  for (let index = 0; index < 15; index += 1) {
    const document = candidates[index];
    const source = document.items[0];
    const soldQty = Number(source.qty || source.quantity || 1);
    const returnQty = index < 10 ? Math.min(soldQty, Math.max(0.001, Number((soldQty / 2).toFixed(3)))) : soldQty;
    const body = {
      sourceSalesDocumentId: document.id,
      reason: index < 10 ? 'QA Grocery partial return' : 'QA Grocery full-line return',
      items: [{
        productId: source.productId,
        sku: source.sku,
        productName: source.name,
        soldQty,
        returnQty,
        rate: Number(source.rate || source.unitPrice || 0),
      }],
    };
    const created = await request(backend, '/api/v1/sales-returns', {
      method: 'POST',
      token,
      idempotencyKey: logicalKey('grocery-cert-return', { businessId: runtime.businessId, index, body }),
      body,
      expected: [201],
      retries: 2,
    });
    if (!created.data?.id) throw new Error(`Return ${index + 1} did not persist`);
    createdReturns.push({ salesReturn: created.data, document });
    counts.returns += 1;
  }
  pass('Fifteen posted returns', { partial: 10, fullLine: 5, total: counts.returns });

  for (let index = 0; index < 5; index += 1) {
    const pair = createdReturns[index];
    const refundable = Math.min(Number(pair.salesReturn.total || pair.salesReturn.totalAmount || 0), Number(pair.document.paid || pair.document.paidAmount || 0));
    if (!(refundable > 0)) throw new Error(`Return ${index + 1} has no refundable amount`);
    const body = {
      salesDocumentId: pair.document.id,
      salesReturnId: pair.salesReturn.id,
      amount: refundable,
      refundMethod: index % 2 === 0 ? 'cash' : 'card',
      referenceNo: `QA-RFD-${runtime.runTag}-${index + 1}`,
      notes: 'Grocery production certification refund',
    };
    const refund = await request(backend, '/api/v1/refunds', {
      method: 'POST',
      token,
      idempotencyKey: logicalKey('grocery-cert-refund', { businessId: runtime.businessId, index, body }),
      body,
      expected: [201],
      retries: 2,
    });
    if (!refund.data?.id) throw new Error(`Refund ${index + 1} did not persist`);
    counts.refunds += 1;
  }
  pass('Five refunds posted', { count: counts.refunds });

  const purchaseRows = rows((await request(backend, '/api/v1/purchases?limit=100', { token, expected: [200] })).payload);
  const returnRows = rows((await request(backend, '/api/v1/sales-returns', { token, expected: [200] })).payload);
  const refundRows = rows((await request(backend, '/api/v1/refunds', { token, expected: [200] })).payload);
  if (purchaseRows.length < 10 || returnRows.length < 15 || refundRows.length < 5) throw new Error('Extended-operation persistence reconciliation failed');
  pass('Extended operation persistence reconciliation', { purchases: purchaseRows.length, returns: returnRows.length, refunds: refundRows.length });

  const reportEndpoints = [
    '/api/v1/dashboard/summary',
    '/api/v1/reports/daily-sales',
    '/api/v1/reports/sale-products',
    '/api/v1/reports/profit-loss',
    '/api/v1/reports/grocery-expiry-risk',
    '/api/v1/reports/grocery-waste-share',
    '/api/v1/reports/grocery-recall-share',
    '/api/v1/reports/grocery-sales-category',
    '/api/v1/reports/grocery-sales-brand',
    '/api/v1/reports/grocery-payment-method',
    '/api/v1/reports/grocery-cashier-sales',
    '/api/v1/reports/grocery-terminal-sales',
    '/api/v1/inventory/stock',
    '/api/v1/industry/batches',
  ];
  for (const endpoint of reportEndpoints) {
    try {
      const response = await request(backend, endpoint, { token, expected: [200], retries: 1 });
      pass(`Read ${endpoint}`, { httpStatus: response.status });
    } catch (error) {
      fail(`Read ${endpoint}`, error, { httpStatus: error?.status || null });
    }
  }
} catch (error) {
  fail('Extended Grocery operations', error, { httpStatus: error?.status || null, details: error?.details || null });
}

const report = {
  generatedAt: new Date().toISOString(),
  tenant: { businessId: runtime.businessId, businessSlug: runtime.businessSlug },
  counts,
  results,
  overall: results.length > 0 && results.every((entry) => entry.status === 'PASS') ? 'PASS' : 'FAIL',
};
await fs.writeFile('grocery-extended-operations-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.overall !== 'PASS') process.exitCode = 1;
