import type { Request, Response } from "express";
import { getDashboardSummary } from "../services/dashboard.service.js";
import { getRetailReportingSummary } from "../services/retail-reporting.service.js";
import { handleError, tenant } from "../utils/http.js";

export async function dashboardSummary(req: Request, res: Response): Promise<void> {
  try {
    const { businessId } = tenant(req);
    const [dashboard, reporting] = await Promise.all([
      getDashboardSummary(businessId),
      getRetailReportingSummary(businessId, req.query),
    ]);
    res.json({ ok: true, data: { ...dashboard, ...reporting } });
  } catch (error) {
    handleError(res, error);
  }
}
