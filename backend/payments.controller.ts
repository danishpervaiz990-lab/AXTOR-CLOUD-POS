import type { Request, Response } from "express";
import * as service from "../services/commercial.service.js";
import { handleError, tenant } from "../utils/http.js";

const run = (fn: (req: Request, context: { businessId: string; userId: string | null }) => Promise<any>) => async (req: Request, res: Response) => {
  try { const context = tenant(req); res.json({ ok: true, data: await fn(req, context) }); } catch (error) { handleError(res, error); }
};

export const catalog = run(() => service.catalog());
export const context = run((_req, t) => service.context(t.businessId, t.userId));
export const saveOnboarding = run((req, t) => service.saveOnboarding(req, t.businessId, t.userId, req.body));
export const completeOnboarding = run((req, t) => service.completeOnboarding(req, t.businessId, t.userId, req.body));
export const saveExchangeRate = run((req, t) => service.saveExchangeRate(req, t.businessId, t.userId, req.body));
export const savePreferences = run((req, t) => service.savePreferences(req, t.businessId, t.userId, req.body));
export const setBusinessCurrencies = run((req, t) => service.setBusinessCurrencies(req, t.businessId, t.userId, req.body));
export const listTaxRates = run((_req, t) => service.listTaxRates(t.businessId));
export const createTaxRate = run((req, t) => service.saveTaxRate(req, t.businessId, t.userId, null, req.body));
export const updateTaxRate = run((req, t) => service.saveTaxRate(req, t.businessId, t.userId, req.params.id, req.body));
export const exportTenantConfig = run((_req, t) => service.exportTenantConfig(t.businessId));
