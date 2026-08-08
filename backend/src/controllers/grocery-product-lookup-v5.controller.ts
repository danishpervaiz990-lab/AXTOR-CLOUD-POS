import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { readGroceryProductProfile } from "./grocery-product-uom.controller.js";

const db:any=prisma;
const text=(v:unknown)=>String(v??"").trim();
function tenant(req:Request){const businessId=req.tenant?.businessId;if(!businessId)throw new Error("Authenticated Grocery tenant is required");return businessId;}
function ok(res:Response,data:unknown,status=200){return res.status(status).json({ok:true,data});}
function fail(res:Response,e:any,status=400){return res.status(status).json({ok:false,error:{message:e?.message||"Request failed"}});}
function decodeEmbeddedBarcode(product:any,query:string){const p=readGroceryProductProfile(product);const rules=[p.priceEmbeddedBarcode&&p.priceEmbeddedBarcodePrefix?{type:"price",prefix:p.priceEmbeddedBarcodePrefix}:null,p.weightedBarcode&&p.weightedBarcodePrefix?{type:"weight",prefix:p.weightedBarcodePrefix}:null].filter(Boolean) as {type:"price"|"weight";prefix:string}[];for(const rule of rules){if(!query.startsWith(rule.prefix)||query.length<rule.prefix.length+5)continue;const raw=Number(query.slice(rule.prefix.length,rule.prefix.length+5));if(!Number.isFinite(raw))continue;return rule.type==="price"?{price:raw/100,qty:1,barcodeType:"price_embedded"}:{qty:raw/1000,barcodeType:"weighted"};}return null;}

export async function groceryProductLookupV5(req:Request,res:Response){
  try{
    const businessId=tenant(req),q=text(req.query.q||req.query.code);if(!q)throw new Error("Lookup code is required");
    let product=await db.product.findFirst({where:{businessId,deleted:false,active:true,OR:[{sku:{equals:q,mode:"insensitive"}},{barcode:{equals:q,mode:"insensitive"}},{itemCode:{equals:q,mode:"insensitive"}},{productCode:{equals:q,mode:"insensitive"}}]}}),embedded:any=null;
    if(!product){
      const exact=await db.product.findMany({where:{businessId,deleted:false,active:true,OR:[
        {customFields:{path:["grocery","plu"],equals:q}},{customFields:{path:["plu"],equals:q}},
        {customFields:{path:["grocery","barcodes"],array_contains:[q]}},{customFields:{path:["barcodes"],array_contains:[q]}},
      ]},take:2});
      if(exact.length>1)throw new Error("Lookup code is not unique; correct the duplicate Grocery identifiers");product=exact[0]||null;
    }
    if(!product&&/^\d{7,18}$/.test(q)){
      const prefixes=[] as string[];for(let length=2;length<=Math.min(8,q.length-5);length++)prefixes.push(q.slice(0,length));
      const candidates=await db.product.findMany({where:{businessId,deleted:false,active:true,OR:prefixes.flatMap(prefix=>[
        {customFields:{path:["grocery","weightedBarcodePrefix"],equals:prefix}},{customFields:{path:["weightedBarcodePrefix"],equals:prefix}},
        {customFields:{path:["grocery","priceEmbeddedBarcodePrefix"],equals:prefix}},{customFields:{path:["priceEmbeddedBarcodePrefix"],equals:prefix}},
      ])},take:20});
      const decoded=candidates.map((candidate:any)=>({candidate,embedded:decodeEmbeddedBarcode(candidate,q)})).filter((x:any)=>x.embedded);if(decoded.length>1)throw new Error("Embedded barcode prefix is not unique");if(decoded.length){product=decoded[0].candidate;embedded=decoded[0].embedded;}
    }
    if(!product)return fail(res,new Error("Product not found"),404);
    return ok(res,{product,grocery:readGroceryProductProfile(product),embedded,lookup:{serverSide:true,maxCandidates:20}});
  }catch(e){return fail(res,e);}
}
