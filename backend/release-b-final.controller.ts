import type {Request,Response}from"express";import * as s from"../services/purchases.service.js";import{handleError,tenant}from"../utils/http.js";
export async function list(req:Request,res:Response){try{const t=tenant(req);res.json({ok:true,data:await s.listPurchases(t.businessId,req.query)});}catch(e){handleError(res,e);}}
export async function get(req:Request,res:Response){try{const t=tenant(req);res.json({ok:true,data:await s.getPurchase(t.businessId,req.params.id)});}catch(e){handleError(res,e);}}
export async function create(req:Request,res:Response){try{const t=tenant(req);res.status(201).json({ok:true,data:await s.createPurchase(req,t.businessId,t.userId,req.body)});}catch(e){handleError(res,e);}}
export async function update(req:Request,res:Response){try{const t=tenant(req);res.json({ok:true,data:await s.updatePurchase(req,t.businessId,t.userId,req.params.id,req.body)});}catch(e){handleError(res,e);}}
export async function receive(req:Request,res:Response){try{const t=tenant(req);res.json({ok:true,data:await s.receivePurchase(req,t.businessId,t.userId,req.params.id,req.body)});}catch(e){handleError(res,e);}}
export async function cancel(req:Request,res:Response){try{const t=tenant(req);res.json({ok:true,data:await s.cancelPurchase(req,t.businessId,t.userId,req.params.id)});}catch(e){handleError(res,e);}}
export async function requests(req:Request,res:Response){try{const t=tenant(req);res.json({ok:true,data:await s.listPurchaseRequests(t.businessId)});}catch(e){handleError(res,e);}}
export async function createRequest(req:Request,res:Response){try{const t=tenant(req);res.status(201).json({ok:true,data:await s.createPurchaseRequest(req,t.businessId,t.userId,req.body)});}catch(e){handleError(res,e);}}
export async function convertRequest(req:Request,res:Response){try{const t=tenant(req);res.json({ok:true,data:await s.convertPurchaseRequest(req,t.businessId,t.userId,req.params.id,req.body)});}catch(e){handleError(res,e);}}
export async function receipts(req:Request,res:Response){try{const t=tenant(req);res.json({ok:true,data:await s.listGoodsReceipts(t.businessId)});}catch(e){handleError(res,e);}}
export async function payments(req:Request,res:Response){try{const t=tenant(req);res.json({ok:true,data:await s.listSupplierPayments(t.businessId,req.query)});}catch(e){handleError(res,e);}}
export async function createPayment(req:Request,res:Response){try{const t=tenant(req);res.status(201).json({ok:true,data:await s.createSupplierPayment(req,t.businessId,t.userId,req.body)});}catch(e){handleError(res,e);}}
export async function statement(req:Request,res:Response){try{const t=tenant(req);res.json({ok:true,data:await s.supplierStatement(t.businessId,req.params.supplierId,req.query)});}catch(e){handleError(res,e);}}
export async function returns(req:Request,res:Response){try{const t=tenant(req);res.json({ok:true,data:await s.listPurchaseReturns(t.businessId)});}catch(e){handleError(res,e);}}
export async function createReturn(req:Request,res:Response){try{const t=tenant(req);res.status(201).json({ok:true,data:await s.createPurchaseReturn(req,t.businessId,t.userId,req.body)});}catch(e){handleError(res,e);}}
