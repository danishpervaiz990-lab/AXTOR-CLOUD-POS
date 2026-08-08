import type { Request } from "express";
import { prisma } from "../db/prisma.js";
import { writeAudit } from "./audit.service.js";
import { assertGrocery } from "./grocery-41-50-valuation.service.js";

const db:any=prisma,DAY=86_400_000,INVALID_SALES=["DRAFT","CANCELLED","VOID"];
const text=(v:unknown)=>String(v??"").trim();
const num=(v:unknown,f=0)=>{const n=Number(v);return Number.isFinite(n)?n:f;};
const money=(v:unknown)=>Math.round((num(v)+Number.EPSILON)*100)/100;
const json=(v:unknown):Record<string,any>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,any>:{};
async function settings(businessId:string){const rows:any[]=await db.appSetting.findMany({where:{businessId,key:{startsWith:"grocery.notifications."}}});return new Map<string,any>(rows.map(r=>[String(r.key),r.value]));}
async function upsertNotice(tx:any,businessId:string,type:string,title:string,message:string,entityType:string,entityId:string){const existing=await tx.notification.findFirst({where:{businessId,type,entityType,entityId,readAt:null,title}});return existing||tx.notification.create({data:{businessId,type,title,message,entityType,entityId}});}

export async function generateOperationalNotifications(req:Request,businessId:string,userId:string|null){
 await assertGrocery(businessId);const s=await settings(businessId),now=new Date(),expiryDays=Math.max(0,num(s.get("grocery.notifications.expiryDays"),30)),customerDays=Math.max(0,num(s.get("grocery.notifications.customerDueDays"),7)),supplierDays=Math.max(0,num(s.get("grocery.notifications.supplierDueDays"),7)),chequeDays=Math.max(0,num(s.get("grocery.notifications.chequeReminderDays"),7)),lowStockThreshold=Math.max(0,num(s.get("grocery.notifications.lowStockThreshold"),0)),largeDiscount=Math.max(0,num(s.get("grocery.notifications.largeDiscountAmount"),100)),largeRefund=Math.max(0,num(s.get("grocery.notifications.largeRefundAmount"),100));
 const [stockRows,batches,customerDue,supplierDue,cheques,pendingPo,transfers,counts,discounts,refunds]=await Promise.all([
  db.$queryRawUnsafe(`SELECT id,name,sku,current_stock AS "currentStock",min_stock AS "minStock" FROM products WHERE business_id=$1 AND deleted=false AND active=true AND current_stock<=GREATEST(min_stock,$2::numeric) ORDER BY current_stock ASC LIMIT 2000`,businessId,lowStockThreshold),
  db.inventoryBatch.findMany({where:{businessId,qtyOnHandBase:{gt:0},expiryDate:{lte:new Date(now.getTime()+expiryDays*DAY)},status:{notIn:["depleted","quarantined"]}},include:{product:{select:{name:true,sku:true}}},orderBy:{expiryDate:"asc"},take:2000}),
  db.salesDocument.findMany({where:{businessId,documentType:"INVOICE",balance:{gt:0},dueDate:{lte:new Date(now.getTime()+customerDays*DAY)},status:{notIn:INVALID_SALES}},select:{id:true,documentNo:true,customerName:true,dueDate:true,balance:true},take:2000}),
  db.purchase.findMany({where:{businessId,balance:{gt:0},dueDate:{lte:new Date(now.getTime()+supplierDays*DAY)},status:{not:"CANCELLED"}},select:{id:true,purchaseNo:true,supplierName:true,dueDate:true,balance:true},take:2000}),
  db.industryRecord.findMany({where:{businessId,industryCode:"grocery",entityType:"grocery_cheque",dueAt:{lte:new Date(now.getTime()+chequeDays*DAY)},status:{notIn:["cleared","cancelled","replaced"]}},take:1000}),
  db.purchase.findMany({where:{businessId,status:"DRAFT"},select:{id:true,purchaseNo:true,supplierName:true},take:1000}),
  db.industryRecord.findMany({where:{businessId,industryCode:"grocery",entityType:"grocery_transfer",status:{in:["draft","approved","in_transit","partially_received"]}},take:1000}),
  db.stockCount.findMany({where:{businessId,status:{in:["draft","pending","submitted"]}},select:{id:true,countNo:true,status:true},take:1000}),
  db.salesDocument.findMany({where:{businessId,documentType:"INVOICE",discount:{gte:largeDiscount},createdAt:{gte:new Date(now.getTime()-DAY)},status:{notIn:INVALID_SALES}},select:{id:true,documentNo:true,discount:true},take:1000}),
  db.customerRefund.findMany({where:{businessId,amount:{gte:largeRefund},refundDate:{gte:new Date(now.getTime()-DAY)}},select:{id:true,refundNo:true,amount:true},take:1000}),
 ]);
 let attempted=0;await db.$transaction(async(tx:any)=>{
  for(const p of stockRows as any[]){const stock=num(p.currentStock),threshold=Math.max(num(p.minStock),lowStockThreshold),out=stock<=0;await upsertNotice(tx,businessId,out?"out_of_stock":"low_stock",out?"Out of Stock":"Low Stock",`${p.name} (${p.sku}) has ${stock} remaining; alert threshold ${threshold}.`,`Product`,String(p.id));attempted++;}
  for(const b of batches as any[]){const expired=b.expiryDate&&b.expiryDate<now;await upsertNotice(tx,businessId,expired?"expired_stock":"near_expiry",expired?"Expired Stock":"Near Expiry",`${b.product?.name||b.productId} batch ${b.batchNo} ${expired?"expired":"expires"} ${b.expiryDate?.toISOString().slice(0,10)}.`,`InventoryBatch`,b.id);attempted++;}
  for(const d of customerDue as any[]){const overdue=d.dueDate&&d.dueDate<now;await upsertNotice(tx,businessId,overdue?"customer_overdue":"customer_payment_due",overdue?"Customer Overdue":"Customer Payment Due",`${d.customerName} · ${d.documentNo} · balance ${money(d.balance)}.`,`SalesDocument`,d.id);attempted++;}
  for(const d of supplierDue as any[]){const overdue=d.dueDate&&d.dueDate<now;await upsertNotice(tx,businessId,overdue?"supplier_overdue":"supplier_payment_due",overdue?"Supplier Overdue":"Supplier Payment Due",`${d.supplierName} · ${d.purchaseNo} · balance ${money(d.balance)}.`,`Purchase`,d.id);attempted++;}
  for(const c of cheques as any[]){const direction=text(json(c.data).direction||json(c.data).type).toLowerCase(),out=direction.includes("out");await upsertNotice(tx,businessId,out?"outward_cheque_due":"inward_cheque_due",out?"Outward Cheque Due":"Inward Cheque Due",`${c.referenceNo||c.displayName} due ${c.dueAt?.toISOString().slice(0,10)}.`,`Cheque`,c.id);attempted++;}
  for(const p of pendingPo as any[]){await upsertNotice(tx,businessId,"pending_po","Pending Purchase Order",`${p.purchaseNo} · ${p.supplierName}.`,`Purchase`,p.id);attempted++;}
  for(const t of transfers as any[]){await upsertNotice(tx,businessId,"transfer_pending","Transfer Pending",`${t.referenceNo||t.displayName} · ${t.status}.`,`StockTransfer`,t.id);attempted++;}
  for(const c of counts as any[]){await upsertNotice(tx,businessId,"stock_count_pending","Stock Count Pending",`${c.countNo} · ${c.status}.`,`StockCount`,c.id);attempted++;}
  for(const d of discounts as any[]){await upsertNotice(tx,businessId,"large_discount","Large Discount",`${d.documentNo} discount ${money(d.discount)}.`,`SalesDocument`,d.id);attempted++;}
  for(const r of refunds as any[]){await upsertNotice(tx,businessId,"large_refund","Large Refund",`${r.refundNo} refund ${money(r.amount)}.`,`CustomerRefund`,r.id);attempted++;}
  await writeAudit(tx,req,{businessId,userId,action:"grocery.notifications.generate",entityType:"Notification",after:{attempted,thresholds:{expiryDays,customerDays,supplierDays,chequeDays,lowStockThreshold,largeDiscount,largeRefund},caps:{stock:2000,expiry:2000,due:2000}}});
 });return{evaluatedAt:now.toISOString(),attempted,thresholds:{expiryDays,customerDays,supplierDays,chequeDays,lowStockThreshold,largeDiscount,largeRefund}};
}
