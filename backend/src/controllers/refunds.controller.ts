import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { writeAudit } from "../services/audit.service.js";
import { loadUserAccess, requirePermission } from "../services/access.service.js";

function businessId(req: Request) { return req.tenant?.businessId ?? undefined; }
function userId(req: Request) { return req.tenant?.userId ?? undefined; }
function text(v: unknown) { const s = String(v ?? "").trim(); return s || undefined; }
function number(v: unknown) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function money(v: number) { return Math.round((v + Number.EPSILON) * 100) / 100; }
function date(v: unknown) { const d = new Date(String(v ?? "")); return Number.isNaN(d.getTime()) ? new Date() : d; }
function status(returned: number, refunded: number) {
  if (refunded <= 0) return "not_refunded";
  if (refunded + 0.001 >= returned) return "fully_refunded";
  return "partially_refunded";
}
function format(r: any) {
  return { ...r, amount: Number(r.amount || 0), method: r.method, refundDate: r.refundDate };
}
async function nextNo(tx: any, bid: string) {
  await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `axtor:refund-counter:${bid}`);
  const count = await tx.customerRefund.count({ where: { businessId: bid } });
  for (let i=1;i<30;i++) {
    const no = `RFD-${String(count+i).padStart(6,"0")}`;
    if (!await tx.customerRefund.findFirst({ where: { businessId: bid, refundNo: no }, select:{id:true} })) return no;
  }
  return `RFD-${Date.now()}`;
}

export async function listRefunds(req: Request, res: Response) {
  try {
    const bid=businessId(req); if(!bid) return res.status(401).json({ok:false,error:{message:"Unauthorized: business context missing"}});
    const where:any={businessId:bid};
    const salesDocumentId=text(req.query.salesDocumentId); if(salesDocumentId) where.salesDocumentId=salesDocumentId;
    const salesReturnId=text(req.query.salesReturnId); if(salesReturnId) where.salesReturnId=salesReturnId;
    const rows=await (prisma as any).customerRefund.findMany({where,orderBy:{createdAt:"desc"},take:100});
    return res.json({ok:true,count:rows.length,data:rows.map(format)});
  } catch(e){ console.error("listRefunds error",e); return res.status(500).json({ok:false,error:{message:"Failed to list refunds"}}); }
}

export async function getRefundById(req: Request,res: Response){
  try { const bid=businessId(req); const id=text(req.params.id); if(!bid) return res.status(401).json({ok:false,error:{message:"Unauthorized"}});
    const row=await (prisma as any).customerRefund.findFirst({where:{id,businessId:bid}}); if(!row) return res.status(404).json({ok:false,error:{message:"Refund not found"}});
    return res.json({ok:true,data:format(row)});
  } catch(e){ return res.status(500).json({ok:false,error:{message:"Failed to get refund"}}); }
}

export async function createRefund(req: Request,res: Response){
  try {
    const bid=businessId(req); if(!bid) return res.status(401).json({ok:false,error:{message:"Unauthorized: business context missing"}});
    const salesDocumentId=text(req.body?.salesDocumentId)||text(req.body?.sourceSalesDocumentId);
    const salesReturnId=text(req.body?.salesReturnId)||text(req.body?.returnId);
    const amount=money(number(req.body?.amount));
    const method=text(req.body?.refundMethod)||text(req.body?.method);
    const idempotencyKey=text(req.body?.idempotencyKey)||text(req.headers["idempotency-key"]);
    if(!salesDocumentId) return res.status(400).json({ok:false,error:{message:"Sales document id is required"}});
    if(amount<=0) return res.status(400).json({ok:false,error:{message:"Refund amount must be greater than zero"}});
    if(!method) return res.status(400).json({ok:false,error:{message:"Refund method is required"}});
    const allowed=["cash","card","card reversal","bank transfer","store credit","wallet","credit note"];
    if(!allowed.includes(method.toLowerCase())) return res.status(400).json({ok:false,error:{message:"Unsupported refund method"}});

    const result=await prisma.$transaction(async(tx:any)=>{
      const access=await loadUserAccess(tx,bid,userId(req));
      requirePermission(access,"sales_documents.refund",true);
      if(idempotencyKey){ await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))",`axtor:refund-idempotency:${bid}:${idempotencyKey}`); const existing=await tx.customerRefund.findFirst({where:{businessId:bid,idempotencyKey}}); if(existing) return {row:existing,duplicate:true}; }
      const doc=await tx.salesDocument.findFirst({where:{id:salesDocumentId,businessId:bid},include:{returns:true}});
      if(!doc) throw new Error("Sales invoice not found");
      if(String(doc.documentType)!=="INVOICE") throw new Error("Only invoices can be refunded");
      const returned=money(number(doc.returnedAmount));
      const paid=money(number(doc.paid));
      const already=money(number(doc.refundedAmount));
      if(returned<=0) throw new Error("Refund is not allowed because this invoice has no posted return");
      if(salesReturnId && !doc.returns.some((r:any)=>r.id===salesReturnId)) throw new Error("Selected return does not belong to this invoice");
      const refundable=money(Math.max(0,Math.min(returned,paid)-already));
      if(refundable<=0) throw new Error("No refundable balance remains for this invoice");
      if(amount>refundable+0.001) throw new Error(`Refund exceeds refundable balance. Maximum allowed: ${refundable.toFixed(2)}`);
      const refundNo=await nextNo(tx,bid);
      const row=await tx.customerRefund.create({data:{businessId:bid,refundNo,salesDocumentId:doc.id,salesReturnId:salesReturnId||null,customerId:doc.customerId||null,customerName:doc.customerName||"Walk-in Customer",amount,method,accountId:text(req.body?.accountId)||text(req.body?.depositAccount)||null,referenceNo:text(req.body?.referenceNo)||null,notes:text(req.body?.notes)||null,idempotencyKey:idempotencyKey||null,refundDate:date(req.body?.refundDate),metadata:{createdById:userId(req)||null,source:"api"}}});
      const next=money(already+amount); const rs=status(returned,next);
      await tx.salesDocument.update({where:{id:doc.id},data:{refundedAmount:next,refundStatus:rs,metadata:{...(doc.metadata&&typeof doc.metadata==="object"?doc.metadata:{}),lastRefundId:row.id,lastRefundNo:refundNo,lastRefundAmount:amount,lastRefundAt:new Date().toISOString()}}});
      if(salesReturnId){ const ret=await tx.salesReturn.findFirst({where:{id:salesReturnId,businessId:bid}}); if(ret) await tx.salesReturn.update({where:{id:ret.id},data:{refundAmount:money(number(ret.refundAmount)+amount)}}); }
      await writeAudit(tx, req, {businessId:bid,userId:userId(req),action:"REFUNDED",entityType:"sales_document",entityId:doc.id,before:{refundedAmount:already,refundStatus:doc.refundStatus},after:{refundNo,amount,refundedAmount:next,refundStatus:rs,refundBalance:money(Math.max(0,Math.min(returned,paid)-next))}});
      return {row,duplicate:false,returnedAmount:returned,refundedAmount:next,refundBalance:money(Math.max(0,Math.min(returned,paid)-next)),refundStatus:rs};
    });
    return res.status(result.duplicate?200:201).json({ok:true,message:result.duplicate?"Refund already posted":"Customer refund posted successfully",duplicate:result.duplicate,data:{...format(result.row),returnedAmount:result.returnedAmount,refundedAmount:result.refundedAmount,refundBalance:result.refundBalance,refundStatus:result.refundStatus}});
  } catch(e:any){ console.error("createRefund error",e); return res.status(400).json({ok:false,error:{message:e?.message||"Failed to create refund"}}); }
}
