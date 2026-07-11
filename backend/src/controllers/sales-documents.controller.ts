import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { getDocumentPrefix, getNextDocumentNumber } from "../utils/document-number.js";
import { hasPermission, loadUserAccess, requirePermission, type UserAccess } from "../services/access.service.js";
import { writeAudit } from "../services/audit.service.js";

type PrismaDocumentType = "INVOICE" | "QUOTATION" | "DELIVERY_NOTE";
type ApiDocumentType = "invoice" | "quotation" | "delivery_note";

type CreateSalesDocumentItemInput = {
  productId?: string;
  sku?: string;
  barcode?: string;
  qrCode?: string;
  name?: string;
  description?: string;
  unit?: string;
  qty?: number;
  quantity?: number;
  rate?: number;
  price?: number;
  unitPrice?: number;
  discount?: number;
  discountAmount?: number;
  taxRate?: number;
};

type PaymentLineInput = {
  method?: string;
  amount?: number;
  accountId?: string;
  depositAccount?: string;
  referenceNo?: string;
  notes?: string;
};

const documentTypeMap: Record<string, PrismaDocumentType> = {
  invoice: "INVOICE",
  INVOICE: "INVOICE",
  quotation: "QUOTATION",
  QUOTATION: "QUOTATION",
  quote: "QUOTATION",
  delivery_note: "DELIVERY_NOTE",
  DELIVERY_NOTE: "DELIVERY_NOTE",
  dn: "DELIVERY_NOTE",
  DN: "DELIVERY_NOTE",
};

const paymentMethodMap: Record<string, string> = {
  cash: "cash",
  card: "card",
  "bank transfer": "bank_transfer",
  bank_transfer: "bank_transfer",
  bank: "bank_transfer",
  credit: "credit",
  "customer credit": "credit",
  customer_credit: "credit",
  mixed: "mixed",
  "mixed payment": "mixed",
  "cash/card": "mixed",
  cheque: "cheque",
  check: "cheque",
  wallet: "wallet",
};

function getBusinessId(req: Request) {
  return req.tenant?.businessId ?? undefined;
}

function getUserId(req: Request) {
  return req.tenant?.userId ?? undefined;
}

function cleanString(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function toNumber(value: unknown, defaultValue = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : defaultValue;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundQty(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function normalizeDocumentType(value: unknown): PrismaDocumentType | null {
  const text = cleanString(value);
  if (!text) return null;
  return documentTypeMap[text] ?? documentTypeMap[text.toLowerCase()] ?? null;
}

function toApiDocumentType(documentType: PrismaDocumentType): ApiDocumentType {
  if (documentType === "INVOICE") return "invoice";
  if (documentType === "QUOTATION") return "quotation";
  return "delivery_note";
}

function normalizeStatus(value: unknown) {
  const text = cleanString(value);
  if (!text) return undefined;
  const status = text.toUpperCase();
  const allowed = ["DRAFT", "ISSUED", "PAID", "PARTIALLY_PAID", "CREDIT", "CANCELLED", "VOID"];
  return allowed.includes(status) ? status : undefined;
}

function normalizePaymentMethod(value: unknown): string {
  const raw = cleanString(value)?.toLowerCase() || "cash";
  return paymentMethodMap[raw] || raw.replace(/\s+/g, "_");
}

function toDate(value: unknown): Date | undefined {
  const text = cleanString(value);
  if (!text) return undefined;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function localDateKey(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getPaymentStatus(total: number, paid: number, applicable = true) {
  if (!applicable) return "not_applicable";
  if (paid <= 0) return "unpaid";
  if (paid + 0.001 >= total) return "paid";
  return "partial";
}

function getPostedStatus(total: number, paid: number, paymentMethod: string) {
  if (paid + 0.001 >= total) return "PAID";
  if (paid > 0) return "PARTIALLY_PAID";
  if (paymentMethod === "credit") return "CREDIT";
  return "ISSUED";
}

function jsonObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function settingValue(settings: Map<string, any>, key: string, fallback: any) {
  if (!settings.has(key)) return fallback;
  const value = settings.get(key);
  if (value && typeof value === "object" && "value" in value) return value.value;
  return value;
}

async function loadSettings(tx: any, businessId: string) {
  const rows = await tx.appSetting.findMany({ where: { businessId } });
  return new Map<string, any>(rows.map((row: any) => [String(row.key), row.value]));
}

function formatItem(item: any) {
  return {
    id: item.id,
    businessId: item.businessId,
    salesDocumentId: item.salesDocumentId,
    productId: item.productId,
    sku: item.sku,
    barcode: item.barcode,
    qrCode: item.qrCode,
    name: item.name,
    description: item.description,
    unit: item.unit,
    qty: Number(item.qty),
    quantity: Number(item.qty),
    rate: Number(item.rate),
    unitPrice: Number(item.rate),
    price: Number(item.price),
    discount: Number(item.discount),
    taxRate: Number(item.taxRate),
    tax: Number(item.tax),
    total: Number(item.total),
    lineTotal: Number(item.total),
    createdAt: item.createdAt,
  };
}

function formatSalesDocument(document: any) {
  const documentType = String(document.documentType) as PrismaDocumentType;
  const total = Number(document.total || 0);
  const paid = Number(document.paid || 0);
  const balance = Number(document.balance || 0);
  const returnedAmount = Number(document.returnedAmount || 0);
  const refundedAmount = Number(document.refundedAmount || 0);
  const returnCount = Number(document.returnCount || 0);
  const refundStatus = document.refundStatus || (refundedAmount > 0 ? "partially_refunded" : "not_refunded");
  const refundBalance = roundMoney(Math.max(0, Math.min(returnedAmount, paid) - refundedAmount));
  const returnStatus = document.returnStatus || (returnedAmount > 0 ? "partially_returned" : "not_returned");
  const metadata = jsonObject(document.metadata);

  return {
    id: document.id,
    businessId: document.businessId,
    branchId: document.branchId,
    warehouseId: document.warehouseId,
    documentNo: document.documentNo,
    documentType: toApiDocumentType(documentType),
    documentTypeRaw: document.documentType,
    documentPrefix: document.documentPrefix,
    lpoNo: document.lpoNo,
    customerPoNo: document.customerPoNo,
    poNo: document.poNo,
    customerId: document.customerId,
    customerName: document.customerName,
    salesmanId: document.salesmanId,
    salesmanName: document.salesmanName,
    paymentMethod: document.paymentMethod,
    currency: document.currency || "QAR",
    salesChannel: document.salesChannel,
    referenceNo: document.referenceNo,
    internalNotes: document.internalNotes,
    customerNotes: document.customerNotes,
    paymentStatus: document.paymentStatus,
    stockStatus: document.stockStatus,
    status: String(document.status).toLowerCase(),
    statusRaw: document.status,
    subtotal: Number(document.subtotal),
    discount: Number(document.discount),
    tax: Number(document.tax),
    total,
    amount: total,
    totalAmount: total,
    grandTotal: total,
    netAmount: total,
    paid,
    paidAmount: paid,
    amountPaid: paid,
    receivedAmount: paid,
    balance,
    balanceAmount: balance,
    returnStatus,
    returnedAmount,
    returnCount,
    refundedAmount,
    refundStatus,
    refundBalance,
    netRetained: roundMoney(Math.max(0, paid - refundedAmount)),
    isReturned: ["fully_returned", "partially_returned"].includes(returnStatus),
    creditAmount: Number(document.creditAmount || 0),
    customerCreditApplied: document.customerCreditApplied,
    dueDate: document.dueDate,
    issuedAt: document.issuedAt,
    postedAt: document.postedAt,
    documentDate: document.issuedAt,
    date: document.issuedAt,
    createdByUserId: document.createdByUserId,
    updatedByUserId: document.updatedByUserId,
    revision: Number(document.revision || 1),
    delivery: metadata.delivery || null,
    paymentLines: metadata.paymentLines || [],
    metadata,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    items: Array.isArray(document.items) ? document.items.map(formatItem) : [],
    lines: Array.isArray(document.items) ? document.items.map(formatItem) : [],
  };
}

async function resolveOperationalContext(
  tx: any,
  businessId: string,
  access: UserAccess,
  input: any,
  options: { requireWarehouse?: boolean } = {}
) {
  const settings = await loadSettings(tx, businessId);
  const requestedBranchId = cleanString(input?.branchId);
  let branchId = requestedBranchId || access.branchId || null;

  if (branchId) {
    const branch = await tx.branch.findFirst({ where: { id: branchId, businessId, active: true } });
    if (!branch) throw new Error("Selected branch is invalid or inactive");
    if (access.branchId && branchId !== access.branchId && !hasPermission(access, "sales_documents.cross_branch")) {
      throw new Error("You do not have permission to create sales in another branch");
    }
  } else {
    const firstBranch = await tx.branch.findFirst({ where: { businessId, active: true }, orderBy: { createdAt: "asc" } });
    branchId = firstBranch?.id || null;
  }

  let warehouseId = cleanString(input?.warehouseId) || null;
  if (!warehouseId) {
    const configured = cleanString(settingValue(settings, "sales.defaultWarehouseId", null));
    if (configured) warehouseId = configured;
  }
  if (!warehouseId && branchId) {
    const warehouse = await tx.warehouse.findFirst({ where: { businessId, branchId, active: true }, orderBy: { createdAt: "asc" } });
    warehouseId = warehouse?.id || null;
  }
  if (!warehouseId) {
    const warehouse = await tx.warehouse.findFirst({ where: { businessId, active: true }, orderBy: { createdAt: "asc" } });
    warehouseId = warehouse?.id || null;
  }

  if (warehouseId) {
    const warehouse = await tx.warehouse.findFirst({ where: { id: warehouseId, businessId, active: true } });
    if (!warehouse) throw new Error("Selected warehouse is invalid or inactive");
    if (branchId && warehouse.branchId && warehouse.branchId !== branchId && !hasPermission(access, "sales_documents.cross_branch")) {
      throw new Error("Selected warehouse does not belong to the selected branch");
    }
  } else if (options.requireWarehouse) {
    throw new Error("Warehouse is required. Create or select an active warehouse first.");
  }

  return { branchId, warehouseId, settings };
}

async function resolveCustomer(tx: any, businessId: string, input: any) {
  const customerId = cleanString(input?.customerId);
  if (!customerId) {
    return {
      customerId: null,
      customerName: cleanString(input?.customerName) || "Walk-in Customer",
      customer: null,
    };
  }

  const customer = await tx.customer.findFirst({ where: { id: customerId, businessId, active: true } });
  if (!customer) throw new Error("Selected customer is invalid or inactive");
  return { customerId: customer.id, customerName: customer.name, customer };
}

async function resolveSalesperson(tx: any, businessId: string, access: UserAccess, input: any) {
  const requestedId = cleanString(input?.salesmanId) || access.userId;
  const salesperson = await tx.user.findFirst({ where: { id: requestedId, businessId, status: "ACTIVE" } });
  if (!salesperson) throw new Error("Selected sales person is invalid or inactive");

  if (salesperson.id !== access.userId && !hasPermission(access, "sales_documents.change_salesperson")) {
    throw new Error("You do not have permission to select another sales person");
  }

  return { salesmanId: salesperson.id, salesmanName: salesperson.name };
}

function preparePaymentLines(input: any, total: number, documentType: PrismaDocumentType, postingMode: string) {
  const paymentMethod = normalizePaymentMethod(input?.paymentMethod);
  if (documentType !== "INVOICE") {
    return { paymentMethod, paymentLines: [] as any[], plannedPaid: 0, paid: 0, balance: 0 };
  }

  const rawLines = Array.isArray(input?.paymentLines) ? (input.paymentLines as PaymentLineInput[]) : [];
  let paymentLines = rawLines
    .map((line) => ({
      method: normalizePaymentMethod(line.method || paymentMethod),
      amount: roundMoney(toNumber(line.amount)),
      accountId: cleanString(line.accountId) || null,
      depositAccount: cleanString(line.depositAccount) || null,
      referenceNo: cleanString(line.referenceNo) || null,
      notes: cleanString(line.notes) || null,
    }))
    .filter((line) => line.amount > 0);

  const explicitPaid = input?.paidAmount ?? input?.paid ?? input?.receivedAmount;
  if (!paymentLines.length && paymentMethod !== "credit") {
    const defaultPaid = explicitPaid === undefined || explicitPaid === null || explicitPaid === ""
      ? total
      : roundMoney(toNumber(explicitPaid));
    if (defaultPaid > 0) {
      paymentLines = [{
        method: paymentMethod === "mixed" ? "cash" : paymentMethod,
        amount: defaultPaid,
        accountId: null,
        depositAccount: cleanString(input?.depositAccount) || null,
        referenceNo: cleanString(input?.paymentReferenceNo) || cleanString(input?.referenceNo) || null,
        notes: null,
      }];
    }
  }

  if (postingMode !== "draft" && paymentMethod === "mixed" && paymentLines.length < 2) {
    throw new Error("Mixed Payment requires at least two payment lines");
  }

  const plannedPaid = roundMoney(paymentLines.reduce((sum, line) => sum + line.amount, 0));
  if (plannedPaid > total + 0.001) throw new Error("Paid amount cannot exceed the document total");

  if (postingMode === "draft") {
    return { paymentMethod, paymentLines, plannedPaid, paid: 0, balance: total };
  }

  return { paymentMethod, paymentLines, plannedPaid, paid: plannedPaid, balance: roundMoney(Math.max(0, total - plannedPaid)) };
}

async function prepareItems(tx: any, businessId: string, inputItems: CreateSalesDocumentItemInput[]) {
  if (!inputItems.length) throw new Error("At least one item is required");

  const productIds = [...new Set(inputItems.map((item) => cleanString(item.productId)).filter((id): id is string => Boolean(id)))];
  if (productIds.length !== inputItems.length) throw new Error("Each item must have a valid productId");

  const products = await tx.product.findMany({ where: { businessId, id: { in: productIds }, deleted: false, active: true } });
  if (products.length !== productIds.length) throw new Error("One or more products are invalid or inactive");
  const productById = new Map<string, any>(products.map((product: any) => [String(product.id), product]));

  let subtotal = 0;
  let lineDiscountTotal = 0;
  let taxTotal = 0;

  const items = inputItems.map((item) => {
    const productId = cleanString(item.productId) as string;
    const product = productById.get(productId);
    if (!product) throw new Error(`Product not found: ${productId}`);

    const qty = roundQty(toNumber(item.qty ?? item.quantity));
    if (qty <= 0) throw new Error(`Quantity must be greater than zero for ${product.name}`);

    const rate = roundMoney(toNumber(item.unitPrice ?? item.rate ?? item.price, Number(product.price || 0)));
    const linePrice = roundMoney(qty * rate);
    const discount = roundMoney(Math.max(0, toNumber(item.discountAmount ?? item.discount)));
    if (discount > linePrice) throw new Error(`Discount cannot exceed line amount for ${product.name}`);
    const taxRate = roundMoney(Math.max(0, toNumber(item.taxRate)));
    const taxableAmount = roundMoney(linePrice - discount);
    const tax = roundMoney((taxableAmount * taxRate) / 100);
    const total = roundMoney(taxableAmount + tax);

    subtotal = roundMoney(subtotal + linePrice);
    lineDiscountTotal = roundMoney(lineDiscountTotal + discount);
    taxTotal = roundMoney(taxTotal + tax);

    return {
      product,
      productId,
      sku: product.sku || cleanString(item.sku) || null,
      barcode: product.barcode || cleanString(item.barcode) || null,
      qrCode: product.qrCode || cleanString(item.qrCode) || null,
      name: product.name || cleanString(item.name) || "Item",
      description: cleanString(item.description) || null,
      unit: product.unit || cleanString(item.unit) || "PCS",
      qty,
      rate,
      price: linePrice,
      discount,
      taxRate,
      tax,
      total,
    };
  });

  return { items, subtotal, lineDiscountTotal, taxTotal };
}

async function validateStock(
  tx: any,
  businessId: string,
  warehouseId: string | null,
  preparedItems: any[],
  allowNegative: boolean
) {
  const stockByProduct = new Map<string, any>();
  const productsWithAllocatedStock = new Set<string>();
  if (warehouseId) {
    const rows = await tx.inventoryStock.findMany({
      where: { businessId, productId: { in: preparedItems.map((item) => item.productId) } },
    });
    for (const row of rows) {
      productsWithAllocatedStock.add(String(row.productId));
      if (String(row.warehouseId) === String(warehouseId)) stockByProduct.set(String(row.productId), row);
    }
  }

  for (const item of preparedItems) {
    const warehouseStock = stockByProduct.get(item.productId);
    const hasWarehouseAllocation = productsWithAllocatedStock.has(String(item.productId));
    // Backward compatibility: legacy products with no warehouse rows are initialized
    // from global stock on their first warehouse transaction. Once any warehouse row
    // exists, an unallocated warehouse correctly has zero available stock.
    const available = warehouseStock
      ? roundQty(Number(warehouseStock.qtyOnHand || 0) - Number(warehouseStock.qtyReserved || 0))
      : hasWarehouseAllocation
        ? 0
        : roundQty(Number(item.product.currentStock || 0));
    item.stockRecord = warehouseStock || null;
    item.availableStock = available;
    item.reservedStock = warehouseStock ? Number(warehouseStock.qtyReserved || 0) : 0;
    item.usesLegacyGlobalStock = Boolean(warehouseId && !warehouseStock && !hasWarehouseAllocation);

    if (!allowNegative && available + 0.0001 < item.qty) {
      throw new Error(`Insufficient stock for ${item.name}. Available: ${available}, Required: ${item.qty}`);
    }
  }
}

async function applyStockMovement(
  tx: any,
  input: {
    businessId: string;
    warehouseId: string | null;
    documentId: string;
    documentNo: string;
    userId: string;
    items: any[];
    direction: "OUT" | "IN";
    movementType: string;
    suffix?: string;
  }
) {
  const multiplier = input.direction === "OUT" ? -1 : 1;

  for (let index = 0; index < input.items.length; index += 1) {
    const item = input.items[index];
    const product = await tx.product.findFirst({ where: { id: item.productId, businessId: input.businessId, deleted: false } });
    if (!product) throw new Error(`Product is no longer available: ${item.name}`);

    const beforeGlobal = roundQty(Number(product.currentStock || 0));
    const afterGlobal = roundQty(beforeGlobal + multiplier * item.qty);
    await tx.product.update({ where: { id: item.productId }, data: { currentStock: multiplier < 0 ? { decrement: item.qty } : { increment: item.qty } } });

    let movementBefore = beforeGlobal;
    let movementAfter = afterGlobal;
    if (input.warehouseId) {
      let stock = await tx.inventoryStock.findFirst({
        where: { businessId: input.businessId, productId: item.productId, warehouseId: input.warehouseId },
      });
      if (!stock) {
        const anyAllocatedStock = await tx.inventoryStock.findFirst({
          where: { businessId: input.businessId, productId: item.productId },
          select: { id: true },
        });
        stock = await tx.inventoryStock.upsert({
          where: {
            businessId_productId_warehouseId: {
              businessId: input.businessId,
              productId: item.productId,
              warehouseId: input.warehouseId,
            },
          },
          create: {
            businessId: input.businessId,
            productId: item.productId,
            warehouseId: input.warehouseId,
            qtyOnHand: anyAllocatedStock ? 0 : beforeGlobal,
            qtyReserved: 0,
          },
          update: {},
        });
      }
      movementBefore = roundQty(Number(stock.qtyOnHand || 0));
      movementAfter = roundQty(movementBefore + multiplier * item.qty);
      await tx.inventoryStock.update({
        where: { id: stock.id },
        data: { qtyOnHand: multiplier < 0 ? { decrement: item.qty } : { increment: item.qty } },
      });
    }

    await tx.stockMovement.create({
      data: {
        businessId: input.businessId,
        movementNo: `${input.documentNo}${input.suffix || ""}-${String(index + 1).padStart(3, "0")}-${Date.now()}`,
        productId: item.productId,
        sku: item.sku,
        productName: item.name,
        warehouseId: input.warehouseId,
        direction: input.direction,
        movementType: input.movementType,
        referenceNo: input.documentNo,
        qty: item.qty,
        beforeQty: movementBefore,
        afterQty: movementAfter,
        source: "sales_document",
        metadata: { salesDocumentId: input.documentId, createdById: input.userId },
      },
    });
  }
}

async function nextReceiptNo(tx: any, businessId: string) {
  await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `axtor:receipt-counter:${businessId}`);
  const count = await tx.customerPayment.count({ where: { businessId } });
  for (let offset = 1; offset <= 50; offset += 1) {
    const receiptNo = `RCPT-${String(count + offset).padStart(6, "0")}`;
    const existing = await tx.customerPayment.findFirst({ where: { businessId, receiptNo }, select: { id: true } });
    if (!existing) return receiptNo;
  }
  return `RCPT-${Date.now()}`;
}

async function createPayments(
  tx: any,
  input: {
    businessId: string;
    customerId: string | null;
    customerName: string;
    document: any;
    paymentLines: any[];
    idempotencyKey: string;
    paymentDate: Date;
  }
) {
  const created: any[] = [];
  for (let index = 0; index < input.paymentLines.length; index += 1) {
    const line = input.paymentLines[index];
    const receiptNo = await nextReceiptNo(tx, input.businessId);
    const payment = await tx.customerPayment.create({
      data: {
        businessId: input.businessId,
        receiptNo,
        customerId: input.customerId,
        customerName: input.customerName,
        amount: line.amount,
        method: line.method,
        accountId: line.accountId,
        referenceNo: line.referenceNo,
        idempotencyKey: `${input.idempotencyKey}:payment:${index + 1}`,
        paymentDate: input.paymentDate,
        allocation: {
          salesDocumentId: input.document.id,
          salesDocumentNo: input.document.documentNo,
          paymentMethod: line.method,
          depositAccount: line.depositAccount,
          referenceNo: line.referenceNo,
          notes: line.notes,
          source: "sales_document_posting",
        },
      },
    });
    created.push(payment);
  }
  return created;
}

function stockAffectsDocument(documentType: PrismaDocumentType, settings: Map<string, any>) {
  if (documentType === "INVOICE") return true;
  if (documentType === "DELIVERY_NOTE") return Boolean(settingValue(settings, "sales.deliveryNoteAffectsStock", false));
  return false;
}

function validateDocumentDate(access: UserAccess, documentDate: Date, timezone: string) {
  const todayKey = localDateKey(new Date(), timezone);
  const documentKey = localDateKey(documentDate, timezone);
  if (documentKey < todayKey && !hasPermission(access, "sales_documents.backdate")) {
    throw new Error("Backdated sales documents require sales_documents.backdate permission");
  }
}

export async function getSalesDocumentContext(req: Request, res: Response) {
  try {
    const businessId = getBusinessId(req);
    const userId = getUserId(req);
    if (!businessId) return res.status(401).json({ ok: false, error: { message: "Unauthorized: business context missing" } });

    const data = await (prisma as any).$transaction(async (tx: any) => {
      const access = await loadUserAccess(tx, businessId, userId);
      const [business, branches, warehouses, salesPersons, settingsRows, inventoryStocks] = await Promise.all([
        tx.business.findUnique({ where: { id: businessId } }),
        tx.branch.findMany({ where: { businessId, active: true }, orderBy: { name: "asc" } }),
        tx.warehouse.findMany({ where: { businessId, active: true }, orderBy: { name: "asc" } }),
        tx.user.findMany({ where: { businessId, status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true, branchId: true } }),
        tx.appSetting.findMany({ where: { businessId } }),
        tx.inventoryStock.findMany({
          where: { businessId },
          select: { id: true, productId: true, warehouseId: true, qtyOnHand: true, qtyReserved: true, reorderLevel: true },
          take: 5000,
        }),
      ]);

      const allowedBranches = access.branchId && !hasPermission(access, "sales_documents.cross_branch")
        ? branches.filter((branch: any) => branch.id === access.branchId)
        : branches;
      const allowedBranchIds = new Set(allowedBranches.map((branch: any) => branch.id));
      const allowedWarehouses = warehouses.filter((warehouse: any) => !warehouse.branchId || allowedBranchIds.has(warehouse.branchId));
      const settings = Object.fromEntries(settingsRows.map((row: any) => [row.key, row.value]));

      return {
        business: business ? { id: business.id, name: business.name, currency: business.currency || "QAR", timezone: business.timezone || "Asia/Qatar" } : null,
        currentUser: { id: access.userId, name: access.userName, branchId: access.branchId, roles: access.roleNames },
        permissions: Array.from(access.permissions),
        capabilities: {
          changeSalesperson: hasPermission(access, "sales_documents.change_salesperson"),
          changeDocumentType: hasPermission(access, "sales_documents.change_document_type", true),
          backdate: hasPermission(access, "sales_documents.backdate"),
          overrideCreditLimit: hasPermission(access, "sales_documents.override_credit_limit"),
          allowNegativeStock: hasPermission(access, "sales_documents.allow_negative_stock"),
          editDraft: hasPermission(access, "sales_documents.edit_draft", true),
          editPosted: hasPermission(access, "sales_documents.edit_posted"),
          editPaid: hasPermission(access, "sales_documents.edit_paid"),
          editReturned: hasPermission(access, "sales_documents.edit_returned"),
          editRefunded: hasPermission(access, "sales_documents.edit_refunded"),
        },
        branches: allowedBranches,
        warehouses: allowedWarehouses,
        salesPersons,
        inventoryStocks: inventoryStocks
          .filter((row: any) => allowedWarehouses.some((warehouse: any) => warehouse.id === row.warehouseId))
          .map((row: any) => ({
            id: row.id,
            productId: row.productId,
            warehouseId: row.warehouseId,
            qtyOnHand: Number(row.qtyOnHand || 0),
            qtyReserved: Number(row.qtyReserved || 0),
            available: Number(row.qtyOnHand || 0) - Number(row.qtyReserved || 0),
            reorderLevel: Number(row.reorderLevel || 0),
          })),
        settings,
      };
    });

    return res.json({ ok: true, data });
  } catch (error: any) {
    console.error("getSalesDocumentContext error:", error);
    return res.status(400).json({ ok: false, error: { message: error?.message || "Failed to load sales context" } });
  }
}

export async function previewSalesDocumentNumber(req: Request, res: Response) {
  try {
    const businessId = getBusinessId(req);
    const userId = getUserId(req);
    if (!businessId) return res.status(401).json({ ok: false, error: { message: "Unauthorized" } });
    const documentType = normalizeDocumentType(req.query.documentType);
    if (!documentType) return res.status(400).json({ ok: false, error: { message: "Invalid document type" } });

    const data = await (prisma as any).$transaction(async (tx: any) => {
      const access = await loadUserAccess(tx, businessId, userId);
      const { branchId } = await resolveOperationalContext(tx, businessId, access, { branchId: req.query.branchId });
      const counter = await tx.documentCounter.findFirst({ where: { businessId, branchId, documentType } });
      const prefix = counter?.prefix || getDocumentPrefix(documentType as any);
      const nextNumber = counter?.nextNumber || 1;
      const padding = counter?.padding || 6;
      return { preview: `${prefix}-${String(nextNumber).padStart(padding, "0")}`, prefix, nextNumber, officialNumberGeneratedOnSave: true };
    });

    return res.json({ ok: true, data });
  } catch (error: any) {
    return res.status(400).json({ ok: false, error: { message: error?.message || "Failed to preview document number" } });
  }
}

export async function listSalesDocuments(req: Request, res: Response) {
  try {
    const businessId = getBusinessId(req);
    if (!businessId) return res.status(401).json({ ok: false, error: { message: "Unauthorized: business context missing" } });

    const where: any = { businessId };
    const documentType = normalizeDocumentType(req.query.documentType);
    if (documentType) where.documentType = documentType;
    const customerId = cleanString(req.query.customerId);
    if (customerId) where.customerId = customerId;
    const status = normalizeStatus(req.query.status);
    if (status) where.status = status;
    const q = cleanString(req.query.q);
    if (q) {
      where.OR = [
        { documentNo: { contains: q, mode: "insensitive" } },
        { customerName: { contains: q, mode: "insensitive" } },
        { lpoNo: { contains: q, mode: "insensitive" } },
        { customerPoNo: { contains: q, mode: "insensitive" } },
        { poNo: { contains: q, mode: "insensitive" } },
        { referenceNo: { contains: q, mode: "insensitive" } },
        { paymentStatus: { contains: q, mode: "insensitive" } },
        { returnStatus: { contains: q, mode: "insensitive" } },
        { refundStatus: { contains: q, mode: "insensitive" } },
      ];
    }

    const documents = await (prisma as any).salesDocument.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { items: true },
      take: Math.min(500, Math.max(1, toNumber(req.query.limit, 250))),
    });

    return res.json({ ok: true, count: documents.length, data: documents.map(formatSalesDocument) });
  } catch (error) {
    console.error("listSalesDocuments error:", error);
    return res.status(500).json({ ok: false, error: { message: "Failed to list sales documents" } });
  }
}

export async function getSalesDocumentById(req: Request, res: Response) {
  try {
    const businessId = getBusinessId(req);
    const id = cleanString(req.params.id);
    if (!businessId) return res.status(401).json({ ok: false, error: { message: "Unauthorized: business context missing" } });
    if (!id) return res.status(400).json({ ok: false, error: { message: "Sales document id is required" } });

    const document = await (prisma as any).salesDocument.findFirst({ where: { id, businessId }, include: { items: true, returns: true, refunds: true } });
    if (!document) return res.status(404).json({ ok: false, error: { message: "Sales document not found" } });
    return res.json({ ok: true, data: formatSalesDocument(document) });
  } catch (error) {
    console.error("getSalesDocumentById error:", error);
    return res.status(500).json({ ok: false, error: { message: "Failed to get sales document" } });
  }
}

export async function createSalesDocument(req: Request, res: Response) {
  try {
    const businessId = getBusinessId(req);
    const userId = getUserId(req);
    if (!businessId) return res.status(401).json({ ok: false, error: { message: "Unauthorized: business context missing" } });

    const documentType = normalizeDocumentType(req.body?.documentType);
    if (!documentType) return res.status(400).json({ ok: false, error: { message: "Invalid documentType. Use invoice, quotation, or delivery_note" } });

    const postingMode = String(req.body?.postingMode || req.body?.mode || req.body?.status || "post").toLowerCase() === "draft" ? "draft" : "post";
    const idempotencyKey = cleanString(req.body?.idempotencyKey) || cleanString(req.headers["idempotency-key"]);
    if (!idempotencyKey) return res.status(400).json({ ok: false, error: { message: "idempotencyKey is required for safe document creation" } });

    const inputItems = Array.isArray(req.body?.items) ? (req.body.items as CreateSalesDocumentItemInput[]) : [];

    const result = await (prisma as any).$transaction(async (tx: any) => {
      await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `axtor:sales-idempotency:${businessId}:${idempotencyKey}`);
      const duplicate = await tx.salesDocument.findFirst({ where: { businessId, idempotencyKey }, include: { items: true } });
      if (duplicate) return { document: duplicate, duplicate: true };

      const access = await loadUserAccess(tx, businessId, userId);
      requirePermission(access, postingMode === "draft" ? "sales_documents.save_draft" : "sales_documents.post", true);
      requirePermission(access, "sales_documents.create", true);

      const operational = await resolveOperationalContext(tx, businessId, access, req.body, { requireWarehouse: postingMode === "post" && documentType === "INVOICE" });
      const business = await tx.business.findUnique({ where: { id: businessId } });
      const timezone = business?.timezone || "Asia/Qatar";
      const currency = business?.currency || "QAR";
      const documentDate = toDate(req.body?.documentDate) || new Date();
      validateDocumentDate(access, documentDate, timezone);

      const customerInfo = await resolveCustomer(tx, businessId, req.body);
      const salesperson = await resolveSalesperson(tx, businessId, access, req.body);
      const prepared = await prepareItems(tx, businessId, inputItems);
      const headerDiscount = roundMoney(Math.max(0, toNumber(req.body?.discount ?? req.body?.discountTotal)));
      const discountTotal = roundMoney(prepared.lineDiscountTotal + headerDiscount);
      const total = roundMoney(prepared.subtotal - discountTotal + prepared.taxTotal);
      if (total < 0) throw new Error("Document total cannot be negative");

      const payment = preparePaymentLines(req.body, total, documentType, postingMode);
      const lpoNo = cleanString(req.body?.lpoNo) || null;
      const customerPoNo = cleanString(req.body?.customerPoNo) || null;
      const poNo = cleanString(req.body?.poNo) || null;
      const requireLpo = Boolean(settingValue(operational.settings, "sales.requireLpo", false));
      if (requireLpo && !lpoNo) throw new Error("LPO number is required by business policy");

      if (postingMode === "post" && documentType === "INVOICE" && payment.paymentMethod === "credit") {
        if (!customerInfo.customerId) throw new Error("Customer is required for a credit invoice");
        if (!toDate(req.body?.dueDate)) throw new Error("Due date is required for a credit invoice");
      }
      if (postingMode === "post" && documentType === "INVOICE" && payment.balance > 0 && !customerInfo.customerId) {
        throw new Error("A named customer is required when an invoice has an outstanding balance");
      }

      if (postingMode === "post" && customerInfo.customer && payment.balance > 0) {
        const currentBalance = roundMoney(Number(customerInfo.customer.balance || 0));
        const creditLimit = roundMoney(Number(customerInfo.customer.creditLimit || 0));
        const projected = roundMoney(currentBalance + payment.balance);
        if (creditLimit > 0 && projected > creditLimit + 0.001 && !hasPermission(access, "sales_documents.override_credit_limit")) {
          throw new Error(`Credit limit exceeded. Available credit: ${Math.max(0, creditLimit - currentBalance).toFixed(2)}`);
        }
        if (creditLimit > 0 && projected > creditLimit + 0.001 && !cleanString(req.body?.creditOverrideReason)) {
          throw new Error("Credit override reason is required");
        }
      }

      const affectsStock = postingMode === "post" && stockAffectsDocument(documentType, operational.settings);
      const allowNegative = Boolean(settingValue(operational.settings, "sales.allowNegativeStock", false)) || hasPermission(access, "sales_documents.allow_negative_stock");
      if (affectsStock) await validateStock(tx, businessId, operational.warehouseId, prepared.items, allowNegative);

      const documentNo = await getNextDocumentNumber(tx, businessId, operational.branchId, documentType as any);
      const status = postingMode === "draft" ? "DRAFT" : documentType === "INVOICE" ? getPostedStatus(total, payment.paid, payment.paymentMethod) : "ISSUED";
      const applicablePayment = documentType === "INVOICE";
      const metadata = {
        source: "api",
        postingMode,
        paymentLines: payment.paymentLines,
        plannedPaid: payment.plannedPaid,
        creditOverrideReason: cleanString(req.body?.creditOverrideReason) || null,
        delivery: {
          address: cleanString(req.body?.deliveryAddress) || null,
          date: cleanString(req.body?.deliveryDate) || null,
          driver: cleanString(req.body?.driver) || null,
          vehicleNumber: cleanString(req.body?.vehicleNumber) || null,
          instructions: cleanString(req.body?.deliveryInstructions) || null,
        },
      };

      const document = await tx.salesDocument.create({
        data: {
          businessId,
          branchId: operational.branchId,
          warehouseId: operational.warehouseId,
          documentNo,
          documentType,
          documentPrefix: getDocumentPrefix(documentType as any),
          lpoNo,
          customerPoNo,
          poNo,
          customerId: customerInfo.customerId,
          customerName: customerInfo.customerName,
          salesmanId: salesperson.salesmanId,
          salesmanName: salesperson.salesmanName,
          paymentMethod: payment.paymentMethod,
          currency,
          salesChannel: cleanString(req.body?.salesChannel) || "pos_counter",
          referenceNo: cleanString(req.body?.referenceNo) || null,
          internalNotes: cleanString(req.body?.internalNotes) || null,
          customerNotes: cleanString(req.body?.customerNotes) || null,
          paymentStatus: getPaymentStatus(total, postingMode === "draft" ? 0 : payment.paid, applicablePayment),
          stockStatus: postingMode === "draft" ? "not_posted" : affectsStock ? "posted" : "not_applicable",
          status,
          subtotal: prepared.subtotal,
          discount: discountTotal,
          tax: prepared.taxTotal,
          total,
          paid: postingMode === "draft" ? 0 : payment.paid,
          balance: postingMode === "draft" ? (documentType === "INVOICE" ? total : 0) : (documentType === "INVOICE" ? payment.balance : 0),
          creditAmount: postingMode === "post" && documentType === "INVOICE" ? payment.balance : 0,
          customerCreditApplied: postingMode === "post" && documentType === "INVOICE" && payment.balance > 0 && Boolean(customerInfo.customerId),
          dueDate: toDate(req.body?.dueDate) || null,
          issuedAt: documentDate,
          postedAt: postingMode === "post" ? new Date() : null,
          idempotencyKey,
          createdByUserId: access.userId,
          updatedByUserId: access.userId,
          metadata,
          items: {
            create: prepared.items.map((item) => ({
              businessId,
              productId: item.productId,
              sku: item.sku,
              barcode: item.barcode,
              qrCode: item.qrCode,
              name: item.name,
              description: item.description,
              unit: item.unit,
              qty: item.qty,
              rate: item.rate,
              price: item.price,
              discount: item.discount,
              taxRate: item.taxRate,
              tax: item.tax,
              total: item.total,
            })),
          },
        },
        include: { items: true },
      });

      if (affectsStock) {
        await applyStockMovement(tx, {
          businessId,
          warehouseId: operational.warehouseId,
          documentId: document.id,
          documentNo,
          userId: access.userId,
          items: prepared.items,
          direction: "OUT",
          movementType: documentType === "DELIVERY_NOTE" ? "delivery_note" : "sales_invoice",
        });
      }

      if (postingMode === "post" && documentType === "INVOICE" && payment.paymentLines.length) {
        await createPayments(tx, {
          businessId,
          customerId: customerInfo.customerId,
          customerName: customerInfo.customerName,
          document,
          paymentLines: payment.paymentLines,
          idempotencyKey,
          paymentDate: documentDate,
        });
      }

      if (postingMode === "post" && documentType === "INVOICE" && payment.balance > 0 && customerInfo.customerId) {
        await tx.customer.update({ where: { id: customerInfo.customerId }, data: { balance: { increment: payment.balance } } });
      }

      await writeAudit(tx, req, {
        businessId,
        userId: access.userId,
        action: postingMode === "draft" ? "SAVED_DRAFT" : "POSTED",
        entityType: "sales_document",
        entityId: document.id,
        after: { documentNo, documentType, status, total, paid: payment.paid, balance: payment.balance, branchId: operational.branchId, warehouseId: operational.warehouseId },
      });

      return { document, duplicate: false };
    });

    return res.status(result.duplicate ? 200 : 201).json({
      ok: true,
      duplicate: result.duplicate,
      message: result.duplicate ? "Duplicate request ignored; existing document returned" : (postingMode === "draft" ? "Sales draft saved successfully" : "Sales document posted successfully"),
      data: formatSalesDocument(result.document),
    });
  } catch (error: any) {
    console.error("createSalesDocument error:", error);
    return res.status(400).json({ ok: false, error: { message: error?.message || "Failed to create sales document" } });
  }
}

export async function postSalesDocument(req: Request, res: Response) {
  try {
    const businessId = getBusinessId(req);
    const userId = getUserId(req);
    const id = cleanString(req.params.id);
    if (!businessId || !id) return res.status(400).json({ ok: false, error: { message: "Business context and document id are required" } });

    const result = await (prisma as any).$transaction(async (tx: any) => {
      const access = await loadUserAccess(tx, businessId, userId);
      requirePermission(access, "sales_documents.post", true);
      const document = await tx.salesDocument.findFirst({ where: { id, businessId }, include: { items: true } });
      if (!document) throw new Error("Sales document not found");
      if (document.status !== "DRAFT") throw new Error("Only draft documents can be posted");

      const operational = await resolveOperationalContext(tx, businessId, access, { branchId: document.branchId, warehouseId: document.warehouseId }, { requireWarehouse: document.documentType === "INVOICE" });
      const settings = operational.settings;
      const affectsStock = stockAffectsDocument(document.documentType, settings);
      const allowNegative = Boolean(settingValue(settings, "sales.allowNegativeStock", false)) || hasPermission(access, "sales_documents.allow_negative_stock");
      const preparedItems = document.items.map((item: any) => ({
        productId: item.productId,
        product: null,
        sku: item.sku,
        name: item.name,
        qty: Number(item.qty),
      }));
      const products = await tx.product.findMany({ where: { businessId, id: { in: preparedItems.map((item: any) => item.productId).filter(Boolean) } } });
      const byId = new Map(products.map((product: any) => [product.id, product]));
      for (const item of preparedItems) item.product = byId.get(item.productId);
      if (affectsStock) await validateStock(tx, businessId, operational.warehouseId, preparedItems, allowNegative);

      const metadata = jsonObject(document.metadata);
      const paymentInput = { ...metadata, ...req.body, paymentLines: req.body?.paymentLines || metadata.paymentLines, paidAmount: req.body?.paidAmount ?? metadata.plannedPaid, paymentMethod: req.body?.paymentMethod || document.paymentMethod };
      const payment = preparePaymentLines(paymentInput, Number(document.total), document.documentType, "post");
      if (document.documentType === "INVOICE" && payment.balance > 0 && !document.customerId) throw new Error("A named customer is required when an invoice has an outstanding balance");
      if (document.documentType === "INVOICE" && payment.paymentMethod === "credit" && !document.dueDate) throw new Error("Due date is required for a credit invoice");

      if (document.customerId && payment.balance > 0) {
        const customer = await tx.customer.findFirst({ where: { id: document.customerId, businessId } });
        if (!customer) throw new Error("Customer is no longer available");
        const projected = roundMoney(Number(customer.balance || 0) + payment.balance);
        const limit = roundMoney(Number(customer.creditLimit || 0));
        const overrideReason = cleanString(req.body?.creditOverrideReason) || cleanString(metadata.creditOverrideReason);
        if (limit > 0 && projected > limit + 0.001 && !hasPermission(access, "sales_documents.override_credit_limit")) throw new Error("Credit limit exceeded");
        if (limit > 0 && projected > limit + 0.001 && !overrideReason) throw new Error("Credit override reason is required");
      }

      const updated = await tx.salesDocument.update({
        where: { id: document.id },
        data: {
          status: document.documentType === "INVOICE" ? getPostedStatus(Number(document.total), payment.paid, payment.paymentMethod) : "ISSUED",
          paymentMethod: payment.paymentMethod,
          paymentStatus: getPaymentStatus(Number(document.total), payment.paid, document.documentType === "INVOICE"),
          paid: document.documentType === "INVOICE" ? payment.paid : 0,
          balance: document.documentType === "INVOICE" ? payment.balance : 0,
          creditAmount: document.documentType === "INVOICE" ? payment.balance : 0,
          customerCreditApplied: document.documentType === "INVOICE" && payment.balance > 0 && Boolean(document.customerId),
          stockStatus: affectsStock ? "posted" : "not_applicable",
          postedAt: new Date(),
          updatedByUserId: access.userId,
          revision: { increment: 1 },
          metadata: { ...metadata, postingMode: "post", paymentLines: payment.paymentLines },
        },
        include: { items: true },
      });

      if (affectsStock) await applyStockMovement(tx, { businessId, warehouseId: operational.warehouseId, documentId: document.id, documentNo: document.documentNo, userId: access.userId, items: preparedItems, direction: "OUT", movementType: document.documentType === "DELIVERY_NOTE" ? "delivery_note" : "sales_invoice" });
      if (document.documentType === "INVOICE" && payment.paymentLines.length) await createPayments(tx, { businessId, customerId: document.customerId, customerName: document.customerName, document, paymentLines: payment.paymentLines, idempotencyKey: document.idempotencyKey || `post:${document.id}`, paymentDate: document.issuedAt || new Date() });
      if (document.documentType === "INVOICE" && payment.balance > 0 && document.customerId) await tx.customer.update({ where: { id: document.customerId }, data: { balance: { increment: payment.balance } } });

      await writeAudit(tx, req, { businessId, userId: access.userId, action: "POSTED", entityType: "sales_document", entityId: document.id, before: { status: "DRAFT" }, after: { status: updated.status, paid: payment.paid, balance: payment.balance } });
      return updated;
    });

    return res.json({ ok: true, message: "Draft posted successfully", data: formatSalesDocument(result) });
  } catch (error: any) {
    console.error("postSalesDocument error:", error);
    return res.status(400).json({ ok: false, error: { message: error?.message || "Failed to post draft" } });
  }
}

export async function updateSalesDocument(req: Request, res: Response) {
  try {
    const businessId = getBusinessId(req);
    const userId = getUserId(req);
    const id = cleanString(req.params.id);
    if (!businessId || !id) return res.status(400).json({ ok: false, error: { message: "Business context and document id are required" } });

    const result = await (prisma as any).$transaction(async (tx: any) => {
      const access = await loadUserAccess(tx, businessId, userId);
      const current = await tx.salesDocument.findFirst({ where: { id, businessId }, include: { items: true } });
      if (!current) throw new Error("Sales document not found");
      if (["CANCELLED", "VOID"].includes(current.status)) throw new Error("Cancelled or void documents cannot be edited");

      const isDraft = current.status === "DRAFT";
      if (isDraft) requirePermission(access, "sales_documents.edit_draft", true);
      else requirePermission(access, current.status === "PAID" || current.status === "PARTIALLY_PAID" ? "sales_documents.edit_paid" : "sales_documents.edit_posted");
      if (Number(current.returnedAmount || 0) > 0) requirePermission(access, "sales_documents.edit_returned");
      if (Number(current.refundedAmount || 0) > 0) requirePermission(access, "sales_documents.edit_refunded");

      const itemChangeRequested = Array.isArray(req.body?.items);
      if (itemChangeRequested && Number(current.returnedAmount || 0) > 0) throw new Error("Item/financial editing is locked after a return has been posted");
      if (itemChangeRequested && Number(current.refundedAmount || 0) > 0) throw new Error("Item/financial editing is locked after a refund has been posted");
      if (!isDraft && itemChangeRequested) {
        requirePermission(access, "sales_documents.override_financials");
        requirePermission(access, "sales_documents.override_stock");
        if (!cleanString(req.body?.editReason)) throw new Error("Edit reason is required for posted financial changes");
      }

      const documentType = normalizeDocumentType(req.body?.documentType || current.documentType) || current.documentType;
      if (documentType !== current.documentType) {
        if (!isDraft) throw new Error("Posted document type cannot be changed");
        requirePermission(access, "sales_documents.change_document_type", true);
      }

      const operational = await resolveOperationalContext(tx, businessId, access, { branchId: req.body?.branchId ?? current.branchId, warehouseId: req.body?.warehouseId ?? current.warehouseId });
      if (!isDraft && !itemChangeRequested && operational.warehouseId !== current.warehouseId) throw new Error("Warehouse cannot be changed on a posted document without stock adjustment");
      const customerInfo = await resolveCustomer(tx, businessId, { customerId: req.body?.customerId ?? current.customerId, customerName: req.body?.customerName ?? current.customerName });
      const salesperson = await resolveSalesperson(tx, businessId, access, { salesmanId: req.body?.salesmanId ?? current.salesmanId });
      const customerChanged = String(current.customerId || "") !== String(customerInfo.customerId || "");
      if (!isDraft && customerChanged) {
        requirePermission(access, "sales_documents.override_financials");
        if (!cleanString(req.body?.editReason)) throw new Error("Edit reason is required to change the customer on a posted document");
      }
      const requestedDocumentDate = toDate(req.body?.documentDate);
      if (requestedDocumentDate) {
        const business = await tx.business.findUnique({ where: { id: businessId }, select: { timezone: true } });
        validateDocumentDate(access, requestedDocumentDate, business?.timezone || "Asia/Qatar");
      }

      let financial: any = {
        items: current.items,
        subtotal: Number(current.subtotal),
        discountTotal: Number(current.discount),
        taxTotal: Number(current.tax),
        total: Number(current.total),
      };

      if (itemChangeRequested) {
        const prepared = await prepareItems(tx, businessId, req.body.items);
        const headerDiscount = roundMoney(Math.max(0, toNumber(req.body?.discount ?? req.body?.discountTotal)));
        financial = {
          items: prepared.items,
          subtotal: prepared.subtotal,
          discountTotal: roundMoney(prepared.lineDiscountTotal + headerDiscount),
          taxTotal: prepared.taxTotal,
        };
        financial.total = roundMoney(financial.subtotal - financial.discountTotal + financial.taxTotal);
        if (financial.total + 0.001 < Number(current.paid || 0)) throw new Error("Edited total cannot be lower than the amount already paid");
      }

      const before = formatSalesDocument(current);
      const oldBalance = Number(current.balance || 0);
      const newBalance = documentType === "INVOICE" ? roundMoney(Math.max(0, financial.total - Number(current.paid || 0))) : 0;
      const requestedPaymentMethod = normalizePaymentMethod(req.body?.paymentMethod || current.paymentMethod);
      const currentMetadata = jsonObject(current.metadata);
      const draftPaymentPlan = isDraft
        ? preparePaymentLines({
            ...currentMetadata,
            ...req.body,
            paymentLines: Array.isArray(req.body?.paymentLines) ? req.body.paymentLines : currentMetadata.paymentLines,
            paidAmount: req.body?.paidAmount ?? currentMetadata.plannedPaid,
            paymentMethod: requestedPaymentMethod,
          }, financial.total, documentType, "draft")
        : null;
      const newStatus = isDraft ? "DRAFT" : documentType === "INVOICE" ? getPostedStatus(financial.total, Number(current.paid || 0), requestedPaymentMethod) : "ISSUED";

      if (!isDraft && documentType === "INVOICE" && newBalance > 0 && !customerInfo.customerId) {
        throw new Error("A named customer is required when an invoice has an outstanding balance");
      }
      if (!isDraft && documentType === "INVOICE" && requestedPaymentMethod === "credit" && !(toDate(req.body?.dueDate) || current.dueDate)) {
        throw new Error("Due date is required for a credit invoice");
      }
      if (!isDraft && customerInfo.customer && newBalance > 0) {
        const currentCustomerBalance = roundMoney(Number(customerInfo.customer.balance || 0));
        const projected = roundMoney(currentCustomerBalance + (customerChanged ? newBalance : newBalance - oldBalance));
        const creditLimit = roundMoney(Number(customerInfo.customer.creditLimit || 0));
        if (creditLimit > 0 && projected > creditLimit + 0.001 && !hasPermission(access, "sales_documents.override_credit_limit")) {
          throw new Error(`Credit limit exceeded. Available credit: ${Math.max(0, creditLimit - currentCustomerBalance).toFixed(2)}`);
        }
        if (creditLimit > 0 && projected > creditLimit + 0.001 && !cleanString(req.body?.creditOverrideReason || req.body?.editReason)) {
          throw new Error("Credit override reason is required");
        }
      }

      if (!isDraft && itemChangeRequested && stockAffectsDocument(current.documentType, operational.settings)) {
        const oldItems = current.items.map((item: any) => ({ productId: item.productId, sku: item.sku, name: item.name, qty: Number(item.qty) }));
        await applyStockMovement(tx, { businessId, warehouseId: current.warehouseId, documentId: current.id, documentNo: current.documentNo, userId: access.userId, items: oldItems, direction: "IN", movementType: "sales_edit_reversal", suffix: "-REV" });
        const productIds = financial.items.map((item: any) => item.productId);
        const products = await tx.product.findMany({ where: { businessId, id: { in: productIds }, deleted: false } });
        const byId = new Map(products.map((product: any) => [product.id, product]));
        for (const item of financial.items) item.product = byId.get(item.productId);
        const allowNegative = hasPermission(access, "sales_documents.allow_negative_stock") || Boolean(settingValue(operational.settings, "sales.allowNegativeStock", false));
        await validateStock(tx, businessId, operational.warehouseId, financial.items, allowNegative);
        await applyStockMovement(tx, { businessId, warehouseId: operational.warehouseId, documentId: current.id, documentNo: current.documentNo, userId: access.userId, items: financial.items, direction: "OUT", movementType: "sales_edit", suffix: "-EDIT" });
      }

      if (itemChangeRequested) {
        await tx.salesDocumentItem.deleteMany({ where: { salesDocumentId: current.id, businessId } });
      }

      const metadata = {
        ...currentMetadata,
        ...(isDraft ? {
          paymentLines: draftPaymentPlan?.paymentLines || [],
          plannedPaid: draftPaymentPlan?.plannedPaid || 0,
          postingMode: "draft",
        } : {}),
        delivery: {
          address: cleanString(req.body?.deliveryAddress) ?? jsonObject(currentMetadata.delivery).address ?? null,
          date: cleanString(req.body?.deliveryDate) ?? jsonObject(currentMetadata.delivery).date ?? null,
          driver: cleanString(req.body?.driver) ?? jsonObject(currentMetadata.delivery).driver ?? null,
          vehicleNumber: cleanString(req.body?.vehicleNumber) ?? jsonObject(currentMetadata.delivery).vehicleNumber ?? null,
          instructions: cleanString(req.body?.deliveryInstructions) ?? jsonObject(currentMetadata.delivery).instructions ?? null,
        },
        lastEditReason: cleanString(req.body?.editReason) || null,
      };

      const updated = await tx.salesDocument.update({
        where: { id: current.id },
        data: {
          branchId: operational.branchId,
          warehouseId: operational.warehouseId,
          documentType,
          documentPrefix: getDocumentPrefix(documentType as any),
          lpoNo: cleanString(req.body?.lpoNo) ?? current.lpoNo,
          customerPoNo: cleanString(req.body?.customerPoNo) ?? current.customerPoNo,
          poNo: cleanString(req.body?.poNo) ?? current.poNo,
          customerId: customerInfo.customerId,
          customerName: customerInfo.customerName,
          salesmanId: salesperson.salesmanId,
          salesmanName: salesperson.salesmanName,
          paymentMethod: requestedPaymentMethod,
          salesChannel: cleanString(req.body?.salesChannel) ?? current.salesChannel,
          referenceNo: cleanString(req.body?.referenceNo) ?? current.referenceNo,
          internalNotes: cleanString(req.body?.internalNotes) ?? current.internalNotes,
          customerNotes: cleanString(req.body?.customerNotes) ?? current.customerNotes,
          dueDate: toDate(req.body?.dueDate) ?? current.dueDate,
          issuedAt: toDate(req.body?.documentDate) ?? current.issuedAt,
          subtotal: financial.subtotal,
          discount: financial.discountTotal,
          tax: financial.taxTotal,
          total: financial.total,
          balance: newBalance,
          creditAmount: newBalance,
          customerCreditApplied: !isDraft && documentType === "INVOICE" && newBalance > 0 && Boolean(customerInfo.customerId),
          paymentStatus: getPaymentStatus(financial.total, Number(current.paid || 0), documentType === "INVOICE"),
          status: newStatus,
          updatedByUserId: access.userId,
          revision: { increment: 1 },
          metadata,
          ...(itemChangeRequested ? { items: { create: financial.items.map((item: any) => ({ businessId, productId: item.productId, sku: item.sku, barcode: item.barcode, qrCode: item.qrCode, name: item.name, description: item.description, unit: item.unit, qty: item.qty, rate: item.rate, price: item.price, discount: item.discount, taxRate: item.taxRate, tax: item.tax, total: item.total })) } } : {}),
        },
        include: { items: true },
      });

      if (!isDraft) {
        if (current.customerId && current.customerId === updated.customerId && Math.abs(newBalance - oldBalance) > 0.001) {
          await tx.customer.update({ where: { id: current.customerId }, data: { balance: { increment: roundMoney(newBalance - oldBalance) } } });
        } else if (customerChanged) {
          if (current.customerId && oldBalance > 0.001) {
            await tx.customer.update({ where: { id: current.customerId }, data: { balance: { decrement: roundMoney(oldBalance) } } });
          }
          if (updated.customerId && newBalance > 0.001) {
            await tx.customer.update({ where: { id: updated.customerId }, data: { balance: { increment: roundMoney(newBalance) } } });
          }
        }
      }

      await writeAudit(tx, req, { businessId, userId: access.userId, action: itemChangeRequested ? "EDITED_FINANCIALS" : "EDITED", entityType: "sales_document", entityId: current.id, before, after: formatSalesDocument(updated) });
      return updated;
    });

    return res.json({ ok: true, message: "Sales document updated safely", data: formatSalesDocument(result) });
  } catch (error: any) {
    console.error("updateSalesDocument error:", error);
    return res.status(400).json({ ok: false, error: { message: error?.message || "Failed to update sales document" } });
  }
}
