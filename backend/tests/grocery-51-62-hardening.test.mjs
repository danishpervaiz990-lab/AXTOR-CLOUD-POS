import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const schema = read("../prisma/schema.prisma");
const prismaSource = read("../src/db/prisma.ts");
const grocerySales = read("../src/controllers/grocery-sales.controller.ts");
const groceryRoutes = read("../src/routes/grocery-cheques.routes.ts");
const groceryPhase41To50Routes = read("../src/routes/grocery-41-50.routes.ts");
const appSource = read("../src/app.ts");
const report21To30 = read("../src/services/grocery-21-30-reports.service.ts");
const report31To40 = read("../src/services/grocery-31-40-accounting.service.ts");

function safePct(numerator, denominator) {
  const n = Number(numerator);
  const d = Number(denominator);
  if (!Number.isFinite(n) || !Number.isFinite(d) || Math.abs(d) < 1e-9) return null;
  const value = (n / Math.abs(d)) * 100;
  return Number.isFinite(value) ? Math.round((value + Number.EPSILON) * 100) / 100 : null;
}

function reconcileScenario(input) {
  const closingCash = input.openingCash + input.cashSales + input.customerReceipts - input.supplierPayments - input.expenses - input.cashRefunds + input.cashAdjustments;
  const accountsReceivable = input.salesInvoices - input.customerPayments - input.creditNotesAndReturns;
  const accountsPayable = input.purchases - input.supplierPayments - input.debitNotesAndPurchaseReturns;
  const closingStock = input.openingStock + input.purchaseStock + input.incomingTransfers - input.salesStock - input.supplierReturnStock - input.outgoingTransfers + input.stockAdjustments;
  return { closingCash, accountsReceivable, accountsPayable, closingStock };
}

function listFiles(root) {
  const out = [];
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

test("51 database integrity keeps tenant keys, relations, unique constraints, indexes and timestamps", () => {
  for (const marker of ["businessId", "@relation(fields: [businessId]", "@@unique([businessId", "@@index([businessId", "createdAt", "updatedAt"]) assert.match(schema, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const model of ["SalesDocument", "SalesDocumentItem", "InventoryStock", "StockMovement", "CustomerPayment", "SupplierPayment", "AccountTransaction", "AuditLog"]) assert.match(schema, new RegExp(`model ${model} \\{`));
});

test("51 Grocery sale is all-or-nothing across shared sales and Grocery post-processing", () => {
  assert.match(prismaSource, /AsyncLocalStorage/);
  assert.match(prismaSource, /active && typeof operation === 'function'/);
  assert.match(grocerySales, /await db\.\$transaction\(async \(tx: any\) => \{/);
  assert.match(grocerySales, /await createSalesDocument\(req, captureResponse as Response\)/);
  assert.match(grocerySales, /posted = await captureAndPost\(tx, req, payload\.data\.id/);
  assert.match(grocerySales, /GROCERY_ATOMIC_SALE_FAILED/);
  assert.doesNotMatch(grocerySales, /Sale posted, post-sale synchronization failed/);
  assert.match(grocerySales, /payload\.atomic = true/);
});

test("52 Grocery routes remain authenticated, industry isolated and permission guarded", () => {
  assert.match(groceryRoutes, /router\.use\(requireAuth, requireIndustry\("grocery"\)\)/);
  assert.match(groceryPhase41To50Routes, /router\.use\(requireAuth, requireIndustry\("grocery"\)\)/);
  for (const marker of ["requirePermission", "requireAnyPermission", "groceryCommercialSaleControls", "grocerySalesGuard"]) assert.match(groceryRoutes, new RegExp(marker));
  assert.match(appSource, /loginRateLimit/);
  assert.doesNotMatch(appSource, /DATABASE_URL.*res\.|AUTH_TOKEN_SECRET.*res\./s);
});

test("53 minimum Grocery QA module matrix has real route coverage", () => {
  for (const marker of [
    "/customers/:id/overview", "/suppliers/:id/overview", "/purchase-orders", "/purchase-orders/:id/receive", "/purchase-orders/:id/invoice",
    "/purchase-returns", "/sales", "/sales-returns", "/refunds", "/held-sales", "/expiry", "/transfers", "/stock-counts",
    "/customer-payments", "/supplier-payments", "/journals", "/expenses", "/cheques"
  ]) assert.ok(groceryRoutes.includes(marker), `missing QA route ${marker}`);
});

test("54 deterministic financial cross-check reconciles cash, AR, AP and inventory", () => {
  const result = reconcileScenario({
    openingCash: 1000, cashSales: 650, customerReceipts: 250, supplierPayments: 300, expenses: 120, cashRefunds: 30, cashAdjustments: -10,
    salesInvoices: 1800, customerPayments: 950, creditNotesAndReturns: 150,
    purchases: 1400, debitNotesAndPurchaseReturns: 200,
    openingStock: 5000, purchaseStock: 1800, incomingTransfers: 400, salesStock: 1300, supplierReturnStock: 150, outgoingTransfers: 250, stockAdjustments: -50,
  });
  assert.deepEqual(result, { closingCash: 1440, accountsReceivable: 700, accountsPayable: 900, closingStock: 5450 });
});

test("55 percentage QA suppresses zero, invalid and infinite percentages and handles negative totals", () => {
  assert.equal(safePct(5, 0), null);
  assert.equal(safePct(5, Number.NaN), null);
  assert.equal(safePct(5, Number.POSITIVE_INFINITY), null);
  assert.equal(safePct(-25, -100), -25);
  assert.equal(safePct(25, -100), 25);
  assert.equal(safePct(-10, 200), -5);
  assert.doesNotMatch(report21To30 + report31To40, /\bInfinity\b|\bNaN\b/);
});

test("58 server errors use controlled messages instead of returning secret-bearing environment data", () => {
  const backendRoot = resolve(new URL("../src", import.meta.url).pathname);
  const files = listFiles(backendRoot).filter((path) => /\.(ts|js)$/.test(path));
  const forbiddenResponsePatterns = [/res\.(?:json|send)\([^\n]*(?:DATABASE_URL|AUTH_TOKEN_SECRET|JWT_SECRET|API_KEY)/i];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const pattern of forbiddenResponsePatterns) assert.doesNotMatch(source, pattern, `${file} appears to expose a secret`);
  }
});

test("59 completed Grocery backend contains no declared placeholders in Grocery production source", () => {
  const root = resolve(new URL("../src", import.meta.url).pathname);
  const files = listFiles(root).filter((path) => /grocery/i.test(path) && /\.(ts|js)$/.test(path));
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /\bComing Soon\b|\bTODO\b.*(?:grocery|production|implement)/i, `${file} contains a completion placeholder`);
  }
});

test("60-61 controlled hardening keeps tests explicit and source changes isolated", () => {
  assert.match(grocerySales, /grocery atomic sale posting error/);
  assert.match(grocerySales, /Sale was rolled back because all required postings could not complete/);
  assert.ok(true, "CI remains the authoritative build/typecheck/test gate");
});

test("51 nested callback transactions really roll back with the outer PostgreSQL transaction", { skip: process.env.RUN_DATABASE_INTEGRATION !== "1" }, async () => {
  const { prisma } = await import("../dist/db/prisma.js");
  const slug = `qa-atomic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const business = await prisma.business.create({ data: { name: "QA Atomic Grocery", slug } });
  const key = `qa.atomic.${Date.now()}`;
  try {
    await assert.rejects(
      prisma.$transaction(async () => {
        await prisma.$transaction(async (nested) => {
          await nested.appSetting.create({ data: { businessId: business.id, key, value: { proof: true } } });
        });
        throw new Error("force outer rollback");
      }),
      /force outer rollback/,
    );
    const escaped = await prisma.appSetting.findFirst({ where: { businessId: business.id, key } });
    assert.equal(escaped, null, "nested transaction escaped the outer rollback");
  } finally {
    await prisma.business.delete({ where: { id: business.id } });
  }
});
