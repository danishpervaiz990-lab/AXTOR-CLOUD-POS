import type { Request, Response } from "express";
import * as service from "../services/platform-admin.service.js";
import { handleError } from "../utils/http.js";

const run = (fn: (req: Request) => Promise<any>, status = 200) => async (req: Request, res: Response) => { try { res.status(status).json({ ok: true, data: await fn(req) }); } catch (error) { handleError(res, error); } };
export const listTenants = run(req => service.listTenants(req.query));
export const createTenant = run(req => service.createTenant(req, req.tenant?.userId || null, req.body), 201);
export const updateTenant = run(req => service.updateTenant(req, req.tenant?.userId || null, req.params.businessId, req.body));
export const changeSubscription = run(req => service.changeSubscription(req, req.tenant?.userId || null, req.params.businessId, req.body));
export const saveOverride = run(req => service.saveOverride(req, req.tenant?.userId || null, req.params.businessId, req.body));
export const resetOnboarding = run(req => service.resetOnboarding(req, req.tenant?.userId || null, req.params.businessId));
export const revokeSessions = run(req => service.revokeSessions(req, req.tenant?.userId || null, req.params.businessId));
