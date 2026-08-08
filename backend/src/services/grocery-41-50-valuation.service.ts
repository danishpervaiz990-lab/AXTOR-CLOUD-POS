import type { Request } from "express";
import { prisma } from "../db/prisma.js";
import { writeAudit } from "./audit.service.js";

const db:any=prisma;
const text=(v:unknown)=>String(v??"").trim();
const num=(v:unknown,f=0)=>{const n=Number(v);return Number.isFinite(n)?n:f;};
const money=(v:unknown)=>Math.round((num(v)+Number.EPSILON)*100)/100;
const qty=(v:unknown)=>Math.round((num(v)+Number.EPSILON)*1000)/1000;
const pageOf=(v:unknown)=>Math.max(1,Math.trunc(num(v,1)));
const limitOf=(v:unknown,d=50,max=250)=>Math.max(1,Math.min(max,Math.trunc(num(v,d))));

export const GROCERY_41_50_MODULES=["stock-valuation","printing","barcode-shelf-labels","dashboard-improvement","notification-center","settings","market-standard-completion","bulk-import-export","global-search","performance-controls"] as const;
export const GROCERY_PRINT_TEMPLATES=["sales_receipt","tax_invoice","credit_invoice","quotation","sales_return","customer_payment_receipt","customer_statement","purchase_order","grn","purchase_invoice","purchase_return","supplier_payment_voucher","receipt_voucher","payment_voucher","stock_transfer","stock_count","expense_voucher","journal_voucher"] as const;

export async function assertGrocery(businessId:string){const selected=await db.businessIndustry.findUnique({where:{businessId},include:{industry:{select:{code:true}}}});if(text(selected?.industry?.code).toLowerCase()!=="grocery")throw new Error("Grocery tenant is required");}

export async function weightedAverageCosts(businessId:string,productIds:string[]){
  const ids=[...new Set(productIds.map(text).filter(Boolean))].slice(0,500);const out=new Map<string,{quantity:number;averageCost:number;stockValue:number}>();if(!ids.length)return out;
  const rows:any[]=await db.$queryRawUnsafe(`SELECT product_id AS "productId",COALESCE(SUM(qty_on_hand_base),0)::float8 AS quantity,COALESCE(SUM(qty_on_hand_base*cost_per_base_unit),0)::float8 AS value FROM inventory_batches WHERE business_id=$1 AND product_id=ANY($2::text[]) AND qty_on_hand_base>0 AND status NOT IN ('depleted','quarantined') GROUP BY product_id`,businessId,ids);
  for(const row of rows){const quantity=num(row.quantity),stockValue=money(row.value);out.set(String(row.productId),{quantity,stockValue,averageCost:quantity>0?money(stockValue/quantity):0});}return out;
}

export async function stockValuation(businessId:string,query:any={}){
  await assertGrocery(businessId);const page=pageOf(query.page),limit=limitOf(query.limit??query.pageSize),offset=(page-1)*limit,q=text(query.q||query.search),warehouseId=text(query.warehouseId),params:any[]=[businessId];let idx=2,warehouseSql="",searchSql="";
  if(warehouseId){warehouseSql=` AND b.warehouse_id=$${idx++}`;params.push(warehouseId);}if(q){searchSql=` AND (p.name ILIKE $${idx} OR p.sku ILIKE $${idx} OR COALESCE(p.barcode,'') ILIKE $${idx})`;params.push(`%${q}%`);idx++;}const limitPos=idx++,offsetPos=idx++;params.push(limit,offset);
  const rows:any[]=await db.$queryRawUnsafe(`SELECT p.id AS "productId",p.sku,p.name,p.category,p.unit,COALESCE(SUM(b.qty_on_hand_base),0)::float8 AS quantity,COALESCE(SUM(b.qty_on_hand_base*b.cost_per_base_unit),0)::float8 AS "stockValue" FROM products p JOIN inventory_batches b ON b.product_id=p.id AND b.business_id=p.business_id WHERE p.business_id=$1 AND p.deleted=false AND b.qty_on_hand_base>0 AND b.status NOT IN ('depleted','quarantined')${warehouseSql}${searchSql} GROUP BY p.id,p.sku,p.name,p.category,p.unit ORDER BY p.name ASC LIMIT $${limitPos} OFFSET $${offsetPos}`,...params);
  const countParams=params.slice(0,-2),countRows:any[]=await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM (SELECT p.id FROM products p JOIN inventory_batches b ON b.product_id=p.id AND b.business_id=p.business_id WHERE p.business_id=$1 AND p.deleted=false AND b.qty_on_hand_base>0 AND b.status NOT IN ('depleted','quarantined')${warehouseSql}${searchSql} GROUP BY p.id)x`,...countParams);
  const totalSql=`SELECT COALESCE(SUM(qty_on_hand_base*cost_per_base_unit),0)::float8 AS value,COALESCE(SUM(qty_on_hand_base),0)::float8 AS quantity FROM inventory_batches WHERE business_id=$1 AND qty_on_hand_base>0 AND status NOT IN ('depleted','quarantined')${warehouseId?" AND warehouse_id=$2":""}`;const totals:any[]=await db.$queryRawUnsafe(totalSql,...(warehouseId?[businessId,warehouseId]:[businessId]));const totalRows=Number(countRows[0]?.count||0);
  return{method:"weighted_average",physicalRotation:"FEFO",rows:rows.map(r=>({...r,quantity:qty(r.quantity),stockValue:money(r.stockValue),averageCost:num(r.quantity)>0?money(num(r.stockValue)/num(r.quantity)):0})),summary:{quantity:qty(totals[0]?.quantity),stockValue:money(totals[0]?.value)},meta:{page,pageSize:limit,totalRows,totalPages:Math.max(1,Math.ceil(totalRows/limit))}};
}

export async function syncWeightedAverageProductCosts(req:Request,businessId:string,userId:string|null,productIds?:string[]){await assertGrocery(businessId);let ids=[...new Set((productIds||[]).map(text).filter(Boolean))];if(!ids.length){const rows:any[]=await db.product.findMany({where:{businessId,deleted:false},select:{id:true},take:10000});ids=rows.map(r=>String(r.id));}const costs=await weightedAverageCosts(businessId,ids);let updated=0;await db.$transaction(async(tx:any)=>{for(const id of ids){const row=costs.get(id);if(!row)continue;await tx.product.updateMany({where:{id,businessId},data:{costPrice:row.averageCost}});updated++;}await writeAudit(tx,req,{businessId,userId,action:"grocery.valuation.weighted_average_sync",entityType:"Product",after:{method:"weighted_average",updated}});});return{method:"weighted_average",updated};}

export async function purchaseCostHistory(businessId:string,productId:string,query:any={}){await assertGrocery(businessId);const product=await db.product.findFirst({where:{id:productId,businessId,deleted:false},select:{id:true,sku:true,name:true}});if(!product)throw new Error("Product not found");const page=pageOf(query.page),limit=limitOf(query.limit??query.pageSize,50,200);const [rows,total]=await Promise.all([db.goodsReceiptItem.findMany({where:{businessId,productId},include:{goodsReceipt:{include:{purchase:{select:{purchaseNo:true,supplierId:true,supplierName:true,purchaseDate:true}}}}},orderBy:{createdAt:"desc"},skip:(page-1)*limit,take:limit}),db.goodsReceiptItem.count({where:{businessId,productId}})]);return{product,rows:(rows as any[]).map(r=>({receivedAt:r.createdAt,receiptNo:r.goodsReceipt?.receiptNo,purchaseNo:r.goodsReceipt?.purchase?.purchaseNo,supplierId:r.goodsReceipt?.purchase?.supplierId,supplier:r.goodsReceipt?.purchase?.supplierName,quantity:qty(r.qty),purchaseUnitCost:money(r.cost)})),meta:{page,pageSize:limit,totalRows:total}};}
