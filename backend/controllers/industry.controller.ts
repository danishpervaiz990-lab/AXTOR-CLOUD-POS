import type { Request, Response } from "express";
import * as service from "../services/industry.service.js";
import { handleError, tenant } from "../utils/http.js";

const run = (fn: (req: Request, context: { businessId: string; userId: string | null }) => Promise<any>) => async (req: Request, res: Response) => {
  try {
    const context = tenant(req);
    return res.json({ ok: true, data: await fn(req, context) });
  } catch (error) {
    return handleError(res, error);
  }
};

export const registry = run((_req, context) => service.registry(context.businessId, context.userId));
export const summary = run((_req, context) => service.summary(context.businessId, context.userId));
export const listRecords = run((req, context) => service.listRecords(context.businessId, context.userId, req.query));
export const getRecord = run((req, context) => service.getRecord(context.businessId, context.userId, req.params.id));
export const createRecord = run((req, context) => service.createRecord(req, context.businessId, context.userId, req.body));
export const updateRecord = run((req, context) => service.updateRecord(req, context.businessId, context.userId, req.params.id, req.body));
export const archiveRecord = run((req, context) => service.archiveRecord(req, context.businessId, context.userId, req.params.id));
export const listBatches = run((req, context) => service.listBatches(context.businessId, context.userId, req.query));
export const createBatch = run((req, context) => service.createBatch(req, context.businessId, context.userId, req.body));
export const updateBatch = run((req, context) => service.updateBatch(req, context.businessId, context.userId, req.params.id, req.body));
export const listPrintProfiles = run((_req, context) => service.listPrintProfiles(context.businessId, context.userId));
export const createPrintProfile = run((req, context) => service.savePrintProfile(req, context.businessId, context.userId, null, req.body));
export const updatePrintProfile = run((req, context) => service.savePrintProfile(req, context.businessId, context.userId, req.params.id, req.body));
export const listNotificationRules = run((_req, context) => service.listNotificationRules(context.businessId, context.userId));
export const createNotificationRule = run((req, context) => service.saveNotificationRule(req, context.businessId, context.userId, null, req.body));
export const updateNotificationRule = run((req, context) => service.saveNotificationRule(req, context.businessId, context.userId, req.params.id, req.body));
export const evaluateNotificationRules = run((req, context) => service.evaluateNotificationRules(req, context.businessId, context.userId));
