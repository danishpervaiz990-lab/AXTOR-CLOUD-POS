import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";

const db:any=prisma;
function tenant(req:Request){const businessId=req.tenant?.businessId;if(!businessId)throw new Error("Authenticated Grocery tenant is required");return businessId;}
function num(v:unknown){const n=Number(v);return Number.isFinite(n)?n:0;}
function ok(res:Response,data:unknown){return res.json({ok:true,data});}
function fail(res:Response,e:any){return res.status(400).json({ok:false,error:{message:e?.message||"Request failed"}});}

export async function groceryVoucherIndex(req:Request,res:Response){
 try{
  const businessId=tenant(req);const take=Math.max(10,Math.min(500,Math.trunc(Number(req.query.limit||200))));
  const [receipts,payments,expenses]=await Promise.all([
   db.customerPayment.findMany({where:{businessId},orderBy:{paymentDate:"desc"},take}),
   db.supplierPayment.findMany({where:{businessId},orderBy:{paymentDate:"desc"},take}),
   db.expense.findMany({where:{businessId},orderBy:{expenseDate:"desc"},take}),
  ]);
  const rows=[
   ...receipts.map((x:any)=>({id:x.id,type:"customer-receipt-voucher",voucherNo:x.receiptNo,date:x.paymentDate,party:x.customerName,amount:num(x.baseAmount||x.amount),method:x.method,reference:x.referenceNo||null})),
   ...payments.map((x:any)=>({id:x.id,type:"supplier-payment-voucher",voucherNo:x.voucherNo,date:x.paymentDate,party:x.supplierName,amount:num(x.baseAmount||x.amount),method:x.method,reference:x.referenceNo||null})),
   ...expenses.map((x:any)=>({id:x.id,type:"payment-voucher",voucherNo:x.expenseNo||`EXP-${x.id}`,date:x.expenseDate,party:x.payee||x.category||"Expense",amount:num(x.baseAmount||x.amount),method:x.metadata?.paymentMethod||"cash",reference:x.referenceNo||null})),
  ].sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime()).slice(0,take);
  return ok(res,{rows,total:rows.length});
 }catch(e){return fail(res,e);}
}
