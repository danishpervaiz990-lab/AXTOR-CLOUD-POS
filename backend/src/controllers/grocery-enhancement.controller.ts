import type { Request, Response } from "express";
import {
  allocateGroceryNumber,
  bindGroceryEntityCode,
  decideCreditOverride,
  decideHeldSale,
  enhancementCatalog,
  previewGroceryNumber,
  requestCreditOverride,
  salesApprovalQueue,
  saveGlobalPreferences,
  saveSequenceSettings,
} from "../services/grocery-enhancement.service.js";

function tenant(req: Request) {
  const businessId = req.tenant?.businessId, userId = req.tenant?.userId;
  if (!businessId || !userId) throw new Error("Authenticated Grocery tenant is required");
  return { businessId, userId };
}
function ok(res: Response, data: unknown, status = 200) { return res.status(status).json({ ok:true, data }); }
function fail(res: Response, error: any) {
  const status = Number(error?.statusCode || error?.status || 400);
  return res.status(status >= 400 && status < 600 ? status : 400).json({ ok:false, error:{ message:error?.message || "Request failed" } });
}

export async function groceryEnhancementCatalog(req: Request, res: Response) {
  try { const t=tenant(req); return ok(res, await enhancementCatalog(t.businessId,t.userId)); } catch(e){ return fail(res,e); }
}
export async function groceryGlobalPreferencesSave(req: Request, res: Response) {
  try { const t=tenant(req); return ok(res, await saveGlobalPreferences(req,t.businessId,t.userId,req.body||{})); } catch(e){ return fail(res,e); }
}
export async function groceryNumberPreview(req: Request, res: Response) {
  try { const t=tenant(req); return ok(res, await previewGroceryNumber(t.businessId,t.userId,req.params.key)); } catch(e){ return fail(res,e); }
}
export async function groceryNumberAllocate(req: Request, res: Response) {
  try { const t=tenant(req); return ok(res, await allocateGroceryNumber(req,t.businessId,t.userId,req.params.key),201); } catch(e){ return fail(res,e); }
}
export async function groceryNumberSettingsSave(req: Request, res: Response) {
  try { const t=tenant(req); return ok(res, await saveSequenceSettings(req,t.businessId,t.userId,req.params.key,req.body||{})); } catch(e){ return fail(res,e); }
}
export async function groceryEntityCodeBind(req: Request, res: Response) {
  try { const t=tenant(req); return ok(res, await bindGroceryEntityCode(req,t.businessId,t.userId,req.params.key,req.params.id,req.body?.code)); } catch(e){ return fail(res,e); }
}
export async function grocerySalesApprovalQueue(req: Request, res: Response) {
  try { const t=tenant(req); return ok(res, await salesApprovalQueue(t.businessId,t.userId,req.query)); } catch(e){ return fail(res,e); }
}
export async function groceryCreditOverrideRequest(req: Request, res: Response) {
  try { const t=tenant(req); return ok(res, await requestCreditOverride(req,t.businessId,t.userId,req.body||{}),201); } catch(e){ return fail(res,e); }
}
export async function groceryCreditOverrideApprove(req: Request, res: Response) {
  try { const t=tenant(req); return ok(res, await decideCreditOverride(req,t.businessId,t.userId,req.params.id,"approved",req.body||{})); } catch(e){ return fail(res,e); }
}
export async function groceryCreditOverrideReject(req: Request, res: Response) {
  try { const t=tenant(req); return ok(res, await decideCreditOverride(req,t.businessId,t.userId,req.params.id,"rejected",req.body||{})); } catch(e){ return fail(res,e); }
}
export async function groceryHeldSaleApprove(req: Request, res: Response) {
  try { const t=tenant(req); return ok(res, await decideHeldSale(req,t.businessId,t.userId,req.params.id,"approved",req.body||{})); } catch(e){ return fail(res,e); }
}
export async function groceryHeldSaleReject(req: Request, res: Response) {
  try { const t=tenant(req); return ok(res, await decideHeldSale(req,t.businessId,t.userId,req.params.id,"rejected",req.body||{})); } catch(e){ return fail(res,e); }
}
