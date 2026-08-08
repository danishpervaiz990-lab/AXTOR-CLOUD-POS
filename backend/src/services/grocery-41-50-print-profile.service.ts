import { prisma } from "../db/prisma.js";
import { ensurePrintProfiles, printableDocument as basePrintableDocument } from "./grocery-41-50-print.service.js";

const db:any=prisma;
const text=(v:unknown)=>String(v??"").trim();

export async function printableDocument(businessId:string,type:string,id:string,profileCode?:string,userId:string|null=null){
  await ensurePrintProfiles(businessId,userId);
  const document=await basePrintableDocument(businessId,type,id);
  const requested=text(profileCode);
  let profile=requested?await db.printProfile.findFirst({where:{businessId,code:requested,active:true}}):null;
  if(!profile){const thermal=type==="sales_receipt";profile=await db.printProfile.findFirst({where:{businessId,active:true,...(thermal?{documentType:"sales_receipt"}:{})},orderBy:[{isDefault:"desc"},{createdAt:"asc"}]});}
  return{...document,profile};
}
