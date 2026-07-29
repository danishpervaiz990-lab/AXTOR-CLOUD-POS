import { prisma } from "../db/prisma.js";
import { ApiError, cleanString, monthRange, plain, roundMoney } from "../utils/http.js";
import { profitLossAfterReturns } from "./retail-accounting.helpers.js";

const QATAR_OFFSET = "+03:00";
const INVALID_SALES_STATUSES = ["DRAFT", "CANCELLED", "VOID"];

function qatarDate(value: string, endOfDay = false): Date {
  return new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}${QATAR_OFFSET}`);
}

function qatarToday(date = new Date()): string {
  return new Date(date.getTime() + 3 * 3600000).toISOString().slice(0, 10);
}

function range(q: any): { from: Date; to: Date } {
  const month = cleanString(q.month);
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [year, monthNo] = month.split("-").map(Number);
    const nextMonth = monthNo === 12 ? `${year + 1}-01-01` : `${year}-${String(monthNo + 1).padStart(2, "0")}-01`;
    return { from: qatarDate(`${month}-01`), to: new Date(qatarDate(nextMonth).getTime() - 1) };
  }
  const yearText = cleanString(q.year);
  if (yearText && /^\d{4}$/.test(yearText)) {
    const year = Number(yearText);
    return { from: qatarDate(`${year}-01-01`), to: new Date(qatarDate(`${year + 1}-01-01`).getTime() - 1) };
  }
  const today = qatarToday();
  const fromText = cleanString(q.from);
  const toText = cleanString(q.to);
  const fallbackFrom = new Date(Date.now() - 30 * 86400000);
  return {
    from: fromText && /^\d{4}-\d{2}-\d{2}$/.test(fromText) ? qatarDate(fromText) : fallbackFrom,
    to: toText && /^\d{4}-\d{2}-\d{2}$/.test(toText) ? qatarDate(toText, true) : qatarDate(today, true),
  };
}

function money(value: any): number {
  return roundMoney(Number(value || 0));
}

function percentage(value: any, denominator: any): number {
  const base = Number(denominator || 0);
  if (!Number.isFinite(base) || Math.abs(base) < 0.0000001) return 0;
  return roundMoney((Number(value || 0) / base) * 100);
}

function sum(rows: any[], key: string): number {
  return money(rows.reduce((total, row) => total + Number(row[key] || 0), 0));
}

function cell(value: any): any {
  return value instanceof Date ? value.toISOString() : value;
}

function result(title: string, columns: any[], rows: any[], summary: any[] = []): any {
  return {
    title,
    columns,
    rows: rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, cell(value)]))),
    summary,
  };
}

export async function options(businessId: string): Promise<any> {
  const [branches, customers, products, suppliers, salesmen, warehouses] = await Promise.all([
    prisma.branch.findMany({ where: { businessId, active: true }, select: { id: true, name: true } }),
    prisma.customer.findMany({ where: { businessId, active: true }, select: { id: true, name: true } }),
    prisma.product.findMany({ where: { businessId, active: true, deleted: false }, select: { id: true, name: true, sku: true } }),
    prisma.supplier.findMany({ where: { businessId, active: true }, select: { id: true, name: true } }),
    prisma.salesman.findMany({ where: { businessId, active: true }, select: { id: true, name: true } }),
    prisma.warehouse.findMany({ where: { businessId, active: true }, select: { id: true, name: true } }),
  ]);
  return plain({ branches, customers, products, suppliers, salesmen, warehouses });
}

function invoiceWhere(businessId: string, q: any): any {
  const { from, to } = range(q);
  const where: any = {
    businessId,
    documentType: "INVOICE",
    createdAt: { gte: from, lte: to },
    status: { notIn: INVALID_SALES_STATUSES },
  };
  if (cleanString(q.branchId)) where.branchId = cleanString(q.branchId);
  if (cleanString(q.customerId)) where.customerId = cleanString(q.customerId);
  if (cleanString(q.salesmanId)) where.salesmanId = cleanString(q.salesmanId);
  return where;
}

async function sales(businessId: string, q: any, withItems = false): Promise<any[]> {
  return prisma.salesDocument.findMany({
    where: invoiceWhere(businessId, q),
    include: withItems ? { items: true } : undefined,
    orderBy: { createdAt: "desc" },
  });
}

export async function runReport(businessId: string, id: string, q: any = {}): Promise<any> {
  switch (id) {
    case "daily-sales": {
      const docs = await sales(businessId, q);
      const rows = docs.map((doc) => ({
        date: doc.createdAt,
        documentNo: doc.documentNo,
        customer: doc.customerName,
        salesman: doc.salesmanName || "-",
        payment: doc.paymentMethod || "-",
        total: money(doc.total),
        paid: money(doc.paid),
        balance: money(doc.balance),
        paidPct: percentage(doc.paid, doc.total),
      }));
      return result(
        "Daily Sale Report",
        [
          { key: "date", label: "Date" }, { key: "documentNo", label: "Invoice" },
          { key: "customer", label: "Customer" }, { key: "salesman", label: "Salesman" },
          { key: "payment", label: "Payment" }, { key: "total", label: "Total" },
          { key: "paid", label: "Paid" }, { key: "balance", label: "Balance" },
          { key: "paidPct", label: "Paid %" },
        ],
        rows,
        [
          { label: "Sales", value: sum(rows, "total") }, { label: "Paid", value: sum(rows, "paid") },
          { label: "Outstanding", value: sum(rows, "balance") }, { label: "Invoices", value: rows.length },
          { label: "Collection %", value: percentage(sum(rows, "paid"), sum(rows, "total")), format: "percent" },
        ],
      );
    }

    case "sale-products": {
      const docs = await sales(businessId, q, true);
      const productIds = [...new Set(docs.flatMap((doc: any) => doc.items.map((item: any) => item.productId).filter(Boolean)))] as string[];
      const products = productIds.length
        ? await prisma.product.findMany({ where: { businessId, id: { in: productIds } }, select: { id: true, costPrice: true } })
        : [];
      const costs = new Map(products.map((product) => [product.id, Number(product.costPrice)]));
      const grouped = new Map<string, any>();
      for (const doc of docs) {
        for (const item of doc.items) {
          if (cleanString(q.productId) && item.productId !== cleanString(q.productId)) continue;
          const key = item.productId || item.sku || item.name;
          const row = grouped.get(key) || { sku: item.sku || "-", product: item.name, qty: 0, sales: 0, cost: 0, profit: 0 };
          row.qty += Number(item.qty);
          row.sales += Number(item.total);
          row.cost += (costs.get(item.productId || "") || 0) * Number(item.qty);
          row.profit = row.sales - row.cost;
          grouped.set(key, row);
        }
      }
      const rows = [...grouped.values()].map((row) => ({
        ...row,
        qty: Number(row.qty.toFixed(3)), sales: money(row.sales), cost: money(row.cost), profit: money(row.profit),
        marginPct: percentage(row.profit, row.sales),
      })).sort((a, b) => b.sales - a.sales);
      return result(
        "Sale Report by Products",
        [
          { key: "sku", label: "SKU" }, { key: "product", label: "Product" }, { key: "qty", label: "Qty" },
          { key: "sales", label: "Sales" }, { key: "cost", label: "Cost" }, { key: "profit", label: "Profit" },
          { key: "marginPct", label: "Margin %" },
        ],
        rows,
        [
          { label: "Sales", value: sum(rows, "sales") }, { label: "Cost", value: sum(rows, "cost") },
          { label: "Profit", value: sum(rows, "profit") },
          { label: "Gross Margin %", value: percentage(sum(rows, "profit"), sum(rows, "sales")), format: "percent" },
        ],
      );
    }

    case "sale-customer": {
      const docs = await sales(businessId, q);
      const grouped = new Map<string, any>();
      for (const doc of docs) {
        const key = doc.customerId || doc.customerName;
        const row = grouped.get(key) || { customer: doc.customerName, invoices: 0, sales: 0, paid: 0, balance: 0 };
        row.invoices += 1;
        row.sales += Number(doc.total);
        row.paid += Number(doc.paid);
        row.balance += Number(doc.balance);
        grouped.set(key, row);
      }
      const rows = [...grouped.values()].map((row) => ({
        ...row, sales: money(row.sales), paid: money(row.paid), balance: money(row.balance),
        collectionPct: percentage(row.paid, row.sales),
      })).sort((a, b) => b.sales - a.sales);
      return result(
        "Sale Report by Customer",
        [
          { key: "customer", label: "Customer" }, { key: "invoices", label: "Invoices" },
          { key: "sales", label: "Sales" }, { key: "paid", label: "Paid" },
          { key: "balance", label: "Balance" }, { key: "collectionPct", label: "Collection %" },
        ],
        rows,
        [
          { label: "Customers", value: rows.length }, { label: "Sales", value: sum(rows, "sales") },
          { label: "Outstanding", value: sum(rows, "balance") },
          { label: "Collection %", value: percentage(sum(rows, "paid"), sum(rows, "sales")), format: "percent" },
        ],
      );
    }

    case "sales-return": {
      const { from, to } = range(q);
      const returns = await prisma.salesReturn.findMany({
        where: {
          businessId,
          returnDate: { gte: from, lte: to },
          status: { notIn: ["CANCELLED", "VOID"] },
          ...(cleanString(q.customerId) ? { customerId: cleanString(q.customerId) } : {}),
        },
        include: { items: true, sourceSalesDocument: { select: { documentNo: true } } },
        orderBy: { returnDate: "desc" },
      });
      const totalReturns = returns.reduce((total, row) => total + Number(row.total || 0), 0);
      const rows = returns.map((row) => ({
        date: row.returnDate,
        returnNo: row.returnNo,
        invoice: row.sourceSalesDocument.documentNo,
        customer: row.customerName,
        qty: row.items.reduce((total, item) => total + Number(item.returnQty), 0),
        amount: money(row.total),
        sharePct: percentage(row.total, totalReturns),
        status: row.status,
      }));
      return result(
        "Sales Return Report",
        [
          { key: "date", label: "Date" }, { key: "returnNo", label: "Return No" },
          { key: "invoice", label: "Invoice" }, { key: "customer", label: "Customer" },
          { key: "qty", label: "Qty" }, { key: "amount", label: "Amount" },
          { key: "sharePct", label: "Return Share %" }, { key: "status", label: "Status" },
        ],
        rows,
        [{ label: "Returns", value: rows.length }, { label: "Return Amount", value: money(totalReturns) }],
      );
    }

    case "stock-valuation": {
      const warehouseId = cleanString(q.warehouseId);
      const [stocks, products] = await Promise.all([
        prisma.inventoryStock.findMany({ where: { businessId, ...(warehouseId ? { warehouseId } : {}) } }),
        prisma.product.findMany({ where: { businessId, deleted: false } }),
      ]);
      const productMap = new Map(products.map((product) => [product.id, product]));
      const raw = stocks.map((stock) => {
        const product = productMap.get(stock.productId);
        const qty = Number(stock.qtyOnHand);
        const cost = Number(product?.costPrice || 0);
        const retail = Number(product?.price || 0);
        return {
          sku: product?.sku || "-", product: product?.name || "Unknown", warehouse: stock.warehouseId,
          qty, cost: money(cost), stockValue: money(qty * cost), retailValue: money(qty * retail),
        };
      });
      const totalStockValue = sum(raw, "stockValue");
      const rows = raw.map((row) => ({ ...row, valueSharePct: percentage(row.stockValue, totalStockValue) }));
      return result(
        "Stock Valuation Report",
        [
          { key: "sku", label: "SKU" }, { key: "product", label: "Product" },
          { key: "warehouse", label: "Warehouse" }, { key: "qty", label: "Qty" },
          { key: "cost", label: "Cost" }, { key: "stockValue", label: "Stock Value" },
          { key: "retailValue", label: "Retail Value" }, { key: "valueSharePct", label: "Value Share %" },
        ],
        rows,
        [{ label: "Stock Value", value: totalStockValue }, { label: "Retail Value", value: sum(rows, "retailValue") }, { label: "Products", value: rows.length }],
      );
    }

    case "purchase-report": {
      const { from, to } = range(q);
      const where: any = { businessId, purchaseDate: { gte: from, lte: to } };
      if (cleanString(q.supplierId)) where.supplierId = cleanString(q.supplierId);
      const purchases = await prisma.purchase.findMany({ where, orderBy: { purchaseDate: "desc" } });
      const rows = purchases.map((row) => ({
        date: row.purchaseDate, purchaseNo: row.purchaseNo, supplier: row.supplierName, status: row.status,
        total: money(row.total), paid: money(row.paid), balance: money(row.balance), paidPct: percentage(row.paid, row.total),
      }));
      return result(
        "Purchase Report",
        [
          { key: "date", label: "Date" }, { key: "purchaseNo", label: "Purchase No" },
          { key: "supplier", label: "Supplier" }, { key: "status", label: "Status" },
          { key: "total", label: "Total" }, { key: "paid", label: "Paid" },
          { key: "balance", label: "Payable" }, { key: "paidPct", label: "Paid %" },
        ],
        rows,
        [
          { label: "Purchases", value: sum(rows, "total") }, { label: "Paid", value: sum(rows, "paid") },
          { label: "Payable", value: sum(rows, "balance") },
          { label: "Paid %", value: percentage(sum(rows, "paid"), sum(rows, "total")), format: "percent" },
        ],
      );
    }

    case "tax-report": {
      const docs = await sales(businessId, q);
      const rows = docs.map((doc) => ({
        date: doc.createdAt, documentNo: doc.documentNo, customer: doc.customerName,
        subtotal: money(doc.subtotal), tax: money(doc.tax), total: money(doc.total), taxPct: percentage(doc.tax, doc.subtotal),
      }));
      return result(
        "Tax Report",
        [
          { key: "date", label: "Date" }, { key: "documentNo", label: "Invoice" },
          { key: "customer", label: "Customer" }, { key: "subtotal", label: "Subtotal" },
          { key: "tax", label: "Tax" }, { key: "total", label: "Total" }, { key: "taxPct", label: "Tax %" },
        ],
        rows,
        [
          { label: "Taxable Sales", value: sum(rows, "subtotal") }, { label: "Tax", value: sum(rows, "tax") },
          { label: "Total", value: sum(rows, "total") },
          { label: "Effective Tax %", value: percentage(sum(rows, "tax"), sum(rows, "subtotal")), format: "percent" },
        ],
      );
    }

    case "expense-report": {
      const { from, to } = range(q);
      const expenses = await prisma.expense.findMany({
        where: { businessId, expenseDate: { gte: from, lte: to }, ...(cleanString(q.branchId) ? { branchId: cleanString(q.branchId) } : {}) },
        orderBy: { expenseDate: "desc" },
      });
      const totalExpenses = expenses.reduce((total, row) => total + Number(row.amount || 0), 0);
      const rows = expenses.map((row) => ({
        date: row.expenseDate, category: row.category, description: row.description || "-", reference: row.referenceNo || "-",
        amount: money(row.amount), sharePct: percentage(row.amount, totalExpenses),
      }));
      return result(
        "Expense Report",
        [
          { key: "date", label: "Date" }, { key: "category", label: "Category" },
          { key: "description", label: "Description" }, { key: "reference", label: "Reference" },
          { key: "amount", label: "Amount" }, { key: "sharePct", label: "Expense Share %" },
        ],
        rows,
        [{ label: "Expenses", value: money(totalExpenses) }, { label: "Entries", value: rows.length }],
      );
    }

    case "profit-loss": {
      const docs = await sales(businessId, q, true);
      const { from, to } = range(q);
      const [expenses, returns] = await Promise.all([
        prisma.expense.findMany({ where: { businessId, expenseDate: { gte: from, lte: to } } }),
        prisma.salesReturn.findMany({
          where: { businessId, returnDate: { gte: from, lte: to }, status: { notIn: ["CANCELLED", "VOID"] } },
          include: { items: true },
        }),
      ]);
      let grossRevenue = 0;
      let grossCogs = 0;
      const productIds = [...new Set([
        ...docs.flatMap((doc: any) => doc.items.map((item: any) => item.productId).filter(Boolean)),
        ...returns.flatMap((row) => row.items.map((item: any) => item.productId).filter(Boolean)),
      ])] as string[];
      const products = productIds.length
        ? await prisma.product.findMany({ where: { businessId, id: { in: productIds } }, select: { id: true, costPrice: true } })
        : [];
      const costs = new Map(products.map((product) => [product.id, Number(product.costPrice)]));
      for (const doc of docs) {
        grossRevenue += Number(doc.total);
        for (const item of doc.items) grossCogs += (costs.get(item.productId || "") || 0) * Number(item.qty);
      }
      const returnedRevenue = returns.reduce((total, row) => total + Number(row.total || 0), 0);
      const returnedCogs = returns.reduce((total, row) => total + row.items.reduce((subTotal: number, item: any) => subTotal + (costs.get(item.productId || "") || 0) * Number(item.returnQty || 0), 0), 0);
      const expenseTotal = sum(expenses, "amount");
      const calculated = profitLossAfterReturns({ grossRevenue, grossCogs, returnedRevenue, returnedCogs, expenses: expenseTotal });
      const revenue = money(calculated.revenue);
      const cogs = money(calculated.cogs);
      const gross = money(calculated.grossProfit);
      const net = money(calculated.netProfit);
      const rows = [
        { line: "Gross Sales Revenue", amount: money(grossRevenue) },
        { line: "Sales Returns", amount: money(-returnedRevenue) },
        { line: "Net Sales Revenue", amount: revenue },
        { line: "Cost of Goods Sold", amount: cogs },
        { line: "Gross Profit", amount: gross },
        { line: "Operating Expenses", amount: expenseTotal },
        { line: "Net Profit", amount: net },
      ].map((row) => ({ ...row, salesPct: percentage(row.amount, revenue) }));
      return result(
        "Profit & Loss Report",
        [{ key: "line", label: "Account" }, { key: "amount", label: "Amount" }, { key: "salesPct", label: "% of Net Sales" }],
        rows,
        [
          { label: "Revenue", value: revenue }, { label: "Gross Profit", value: gross },
          { label: "Gross Margin %", value: percentage(gross, revenue), format: "percent" },
          { label: "Net Profit", value: net }, { label: "Net Margin %", value: percentage(net, revenue), format: "percent" },
        ],
      );
    }

    case "trial-balance": {
      const accounts = await prisma.account.findMany({ where: { businessId, active: true } });
      const raw = accounts.map((account) => {
        const balance = Number(account.currentBalance);
        return { account: account.name, type: account.type, debit: balance >= 0 ? money(balance) : 0, credit: balance < 0 ? money(Math.abs(balance)) : 0 };
      });
      const debitTotal = sum(raw, "debit");
      const creditTotal = sum(raw, "credit");
      const rows = raw.map((row) => ({ ...row, sideSharePct: row.debit > 0 ? percentage(row.debit, debitTotal) : percentage(row.credit, creditTotal) }));
      return result(
        "Trial Balance",
        [
          { key: "account", label: "Account" }, { key: "type", label: "Type" },
          { key: "debit", label: "Debit" }, { key: "credit", label: "Credit" },
          { key: "sideSharePct", label: "Side Share %" },
        ],
        rows,
        [{ label: "Debit", value: debitTotal }, { label: "Credit", value: creditTotal }],
      );
    }

    case "balance-sheet": {
      const [accounts, customers, suppliers, stocks, products] = await Promise.all([
        prisma.account.findMany({ where: { businessId, active: true } }),
        prisma.customer.aggregate({ where: { businessId, active: true }, _sum: { balance: true } }),
        prisma.supplier.aggregate({ where: { businessId, active: true }, _sum: { balance: true } }),
        prisma.inventoryStock.findMany({ where: { businessId } }),
        prisma.product.findMany({ where: { businessId }, select: { id: true, costPrice: true } }),
      ]);
      const costs = new Map(products.map((product) => [product.id, Number(product.costPrice)]));
      const cash = accounts.reduce((total, account) => total + Number(account.currentBalance), 0);
      const inventory = stocks.reduce((total, stock) => total + Number(stock.qtyOnHand) * (costs.get(stock.productId) || 0), 0);
      const receivables = Number(customers._sum.balance || 0);
      const payables = Number(suppliers._sum.balance || 0);
      const assets = money(cash + inventory + receivables);
      const liabilities = money(payables);
      const equity = money(assets - liabilities);
      const rows = [
        { section: "Assets", line: "Cash & Bank", amount: money(cash) },
        { section: "Assets", line: "Inventory", amount: money(inventory) },
        { section: "Assets", line: "Receivables", amount: money(receivables) },
        { section: "Liabilities", line: "Supplier Payables", amount: liabilities },
        { section: "Equity", line: "Net Assets", amount: equity },
      ].map((row) => ({ ...row, assetsPct: percentage(row.amount, assets) }));
      return result(
        "Balance Sheet",
        [
          { key: "section", label: "Section" }, { key: "line", label: "Line" },
          { key: "amount", label: "Amount" }, { key: "assetsPct", label: "% of Assets" },
        ],
        rows,
        [{ label: "Assets", value: assets }, { label: "Liabilities", value: liabilities }, { label: "Equity", value: equity }],
      );
    }

    case "general-ledger": {
      const { from, to } = range(q);
      const [transactions, customerPayments, supplierPayments, expenses] = await Promise.all([
        prisma.accountTransaction.findMany({ where: { businessId, transactionDate: { gte: from, lte: to } }, include: { account: { select: { name: true } } } }),
        prisma.customerPayment.findMany({ where: { businessId, paymentDate: { gte: from, lte: to } } }),
        prisma.supplierPayment.findMany({ where: { businessId, paymentDate: { gte: from, lte: to } } }),
        prisma.expense.findMany({ where: { businessId, expenseDate: { gte: from, lte: to } } }),
      ]);
      const rows: any[] = [];
      for (const transaction of transactions) {
        const isDebit = ["debit", "deposit", "receipt", "income", "opening", "adjustment_in"].includes(transaction.type);
        rows.push({
          date: transaction.transactionDate, source: transaction.sourceType || "account", reference: transaction.referenceNo || "-",
          description: transaction.description || transaction.account?.name || "Account transaction",
          debit: isDebit ? money(transaction.amount) : 0, credit: isDebit ? 0 : money(transaction.amount),
        });
      }
      if (!transactions.length) {
        for (const payment of customerPayments) rows.push({ date: payment.paymentDate, source: "customer payment", reference: payment.receiptNo, description: payment.customerName, debit: money(payment.amount), credit: 0 });
        for (const payment of supplierPayments) rows.push({ date: payment.paymentDate, source: "supplier payment", reference: payment.voucherNo, description: payment.supplierName, debit: 0, credit: money(payment.amount) });
        for (const expense of expenses) rows.push({ date: expense.expenseDate, source: "expense", reference: expense.referenceNo || "-", description: expense.category, debit: 0, credit: money(expense.amount) });
      }
      rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const movementTotal = rows.reduce((total, row) => total + Number(row.debit || 0) + Number(row.credit || 0), 0);
      rows.forEach((row) => { row.movementSharePct = percentage(Number(row.debit || 0) + Number(row.credit || 0), movementTotal); });
      return result(
        "General Ledger Report",
        [
          { key: "date", label: "Date" }, { key: "source", label: "Source" },
          { key: "reference", label: "Reference" }, { key: "description", label: "Description" },
          { key: "debit", label: "Debit" }, { key: "credit", label: "Credit" },
          { key: "movementSharePct", label: "Movement Share %" },
        ],
        rows,
        [{ label: "Debit", value: sum(rows, "debit") }, { label: "Credit", value: sum(rows, "credit") }],
      );
    }

    case "salesman-commission": {
      const { month } = monthRange(q.month);
      const payouts = await prisma.commissionPayout.findMany({
        where: { businessId, month, ...(cleanString(q.salesmanId) ? { salesmanId: cleanString(q.salesmanId) } : {}) },
        include: { salesman: true },
      });
      const rows = payouts.map((payout) => ({
        salesman: payout.salesman.name, month: payout.month, sales: money(payout.grossSales),
        achievement: money(payout.achievementPct), commission: money(payout.commissionAmount), bonus: money(payout.bonusAmount),
        payout: money(payout.totalPayout), payoutPct: percentage(payout.totalPayout, payout.grossSales), status: payout.status,
      }));
      return result(
        "Salesman Commission Report",
        [
          { key: "salesman", label: "Salesman" }, { key: "month", label: "Month" },
          { key: "sales", label: "Sales" }, { key: "achievement", label: "Achievement %" },
          { key: "commission", label: "Commission" }, { key: "bonus", label: "Bonus" },
          { key: "payout", label: "Payout" }, { key: "payoutPct", label: "Payout %" }, { key: "status", label: "Status" },
        ],
        rows,
        [
          { label: "Gross Sales", value: sum(rows, "sales") }, { label: "Total Payout", value: sum(rows, "payout") },
          { label: "Payout %", value: percentage(sum(rows, "payout"), sum(rows, "sales")), format: "percent" },
        ],
      );
    }

    case "customer-profit-loss": {
      const docs = await sales(businessId, q, true);
      const productIds = [...new Set(docs.flatMap((doc: any) => doc.items.map((item: any) => item.productId).filter(Boolean)))] as string[];
      const products = productIds.length
        ? await prisma.product.findMany({ where: { businessId, id: { in: productIds } }, select: { id: true, costPrice: true } })
        : [];
      const costs = new Map(products.map((product) => [product.id, Number(product.costPrice)]));
      const grouped = new Map<string, any>();
      for (const doc of docs) {
        const key = doc.customerId || doc.customerName;
        const row = grouped.get(key) || { customer: doc.customerName, sales: 0, cogs: 0, profit: 0, outstanding: 0 };
        row.sales += Number(doc.total);
        row.outstanding += Number(doc.balance);
        for (const item of doc.items) row.cogs += (costs.get(item.productId || "") || 0) * Number(item.qty);
        row.profit = row.sales - row.cogs;
        grouped.set(key, row);
      }
      const rows = [...grouped.values()].map((row) => ({
        ...row, sales: money(row.sales), cogs: money(row.cogs), profit: money(row.profit), outstanding: money(row.outstanding),
        marginPct: percentage(row.profit, row.sales),
      })).sort((a, b) => b.sales - a.sales);
      return result(
        "Customer Profit/Loss Report",
        [
          { key: "customer", label: "Customer" }, { key: "sales", label: "Sales" },
          { key: "cogs", label: "COGS" }, { key: "profit", label: "Profit" },
          { key: "marginPct", label: "Margin %" }, { key: "outstanding", label: "Outstanding" },
        ],
        rows,
        [
          { label: "Sales", value: sum(rows, "sales") }, { label: "Profit", value: sum(rows, "profit") },
          { label: "Gross Margin %", value: percentage(sum(rows, "profit"), sum(rows, "sales")), format: "percent" },
          { label: "Outstanding", value: sum(rows, "outstanding") },
        ],
      );
    }

    default:
      throw new ApiError(404, "Unknown report");
  }
}
