import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { grocery21To30Catalog } from "../services/grocery-21-30-reports.service.js";

const db: any = prisma;
const text=(v:unknown)=>String(v??"").trim();
const num=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)?n:0;};
const json=(v:unknown):Record<string,any>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,any>:{};
function tenant(req:Request){const businessId=req.tenant?.businessId;if(!businessId)throw new Error("Authenticated Grocery tenant is required");return businessId;}
function ok(res:Response,data:unknown){return res.json({ok:true,data});}
function fail(res:Response,e:any,status=400){return res.status(status).json({ok:false,error:{message:e?.message||"Request failed"}});}

const small=["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
const tens=["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
function under1000(n:number){const parts:string[]=[];if(n>=100){parts.push(`${small[Math.floor(n/100)]} Hundred`);n%=100;}if(n>=20){parts.push(tens[Math.floor(n/10)]);if(n%10)parts.push(small[n%10]);}else if(n>0)parts.push(small[n]);return parts.join(" ");}
function integerWords(n:number){n=Math.floor(Math.abs(n));if(n===0)return"Zero";const parts:string[]=[];for(const [value,label] of [[1_000_000_000,"Billion"],[1_000_000,"Million"],[1_000,"Thousand"]] as const){if(n>=value){parts.push(`${under1000(Math.floor(n/value))} ${label}`);n%=value;}}if(n)parts.push(under1000(n));return parts.join(" ");}
function amountWords(amount:number,currency:string){const whole=Math.floor(Math.abs(amount)),minor=Math.round((Math.abs(amount)-whole)*100);return `${integerWords(whole)} ${currency}${minor?` and ${String(minor).padStart(2,"0")}/100`:""} Only`;}
async function userName(businessId:string,userId:string|null|undefined){if(!userId)return null;const u=await db.user.findFirst({where:{id:userId,businessId},select:{name:true,email:true}});return u?.name||u?.email||null;}
async function voucherContext(businessId:string){const b=await db.business.findUnique({where:{id:businessId}});if(!b)throw new Error("Business not found");return{business:b,businessDetails:{name:b.name||b.legalName||"Grocery Business",logo:b.logoUrl||b.logo||null,address:b.address||b.businessAddress||null,phone:b.phone||null,email:b.email||null,taxRegistration:b.taxRegistration||b.taxNumber||b.vatNumber||null,currency:text(b.currency||"QAR").toUpperCase()}};}

export async function groceryReportCatalog(req:Request,res:Response){try{tenant(req);return ok(res,{reports:grocery21To30Catalog(),filters:{datePresets:["today","yesterday","this-week","last-week","this-month","last-month","this-quarter","this-year","custom"],dimensions:["branch","warehouse","counter","van","cashier","salesman","customer","supplier","product","category","brand","payment method","payment status","due status","tax","user"],features:["sorting","pagination","search","group by","comparison period"],exports:["csv","xlsx","pdf","print"]}});}catch(e){return fail(res,e);}}

export async function groceryVoucher(req:Request,res:Response){
 try{
  const businessId=tenant(req);const type=text(req.params.type).toLowerCase();const id=text(req.params.id);const allowed=["payment-voucher","receipt-voucher","supplier-payment-voucher","customer-receipt-voucher"];
  if(!allowed.includes(type))return fail(res,new Error("Unsupported voucher type"),404);
  const {businessDetails}=await voucherContext(businessId);let row:any=null,entityType="",payeePayer="",voucherNo="",date:any=null,amount=0,method="",reference="",accountId:string|null=null,documentReferences:string[]=[],remarks="";
  if(type==="receipt-voucher"||type==="customer-receipt-voucher"){
    row=await db.customerPayment.findFirst({where:{id,businessId}});if(!row)return fail(res,new Error("Customer receipt not found"),404);entityType="CustomerPayment";payeePayer=row.customerName||"Customer";voucherNo=row.receiptNo;date=row.paymentDate;amount=num(row.baseAmount||row.amount);method=row.method;reference=row.referenceNo||"";accountId=row.accountId||null;const a=json(row.allocation);documentReferences=[a.salesDocumentNo||a.salesDocumentId].filter(Boolean);remarks=a.notes||"";
  }else{
    row=await db.supplierPayment.findFirst({where:{id,businessId}});entityType="SupplierPayment";
    if(row){payeePayer=row.supplierName||"Supplier";voucherNo=row.voucherNo;date=row.paymentDate;amount=num(row.baseAmount||row.amount);method=row.method;reference=row.referenceNo||"";accountId=row.accountId||null;const a=json(row.allocation);documentReferences=[a.purchaseNo||a.purchaseId].filter(Boolean);remarks=a.notes||"";}
    else if(type==="payment-voucher"){
      row=await db.expense.findFirst({where:{id,businessId}});if(!row)return fail(res,new Error("Payment voucher source not found"),404);entityType="Expense";payeePayer=row.payee||row.category||"Expense Payee";voucherNo=row.expenseNo||`EXP-${row.id}`;date=row.expenseDate;amount=num(row.baseAmount||row.amount);const m=json(row.metadata);method=m.paymentMethod||"cash";reference=m.referenceNo||"";accountId=row.paymentAccountId||m.paymentAccountId||null;documentReferences=[row.referenceNo].filter(Boolean);remarks=row.notes||m.notes||"";
    }else return fail(res,new Error("Supplier payment not found"),404);
  }
  const [account,audit]=await Promise.all([accountId?db.account.findFirst({where:{id:accountId,businessId},select:{name:true,accountNumber:true}}):null,db.auditLog.findFirst({where:{businessId,entityType,entityId:row.id},orderBy:{createdAt:"desc"}})]);
  const preparedBy=await userName(businessId,audit?.userId||row.createdByUserId||null);let approvedBy:null|string=null;const approval=await db.auditLog.findFirst({where:{businessId,entityType,entityId:row.id,action:{contains:"approv",mode:"insensitive"}},orderBy:{createdAt:"desc"}}).catch(()=>null);if(approval)approvedBy=await userName(businessId,approval.userId);
  return ok(res,{type,business:businessDetails,voucher:{voucherNo,date,payeePayer,amount,currency:businessDetails.currency,amountInWords:amountWords(amount,businessDetails.currency),paymentMethod:method||"-",chequeBankReference:reference||"-",account:account?`${account.accountNumber?account.accountNumber+" · ":""}${account.name}`:"-",invoiceBillReferences:documentReferences,remarks:remarks||"-",preparedBy:preparedBy||"System",approvedBy:approvedBy||null,receivedBy:"",signature:""},formats:["A4","A5","thermal","PDF","print"]});
 }catch(e){return fail(res,e);}
}
