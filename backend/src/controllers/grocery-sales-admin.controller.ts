import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { createSalesDocument } from "./sales-documents.controller.js";
import { loadUserAccess, hasPermission } from "../services/access.service.js";
import { writeAudit } from "../services/audit.service.js";
import { assertGrocery } from "../services/grocery-41-50.service.js";
import { ApiError } from "../utils/http.js";

const db: any = prisma;
const text = (value: unknown) => String(value ?? "").trim();
const num = (value: unknown, fallback = 0) => { const n = Number(value); return Number.isFinite(n) ? n : fallback; };
const json = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};

function tenant(req: Request) {
  const businessId = req.tenant?.businessId, userId = req.tenant?.userId;
  if (!businessId || !userId) throw new ApiError(401, "Authenticated Grocery tenant is required");
  return { businessId, userId };
}

function fail(res: Response, error: any) {
  const status = Number(error?.status || error?.statusCode || 400);
  return res.status(status >= 400 && status < 600 ? status : 400).json({ ok:false, error:{ message:error?.message || "Request failed" } });
}

function documentType(value: unknown) {
  const raw = text(value).toUpperCase().replace(/[-\s]+/g, "_");
  if (!raw) return null;
  if (["INVOICE","QUOTATION","DELIVERY_NOTE"].includes(raw)) return raw;
  throw new ApiError(400, "Invalid sales document type");
}

function dateValue(value: unknown, endOfDay = false) {
  const raw = text(value); if (!raw) return null;
  const d = new Date(raw); if (Number.isNaN(d.getTime())) throw new ApiError(400, "Invalid date filter");
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(raw)) d.setHours(23,59,59,999);
  return d;
}

function creditStatus(row: any) {
  const balance = num(row.balance), due = row.dueDate ? new Date(row.dueDate) : null;
  if (balance <= 0.001) return "settled";
  if (due && !Number.isNaN(due.getTime()) && due.getTime() < Date.now()) return "overdue";
  return "credit_open";
}

function compact(row: any) {
  const metadata = json(row.metadata);
  return {
    id:row.id,
    documentNo:row.documentNo,
    documentType:row.documentType,
    status:row.status,
    customerId:row.customerId,
    customerName:row.customerName,
    salesmanId:row.salesmanId,
    salesmanName:row.salesmanName,
    branchId:row.branchId,
    warehouseId:row.warehouseId,
    issuedAt:row.issuedAt,
    dueDate:row.dueDate,
    currency:row.currency,
    subtotal:Number(row.subtotal || 0),
    discount:Number(row.discount || 0),
    tax:Number(row.tax || 0),
    total:Number(row.total || 0),
    paid:Number(row.paid || 0),
    balance:Number(row.balance || 0),
    paymentMethod:row.paymentMethod,
    paymentStatus:row.paymentStatus,
    creditStatus:creditStatus(row),
    approvalStatus:text(metadata.creditApprovalStatus || metadata.approvalStatus) || "not_required",
    referenceNo:row.referenceNo,
    createdAt:row.createdAt,
    updatedAt:row.updatedAt,
    conversion:json(metadata.conversion),
  };
}

export async function grocerySalesAdminDocuments(req: Request, res: Response) {
  try {
    const t=tenant(req); await assertGrocery(t.businessId);
    const access=await loadUserAccess(db,t.businessId,t.userId);
    if(!hasPermission(access,"sales_documents.view")) throw new ApiError(403,"Permission denied: sales_documents.view");

    const page=Math.max(1,Math.floor(num(req.query.page,1))), pageSize=Math.min(100,Math.max(10,Math.floor(num(req.query.pageSize,25))));
    const where:any={ businessId:t.businessId };
    const type=documentType(req.query.documentType); if(type) where.documentType=type;
    const status=text(req.query.status).toUpperCase(); if(status) where.status=status;
    const branchId=text(req.query.branchId); if(branchId) where.branchId=branchId;
    const salesmanId=text(req.query.salesmanId); if(salesmanId) where.salesmanId=salesmanId;
    const customerId=text(req.query.customerId); if(customerId) where.customerId=customerId;
    const paymentStatus=text(req.query.paymentStatus); if(paymentStatus) where.paymentStatus={ equals:paymentStatus, mode:"insensitive" };
    const from=dateValue(req.query.from), to=dateValue(req.query.to,true); if(from||to) where.issuedAt={ ...(from?{gte:from}:{}), ...(to?{lte:to}:{}) };
    const minAmount=text(req.query.minAmount), maxAmount=text(req.query.maxAmount); if(minAmount||maxAmount) where.total={ ...(minAmount?{gte:num(minAmount)}:{}), ...(maxAmount?{lte:num(maxAmount)}:{}) };
    const q=text(req.query.q); if(q) where.OR=[
      {documentNo:{contains:q,mode:"insensitive"}},
      {customerName:{contains:q,mode:"insensitive"}},
      {salesmanName:{contains:q,mode:"insensitive"}},
      {referenceNo:{contains:q,mode:"insensitive"}},
      {lpoNo:{contains:q,mode:"insensitive"}},
      {customerPoNo:{contains:q,mode:"insensitive"}},
    ];

    const [total,rows]=await Promise.all([
      db.salesDocument.count({where}),
      db.salesDocument.findMany({where,orderBy:[{issuedAt:"desc"},{createdAt:"desc"}],skip:(page-1)*pageSize,take:pageSize}),
    ]);
    return res.json({ok:true,data:{rows:rows.map(compact),pagination:{page,pageSize,total,totalPages:Math.max(1,Math.ceil(total/pageSize))}}});
  } catch(error){ return fail(res,error); }
}

export async function grocerySalesAdminDocumentDetail(req: Request, res: Response) {
  try {
    const t=tenant(req); await assertGrocery(t.businessId);
    const access=await loadUserAccess(db,t.businessId,t.userId);
    if(!hasPermission(access,"sales_documents.view")) throw new ApiError(403,"Permission denied: sales_documents.view");
    const row=await db.salesDocument.findFirst({where:{id:req.params.id,businessId:t.businessId},include:{items:true,returns:true,refunds:true}});
    if(!row) throw new ApiError(404,"Sales document not found");
    return res.json({ok:true,data:row});
  } catch(error){ return fail(res,error); }
}

export async function grocerySalesAdminConvert(req: Request, res: Response) {
  const originalBody=req.body;
  try {
    const t=tenant(req); await assertGrocery(t.businessId);
    const access=await loadUserAccess(db,t.businessId,t.userId);
    if(!hasPermission(access,"sales_documents.create")||!hasPermission(access,"sales_documents.change_document_type",true)) throw new ApiError(403,"Sales document conversion permission is required");
    const source=await db.salesDocument.findFirst({where:{id:req.params.id,businessId:t.businessId},include:{items:true}});
    if(!source) throw new ApiError(404,"Source sales document not found");
    const target=documentType(req.body?.targetType); if(!target) throw new ApiError(400,"targetType is required");
    const allowed:Record<string,string[]>={QUOTATION:["INVOICE","DELIVERY_NOTE"],DELIVERY_NOTE:["INVOICE"]};
    if(!allowed[String(source.documentType)]?.includes(target)) throw new ApiError(409,`${source.documentType} cannot be converted to ${target}`);

    const sourceMetadata=json(source.metadata);
    const idempotencyKey=`grocery-convert:${source.id}:${target}`;
    req.body={
      documentType:target.toLowerCase(),
      postingMode:"draft",
      idempotencyKey,
      branchId:source.branchId || undefined,
      warehouseId:source.warehouseId || undefined,
      customerId:source.customerId || undefined,
      customerName:source.customerName || undefined,
      salesmanId:source.salesmanId || undefined,
      currency:source.currency || undefined,
      dueDate:source.dueDate || undefined,
      referenceNo:source.documentNo,
      internalNotes:`Converted from ${source.documentNo}`,
      customerNotes:source.customerNotes || undefined,
      items:(source.items||[]).map((item:any)=>({productId:item.productId,inventoryBatchId:item.inventoryBatchId||undefined,quantity:Number(item.qty),unitPrice:Number(item.rate),discountAmount:Number(item.discount||0),taxRate:Number(item.taxRate||0),description:item.description||undefined})),
    };

    let statusCode=200,payload:any=null;
    const capture:any={status(code:number){statusCode=code;return this;},json(body:any){payload=body;return this;}};
    await createSalesDocument(req,capture as Response);
    if(!payload?.ok||!payload?.data?.id) return res.status(statusCode).json(payload||{ok:false,error:{message:"Document conversion failed"}});

    const targetId=payload.data.id;
    await db.$transaction(async(tx:any)=>{
      const created=await tx.salesDocument.findFirst({where:{id:targetId,businessId:t.businessId}});
      if(!created) throw new ApiError(500,"Converted document was not persisted");
      const targetMetadata=json(created.metadata);
      const conversion={sourceDocumentId:source.id,sourceDocumentNo:source.documentNo,sourceDocumentType:source.documentType,targetDocumentId:created.id,targetDocumentNo:created.documentNo,targetDocumentType:created.documentType,convertedByUserId:t.userId,convertedAt:new Date().toISOString()};
      await tx.salesDocument.update({where:{id:created.id},data:{metadata:{...targetMetadata,conversion:{...conversion,direction:"from"}}}});
      const history=Array.isArray(sourceMetadata.conversions)?sourceMetadata.conversions:[];
      await tx.salesDocument.update({where:{id:source.id},data:{metadata:{...sourceMetadata,conversions:[...history,{...conversion,direction:"to"}].slice(-25)}}});
      await writeAudit(tx,req,{businessId:t.businessId,userId:t.userId,action:"grocery.sales_document.convert",entityType:"sales_document",entityId:source.id,before:{documentNo:source.documentNo,documentType:source.documentType},after:conversion});
    });

    return res.status(statusCode).json({...payload,data:{...payload.data,convertedFrom:{id:source.id,documentNo:source.documentNo,documentType:source.documentType}}});
  } catch(error){ return fail(res,error); }
  finally { req.body=originalBody; }
}
