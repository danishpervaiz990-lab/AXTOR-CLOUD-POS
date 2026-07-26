import type { Request, Response } from "express";
import * as service from "../services/salesmen.service.js";
import { handleError, tenant } from "../utils/http.js";

export async function list(req: Request, res: Response) { try { const t=tenant(req); res.json({ok:true,data:await service.listSalesmen(t.businessId,req.query)}); } catch(e){handleError(res,e);} }
export async function get(req: Request, res: Response) { try { const t=tenant(req); res.json({ok:true,data:await service.getSalesman(t.businessId,req.params.id,req.query.month)}); } catch(e){handleError(res,e);} }
export async function create(req: Request, res: Response) { try { const t=tenant(req); res.status(201).json({ok:true,data:await service.createSalesman(req,t.businessId,t.userId,req.body)}); } catch(e){handleError(res,e);} }
export async function update(req: Request, res: Response) { try { const t=tenant(req); res.json({ok:true,data:await service.updateSalesman(req,t.businessId,t.userId,req.params.id,req.body)}); } catch(e){handleError(res,e);} }
export async function remove(req: Request, res: Response) { try { const t=tenant(req); res.json({ok:true,data:await service.deleteSalesman(req,t.businessId,t.userId,req.params.id)}); } catch(e){handleError(res,e);} }
export async function target(req: Request, res: Response) { try { const t=tenant(req); res.json({ok:true,data:await service.upsertTarget(req,t.businessId,t.userId,req.params.id,req.body)}); } catch(e){handleError(res,e);} }
export async function copyTargets(req: Request, res: Response) { try { const t=tenant(req); res.json({ok:true,data:await service.copyTargets(req,t.businessId,t.userId,req.body.fromMonth,req.body.toMonth)}); } catch(e){handleError(res,e);} }
export async function performance(req: Request, res: Response) { try { const t=tenant(req); res.json({ok:true,data:await service.performanceReport(t.businessId,req.query.month)}); } catch(e){handleError(res,e);} }
export async function payouts(req: Request, res: Response) { try { const t=tenant(req); res.json({ok:true,data:await service.listPayouts(t.businessId,req.query.month,true)}); } catch(e){handleError(res,e);} }
export async function updatePayout(req: Request, res: Response) { try { const t=tenant(req); res.json({ok:true,data:await service.updatePayout(req,t.businessId,t.userId,req.params.id,req.body)}); } catch(e){handleError(res,e);} }
