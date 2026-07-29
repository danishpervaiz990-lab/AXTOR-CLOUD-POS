import type { Request, Response } from "express";
import { ApiError, handleError, tenant } from "../utils/http.js";
import * as service from "../services/platform-config.service.js";
import * as developerKeys from "../services/developer-api-key.service.js";

const allowedResources = new Set(["companies", "webhooks", "dashboards", "notification-providers", "offline-policies"]);
function resource(req: Request): string {
  const value = String(req.params.resource || "");
  if (!allowedResources.has(value)) throw new ApiError(400, "Unsupported platform resource");
  return value;
}
const go = (fn: (req: Request, businessId: string, userId: string | null) => Promise<any>) => async (req: Request, res: Response) => {
  try {
    const t = tenant(req);
    return res.json({ ok: true, data: await fn(req, t.businessId, t.userId) });
  } catch (error) {
    return handleError(res, error);
  }
};

export const summary = go((_req, businessId) => service.platformSummary(businessId));
export const list = go((req, businessId) => service.listResource(businessId, resource(req)));
export const create = go((req, businessId, userId) => service.createResource(businessId, userId, resource(req), req.body || {}));
export const update = go((req, businessId, userId) => service.updateResource(businessId, userId, resource(req), req.params.id, req.body || {}));
export const remove = go(async (req, businessId, userId) => { await service.deleteResource(businessId, userId, resource(req), req.params.id); return { deleted: true }; });
export const giftCards = go((_req, businessId) => service.listResource(businessId, "gift-cards"));
export const issueGiftCard = go((req, businessId, userId) => service.issueGiftCard(businessId, userId, req.body || {}));
export const giftCardTransaction = go((req, businessId, userId) => service.transactGiftCard(businessId, userId, req.params.id, req.body || {}));
export const apiKeys = go((_req, businessId) => developerKeys.listApiKeys(businessId));
export const createApiKey = go((req, businessId, userId) => developerKeys.createApiKey(businessId, userId, req.body || {}));
export const revokeApiKey = go((req, businessId, userId) => developerKeys.revokeApiKey(businessId, userId, req.params.id));
export const requestBackup = go((req, businessId, userId) => service.createBackupManifest(businessId, userId, req.body || {}));
export const backups = go((_req, businessId) => service.listResource(businessId, "backups"));
