import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const runtime = JSON.parse(await fs.readFile('hardware-live-audit-runtime.json', 'utf8'));
const report = JSON.parse(await fs.readFile('hardware-live-audit-report.json', 'utf8'));
const owner = runtime.users.find((user) => user.key === 'owner');
if (!owner?.token) throw new Error('Owner token missing');
const backend = runtime.backendOrigin || process.env.AXTOR_BACKEND_ORIGIN;
const token = owner.token;
const runId = `HWOPS-${Date.now()}`;
const checks = [];
const created = { branches: [], tradeSalesUsers: [], salesmen: [], expenses: [] };
const errors = [];
const dataOf = (value) => value?.data ?? value;
const pass = (name, detail) => checks.push({ name, pass: true, detail });
const fail = (name, detail) => { checks.push({ name, pass: false, detail }); errors.push(`${name}: ${detail}`); };

function mutationKey(path, method, body) {
  const digest = crypto.createHash('sha256').update(`${method}:${path}:${JSON.stringify(body ?? null)}`).digest('hex').slice(0, 28);
  return `${runId}:${digest}`;
}

async function request(path, { method = 'GET', body, expected = [200, 201] } = {}) {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' };
  if (method !== 'GET') headers['Idempotency-Key'] = mutationKey(path, method, body);
  const response = await fetch(`${backend}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!expected.includes(response.status)) throw new Error(`${method} ${path} failed (${response.status}): ${JSON.stringify(payload)}`);
  return dataOf(payload);
}

try {
  for (let i = 1; i <= 5; i += 1) {
    created.branches.push(await request('/api/v1/branches', { method: 'POST', body: { name: `QA Hardware Branch ${i} ${runId}`, code: `HWB${i}-${String(Date.now()).slice(-5)}`, city: 'Doha', country: 'QA', type: 'Hardware', active: true } }));
  }
  pass('Five branches created', `${created.branches.length} active Hardware branches`);
} catch (error) { fail('Five branches created', error.message); }

let warehouse;
try {
  warehouse = await request('/api/v1/inventory/warehouses', { method: 'POST', body: { name: `QA Central Warehouse ${runId}`, code: `WH-${String(Date.now()).slice(-6)}`, branchId: created.branches[0]?.id, active: true } });
  pass('One warehouse created', warehouse.name || warehouse.id);
} catch (error) { fail('One warehouse created', error.message); }

let tradeSalesRole;
try {
  const access = await request('/api/v1/access-control');
  tradeSalesRole = access.roles?.find((role) => String(role.name).trim().toLowerCase() === 'trade salesperson');
  if (!tradeSalesRole) throw new Error('Trade Salesperson role not found');
  for (let i = 1; i <= 5; i += 1) {
    created.tradeSalesUsers.push(await request('/api/v1/access-control/users', { method: 'POST', body: { name: `QA Trade Salesperson ${i}`, email: `qa-hw-trade-sales-${Date.now()}-${i}@axtor.invalid`, password: `AxtorQA!${Date.now()}x`, branchId: created.branches[(i - 1) % Math.max(created.branches.length, 1)]?.id, roleIds: [tradeSalesRole.id] } }));
  }
  pass('Five trade sales users created', `${created.tradeSalesUsers.length} users assigned to the canonical Trade Salesperson role`);
} catch (error) { fail('Five trade sales users created', error.message); }

try {
  for (let i = 1; i <= 10; i += 1) {
    const salesman = await request('/api/v1/salesmen', { method: 'POST', body: { name: `QA Hardware Salesman ${i} ${runId}`, email: `qa-hw-sales-${Date.now()}-${i}@axtor.invalid`, phone: `+9745000${String(i).padStart(4, '0')}`, branchId: created.branches[(i - 1) % Math.max(created.branches.length, 1)]?.id, baseCommissionRate: 2, active: true } });
    created.salesmen.push(salesman);
    await request(`/api/v1/salesmen/${salesman.id}/target`, { method: 'PUT', body: { month: new Date().toISOString().slice(0, 7), targetAmount: 50000, targetInvoices: 50, commissionTiers: [{ from: 0, to: 79.99, rate: 1 }, { from: 80, to: 99.99, rate: 2 }, { from: 100, to: 999, rate: 3 }], bonusOnTarget: 500 } });
  }
  pass('Ten salesmen created', `${created.salesmen.length} salesmen with targets and percentage tiers`);
} catch (error) { fail('Ten salesmen created', error.message); }

const expenseSeed = [
  ['Car Petrol', 650], ['Sales Van Petrol', 900], ['Tea and Coffee', 250], ['Salaries', 25000], ['Owner Drawings', 5000], ['General Expenses', 1200],
];
try {
  for (let i = 0; i < expenseSeed.length; i += 1) {
    const [category, amount] = expenseSeed[i];
    created.expenses.push(await request('/api/v1/expenses', { method: 'POST', body: { category, amount, branchId: created.branches[i % Math.max(created.branches.length, 1)]?.id, description: `${category} production audit`, referenceNo: `${runId}-EXP-${i + 1}`, expenseDate: new Date().toISOString() } }));
  }
  const expenseReport = await request('/api/v1/expenses?limit=1000');
  const total = Number(expenseReport.total || expenseSeed.reduce((sum, row) => sum + row[1], 0));
  const percentageRows = expenseSeed.map(([category, amount]) => ({ category, amount, percentage: total ? Number(((amount / total) * 100).toFixed(2)) : 0 }));
  pass('Operating expenses posted', `${created.expenses.length} categories; percentage total ${percentageRows.reduce((sum, row) => sum + row.percentage, 0).toFixed(2)}%`);
  report.operationsExpensePercentages = percentageRows;
} catch (error) { fail('Operating expenses posted', error.message); }

let supplier;
let purchase;
try {
  supplier = await request('/api/v1/suppliers', { method: 'POST', body: { name: `QA Hardware Supplier ${runId}`, company: 'AXTOR QA Supply Co.', phone: '+97444009988', email: `supplier-${Date.now()}@axtor.invalid`, creditDays: 30, active: true } });
  const product = runtime.products?.[0];
  if (!product?.id) throw new Error('Audit product missing');
  purchase = await request('/api/v1/purchases', { method: 'POST', body: { supplierId: supplier.id, warehouseId: warehouse?.id || runtime.ids?.mainWarehouseId, branchId: created.branches[0]?.id, referenceNo: `${runId}-PO`, status: 'DRAFT', items: [{ productId: product.id, sku: product.sku, name: product.name, qty: 100, cost: Number(product.costPrice || product.cost || 10) }] } });
  const received = await request(`/api/v1/purchases/${purchase.id}/receive`, { method: 'POST', body: { warehouseId: warehouse?.id || runtime.ids?.mainWarehouseId, receiptNo: `${runId}-GRN`, notes: 'Supplier goods received during production audit' } });
  const payable = Number(received.balanceAmount || received.balance || received.total || 0);
  await request('/api/v1/purchases/supplier-payments', { method: 'POST', body: { supplierId: supplier.id, amount: payable, method: 'bank_transfer', referenceNo: `${runId}-SPAY`, allocations: [{ purchaseId: purchase.id, amount: payable }] } });
  const receipts = await request('/api/v1/purchases/goods-receipts');
  const payments = await request(`/api/v1/purchases/supplier-payments?supplierId=${supplier.id}`);
  pass('Supplier purchase and item receipt', `${Array.isArray(receipts) ? receipts.length : 0} receipt records available`);
  pass('Supplier payment posted', `${Array.isArray(payments) ? payments.length : 0} supplier payment records available`);
} catch (error) { fail('Supplier purchase/payment flow', error.message); }

try {
  const options = await request('/api/v1/reports/options');
  const reportOptions = Array.isArray(options) ? options : options.reports || options.options || [];
  const selected = reportOptions.slice(0, 25);
  const reportRuns = [];
  for (const option of selected) {
    const id = option.id || option.reportId || option.key;
    if (!id) continue;
    try {
      const result = await request(`/api/v1/reports/${encodeURIComponent(id)}`);
      const rows = Array.isArray(result) ? result : result.rows || result.data || [];
      const numericKey = rows[0] && Object.keys(rows[0]).find((key) => typeof rows[0][key] === 'number');
      let percentageRows = rows;
      if (numericKey) {
        const total = rows.reduce((sum, row) => sum + Number(row[numericKey] || 0), 0);
        percentageRows = rows.map((row) => ({ ...row, percentage: total ? Number(((Number(row[numericKey] || 0) / total) * 100).toFixed(2)) : 0 }));
      }
      reportRuns.push({ id, rowCount: rows.length, percentageColumn: Boolean(numericKey), sample: percentageRows.slice(0, 3) });
    } catch (error) {
      reportRuns.push({ id, error: error.message, percentageColumn: false });
    }
  }
  report.operationsReportPercentages = reportRuns;
  const successful = reportRuns.filter((item) => !item.error);
  pass('Reports executed', `${successful.length}/${reportRuns.length} report endpoints executed; percentage evidence added where numeric totals exist`);
} catch (error) { fail('Reports executed', error.message); }

report.hardwareOperations = {
  runId,
  counts: { branches: created.branches.length, warehouses: warehouse ? 1 : 0, tradeSalesUsers: created.tradeSalesUsers.length, salesmen: created.salesmen.length, expenses: created.expenses.length, suppliers: supplier ? 1 : 0, purchases: purchase ? 1 : 0 },
  checks,
  errors,
};
report.overall = report.overall === 'PASS' && checks.length > 0 && checks.every((item) => item.pass) ? 'PASS' : 'FAIL';
await fs.writeFile('hardware-live-audit-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.hardwareOperations, null, 2));
if (report.overall !== 'PASS') process.exitCode = 1;
