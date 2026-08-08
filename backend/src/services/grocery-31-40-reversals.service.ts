import { prisma } from "../db/prisma.js";
import { postBalancedGroceryJournal, resolveGroceryAccount } from "./grocery-accounting.service.js";
import { ApiError, roundMoney } from "../utils/http.js";

const db: any = prisma;
const money = (v: unknown) => roundMoney(Number(v || 0));
const json = (v: unknown): Record<string, any> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {};

async function currency(tx: any, businessId: string) { const b = await tx.business.findUnique({ where: { id: businessId }, select: { currency: true } }); return String(b?.currency || "QAR").toUpperCase(); }
async function account(tx: any, businessId: string, systemCode: string, name: string, type: string, code: string) { const c = await currency(tx, businessId); return resolveGroceryAccount(tx, businessId, c, { systemCode, name, type, accountCode: code, nameMatches: [name] }); }

function returnFinancialBreakdown(source: any, salesReturn: any) {
  const sourceItems = new Map<string, any>();
  for (const item of source.items || []) { if (item.productId) sourceItems.set(`p:${item.productId}`, item); if (item.sku) sourceItems.set(`s:${String(item.sku).toLowerCase()}`, item); }
  let tax = 0, cogs = 0;
  const snapshot = json(json(source.metadata).groceryCostSnapshot), snapRows = Array.isArray(snapshot.items) ? snapshot.items : [];
  for (const item of salesReturn.items || []) {
    const src = (item.productId && sourceItems.get(`p:${item.productId}`)) || (item.sku && sourceItems.get(`s:${String(item.sku).toLowerCase()}`));
    if (src && Number(src.qty || 0) > 0) tax += Number(src.tax || 0) * Number(item.returnQty || 0) / Number(src.qty || 1);
    const snap = snapRows.find((x: any) => String(x.productId || "") === String(item.productId || ""));
    if (snap && Number(snap.qty || snap.baseQty || 0) > 0) cogs += Number(snap.cogs || 0) * Number(item.returnQty || 0) / Number(snap.qty || snap.baseQty || 1);
  }
  const total = money(salesReturn.total), safeTax = money(Math.min(Math.max(0, tax), total)), revenue = money(total - safeTax);
  return { total, tax: safeTax, revenue, cogs: money(Math.max(0, cogs)) };
}

export async function postGrocerySalesReturnFinancials(tx: any, input: { businessId: string; userId: string | null; salesReturnId: string }) {
  const salesReturn = await tx.salesReturn.findFirst({ where: { id: input.salesReturnId, businessId: input.businessId }, include: { items: true } });
  if (!salesReturn) throw new ApiError(404, "Sales return not found");
  const priorAccounting = json(json(salesReturn.metadata).accounting);
  const alreadyPosted = await tx.accountTransaction.findFirst({ where: { businessId: input.businessId, sourceType: "grocery_sales_return", sourceId: salesReturn.id } });
  if (alreadyPosted) return { duplicate: true, ...priorAccounting };

  const source = await tx.salesDocument.findFirst({ where: { id: salesReturn.sourceSalesDocumentId, businessId: input.businessId, documentType: "INVOICE" }, include: { items: true } });
  if (!source) throw new ApiError(404, "Source sales invoice not found");
  const breakdown = returnFinancialBreakdown(source, salesReturn);
  const outstandingBefore = money(source.balance), arReduction = money(Math.min(outstandingBefore, breakdown.total)), refundPayable = money(breakdown.total - arReduction);
  const salesReturns = await account(tx, input.businessId, "sales_returns", "Sales Returns", "income", "4010");
  const taxPayable = breakdown.tax > 0 ? await account(tx, input.businessId, "tax_payable", "Tax Payable", "liability", "2100") : null;
  const ar = arReduction > 0 ? await account(tx, input.businessId, "accounts_receivable", "Accounts Receivable", "asset", "1100") : null;
  const refundLiability = refundPayable > 0 ? await account(tx, input.businessId, "customer_refund_payable", "Customer Refund Payable", "liability", "2050") : null;
  const inventory = breakdown.cogs > 0 ? await account(tx, input.businessId, "inventory", "Inventory", "asset", "1200") : null;
  const cogs = breakdown.cogs > 0 ? await account(tx, input.businessId, "cogs", "Cost of Goods Sold", "cogs", "5000") : null;
  const lines: any[] = [{ accountId: salesReturns.id, debit: breakdown.revenue, description: `Sales return ${salesReturn.returnNo}` }];
  if (taxPayable && breakdown.tax > 0) lines.push({ accountId: taxPayable.id, debit: breakdown.tax });
  if (ar && arReduction > 0) lines.push({ accountId: ar.id, credit: arReduction });
  if (refundLiability && refundPayable > 0) lines.push({ accountId: refundLiability.id, credit: refundPayable });
  if (inventory && cogs && breakdown.cogs > 0) { lines.push({ accountId: inventory.id, debit: breakdown.cogs }); lines.push({ accountId: cogs.id, credit: breakdown.cogs }); }
  await postBalancedGroceryJournal(tx, { businessId: input.businessId, userId: input.userId, referenceNo: salesReturn.returnNo, description: `Grocery sales return ${salesReturn.returnNo}`, transactionDate: salesReturn.returnDate, sourceType: "grocery_sales_return", sourceId: salesReturn.id, lines });

  if (arReduction > 0) {
    const nextBalance = money(Math.max(0, outstandingBefore - arReduction));
    await tx.salesDocument.update({ where: { id: source.id }, data: { balance: nextBalance, baseBalance: money(nextBalance * Number(source.exchangeRate || 1)), creditAmount: nextBalance, paymentStatus: nextBalance <= .001 ? "paid" : Number(source.paid || 0) > 0 ? "partial" : "unpaid", status: nextBalance <= .001 ? "PAID" : Number(source.paid || 0) > 0 ? "PARTIALLY_PAID" : "CREDIT" } });
    if (source.customerId) { const customer = await tx.customer.findFirst({ where: { id: source.customerId, businessId: input.businessId } }); if (customer) await tx.customer.update({ where: { id: customer.id }, data: { balance: money(Math.max(0, Number(customer.balance || 0) - arReduction)) } }); }
  }
  const accounting = { arReduction, refundPayable, revenueReversal: breakdown.revenue, taxReversal: breakdown.tax, cogsReversal: breakdown.cogs, posted: true };
  await tx.salesReturn.update({ where: { id: salesReturn.id }, data: { creditAmount: refundPayable, metadata: { ...json(salesReturn.metadata), accounting } } });
  return { ...accounting, ...breakdown };
}

function paymentSystemCode(method: string) { const m = method.toLowerCase(); if (m.includes("card")) return "card_clearing"; if (m.includes("bank")) return "bank"; if (m.includes("wallet") || m.includes("digital")) return "digital_wallet"; if (m.includes("store") || m.includes("credit note") || m.includes("customer account")) return "customer_credit_liability"; return "cash"; }
export async function postGroceryRefundAccounting(tx: any, input: { businessId: string; userId: string | null; refundId: string }) {
  const refund = await tx.customerRefund.findFirst({ where: { id: input.refundId, businessId: input.businessId } }); if (!refund) throw new ApiError(404, "Refund not found");
  if (await tx.accountTransaction.findFirst({ where: { businessId: input.businessId, sourceType: "grocery_customer_refund", sourceId: refund.id } })) return { duplicate: true };
  const liability = await account(tx, input.businessId, "customer_refund_payable", "Customer Refund Payable", "liability", "2050"), systemCode = paymentSystemCode(String(refund.method || "cash"));
  const definition: Record<string, [string, string, string]> = { cash: ["Cash", "asset", "1000"], bank: ["Bank", "asset", "1010"], card_clearing: ["Card Clearing", "asset", "1020"], digital_wallet: ["Digital Wallet Clearing", "asset", "1030"], customer_credit_liability: ["Customer Credit Liability", "liability", "2060"] };
  const [name, type, code] = definition[systemCode] || definition.cash, destination = await account(tx, input.businessId, systemCode, name, type, code), amount = money(refund.baseAmount || refund.amount);
  return postBalancedGroceryJournal(tx, { businessId: input.businessId, userId: input.userId, referenceNo: refund.refundNo, description: `Customer refund ${refund.refundNo}`, transactionDate: refund.refundDate, sourceType: "grocery_customer_refund", sourceId: refund.id, lines: [{ accountId: liability.id, debit: amount }, { accountId: destination.id, credit: amount }] });
}

export async function postGroceryPurchaseReturnAccounting(tx: any, input: { businessId: string; userId: string | null; purchaseReturnId: string }) {
  const row = await tx.purchaseReturn.findFirst({ where: { id: input.purchaseReturnId, businessId: input.businessId } }); if (!row) throw new ApiError(404, "Purchase return not found");
  if (await tx.accountTransaction.findFirst({ where: { businessId: input.businessId, sourceType: "grocery_purchase_return", sourceId: row.id } })) return { duplicate: true };
  const ap = await account(tx, input.businessId, "accounts_payable", "Accounts Payable", "liability", "2000"), inventory = await account(tx, input.businessId, "inventory", "Inventory", "asset", "1200"), amount = money(row.total);
  return postBalancedGroceryJournal(tx, { businessId: input.businessId, userId: input.userId, referenceNo: row.returnNo, description: `Grocery purchase return ${row.returnNo}`, transactionDate: row.returnDate || row.createdAt, sourceType: "grocery_purchase_return", sourceId: row.id, lines: [{ accountId: ap.id, debit: amount }, { accountId: inventory.id, credit: amount }] });
}
