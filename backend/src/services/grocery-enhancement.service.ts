import type { Request } from "express";
import { prisma } from "../db/prisma.js";
import { hasPermission, loadUserAccess } from "./access.service.js";
import { writeAudit } from "./audit.service.js";
import { nextEntityNumber, previewEntityNumber } from "./numbering.service.js";
import { assertGrocery } from "./grocery-41-50.service.js";
import { ApiError } from "../utils/http.js";

const db: any = prisma;
const text = (value: unknown) => String(value ?? "").trim();
const num = (value: unknown, fallback = 0) => { const n = Number(value); return Number.isFinite(n) ? n : fallback; };
const money = (value: unknown) => Math.round((num(value) + Number.EPSILON) * 100) / 100;
const json = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};

const REQUIRED_CURRENCIES = ["QAR","KWD","RUB","USD","EUR","GBP","AED","SAR","BHD","OMR","PKR","INR","CNY","JPY","CAD","AUD","NZD","CHF","SGD","HKD"];
const FALLBACK_CURRENCY_CODES = `AED AFN ALL AMD AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD CAD CDF CHF CLP CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES VND VUV WST YER ZAR ZMW ZWG`.split(/\s+/);
const BLOCKED_CURRENCY_CODES = new Set(["CUC","SLL","VEF","ZWL"]);

export const GROCERY_LANGUAGES = [
  { code:"en", locale:"en", name:"English", nativeName:"English", dir:"ltr" },
  { code:"zh-CN", locale:"zh-CN", name:"Mandarin Chinese", nativeName:"简体中文", dir:"ltr" },
  { code:"hi", locale:"hi-IN", name:"Hindi", nativeName:"हिन्दी", dir:"ltr" },
  { code:"es", locale:"es", name:"Spanish", nativeName:"Español", dir:"ltr" },
  { code:"fr", locale:"fr", name:"French", nativeName:"Français", dir:"ltr" },
  { code:"ar", locale:"ar", name:"Arabic", nativeName:"العربية", dir:"rtl" },
  { code:"bn", locale:"bn-BD", name:"Bengali", nativeName:"বাংলা", dir:"ltr" },
  { code:"pt", locale:"pt", name:"Portuguese", nativeName:"Português", dir:"ltr" },
  { code:"ru", locale:"ru", name:"Russian", nativeName:"Русский", dir:"ltr" },
  { code:"ur", locale:"ur-PK", name:"Urdu", nativeName:"اردو", dir:"rtl" },
  { code:"id", locale:"id-ID", name:"Indonesian", nativeName:"Bahasa Indonesia", dir:"ltr" },
  { code:"de", locale:"de", name:"German", nativeName:"Deutsch", dir:"ltr" },
  { code:"ja", locale:"ja-JP", name:"Japanese", nativeName:"日本語", dir:"ltr" },
  { code:"tr", locale:"tr-TR", name:"Turkish", nativeName:"Türkçe", dir:"ltr" },
  { code:"ko", locale:"ko-KR", name:"Korean", nativeName:"한국어", dir:"ltr" },
] as const;

function currencyCodes() {
  const supported = (() => {
    try {
      const fn = (Intl as any).supportedValuesOf;
      return typeof fn === "function" ? fn.call(Intl, "currency") as string[] : [];
    } catch { return []; }
  })();
  const source = supported.length >= 100 ? supported : FALLBACK_CURRENCY_CODES;
  return [...new Set([...source, ...REQUIRED_CURRENCIES])]
    .map(code => text(code).toUpperCase())
    .filter(code => /^[A-Z]{3}$/.test(code) && !code.startsWith("X") && !BLOCKED_CURRENCY_CODES.has(code))
    .sort();
}

export function groceryCurrencyCatalog() {
  const names = (() => { try { return new (Intl as any).DisplayNames(["en"], { type:"currency" }); } catch { return null; } })();
  return currencyCodes().map(code => {
    let symbol: string | null = null, precision = 2;
    try {
      const formatter = new Intl.NumberFormat("en", { style:"currency", currency:code, currencyDisplay:"narrowSymbol" });
      precision = formatter.resolvedOptions().maximumFractionDigits;
      const part = formatter.formatToParts(0).find(x => x.type === "currency")?.value || null;
      symbol = part && part !== code ? part : null;
    } catch { /* keep safe defaults */ }
    const displayName = text(names?.of(code)) || code;
    return { code, name:displayName, symbol, precision };
  });
}

type SequenceDefinition = {
  key: string;
  label: string;
  model: string;
  field: string;
  prefix: string;
  permission: string;
  where?: Record<string, unknown>;
  nativeField?: boolean;
};

export const GROCERY_SEQUENCE_DEFINITIONS: readonly SequenceDefinition[] = [
  { key:"customer", label:"Customer Code", model:"customer", field:"code", prefix:"CUS", permission:"customers.manage", nativeField:true },
  { key:"supplier", label:"Supplier Code", model:"industryRecord", field:"referenceNo", prefix:"SUP", permission:"suppliers.manage", where:{ industryCode:"grocery", entityType:"grocery_supplier_code" } },
  { key:"product", label:"Product / SKU", model:"product", field:"sku", prefix:"PRD", permission:"products.manage", nativeField:true },
  { key:"employee", label:"Employee / User Code", model:"industryRecord", field:"referenceNo", prefix:"EMP", permission:"settings.manage_permissions", where:{ industryCode:"grocery", entityType:"grocery_user_code" } },
  { key:"invoice", label:"Sales Invoice", model:"salesDocument", field:"documentNo", prefix:"INV", permission:"sales_documents.create", where:{ documentType:"INVOICE" } },
  { key:"quotation", label:"Quotation", model:"salesDocument", field:"documentNo", prefix:"QT", permission:"sales_documents.create", where:{ documentType:"QUOTATION" } },
  { key:"delivery_note", label:"Delivery Note", model:"salesDocument", field:"documentNo", prefix:"DN", permission:"sales_documents.create", where:{ documentType:"DELIVERY_NOTE" } },
  { key:"purchase_order", label:"Purchase Order", model:"purchase", field:"purchaseNo", prefix:"PO", permission:"purchases.create" },
  { key:"grn", label:"Goods Receipt / GRN", model:"goodsReceipt", field:"receiptNo", prefix:"GRN", permission:"purchases.receive" },
  { key:"payment", label:"Customer Receipt", model:"customerPayment", field:"receiptNo", prefix:"RCPT", permission:"payments.create" },
  { key:"supplier_payment", label:"Supplier Payment Voucher", model:"supplierPayment", field:"voucherNo", prefix:"SPV", permission:"purchases.pay" },
  { key:"return", label:"Sales Return / Credit Note", model:"salesReturn", field:"returnNo", prefix:"RET", permission:"sales_documents.return" },
  { key:"refund", label:"Customer Refund", model:"customerRefund", field:"refundNo", prefix:"RFD", permission:"sales_documents.refund" },
  { key:"transfer", label:"Stock Transfer / Movement", model:"stockMovement", field:"movementNo", prefix:"TRF", permission:"inventory.transfer" },
  { key:"approval", label:"Approval Request", model:"approvalRequest", field:"requestNo", prefix:"APR", permission:"sales_documents.create" },
  { key:"held_sale", label:"Held Sale", model:"industryRecord", field:"referenceNo", prefix:"HOLD", permission:"sales_documents.create", where:{ industryCode:"grocery", entityType:"grocery_held_sale" } },
] as const;

function sequenceDefinition(key: unknown) {
  const wanted = text(key).toLowerCase();
  const row = GROCERY_SEQUENCE_DEFINITIONS.find(x => x.key === wanted);
  if (!row) throw new ApiError(404, "Unsupported Grocery numbering sequence");
  return row;
}

function sequenceSettingKey(definition: SequenceDefinition) {
  return `numbering.sequence.grocery.${definition.key}`;
}

function sequenceOptions(definition: SequenceDefinition) {
  return { sequenceKey:`grocery.${definition.key}`, ...(definition.where ? { where:definition.where } : {}) };
}

function validatePrefix(value: unknown, fallback: string) {
  const prefix = text(value || fallback).toUpperCase().replace(/[-\s]+$/g, "");
  if (!/^[A-Z0-9][A-Z0-9/_-]{0,11}$/.test(prefix)) throw new ApiError(400, "Prefix must contain 1–12 letters, numbers, /, _ or -");
  return prefix;
}

function validatePadding(value: unknown, fallback = 6) {
  const padding = Number(value ?? fallback);
  if (!Number.isInteger(padding) || padding < 1 || padding > 12) throw new ApiError(400, "Padding must be an integer from 1 to 12");
  return padding;
}

async function savedSequenceSettings(businessId: string, definition: SequenceDefinition) {
  const key = sequenceSettingKey(definition);
  const genericKey = `numbering.sequence.grocery.${definition.key}`;
  const row = await db.appSetting.findUnique({ where:{ businessId_key:{ businessId, key:genericKey } } });
  const value = json(row?.value);
  return {
    key: definition.key,
    label: definition.label,
    prefix: validatePrefix(value.prefix, definition.prefix),
    padding: validatePadding(value.padding, 6),
    nextNumber: Math.max(1, Math.floor(num(value.nextNumber, 1))),
    nativeField: Boolean(definition.nativeField),
  };
}

export async function enhancementCatalog(businessId: string, userId: string) {
  await assertGrocery(businessId);
  const [business, user, sequenceRows] = await Promise.all([
    db.business.findUnique({ where:{ id:businessId }, select:{ id:true, name:true, currency:true, defaultLanguage:true, numberLocale:true, dateFormat:true } }),
    db.user.findFirst({ where:{ id:userId, businessId }, select:{ id:true, preferredLanguage:true } }),
    Promise.all(GROCERY_SEQUENCE_DEFINITIONS.map(def => savedSequenceSettings(businessId, def))),
  ]);
  const currencies = groceryCurrencyCatalog();
  if (currencies.length < 100) throw new Error("Currency catalogue did not meet the 100-currency production minimum");
  return {
    business,
    user:{ preferredLanguage:user?.preferredLanguage || business?.defaultLanguage || "en" },
    currencies,
    languages:[...GROCERY_LANGUAGES],
    languageCoverage:{ scope:"Grocery shell/navigation/settings", fullApplicationTranslation:false, fallback:"en" },
    numbering:sequenceRows,
  };
}

export async function saveGlobalPreferences(req: Request, businessId: string, userId: string, input: any) {
  await assertGrocery(businessId);
  const currencies = new Set(groceryCurrencyCatalog().map(x => x.code));
  const current = await db.business.findUnique({ where:{ id:businessId } });
  if (!current) throw new ApiError(404, "Business not found");
  const currency = text(input.currency || current.currency || "QAR").toUpperCase();
  if (!currencies.has(currency)) throw new ApiError(400, "Unsupported ISO 4217 currency");
  const languageCode = text(input.language || input.defaultLanguage || current.defaultLanguage || "en");
  const language = GROCERY_LANGUAGES.find(x => x.code.toLowerCase() === languageCode.toLowerCase());
  if (!language) throw new ApiError(400, "Unsupported Grocery language");

  if (currency !== text(current.currency || "QAR").toUpperCase() && input.confirmBaseCurrencyChange !== true) {
    const historical = await db.salesDocument.count({ where:{ businessId } });
    if (historical > 0) throw new ApiError(409, "Base currency change requires explicit confirmation because historical financial documents will keep their original currencies and amounts");
  }

  return db.$transaction(async (tx: any) => {
    const before = { currency:current.currency, defaultLanguage:current.defaultLanguage, numberLocale:current.numberLocale };
    const business = await tx.business.update({ where:{ id:businessId }, data:{ currency, defaultLanguage:language.code, numberLocale:language.locale } });
    await tx.user.update({ where:{ id:userId }, data:{ preferredLanguage:language.code } });
    await writeAudit(tx, req, { businessId, userId, action:"grocery.global_preferences.update", entityType:"Business", entityId:businessId, before, after:{ currency, defaultLanguage:language.code, numberLocale:language.locale, historicalTransactionsConverted:false } });
    return { currency, language, numberLocale:language.locale, historicalTransactionsConverted:false };
  });
}

export async function allocateGroceryNumber(req: Request, businessId: string, userId: string, key: string) {
  await assertGrocery(businessId);
  const definition = sequenceDefinition(key);
  return db.$transaction(async (tx: any) => {
    const access = await loadUserAccess(tx, businessId, userId);
    if (!hasPermission(access, definition.permission)) throw new ApiError(403, `Permission denied: ${definition.permission}`);
    const setting = await savedSequenceSettings(businessId, definition);
    const value = await nextEntityNumber(tx, definition.model, definition.field, businessId, setting.prefix, setting.padding, sequenceOptions(definition));
    await writeAudit(tx, req, { businessId, userId, action:"grocery.number.allocate", entityType:"NumberSequence", entityId:definition.key, after:{ sequence:definition.key, value } });
    return { sequence:definition.key, value, prefix:setting.prefix, padding:setting.padding };
  });
}

export async function previewGroceryNumber(businessId: string, userId: string, key: string) {
  await assertGrocery(businessId);
  const definition = sequenceDefinition(key);
  const access = await loadUserAccess(db, businessId, userId);
  if (!hasPermission(access, definition.permission) && !hasPermission(access, "settings.view")) throw new ApiError(403, "Permission denied");
  const setting = await savedSequenceSettings(businessId, definition);
  return previewEntityNumber(db, definition.model, definition.field, businessId, setting.prefix, setting.padding, sequenceOptions(definition));
}

export async function saveSequenceSettings(req: Request, businessId: string, userId: string, key: string, input: any) {
  await assertGrocery(businessId);
  const definition = sequenceDefinition(key);
  const prefix = validatePrefix(input.prefix, definition.prefix), padding = validatePadding(input.padding, 6);
  return db.$transaction(async (tx: any) => {
    const access = await loadUserAccess(tx, businessId, userId);
    if (!hasPermission(access, "settings.manage")) throw new ApiError(403, "Permission denied: settings.manage");
    await tx.business.update({ where:{ id:businessId }, data:{ updatedAt:new Date() } });
    const settingKey = sequenceSettingKey(definition);
    const existing = await tx.appSetting.findUnique({ where:{ businessId_key:{ businessId, key:settingKey } } });
    const before = json(existing?.value);
    const nextNumber = Math.max(1, Math.floor(num(before.nextNumber, 1)));
    const value = { ...before, prefix, padding, nextNumber, updatedAt:new Date().toISOString() };
    await tx.appSetting.upsert({ where:{ businessId_key:{ businessId, key:settingKey } }, create:{ businessId, key:settingKey, value }, update:{ value } });
    await writeAudit(tx, req, { businessId, userId, action:"grocery.numbering.settings.update", entityType:"AppSetting", entityId:settingKey, before, after:value });
    return { key:definition.key, label:definition.label, ...value };
  });
}

export async function bindGroceryEntityCode(req: Request, businessId: string, userId: string, key: string, entityId: string, codeInput?: unknown) {
  await assertGrocery(businessId);
  const definition = sequenceDefinition(key);
  if (!entityId) throw new ApiError(400, "Entity id is required");
  return db.$transaction(async (tx: any) => {
    const access = await loadUserAccess(tx, businessId, userId);
    if (!hasPermission(access, definition.permission)) throw new ApiError(403, `Permission denied: ${definition.permission}`);
    const setting = await savedSequenceSettings(businessId, definition);
    const code = text(codeInput) || await nextEntityNumber(tx, definition.model, definition.field, businessId, setting.prefix, setting.padding, sequenceOptions(definition));
    if (key === "customer") {
      const entity = await tx.customer.findFirst({ where:{ id:entityId, businessId } }); if (!entity) throw new ApiError(404, "Customer not found");
      const clash = await tx.customer.findFirst({ where:{ businessId, code, id:{ not:entityId } } }); if (clash) throw new ApiError(409, "Customer code already exists");
      await tx.customer.update({ where:{ id:entityId }, data:{ code } });
    } else if (key === "product") {
      const entity = await tx.product.findFirst({ where:{ id:entityId, businessId } }); if (!entity) throw new ApiError(404, "Product not found");
      const clash = await tx.product.findFirst({ where:{ businessId, sku:code, id:{ not:entityId } } }); if (clash) throw new ApiError(409, "Product/SKU code already exists");
      await tx.product.update({ where:{ id:entityId }, data:{ sku:code, code, itemCode:code, productCode:code } });
    } else if (key === "supplier" || key === "employee") {
      const entityType = key === "supplier" ? "grocery_supplier_code" : "grocery_user_code";
      const exists = key === "supplier" ? await tx.supplier.findFirst({ where:{ id:entityId, businessId } }) : await tx.user.findFirst({ where:{ id:entityId, businessId } });
      if (!exists) throw new ApiError(404, `${key === "supplier" ? "Supplier" : "User"} not found`);
      const clash = await tx.industryRecord.findFirst({ where:{ businessId, industryCode:"grocery", entityType, referenceNo:code, relatedEntityId:{ not:entityId }, archivedAt:null } });
      if (clash) throw new ApiError(409, "Entity code already exists");
      const current = await tx.industryRecord.findFirst({ where:{ businessId, industryCode:"grocery", entityType, relatedEntityId:entityId, archivedAt:null } });
      if (current) await tx.industryRecord.update({ where:{ id:current.id }, data:{ referenceNo:code, displayName:text((exists as any).name) || code, updatedByUserId:userId, revision:{ increment:1 } } });
      else await tx.industryRecord.create({ data:{ businessId, industryCode:"grocery", entityType, referenceNo:code, displayName:text((exists as any).name) || code, status:"active", relatedEntityId:entityId, createdByUserId:userId, updatedByUserId:userId, data:{ code } } });
    } else throw new ApiError(400, "This sequence is a transaction number and cannot be bound to a master entity");
    await writeAudit(tx, req, { businessId, userId, action:"grocery.entity_code.bind", entityType:key, entityId, after:{ code } });
    return { key, entityId, code };
  });
}

function canApproveSales(access: Awaited<ReturnType<typeof loadUserAccess>>) {
  const canonicalManager = access.roleNames.some(name => ["manager","store manager","sales manager"].includes(text(name).toLowerCase()));
  return access.isOwner || access.isAdmin || canonicalManager || hasPermission(access, "sales_documents.override_credit_limit") || hasPermission(access, "sales_documents.void");
}

async function heldSale(businessId: string, id: string, tx: any = db) {
  return tx.industryRecord.findFirst({ where:{ id, businessId, industryCode:"grocery", entityType:"grocery_held_sale", archivedAt:null } });
}

async function creditSnapshot(tx: any, businessId: string, customerId: string, invoiceAmount: number) {
  const customer = await tx.customer.findFirst({ where:{ id:customerId, businessId, active:true } });
  if (!customer) throw new ApiError(404, "Customer not found or inactive");
  const now = new Date();
  const overdue = await tx.salesDocument.findMany({ where:{ businessId, customerId, documentType:"INVOICE", balance:{ gt:0 }, dueDate:{ lt:now }, status:{ notIn:["DRAFT","CANCELLED","VOID"] } }, select:{ balance:true, dueDate:true, documentNo:true }, orderBy:{ dueDate:"asc" }, take:500 });
  const outstandingBalance = money(customer.balance), creditLimit = money(customer.creditLimit), overdueAmount = money(overdue.reduce((sum:number,row:any)=>sum+num(row.balance),0)), projectedExposure = money(outstandingBalance + invoiceAmount);
  const overLimit = creditLimit > 0 && projectedExposure > creditLimit + .001;
  const overdueBlocked = overdueAmount > .001;
  return {
    customer:{ id:customer.id, name:customer.name },
    outstandingBalance,
    creditLimit,
    overdueAmount,
    creditTermDays:Number(customer.creditDays || 0),
    oldestDueDate:overdue[0]?.dueDate || null,
    newInvoiceAmount:money(invoiceAmount),
    projectedExposure,
    blockedReasons:[...(overLimit ? ["credit_limit_exceeded"] : []), ...(overdueBlocked ? ["overdue_balance"] : [])],
  };
}

export async function requestCreditOverride(req: Request, businessId: string, userId: string, input: any) {
  await assertGrocery(businessId);
  const heldSaleId = text(input.heldSaleId);
  if (!heldSaleId) throw new ApiError(400, "Held sale is required for credit override approval");
  return db.$transaction(async (tx:any) => {
    const access = await loadUserAccess(tx, businessId, userId);
    if (!hasPermission(access, "sales_documents.create")) throw new ApiError(403, "Permission denied: sales_documents.create");
    const held = await heldSale(businessId, heldSaleId, tx); if (!held) throw new ApiError(404, "Held sale not found");
    const customerId = text(input.customerId || held.relatedEntityId); if (!customerId) throw new ApiError(400, "A named customer is required for credit approval");
    const amount = Math.max(0, money(input.invoiceAmount ?? held.amount));
    const snapshot = await creditSnapshot(tx, businessId, customerId, amount);
    if (!snapshot.blockedReasons.length) throw new ApiError(409, "This transaction is not currently blocked by credit limit or overdue balance");
    const existing = await tx.approvalRequest.findFirst({ where:{ businessId, type:"grocery_credit_override", entityType:"grocery_held_sale", entityId:held.id, status:"pending" } });
    if (existing) return { request:existing, snapshot:json(JSON.parse(existing.detail || "{}")?.snapshot) };
    const requestNo = await nextEntityNumber(tx, "approvalRequest", "requestNo", businessId, "APR", 6, { sequenceKey:"grocery.approval" });
    const detail = { heldSaleId:held.id, snapshot, originatingUserId:userId, requestedAt:new Date().toISOString(), requestReason:text(input.reason) || null };
    const approval = await tx.approvalRequest.create({ data:{ businessId, requestNo, type:"grocery_credit_override", detail:JSON.stringify(detail), amount, status:"pending", entityType:"grocery_held_sale", entityId:held.id, requestedByUserId:userId } });
    const data = { ...json(held.data), creditApprovalRequestId:approval.id, creditApprovalStatus:"pending", creditBlockedReasons:snapshot.blockedReasons };
    await tx.industryRecord.update({ where:{ id:held.id }, data:{ status:"awaiting_credit_approval", data, updatedByUserId:userId, revision:{ increment:1 } } });
    await writeAudit(tx, req, { businessId, userId, action:"grocery.credit_override.request", entityType:"ApprovalRequest", entityId:approval.id, after:{ requestNo, heldSaleId:held.id, snapshot, reason:detail.requestReason } });
    return { request:approval, snapshot };
  });
}

export async function decideCreditOverride(req: Request, businessId: string, userId: string, id: string, decision: "approved"|"rejected", input: any) {
  await assertGrocery(businessId);
  const reason = text(input.reason || input.note); if (!reason) throw new ApiError(400, "Approval / rejection reason is required");
  return db.$transaction(async (tx:any) => {
    const access = await loadUserAccess(tx, businessId, userId); if (!canApproveSales(access)) throw new ApiError(403, "Manager/Admin approval permission is required");
    const before = await tx.approvalRequest.findFirst({ where:{ id, businessId, type:"grocery_credit_override" } }); if (!before) throw new ApiError(404, "Credit override request not found");
    if (before.status !== "pending") throw new ApiError(409, "Credit override request has already been decided");
    const row = await tx.approvalRequest.update({ where:{ id }, data:{ status:decision, decidedByUserId:userId, decisionNote:reason, decidedAt:new Date() } });
    const held = before.entityId ? await heldSale(businessId, before.entityId, tx) : null;
    if (held) {
      const data = { ...json(held.data), creditApprovalRequestId:id, creditApprovalStatus:decision, creditApprovedBy:decision === "approved" ? userId : null, creditApprovalDecisionAt:new Date().toISOString(), creditApprovalReason:reason };
      await tx.industryRecord.update({ where:{ id:held.id }, data:{ status:decision === "approved" ? "approved" : "rejected", data, updatedByUserId:userId, revision:{ increment:1 } } });
    }
    await writeAudit(tx, req, { businessId, userId, action:`grocery.credit_override.${decision}`, entityType:"ApprovalRequest", entityId:id, before, after:{ ...row, reason, heldSaleId:before.entityId } });
    return { request:row, heldSaleId:before.entityId, decision, reason };
  });
}

export async function decideHeldSale(req: Request, businessId: string, userId: string, id: string, decision: "approved"|"rejected", input: any) {
  await assertGrocery(businessId);
  const reason = text(input.reason || input.note); if (!reason) throw new ApiError(400, "Approval / rejection reason is required");
  return db.$transaction(async (tx:any) => {
    const access = await loadUserAccess(tx, businessId, userId); if (!canApproveSales(access)) throw new ApiError(403, "Manager/Admin approval permission is required");
    const row = await heldSale(businessId, id, tx); if (!row) throw new ApiError(404, "Held sale not found");
    const before = { status:row.status, data:row.data };
    const data = { ...json(row.data), heldApprovalStatus:decision, heldDecisionByUserId:userId, heldDecisionAt:new Date().toISOString(), heldDecisionReason:reason };
    const updated = await tx.industryRecord.update({ where:{ id:row.id }, data:{ status:decision, data, updatedByUserId:userId, revision:{ increment:1 } } });
    await writeAudit(tx, req, { businessId, userId, action:`grocery.held_sale.${decision}`, entityType:"IndustryRecord", entityId:row.id, before, after:{ status:decision, reason, approvedBy:userId } });
    return updated;
  });
}

export async function salesApprovalQueue(businessId: string, userId: string, query: any) {
  await assertGrocery(businessId);
  const access = await loadUserAccess(db, businessId, userId); if (!canApproveSales(access) && !hasPermission(access, "sales_documents.view")) throw new ApiError(403, "Permission denied");
  const status = text(query.status).toLowerCase();
  const [heldRows, creditRows] = await Promise.all([
    db.industryRecord.findMany({ where:{ businessId, industryCode:"grocery", entityType:"grocery_held_sale", archivedAt:null, ...(status ? { status } : {}) }, orderBy:{ updatedAt:"desc" }, take:250 }),
    db.approvalRequest.findMany({ where:{ businessId, type:"grocery_credit_override", ...(status ? { status } : {}) }, orderBy:{ createdAt:"desc" }, take:250 }),
  ]);
  return {
    canApprove:canApproveSales(access),
    heldSales:heldRows.map((row:any)=>({ id:row.id, referenceNo:row.referenceNo, name:row.displayName, status:row.status, customerId:row.relatedEntityId, amount:money(row.amount), currency:row.currency, data:json(row.data), heldByUserId:row.createdByUserId, heldAt:row.createdAt, updatedAt:row.updatedAt })),
    creditOverrides:creditRows.map((row:any)=>{ let detail:any={}; try{detail=JSON.parse(row.detail||"{}");}catch{} return { id:row.id, requestNo:row.requestNo, status:row.status, amount:money(row.amount), heldSaleId:row.entityId, requestedByUserId:row.requestedByUserId, decidedByUserId:row.decidedByUserId, decisionNote:row.decisionNote, decidedAt:row.decidedAt, createdAt:row.createdAt, ...detail }; }),
  };
}
