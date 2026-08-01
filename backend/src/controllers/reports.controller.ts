import type { Request, Response } from "express";
import * as reports from "../services/reports.service.js";
import { isGroceryOperationalReport, runGroceryOperationalReport } from "../services/grocery-reports.service.js";
import { handleError, tenant } from "../utils/http.js";

export async function options(req: Request, res: Response) {
  try {
    const context = tenant(req);
    res.json({ ok: true, data: await reports.options(context.businessId) });
  } catch (error) {
    handleError(res, error);
  }
}

export async function run(req: Request, res: Response) {
  try {
    const context = tenant(req);
    const reportId = req.params.reportId;
    const data = isGroceryOperationalReport(reportId)
      ? await runGroceryOperationalReport(context.businessId, reportId, req.query)
      : await reports.runReport(context.businessId, reportId, req.query);
    res.json({ ok: true, data });
  } catch (error) {
    handleError(res, error);
  }
}
